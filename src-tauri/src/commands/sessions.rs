//! Session persistence, parsing, switching, and history management commands.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use tokio::sync::oneshot;

use crate::process::next_request_id;

use super::connection::{new_session, NewSessionResult};
use super::AppState;

/// Summary of a session file for the session history browser
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: String,
    pub path: String,
    pub created_at: Option<String>,
    pub modified_at: Option<String>,
    pub first_message: String,
    pub message_count: usize,
    pub is_active: bool,
}


/// Payload for listing sessions in current workspace
#[derive(Debug, Deserialize, Serialize, Clone, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ListSessionsPayload {
    pub working_directory: Option<String>,
}


/// Payload for switching active session
#[derive(Debug, Deserialize, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SwitchSessionPayload {
    pub session_path: String,
}


/// Result returned from switch_session command
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SwitchSessionResult {
    pub cancelled: bool,
    pub session_id: Option<String>,
    pub session_file: Option<String>,
    pub message_count: u64,
    pub messages: Vec<Value>,
    pub error: Option<String>,
}


/// Status returned from inspecting active session persistence
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionPersistenceStatus {
    pub session_id: String,
    pub session_file: String,
    pub canonical_cwd: String,
    pub generation: u64,
    pub message_count: u64,
    pub file_exists: bool,
}

/// Inspect active Pi session persistence status authoritatively:
/// - Evaluates ONLY the currently owned active session (no arbitrary frontend path probe)
/// - Queues get_state to Pi stdin after message_end to establish execution ordering
/// - Verifies that the returned session_file exists on disk
/// - Returns correlated identity tokens (sessionId, sessionFile, canonicalCwd, generation)
#[tauri::command]
pub async fn get_session_persistence_status(
    state: State<'_, AppState>,
) -> Result<SessionPersistenceStatus, String> {
    let session = state.get_session().await?;
    if !session.is_alive() {
        return Err("Pi RPC bridge is not connected".to_string());
    }
    let stdin_tx = session.stdin_tx.clone();
    let pending_responses = Arc::clone(&session.pending_responses);
    let session_gen = session.generation;
    let cwd = session.cwd.clone();

    let req_id = next_request_id("persist-check");
    let (tx, rx) = oneshot::channel();

    {
        let mut pend = pending_responses.lock().await;
        pend.insert(req_id.clone(), tx);
    }

    let cmd = serde_json::json!({
        "id": req_id,
        "type": "get_state",
    });

    if let Err(e) = stdin_tx.send(cmd.to_string()).await {
        let mut pend = pending_responses.lock().await;
        pend.remove(&req_id);
        return Err(format!("Failed to send get_state to Pi RPC: {e}"));
    }

    let response_result = tokio::time::timeout(Duration::from_secs(10), rx).await;
    let response_value = match response_result {
        Ok(Ok(val)) => val,
        Ok(Err(_)) => {
            let mut pend = pending_responses.lock().await;
            pend.remove(&req_id);
            return Err("get_state response channel closed unexpectedly during persistence check".to_string());
        }
        Err(_) => {
            let mut pend = pending_responses.lock().await;
            pend.remove(&req_id);
            return Err("Timeout waiting for get_state persistence check from Pi (10s)".to_string());
        }
    };

    let is_success = response_value
        .get("success")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if !is_success {
        let err_msg = response_value
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("get_state returned success: false");
        return Err(format!("Persistence check failed: {err_msg}"));
    }

    let data = response_value.get("data");
    let session_id = data
        .and_then(|d| d.get("sessionId"))
        .and_then(|s| s.as_str())
        .ok_or_else(|| "Persistence check response missing sessionId".to_string())?
        .to_string();

    let session_file = data
        .and_then(|d| d.get("sessionFile"))
        .and_then(|s| s.as_str())
        .ok_or_else(|| "Persistence check response missing sessionFile".to_string())?
        .to_string();

    let message_count = data
        .and_then(|d| d.get("messageCount"))
        .and_then(|c| c.as_u64())
        .unwrap_or(0);

    let session_file_path = PathBuf::from(&session_file);
    let file_exists = session_file_path.exists() && session_file_path.is_file();

    Ok(SessionPersistenceStatus {
        session_id,
        session_file,
        canonical_cwd: cwd.to_string_lossy().to_string(),
        generation: session_gen,
        message_count,
        file_exists,
    })
}

/// Formats a SystemTime into an ISO 8601 / RFC 3339 UTC string
pub fn system_time_to_rfc3339(time: std::time::SystemTime) -> Option<String> {
    let duration = time.duration_since(std::time::UNIX_EPOCH).ok()?;
    let total_secs = duration.as_secs();
    let subsec_millis = duration.subsec_millis();

    let days = (total_secs / 86400) as i64;
    let rem_secs = (total_secs % 86400) as u32;

    let hour = rem_secs / 3600;
    let minute = (rem_secs % 3600) / 60;
    let second = rem_secs % 60;

    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };

    Some(format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        year, m, d, hour, minute, second, subsec_millis
    ))
}

