//! Strict LF JSONL framing implementation for Pi RPC communication.
//!
//! Protocol rules per docs/rpc.md:
//! - Strictly split records on LF (`\n`, `0x0A`) only.
//! - Accept optional `\r\n` by stripping a trailing `\r`.
//! - Do not split on Unicode line separators (`\u{2028}`, `\u{2029}`).
//! - Bounded record buffer size to prevent unbounded memory growth.

/// Maximum record buffer limit: 16 MB
pub const MAX_RECORD_SIZE: usize = 16 * 1024 * 1024;

/// A byte-oriented buffer that accumulates streaming subprocess stdout bytes
/// and extracts complete JSONL lines delimited strictly by `\n`.
#[derive(Debug, Default)]
pub struct JsonlFrameBuffer {
    buffer: Vec<u8>,
}

impl JsonlFrameBuffer {
    pub fn new() -> Self {
        Self {
            buffer: Vec::with_capacity(8192),
        }
    }

    /// Push new chunk bytes into the buffer and extract all complete lines.
    ///
    /// Returns an error if the accumulated buffer exceeds `MAX_RECORD_SIZE`.
    pub fn push_bytes(&mut self, bytes: &[u8]) -> Result<Vec<String>, String> {
        if self.buffer.len().saturating_add(bytes.len()) > MAX_RECORD_SIZE {
            return Err(format!(
                "RPC framing buffer exceeded maximum record size of {} bytes",
                MAX_RECORD_SIZE
            ));
        }

        self.buffer.extend_from_slice(bytes);

        let mut lines = Vec::new();
        while let Some(newline_pos) = self.buffer.iter().position(|&b| b == b'\n') {
            // Drain line up to and including the newline character
            let line_bytes = self.buffer.drain(..=newline_pos).collect::<Vec<u8>>();
            let mut slice = &line_bytes[..line_bytes.len() - 1];

            // Strip trailing \r if present (\r\n -> line without \r)
            if slice.last() == Some(&b'\r') {
                slice = &slice[..slice.len() - 1];
            }

            // Skip empty blank lines
            if slice.is_empty() {
                continue;
            }

            let s = String::from_utf8(slice.to_vec())
                .map_err(|e| format!("Invalid UTF-8 in RPC frame: {e}"))?;
            lines.push(s);
        }

        Ok(lines)
    }

    /// Current unconsumed bytes in the buffer
    pub fn pending_bytes(&self) -> usize {
        self.buffer.len()
    }

    /// Clear buffer
    pub fn clear(&mut self) {
        self.buffer.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_single_complete_line() {
        let mut fb = JsonlFrameBuffer::new();
        let lines = fb.push_bytes(b"{\"type\":\"agent_start\"}\n").unwrap();
        assert_eq!(lines, vec!["{\"type\":\"agent_start\"}"]);
        assert_eq!(fb.pending_bytes(), 0);
    }

    #[test]
    fn test_crlf_line() {
        let mut fb = JsonlFrameBuffer::new();
        let lines = fb.push_bytes(b"{\"type\":\"agent_start\"}\r\n").unwrap();
        assert_eq!(lines, vec!["{\"type\":\"agent_start\"}"]);
        assert_eq!(fb.pending_bytes(), 0);
    }

    #[test]
    fn test_multiple_lines_in_single_chunk() {
        let mut fb = JsonlFrameBuffer::new();
        let chunk = b"{\"id\":1}\n{\"id\":2}\r\n{\"id\":3}\n";
        let lines = fb.push_bytes(chunk).unwrap();
        assert_eq!(lines, vec!["{\"id\":1}", "{\"id\":2}", "{\"id\":3}"]);
        assert_eq!(fb.pending_bytes(), 0);
    }

    #[test]
    fn test_split_frames_across_pushes() {
        let mut fb = JsonlFrameBuffer::new();
        let lines1 = fb.push_bytes(b"{\"type\":\"message_").unwrap();
        assert!(lines1.is_empty());
        assert_eq!(fb.pending_bytes(), 17);

        let lines2 = fb.push_bytes(b"update\",\"delta\":\"hi\"}\n").unwrap();
        assert_eq!(lines2, vec!["{\"type\":\"message_update\",\"delta\":\"hi\"}"]);
        assert_eq!(fb.pending_bytes(), 0);
    }

    #[test]
    fn test_utf8_split_across_pushes() {
        let mut fb = JsonlFrameBuffer::new();
        // Emoji '🎉' is 4 bytes: F0 9F 8E 89
        let part1 = b"{\"delta\":\"\xF0\x9F";
        let part2 = b"\x8E\x89\"}\n";

        let lines1 = fb.push_bytes(part1).unwrap();
        assert!(lines1.is_empty());

        let lines2 = fb.push_bytes(part2).unwrap();
        assert_eq!(lines2, vec!["{\"delta\":\"🎉\"}"]);
        assert_eq!(fb.pending_bytes(), 0);
    }

    #[test]
    fn test_unicode_line_separators_not_split() {
        let mut fb = JsonlFrameBuffer::new();
        // U+2028 (Line Separator) and U+2029 (Paragraph Separator)
        // must NOT split records per docs/rpc.md!
        let msg = "{\"text\":\"line1\u{2028}line2\u{2029}line3\"}\n";
        let lines = fb.push_bytes(msg.as_bytes()).unwrap();
        assert_eq!(lines, vec!["{\"text\":\"line1\u{2028}line2\u{2029}line3\"}"]);
    }

    #[test]
    fn test_empty_lines_ignored() {
        let mut fb = JsonlFrameBuffer::new();
        let lines = fb.push_bytes(b"\n\r\n{\"a\":1}\n\n").unwrap();
        assert_eq!(lines, vec!["{\"a\":1}"]);
    }

    #[test]
    fn test_buffer_overflow_error() {
        let mut fb = JsonlFrameBuffer::new();
        let large_chunk = vec![b'a'; MAX_RECORD_SIZE + 1];
        let res = fb.push_bytes(&large_chunk);
        assert!(res.is_err());
    }
}
