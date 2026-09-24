//! Model configuration, thinking levels, and session metrics commands.

use std::sync::Arc;
use std::time::Duration;

use serde_json::Value;
use tauri::State;
use tokio::sync::oneshot;

use crate::process::next_request_id;

use super::AppState;

/// Helper to send a correlated RPC command to the active Pi subprocess
pub(crate) async fn send_pi_command_internal(
    state: &AppState,
    prefix: &str,
    cmd_type: &str,
    extra_fields: Option<serde_json::Map<String, Value>>,
    timeout_dur: Duration,
) -> Result<Value, String> {
    let session = state.get_session().await?;
    if !session.is_alive() {
        return Err("Pi RPC bridge is not connected".to_string());
    }
    let stdin_tx = session.stdin_tx.clone();
    let pending_responses = Arc::clone(&session.pending_responses);

    let req_id = next_request_id(prefix);
    let (tx, rx) = oneshot::channel();

    {
        let mut pend = pending_responses.lock().await;
        pend.insert(req_id.clone(), tx);
    }

    let mut cmd_obj = serde_json::Map::new();
    cmd_obj.insert("id".to_string(), Value::String(req_id.clone()));
    cmd_obj.insert("type".to_string(), Value::String(cmd_type.to_string()));
    if let Some(fields) = extra_fields {
        for (k, v) in fields {
            cmd_obj.insert(k, v);
        }
    }

    let cmd_str = Value::Object(cmd_obj).to_string();

    if let Err(_) = stdin_tx.send(cmd_str).await {
        let mut pend = pending_responses.lock().await;
        pend.remove(&req_id);
        return Err(format!("Failed to send {cmd_type}: child process stdin closed"));
    }

    let response_result = tokio::time::timeout(timeout_dur, rx).await;
    let response_value = match response_result {
        Ok(Ok(val)) => val,
        Ok(Err(_)) => {
            let mut pend = pending_responses.lock().await;
            pend.remove(&req_id);
            return Err(format!("{cmd_type} response channel closed unexpectedly"));
        }
        Err(_) => {
            let mut pend = pending_responses.lock().await;
            pend.remove(&req_id);
            return Err(format!(
                "Timeout waiting for {cmd_type} response from Pi ({}s)",
                timeout_dur.as_secs()
            ));
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
            .unwrap_or("Pi returned success: false");
        return Err(format!("Pi {cmd_type} failed: {err_msg}"));
    }

    if !session.is_alive() {
        return Err(format!("Session was terminated while executing {cmd_type}"));
    }

    Ok(response_value.get("data").cloned().unwrap_or(Value::Null))
}



/// Fetch list of configured models available in active Pi session
pub async fn get_available_models_impl(state: &AppState) -> Result<Value, String> {
    send_pi_command_internal(
        state,
        "get-models",
        "get_available_models",
        None,
        Duration::from_secs(15),
    )
    .await
}

/// Fetch list of configured models available in active Pi session
#[tauri::command]
pub async fn get_available_models(state: State<'_, AppState>) -> Result<Value, String> {
    get_available_models_impl(&state).await
}

/// Switch active model in current Pi session
pub async fn set_model_impl(
    provider: &str,
    model_id: &str,
    state: &AppState,
) -> Result<Value, String> {
    let p = provider.trim();
    let m = model_id.trim();
    if p.is_empty() {
        return Err("Provider must not be empty".to_string());
    }
    if m.is_empty() {
        return Err("Model ID must not be empty".to_string());
    }

    let mut map = serde_json::Map::new();
    map.insert("provider".to_string(), Value::String(p.to_string()));
    map.insert("modelId".to_string(), Value::String(m.to_string()));

    send_pi_command_internal(
        state,
        "set-model",
        "set_model",
        Some(map),
        Duration::from_secs(15),
    )
    .await
}

/// Switch active model in current Pi session
#[tauri::command]
pub async fn set_model(
    provider: String,
    model_id: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    set_model_impl(&provider, &model_id, &state).await
}

/// Fetch supported thinking / reasoning levels for current model
pub async fn get_available_thinking_levels_impl(state: &AppState) -> Result<Value, String> {
    send_pi_command_internal(
        state,
        "get-thinking-levels",
        "get_available_thinking_levels",
        None,
        Duration::from_secs(15),
    )
    .await
}

/// Fetch supported thinking / reasoning levels for current model
#[tauri::command]
pub async fn get_available_thinking_levels(state: State<'_, AppState>) -> Result<Value, String> {
    get_available_thinking_levels_impl(&state).await
}

/// Set thinking / reasoning level in current Pi session
pub async fn set_thinking_level_impl(
    level: &str,
    state: &AppState,
) -> Result<Value, String> {
    let lvl = level.trim().to_lowercase();
    let valid_levels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
    if !valid_levels.contains(&lvl.as_str()) {
        return Err(format!(
            "Invalid thinking level '{level}'. Must be one of: {}",
            valid_levels.join(", ")
        ));
    }

    let mut map = serde_json::Map::new();
    map.insert("level".to_string(), Value::String(lvl));

    send_pi_command_internal(
        state,
        "set-thinking-level",
        "set_thinking_level",
        Some(map),
        Duration::from_secs(15),
    )
    .await
}

/// Set thinking / reasoning level in current Pi session
#[tauri::command]
pub async fn set_thinking_level(
    level: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    set_thinking_level_impl(&level, &state).await
}

/// Fetch token usage, cost, and context window metrics for active session
pub async fn get_session_stats_impl(state: &AppState) -> Result<Value, String> {
    send_pi_command_internal(
        state,
        "get-session-stats",
        "get_session_stats",
        None,
        Duration::from_secs(15),
    )
    .await
}

/// Fetch token usage, cost, and context window metrics for active session
#[tauri::command]
pub async fn get_session_stats(state: State<'_, AppState>) -> Result<Value, String> {
    get_session_stats_impl(&state).await
}


#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_set_model_input_validation() {
        let app_state = AppState::new();

        let err_empty_provider = set_model_impl("", "gpt-4", &app_state).await;
        assert!(err_empty_provider.is_err());
        assert!(err_empty_provider.unwrap_err().contains("Provider must not be empty"));

        let err_empty_model = set_model_impl("openai", "   ", &app_state).await;
        assert!(err_empty_model.is_err());
        assert!(err_empty_model.unwrap_err().contains("Model ID must not be empty"));
    }

    #[tokio::test]
    async fn test_set_thinking_level_validation() {
        let app_state = AppState::new();

        let err_invalid = set_thinking_level_impl("super-extreme", &app_state).await;
        assert!(err_invalid.is_err());
        assert!(err_invalid.unwrap_err().contains("Invalid thinking level"));

        // Valid level format validation (fails because not connected, but passes argument validation)
        let err_valid = set_thinking_level_impl("high", &app_state).await;
        assert!(err_valid.is_err());
        assert!(err_valid.unwrap_err().contains("Pi RPC bridge is not connected"));
    }

    #[tokio::test]
    async fn test_model_and_stats_commands_require_active_session() {
        let app_state = AppState::new();

        let err_models = get_available_models_impl(&app_state).await;
        assert!(err_models.is_err());
        assert!(err_models.unwrap_err().contains("Pi RPC bridge is not connected"));

        let err_stats = get_session_stats_impl(&app_state).await;
        assert!(err_stats.is_err());
        assert!(err_stats.unwrap_err().contains("Pi RPC bridge is not connected"));

        let err_thinking = get_available_thinking_levels_impl(&app_state).await;
        assert!(err_thinking.is_err());
        assert!(err_thinking.unwrap_err().contains("Pi RPC bridge is not connected"));
    }

}