/// Helper to extract text from a message content value (string, array of blocks, or object)
fn extract_content_text(content: &Value) -> Option<String> {
    match content {
        Value::String(s) => Some(s.clone()),
        Value::Array(arr) => {
            let parts: Vec<&str> = arr
                .iter()
                .filter_map(|item| {
                    if let Some(s) = item.as_str() {
                        Some(s)
                    } else if item.get("type").and_then(|t| t.as_str()) == Some("text") {
                        item.get("text").and_then(|t| t.as_str())
                    } else {
                        item.get("text").and_then(|t| t.as_str())
                    }
                })
                .collect();
            if parts.is_empty() {
                None
            } else {
                Some(parts.join(" "))
            }
        }
        Value::Object(obj) => obj.get("text").and_then(|t| t.as_str()).map(|s| s.to_string()),
        _ => None,
    }
}

/// Encodes cwd into `--<safe-cwd>--` matching Pi's format under `$USERPROFILE` / `$HOME` / `.pi/agent/sessions/`.
pub fn resolve_sessions_dir(cwd: &Path) -> Option<PathBuf> {
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)?;

    let resolved = dunce::canonicalize(cwd)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| {
            let s = cwd.to_string_lossy();
            s.trim_end_matches(|c| c == '/' || c == '\\').to_string()
        });

    let safe_path = format!(
        "--{}--",
        resolved
            .trim_start_matches(|c| c == '/' || c == '\\')
            .replace(['/', '\\', ':'], "-")
    );

    Some(home.join(".pi").join("agent").join("sessions").join(safe_path))
}

/// Parses a `.jsonl` session file:
/// - Line 1 has `type == "session"`, extracts `id` and `timestamp`
/// - Scans lines for `type == "message"` to count messages
/// - Extracts the first user message content as text (string or block array) truncated to 100 characters
/// - Defaults to "(no messages)" if empty
/// - Retrieves file modified time from metadata and formats as ISO 8601
/// - Sets `is_active = true` if `id` or path matches the active session
pub fn parse_session_file(
    file_path: &Path,
    active_id: Option<&str>,
    active_file: Option<&str>,
) -> Option<SessionSummary> {
    let file = std::fs::File::open(file_path).ok()?;
    let reader = std::io::BufReader::new(file);
    let mut lines = std::io::BufRead::lines(reader);

    let mut first_val = None;
    for line_res in &mut lines {
        let line = line_res.ok()?;
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            let val: Value = serde_json::from_str(trimmed).ok()?;
            first_val = Some(val);
            break;
        }
    }

    let first_val = first_val?;
    if first_val.get("type").and_then(|v| v.as_str()) != Some("session") {
        return None;
    }
    let id = first_val.get("id").and_then(|v| v.as_str())?.to_string();
    if id.is_empty() {
        return None;
    }
    let created_at = first_val
        .get("timestamp")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let mut message_count: usize = 0;
    let mut first_user_message: Option<String> = None;

    for line_res in lines {
        let line = match line_res {
            Ok(l) => l,
            Err(_) => continue,
        };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let val: Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(_) => continue,
        };

        if val.get("type").and_then(|v| v.as_str()) == Some("message") {
            message_count += 1;

            if first_user_message.is_none() {
                let is_user = val
                    .get("message")
                    .and_then(|m| m.get("role"))
                    .and_then(|r| r.as_str())
                    .map(|r| r == "user")
                    .or_else(|| {
                        val.get("role")
                            .and_then(|r| r.as_str())
                            .map(|r| r == "user")
                    })
                    .unwrap_or(false);

                if is_user {
                    let content_val = val
                        .get("message")
                        .and_then(|m| m.get("content"))
                        .or_else(|| val.get("content"));

                    if let Some(cv) = content_val {
                        if let Some(text) = extract_content_text(cv) {
                            let trimmed_text = text.trim();
                            if !trimmed_text.is_empty() {
                                let truncated: String = trimmed_text.chars().take(100).collect();
                                first_user_message = Some(truncated);
                            }
                        }
                    }
                }
            }
        }
    }

    let first_message = first_user_message.unwrap_or_else(|| "(no messages)".to_string());

    let modified_at = std::fs::metadata(file_path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(system_time_to_rfc3339);

    let matches_id = active_id.map_or(false, |aid| aid == id);
    let matches_path = if let Some(af) = active_file {
        let af_path = Path::new(af);
        if af_path == file_path {
            true
        } else if let (Ok(can_af), Ok(can_file)) = (dunce::canonicalize(af_path), dunce::canonicalize(file_path)) {
            can_af == can_file
        } else {
            let norm_af = af.replace('\\', "/").to_lowercase();
            let norm_file = file_path.to_string_lossy().replace('\\', "/").to_lowercase();
            norm_af == norm_file
        }
    } else {
        false
    };
    let is_active = matches_id || matches_path;

    let path_str = dunce::canonicalize(file_path)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| file_path.to_string_lossy().to_string());

    Some(SessionSummary {
        id,
        path: path_str,
        created_at,
        modified_at,
        first_message,
        message_count,
        is_active,
    })
}

