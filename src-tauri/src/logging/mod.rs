//! Structured logging for DirecTree backend.
//!
//! - Rolling daily log files in the OS app-data directory.
//! - Log level controlled by `DIRECTREE_LOG` env var (default: `info`).
//! - Helpers for command timing, redaction, and connection-state transitions.

use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Instant;

use tracing_appender::rolling;
use tracing_subscriber::{
    fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter,
};
use uuid::Uuid;

/// The resolved log directory — set once during `init_logging`.
static LOG_DIR: OnceLock<PathBuf> = OnceLock::new();

// ═══════════════════════════════════════════════════════════════
//  Initialisation
// ═══════════════════════════════════════════════════════════════

/// Call once, early in `lib.rs` before any Tauri commands execute.
///
/// Log files are written to `<app_data_dir>/logs/direc-tree-YYYY-MM-DD.log`.
/// The env var `DIRECTREE_LOG` overrides the default level (info).
/// Examples: `DIRECTREE_LOG=debug`, `DIRECTREE_LOG=warn`, `DIRECTREE_LOG=app_lib=debug,ldap3=warn`.
pub fn init_logging() {
    // Resolve log directory: prefer Tauri-style app data, fall back to ~/.directree/logs
    let log_dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.rishabh.directree")
        .join("logs");

    // Ensure dir exists
    std::fs::create_dir_all(&log_dir).ok();

    // Store for later retrieval (e.g. get_log_tail)
    LOG_DIR.set(log_dir.clone()).ok();

    // Rolling daily file appender
    let file_appender = rolling::daily(&log_dir, "direc-tree.log");
    let (non_blocking_file, _guard) = tracing_appender::non_blocking(file_appender);

    // We intentionally leak the guard so that the writer stays alive for the
    // entire process lifetime. This is the standard pattern for tracing-appender.
    std::mem::forget(_guard);

    // Env filter — default to info, override with DIRECTREE_LOG
    let env_filter = EnvFilter::try_from_env("DIRECTREE_LOG")
        .unwrap_or_else(|_| EnvFilter::new("info"));

    // Build subscriber with two layers:
    //  1. File layer  (always, structured)
    //  2. Stdout layer (debug builds only, for dev convenience)
    let file_layer = fmt::layer()
        .with_writer(non_blocking_file)
        .with_ansi(false)
        .with_target(true)
        .with_thread_ids(false)
        .with_timer(fmt::time::SystemTime);

    let registry = tracing_subscriber::registry()
        .with(env_filter)
        .with(file_layer);

    if cfg!(debug_assertions) {
        let stdout_layer = fmt::layer()
            .with_target(true)
            .with_thread_ids(false)
            .compact();
        registry.with(stdout_layer).init();
    } else {
        registry.init();
    }

    tracing::info!(
        log_dir = %log_dir.display(),
        "DirecTree logging initialised"
    );
}

/// Return the resolved log directory (for the `get_log_tail` Tauri command).
pub fn log_directory() -> Option<&'static PathBuf> {
    LOG_DIR.get()
}

// ═══════════════════════════════════════════════════════════════
//  Request-ID generation
// ═══════════════════════════════════════════════════════════════

/// Generate a short request ID for correlating log entries (first 8 chars of UUID).
pub fn new_request_id() -> String {
    Uuid::new_v4().to_string()[..8].to_string()
}

// ═══════════════════════════════════════════════════════════════
//  Redaction helpers
// ═══════════════════════════════════════════════════════════════

/// Completely redacts a secret value.
#[allow(dead_code)]
pub fn redact_secret(_value: &str) -> &'static str {
    "***REDACTED***"
}

/// Partially redact a DN: show first component, mask the rest.
/// `cn=admin,ou=people,dc=example,dc=com` → `cn=admin,***`
pub fn redact_dn(dn: &str) -> String {
    if let Some(pos) = dn.find(',') {
        format!("{},***", &dn[..pos])
    } else {
        dn.to_string()
    }
}

/// Truncate a value preview to at most `max_len` characters.
pub fn truncate_preview(val: &str, max_len: usize) -> String {
    if val.len() <= max_len {
        val.to_string()
    } else {
        format!("{}…({} chars total)", &val[..max_len], val.len())
    }
}

// ═══════════════════════════════════════════════════════════════
//  Command timing helpers
// ═══════════════════════════════════════════════════════════════

/// Log the start of a Tauri command invocation.
#[inline]
pub fn log_command_start(name: &str, request_id: &str, params: &str) {
    tracing::info!(
        cmd = name,
        req_id = request_id,
        params = params,
        "▶ command_start"
    );
}

/// Log the successful end of a Tauri command invocation.
#[inline]
pub fn log_command_end(name: &str, request_id: &str, start: Instant) {
    let duration_ms = start.elapsed().as_millis();
    tracing::info!(
        cmd = name,
        req_id = request_id,
        duration_ms = duration_ms,
        "◀ command_ok"
    );
}

/// Log a failed command.
#[inline]
pub fn log_command_error(name: &str, request_id: &str, start: Instant, error: &str) {
    let duration_ms = start.elapsed().as_millis();
    tracing::error!(
        cmd = name,
        req_id = request_id,
        duration_ms = duration_ms,
        error = error,
        "✖ command_error"
    );
}

// ═══════════════════════════════════════════════════════════════
//  Connection-state transitions
// ═══════════════════════════════════════════════════════════════

pub fn log_connection_state(from: &str, to: &str, detail: &str) {
    tracing::info!(
        from_state = from,
        to_state = to,
        detail = detail,
        "⟳ connection_state_change"
    );
}