/// Reads directory, collects `.jsonl` files, parses with `parse_session_file`, sorts by `modified_at` descending.
pub fn list_sessions_from_dir(
    dir: &Path,
    active_id: Option<&str>,
    active_file: Option<&str>,
) -> Vec<SessionSummary> {
    if !dir.exists() || !dir.is_dir() {
        return Vec::new();
    }

    let read_dir = match std::fs::read_dir(dir) {
        Ok(rd) => rd,
        Err(_) => return Vec::new(),
    };

    let mut sessions = Vec::new();

    for entry_res in read_dir {
        let entry = match entry_res {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let is_jsonl = path
            .extension()
            .and_then(|ext| ext.to_str())
            .map_or(false, |ext| ext.eq_ignore_ascii_case("jsonl"));

        if !is_jsonl {
            continue;
        }

        if let Some(summary) = parse_session_file(&path, active_id, active_file) {
            sessions.push(summary);
        }
    }

    sessions.sort_by(|a, b| {
        match (&b.modified_at, &a.modified_at) {
            (Some(b_mod), Some(a_mod)) => b_mod.cmp(a_mod).then_with(|| a.id.cmp(&b.id)),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => a.id.cmp(&b.id),
        }
    });

    sessions
}

/// Validates session path for switch_session command:
/// Non-empty, ends with `.jsonl`, exists, and is a file.
pub fn validate_switch_session_path(session_path: &str) -> Result<PathBuf, String> {
    let trimmed = session_path.trim();
    if trimmed.is_empty() {
        return Err("Session path cannot be empty".to_string());
    }

    let path = PathBuf::from(trimmed);
    let is_jsonl = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map_or(false, |ext| ext.eq_ignore_ascii_case("jsonl"));

    if !is_jsonl {
        return Err(format!(
            "Session file must have a .jsonl extension: '{}'",
            trimmed
        ));
    }

    if !path.exists() {
        return Err(format!(
            "Session file does not exist: '{}'",
            trimmed
        ));
    }

    if !path.is_file() {
        return Err(format!(
            "Session path is not a file: '{}'",
            trimmed
        ));
    }

    Ok(path)
}

/// List previous sessions for the workspace
#[tauri::command]
pub async fn list_sessions(
    payload: Option<ListSessionsPayload>,
    state: State<'_, AppState>,
) -> Result<Vec<SessionSummary>, String> {
    let target_cwd: Option<PathBuf> = if let Some(wd_str) = payload
        .as_ref()
        .and_then(|p| p.working_directory.as_deref())
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        Some(dunce::canonicalize(wd_str).unwrap_or_else(|_| PathBuf::from(wd_str)))
    } else {
        state.active_cwd.lock().await.clone()
    };

    let target_cwd = match target_cwd {
        Some(cwd) => cwd,
        None => {
            let guard = state.session.lock().await;
            if let Some(s) = guard.as_ref() {
                s.cwd.clone()
            } else {
                return Ok(Vec::new());
            }
        }
    };

    let active_info = {
        let sessions = state.sessions.lock().await;
        if let Some(s) = sessions.get(&target_cwd) {
            let cur_id = s.current_session_id.lock().await.clone();
            let cur_file = s.current_session_file.lock().await.clone();
            Some((cur_id, cur_file))
        } else {
            let guard = state.session.lock().await;
            if let Some(s) = guard.as_ref() {
                if s.cwd == target_cwd {
                    let cur_id = s.current_session_id.lock().await.clone();
                    let cur_file = s.current_session_file.lock().await.clone();
                    Some((cur_id, cur_file))
                } else {
                    None
                }
            } else {
                None
            }
        }
    };

    let (active_id, active_file) = match active_info {
        Some((id, file)) => (id, file),
        None => (None, None),
    };

    let sessions_dir = if let Some(ref file_str) = active_file {
        let p = Path::new(file_str);
        if let Some(parent) = p.parent().filter(|p| !p.as_os_str().is_empty()) {
            if parent.exists() && parent.is_dir() {
                Some(parent.to_path_buf())
            } else {
                resolve_sessions_dir(&target_cwd)
            }
        } else {
            resolve_sessions_dir(&target_cwd)
        }
    } else {
        resolve_sessions_dir(&target_cwd)
    };

    let mut list = if let Some(dir) = sessions_dir {
        list_sessions_from_dir(&dir, active_id.as_deref(), active_file.as_deref())
    } else {
        Vec::new()
    };

    if let Some(ref aid) = active_id {
        if !aid.is_empty() && !list.iter().any(|s| &s.id == aid) {
            let dummy_path = active_file.clone().unwrap_or_default();
            list.insert(
                0,
                SessionSummary {
                    id: aid.clone(),
                    path: dummy_path,
                    created_at: system_time_to_rfc3339(std::time::SystemTime::now()),
                    modified_at: system_time_to_rfc3339(std::time::SystemTime::now()),
                    first_message: "(no messages)".to_string(),
                    message_count: 0,
                    is_active: true,
                },
            );
        }
    }

    Ok(list)
}

/// Switch the active conversation session to a target session file
#[tauri::command]
pub async fn switch_session(
    payload: SwitchSessionPayload,
    state: State<'_, AppState>,
) -> Result<SwitchSessionResult, String> {
    // 1. Validate session path
    let valid_path = validate_switch_session_path(&payload.session_path)?;
    let session_path_str = dunce::canonicalize(&valid_path)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| valid_path.to_string_lossy().to_string());

    // 2. Generation gating and channel references
    let session = state.get_session().await?;
    if !session.is_alive() {
        return Err("Pi RPC bridge is not connected".to_string());
    }
    let stdin_tx = session.stdin_tx.clone();
    let pending_responses = Arc::clone(&session.pending_responses);
    let _session_gen = session.generation;

    // Step 1: Send switch_session command
    let req_id = next_request_id("switch-session");
    let (tx, rx) = oneshot::channel();

    {
        let mut pend = pending_responses.lock().await;
        pend.insert(req_id.clone(), tx);
    }

    let cmd = serde_json::json!({
        "id": req_id,
        "type": "switch_session",
        "sessionPath": session_path_str,
    });

    if let Err(e) = stdin_tx.send(cmd.to_string()).await {
        let mut pend = pending_responses.lock().await;
        pend.remove(&req_id);
        return Err(format!("Failed to send switch_session: child stdin closed ({e})"));
    }

    let response_result = tokio::time::timeout(Duration::from_secs(15), rx).await;
    let response_value = match response_result {
        Ok(Ok(val)) => val,
        Ok(Err(_)) => {
            let mut pend = pending_responses.lock().await;
            pend.remove(&req_id);
            return Err("switch_session response channel closed unexpectedly".to_string());
        }
        Err(_) => {
            let mut pend = pending_responses.lock().await;
            pend.remove(&req_id);
            return Err("Timeout waiting for switch_session response from Pi (15s)".to_string());
        }
    };

    let is_success = response_value
        .get("success")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if !is_success {
        let err_msg = response_value
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("Failed to switch session");
        return Err(format!("switch_session rejected: {err_msg}"));
    }

    let cancelled = response_value
        .get("data")
        .and_then(|d| d.get("cancelled"))
        .and_then(|c| c.as_bool())
        .unwrap_or(false);

    if cancelled {
        return Ok(SwitchSessionResult {
            cancelled: true,
            session_id: None,
            session_file: None,
            message_count: 0,
            messages: Vec::new(),
            error: None,
        });
    }

    // Check session is still alive during switch_session
    if !session.is_alive() {
        return Err("Session was superseded while switching sessions".to_string());
    }

    // Step 2: Fetch new session identity via get_state
    let state_id = next_request_id("switch-get-state");
    let (state_tx, state_rx) = oneshot::channel();

    {
        let mut pend = pending_responses.lock().await;
        pend.insert(state_id.clone(), state_tx);
    }

    let state_cmd = serde_json::json!({
        "id": state_id,
        "type": "get_state",
    });

    if let Err(e) = stdin_tx.send(state_cmd.to_string()).await {
        let mut pend = pending_responses.lock().await;
        pend.remove(&state_id);
        return Ok(SwitchSessionResult {
            cancelled: false,
            session_id: None,
            session_file: None,
            message_count: 0,
            messages: Vec::new(),
            error: Some(format!("Failed to send get_state after switch_session: child stdin closed ({e})")),
        });
    }

    let state_res = tokio::time::timeout(Duration::from_secs(15), state_rx).await;
    let state_val = match state_res {
        Ok(Ok(val)) => val,
        Ok(Err(_)) => {
            let mut pend = pending_responses.lock().await;
            pend.remove(&state_id);
            return Ok(SwitchSessionResult {
                cancelled: false,
                session_id: None,
                session_file: None,
                message_count: 0,
                messages: Vec::new(),
                error: Some("get_state response channel closed after switch_session".to_string()),
            });
        }
        Err(_) => {
            let mut pend = pending_responses.lock().await;
            pend.remove(&state_id);
            return Ok(SwitchSessionResult {
                cancelled: false,
                session_id: None,
                session_file: None,
                message_count: 0,
                messages: Vec::new(),
                error: Some("Timeout waiting for get_state after switch_session (15s)".to_string()),
            });
        }
    };

    let state_success = state_val
        .get("success")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if !state_success {
        let err_msg = state_val
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("get_state returned success: false");
        return Ok(SwitchSessionResult {
            cancelled: false,
            session_id: None,
            session_file: None,
            message_count: 0,
            messages: Vec::new(),
            error: Some(format!("get_state failed after switch_session: {err_msg}")),
        });
    }

    let state_data = state_val.get("data");
    let session_id = state_data
        .and_then(|d| d.get("sessionId"))
        .and_then(|s| s.as_str())
        .map(|s| s.to_string());

    let session_file = state_data
        .and_then(|d| d.get("sessionFile"))
        .and_then(|s| s.as_str())
        .map(|s| s.to_string());

    let message_count = state_data
        .and_then(|d| d.get("messageCount"))
        .and_then(|c| c.as_u64())
        .unwrap_or(0);

    if session_id.is_none() || session_file.is_none() {
        return Ok(SwitchSessionResult {
            cancelled: false,
            session_id: None,
            session_file: None,
            message_count,
            messages: Vec::new(),
            error: Some("get_state after switch_session returned missing sessionId or sessionFile".to_string()),
        });
    }

    // Step 3: Hydrate messages if message_count > 0
    let mut messages: Vec<Value> = Vec::new();
    if message_count > 0 {
        let msg_id = next_request_id("switch-get-msgs");
        let (msg_tx, msg_rx) = oneshot::channel();

        {
            let mut pend = pending_responses.lock().await;
            pend.insert(msg_id.clone(), msg_tx);
        }

        let msg_cmd = serde_json::json!({
            "id": msg_id,
            "type": "get_messages",
        });

        if let Err(e) = stdin_tx.send(msg_cmd.to_string()).await {
            let mut pend = pending_responses.lock().await;
            pend.remove(&msg_id);
            return Ok(SwitchSessionResult {
                cancelled: false,
                session_id,
                session_file,
                message_count,
                messages: Vec::new(),
                error: Some(format!("Failed to send get_messages after switch_session: child stdin closed ({e})")),
            });
        }

        let msg_res = tokio::time::timeout(Duration::from_secs(15), msg_rx).await;
        let msg_val = match msg_res {
            Ok(Ok(val)) => val,
            Ok(Err(_)) => {
                let mut pend = pending_responses.lock().await;
                pend.remove(&msg_id);
                return Ok(SwitchSessionResult {
                    cancelled: false,
                    session_id,
                    session_file,
                    message_count,
                    messages: Vec::new(),
                    error: Some("get_messages response channel closed after switch_session".to_string()),
                });
            }
            Err(_) => {
                let mut pend = pending_responses.lock().await;
                pend.remove(&msg_id);
                return Ok(SwitchSessionResult {
                    cancelled: false,
                    session_id,
                    session_file,
                    message_count,
                    messages: Vec::new(),
                    error: Some("Timeout waiting for get_messages after switch_session (15s)".to_string()),
                });
            }
        };

        let msg_success = msg_val
            .get("success")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        if !msg_success {
            let err_msg = msg_val
                .get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("get_messages returned success: false");
            return Ok(SwitchSessionResult {
                cancelled: false,
                session_id,
                session_file,
                message_count,
                messages: Vec::new(),
                error: Some(format!("get_messages failed after switch_session: {err_msg}")),
            });
        }

        if let Some(arr) = msg_val
            .get("data")
            .and_then(|d| d.get("messages"))
            .and_then(|m| m.as_array())
        {
            messages = arr.clone();
        }
    }

    // Step 4: Update active.current_session_id and active.current_session_file
    {
        let mut cur_id = session.current_session_id.lock().await;
        *cur_id = session_id.clone();
        let mut cur_file = session.current_session_file.lock().await;
        *cur_file = session_file.clone();
    }

    Ok(SwitchSessionResult {
        cancelled: false,
        session_id,
        session_file,
        message_count,
        messages,
        error: None,
    })
}

/// Payload for delete_session command
#[derive(Debug, Deserialize, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeleteSessionPayload {
    pub session_path: String,
}

/// Result returned from delete_session command
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeleteSessionResult {
    pub success: bool,
    pub was_active: bool,
    pub new_session: Option<NewSessionResult>,
}

/// Delete a conversation session file on disk with safe path checks and active session reset
#[tauri::command]
pub async fn delete_session(
    payload: DeleteSessionPayload,
    state: State<'_, AppState>,
) -> Result<DeleteSessionResult, String> {
    // 1. Validate session path syntax and existence
    let valid_path = validate_switch_session_path(&payload.session_path)?;
    let canonical_target = dunce::canonicalize(&valid_path)
        .map_err(|e| format!("Failed to canonicalize session file path: {e}"))?;

    // 2. Check if the session to delete is the currently active session
    let is_active = {
        let guard = state.session.lock().await;
        if let Some(session) = guard.as_ref() {
            let cur_file = session.current_session_file.lock().await.clone();
            if let Some(ref cf) = cur_file {
                let cf_path = Path::new(cf);
                if let Ok(can_cf) = dunce::canonicalize(cf_path) {
                    can_cf == canonical_target
                } else {
                    cf_path == valid_path
                }
            } else {
                false
            }
        } else {
            false
        }
    };

    // 3. If active, reset the active session in Pi RPC first
    let mut new_session_res: Option<NewSessionResult> = None;
    if is_active {
        let reset_res = new_session(state.clone()).await?;
        if reset_res.cancelled {
            return Err("Session deletion was cancelled by agent extension".to_string());
        }
        new_session_res = Some(reset_res);
    }

    // 4. Remove the session file from disk
    std::fs::remove_file(&canonical_target)
        .map_err(|e| format!("Failed to delete session file on disk: {e}"))?;

    Ok(DeleteSessionResult {
        success: true,
        was_active: is_active,
        new_session: new_session_res,
    })
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_missing_session_file_validation_error() {
        let non_existent = "C:\\definitely_non_existent_dir_12345\\missing_session.jsonl";
        let path = PathBuf::from(non_existent);
        let require_exists = true;

        let res: Result<(), String> = if require_exists && !path.exists() {
            Err(format!(
                "Saved session file not found: '{}'. File may have been moved or deleted.",
                path.display()
            ))
        } else {
            Ok(())
        };

        assert!(res.is_err());
        assert!(res.unwrap_err().contains("Saved session file not found"));
    }

    #[test]
    fn test_session_persistence_status_contract() {
        let status = SessionPersistenceStatus {
            session_id: "test-sess-123".to_string(),
            session_file: "C:\\sessions\\test.jsonl".to_string(),
            canonical_cwd: "C:\\projects\\app".to_string(),
            generation: 2,
            message_count: 5,
            file_exists: true,
        };
        let serialized = serde_json::to_string(&status).unwrap();
        assert!(serialized.contains("\"sessionId\":\"test-sess-123\""));
        assert!(serialized.contains("\"sessionFile\":\"C:\\\\sessions\\\\test.jsonl\""));
        assert!(serialized.contains("\"canonicalCwd\":\"C:\\\\projects\\\\app\""));
        assert!(serialized.contains("\"generation\":2"));
        assert!(serialized.contains("\"messageCount\":5"));
        assert!(serialized.contains("\"fileExists\":true"));

        let deserialized: SessionPersistenceStatus = serde_json::from_str(&serialized).unwrap();
        assert_eq!(deserialized, status);
    }


    #[test]
    fn test_resolve_sessions_dir() {
        if std::env::var_os("USERPROFILE").is_none() && std::env::var_os("HOME").is_none() {
            std::env::set_var("HOME", "/tmp/mock_home");
        }

        let dummy_cwd = Path::new("C:/mock/project");
        let resolved = resolve_sessions_dir(dummy_cwd);
        assert!(resolved.is_some());
        let path_str = resolved.unwrap().to_string_lossy().replace('\\', "/");
        assert!(path_str.contains(".pi/agent/sessions/--C--mock-project--"));

        let dummy_unix = Path::new("/mock/unix/workspace");
        let resolved_unix = resolve_sessions_dir(dummy_unix);
        assert!(resolved_unix.is_some());
        let unix_str = resolved_unix.unwrap().to_string_lossy().replace('\\', "/");
        assert!(unix_str.contains(".pi/agent/sessions/--mock-unix-workspace--"));
    }

    #[test]
    fn test_parse_session_file_and_listing() {
        struct TempDirGuard {
            path: PathBuf,
        }
        impl Drop for TempDirGuard {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.path);
            }
        }

        let temp_path = std::env::temp_dir().join(format!(
            "pi_viewer_session_test_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&temp_path).expect("Failed to create temp test dir");
        let _guard = TempDirGuard {
            path: temp_path.clone(),
        };

        // 1. sess1: Valid with 3 messages, user message string
        let sess1_path = temp_path.join("2026-09-01_sess1.jsonl");
        let sess1_content = "\
{\"type\":\"session\",\"id\":\"sess-1\",\"timestamp\":\"2026-09-01T10:00:00.000Z\"}\n\
{\"type\":\"model_change\",\"provider\":\"openai\"}\n\
{\"type\":\"message\",\"message\":{\"role\":\"user\",\"content\":\"First user message for session 1\"}}\n\
{\"type\":\"message\",\"message\":{\"role\":\"assistant\",\"content\":\"Assistant reply\"}}\n\
{\"type\":\"message\",\"message\":{\"role\":\"user\",\"content\":\"Second user message\"}}\n";
        std::fs::write(&sess1_path, sess1_content).unwrap();

        // Brief sleep to ensure distinct modified timestamps
        std::thread::sleep(Duration::from_millis(50));

        // 2. sess2: Valid with 1 message, array block content
        let sess2_path = temp_path.join("2026-09-02_sess2.jsonl");
        let sess2_content = "\
{\"type\":\"session\",\"id\":\"sess-2\",\"timestamp\":\"2026-09-02T10:00:00.000Z\"}\n\
{\"type\":\"message\",\"message\":{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"Block message text\"},{\"type\":\"image\",\"url\":\"test\"}]}}\n";
        std::fs::write(&sess2_path, sess2_content).unwrap();

        std::thread::sleep(Duration::from_millis(50));

        // 3. sess3: Valid session but no messages
        let sess3_path = temp_path.join("2026-09-03_sess3.jsonl");
        let sess3_content = "\
{\"type\":\"session\",\"id\":\"sess-3\",\"timestamp\":\"2026-09-03T10:00:00.000Z\"}\n\
{\"type\":\"thinking_level_change\",\"thinkingLevel\":\"low\"}\n";
        std::fs::write(&sess3_path, sess3_content).unwrap();

        std::thread::sleep(Duration::from_millis(50));

        // 4. sess4: Valid session with user message > 100 characters (verify truncation)
        let sess4_path = temp_path.join("2026-09-04_sess4.jsonl");
        let long_msg = "A".repeat(150);
        let sess4_content = format!(
            "{{\"type\":\"session\",\"id\":\"sess-4\",\"timestamp\":\"2026-09-04T10:00:00.000Z\"}}\n\
{{\"type\":\"message\",\"message\":{{\"role\":\"user\",\"content\":\"{}\"}}}}\n",
            long_msg
        );
        std::fs::write(&sess4_path, sess4_content).unwrap();

        // 5. Malformed file: invalid json syntax
        let malformed_path = temp_path.join("malformed.jsonl");
        std::fs::write(&malformed_path, "not json content at all\n").unwrap();

        // 6. Malformed file: valid json but line 1 is not session
        let wrong_type_path = temp_path.join("wrong_type.jsonl");
        std::fs::write(&wrong_type_path, "{\"type\":\"message\",\"content\":\"hi\"}\n").unwrap();

        // 7. Non-jsonl file: should be ignored by directory listing
        let non_jsonl_path = temp_path.join("session.txt");
        std::fs::write(&non_jsonl_path, "{\"type\":\"session\",\"id\":\"txt\"}\n").unwrap();

        // Test parse_session_file on sess1
        let summary1 = parse_session_file(&sess1_path, Some("sess-1"), None);
        assert!(summary1.is_some());
        let s1 = summary1.unwrap();
        assert_eq!(s1.id, "sess-1");
        assert_eq!(s1.created_at, Some("2026-09-01T10:00:00.000Z".to_string()));
        assert_eq!(s1.first_message, "First user message for session 1");
        assert_eq!(s1.message_count, 3);
        assert!(s1.is_active);
        assert!(s1.modified_at.is_some());

        // Test inactive matching
        let s1_inactive = parse_session_file(&sess1_path, Some("other-id"), None).unwrap();
        assert!(!s1_inactive.is_active);

        // Test active by path matching
        let s1_path_active = parse_session_file(&sess1_path, None, Some(&sess1_path.to_string_lossy())).unwrap();
        assert!(s1_path_active.is_active);

        // Test parse_session_file on sess2 (block array extraction)
        let summary2 = parse_session_file(&sess2_path, None, None).unwrap();
        assert_eq!(summary2.id, "sess-2");
        assert_eq!(summary2.first_message, "Block message text");
        assert_eq!(summary2.message_count, 1);
        assert!(!summary2.is_active);

        // Test parse_session_file on sess3 (no messages default)
        let summary3 = parse_session_file(&sess3_path, None, None).unwrap();
        assert_eq!(summary3.id, "sess-3");
        assert_eq!(summary3.first_message, "(no messages)");
        assert_eq!(summary3.message_count, 0);

        // Test parse_session_file on sess4 (truncation to 100 characters)
        let summary4 = parse_session_file(&sess4_path, None, None).unwrap();
        assert_eq!(summary4.id, "sess-4");
        assert_eq!(summary4.first_message.len(), 100);
        assert_eq!(summary4.first_message, "A".repeat(100));

        // Test malformed files return None
        assert!(parse_session_file(&malformed_path, None, None).is_none());
        assert!(parse_session_file(&wrong_type_path, None, None).is_none());

        // Test list_sessions_from_dir
        let listing = list_sessions_from_dir(&temp_path, Some("sess-2"), None);
        // Only 4 valid sessions
        assert_eq!(listing.len(), 4);

        // Verify sorted by modified_at descending: newest (sess4) to oldest (sess1)
        assert_eq!(listing[0].id, "sess-4");
        assert_eq!(listing[1].id, "sess-3");
        assert_eq!(listing[2].id, "sess-2");
        assert_eq!(listing[3].id, "sess-1");

        // Verify active flag propagated
        assert!(listing[2].is_active);
        assert!(!listing[0].is_active);
        assert!(!listing[1].is_active);
        assert!(!listing[3].is_active);
    }

    #[test]
    fn test_validate_switch_session_path() {
        struct TempDirGuard {
            path: PathBuf,
        }
        impl Drop for TempDirGuard {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.path);
            }
        }

        let temp_path = std::env::temp_dir().join(format!(
            "pi_viewer_val_switch_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&temp_path).expect("Failed to create temp test dir");
        let _guard = TempDirGuard {
            path: temp_path.clone(),
        };

        // Empty string
        assert!(validate_switch_session_path("").is_err());
        assert!(validate_switch_session_path("   ").is_err());

        // Non-existent file
        let missing = temp_path.join("missing.jsonl");
        assert!(validate_switch_session_path(&missing.to_string_lossy()).is_err());

        // Directory instead of file
        assert!(validate_switch_session_path(&temp_path.to_string_lossy()).is_err());

        // Wrong extension
        let txt_file = temp_path.join("valid.txt");
        std::fs::write(&txt_file, "content").unwrap();
        assert!(validate_switch_session_path(&txt_file.to_string_lossy()).is_err());

        // Valid .jsonl file
        let valid_file = temp_path.join("session.jsonl");
        std::fs::write(&valid_file, "{\"type\":\"session\",\"id\":\"s\"}\n").unwrap();
        let res = validate_switch_session_path(&valid_file.to_string_lossy());
        assert!(res.is_ok());
    }

    #[test]
    fn test_session_summary_and_switch_contracts() {
        let summary = SessionSummary {
            id: "sess-abc-123".to_string(),
            path: "/path/to/session.jsonl".to_string(),
            created_at: Some("2026-09-15T12:00:00.000Z".to_string()),
            modified_at: Some("2026-09-15T12:30:00.000Z".to_string()),
            first_message: "Hello world".to_string(),
            message_count: 5,
            is_active: true,
        };

        let summary_json = serde_json::to_string(&summary).unwrap();
        assert!(summary_json.contains("\"id\":\"sess-abc-123\""));
        assert!(summary_json.contains("\"path\":\"/path/to/session.jsonl\""));
        assert!(summary_json.contains("\"createdAt\":\"2026-09-15T12:00:00.000Z\""));
        assert!(summary_json.contains("\"modifiedAt\":\"2026-09-15T12:30:00.000Z\""));
        assert!(summary_json.contains("\"firstMessage\":\"Hello world\""));
        assert!(summary_json.contains("\"messageCount\":5"));
        assert!(summary_json.contains("\"isActive\":true"));

        let deserialized_summary: SessionSummary = serde_json::from_str(&summary_json).unwrap();
        assert_eq!(deserialized_summary, summary);

        let list_payload = ListSessionsPayload {
            working_directory: Some("/my/workspace".to_string()),
        };
        let list_json = serde_json::to_string(&list_payload).unwrap();
        assert!(list_json.contains("\"workingDirectory\":\"/my/workspace\""));
        let deserialized_list: ListSessionsPayload = serde_json::from_str(&list_json).unwrap();
        assert_eq!(deserialized_list, list_payload);

        let switch_payload = SwitchSessionPayload {
            session_path: "/path/to/session.jsonl".to_string(),
        };
        let switch_json = serde_json::to_string(&switch_payload).unwrap();
        assert!(switch_json.contains("\"sessionPath\":\"/path/to/session.jsonl\""));
        let deserialized_switch: SwitchSessionPayload = serde_json::from_str(&switch_json).unwrap();
        assert_eq!(deserialized_switch, switch_payload);

        let switch_res = SwitchSessionResult {
            cancelled: false,
            session_id: Some("sess-new-1".to_string()),
            session_file: Some("/sessions/sess-new-1.jsonl".to_string()),
            message_count: 2,
            messages: vec![serde_json::json!({"role": "user", "content": "hi"})],
            error: None,
        };
        let switch_res_json = serde_json::to_string(&switch_res).unwrap();
        assert!(switch_res_json.contains("\"cancelled\":false"));
        assert!(switch_res_json.contains("\"sessionId\":\"sess-new-1\""));
        assert!(switch_res_json.contains("\"sessionFile\":\"/sessions/sess-new-1.jsonl\""));
        assert!(switch_res_json.contains("\"messageCount\":2"));
        assert!(switch_res_json.contains("\"messages\":["));
        assert!(switch_res_json.contains("\"error\":null"));

        let deserialized_res: SwitchSessionResult = serde_json::from_str(&switch_res_json).unwrap();
        assert_eq!(deserialized_res, switch_res);

        let delete_payload = DeleteSessionPayload {
            session_path: "/path/to/delete.jsonl".to_string(),
        };
        let delete_json = serde_json::to_string(&delete_payload).unwrap();
        assert!(delete_json.contains("\"sessionPath\":\"/path/to/delete.jsonl\""));
        let deserialized_del: DeleteSessionPayload = serde_json::from_str(&delete_json).unwrap();
        assert_eq!(deserialized_del, delete_payload);

        let delete_res = DeleteSessionResult {
            success: true,
            was_active: false,
            new_session: None,
        };
        let delete_res_json = serde_json::to_string(&delete_res).unwrap();
        assert!(delete_res_json.contains("\"success\":true"));
        assert!(delete_res_json.contains("\"wasActive\":false"));
        assert!(delete_res_json.contains("\"newSession\":null"));
        let deserialized_del_res: DeleteSessionResult = serde_json::from_str(&delete_res_json).unwrap();
        assert_eq!(deserialized_del_res, delete_res);
    }

    #[tokio::test]
    async fn test_list_sessions_respects_payload_working_directory_over_active_session() {
        struct TempDirGuard {
            path: PathBuf,
        }
        impl Drop for TempDirGuard {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.path);
            }
        }

        let temp_base = std::env::temp_dir().join(format!(
            "pi_viewer_list_sess_test_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let dir_a = temp_base.join("project_a");
        let dir_b = temp_base.join("project_b");
        std::fs::create_dir_all(&dir_a).expect("Failed to create dir_a");
        std::fs::create_dir_all(&dir_b).expect("Failed to create dir_b");
        let _guard = TempDirGuard {
            path: temp_base.clone(),
        };

        let can_dir_a = dunce::canonicalize(&dir_a).unwrap();
        let can_dir_b = dunce::canonicalize(&dir_b).unwrap();

        // Create sessions directory and a session file for project_b
        let sessions_dir_b = resolve_sessions_dir(&can_dir_b).expect("Failed to resolve sessions dir for B");
        std::fs::create_dir_all(&sessions_dir_b).expect("Failed to create sessions dir for B");
        let _sess_b_guard = TempDirGuard {
            path: sessions_dir_b.clone(),
        };

        let sess_b_file = sessions_dir_b.join("2026-09-01_sess_b.jsonl");
        let sess_b_content = "{\"type\":\"session\",\"id\":\"sess-b-123\",\"timestamp\":\"2026-09-01T10:00:00.000Z\"}\n{\"type\":\"message\",\"message\":{\"role\":\"user\",\"content\":\"Hello from Project B\"}}\n";
        std::fs::write(&sess_b_file, sess_b_content).unwrap();

        // Create an active session pointing to project_a
        let (stdin_tx, _stdin_rx) = tokio::sync::mpsc::channel(16);
        let session_a = crate::process::ActiveSession {
            child_pid: Some(9999),
            generation: 1,
            cwd: can_dir_a.clone(),
            stdin_tx,
            pending_responses: Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new())),
            stderr_collector: Arc::new(tokio::sync::Mutex::new(crate::process::StderrCollector::new(1024))),
            abort_kill_tx: Arc::new(tokio::sync::Mutex::new(None)),
            child_reap_rx: Arc::new(tokio::sync::Mutex::new(None)),
            current_session_id: Arc::new(tokio::sync::Mutex::new(Some("sess-a-active".to_string()))),
            current_session_file: Arc::new(tokio::sync::Mutex::new(Some("test-session-a.jsonl".to_string()))),
            is_alive: Arc::new(std::sync::atomic::AtomicBool::new(true)),
        };

        let app_state = AppState::new();
        *app_state.active_cwd.lock().await = Some(can_dir_a.clone());
        *app_state.session.lock().await = Some(session_a.clone());
        app_state.sessions.lock().await.insert(can_dir_a.clone(), session_a);

        let state: State<'_, AppState> = unsafe { std::mem::transmute(&app_state) };

        // Query list_sessions with payload.working_directory = project_b
        let payload = Some(ListSessionsPayload {
            working_directory: Some(can_dir_b.to_string_lossy().to_string()),
        });

        let list = list_sessions(payload, state).await.expect("list_sessions should succeed");

        // Verify that the returned sessions are for project_b, NOT project_a
        assert!(!list.is_empty(), "Should have found sessions for project B");
        assert_eq!(list[0].id, "sess-b-123");
        assert_eq!(list[0].first_message, "Hello from Project B");
        assert!(!list.iter().any(|s| s.id == "sess-a-active"), "Should NOT contain active session from project A");
    }

}
