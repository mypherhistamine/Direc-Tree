use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

use crate::logging;

/// Return the last N lines from today's (most recent) log file.
#[tauri::command]
pub fn get_log_tail(lines: u32) -> Result<Vec<String>, String> {
    let log_dir = logging::log_directory()
        .ok_or_else(|| "Logging not initialised".to_string())?;

    // Find the most recent log file in the directory
    let latest = find_latest_log(log_dir)?;

    // Read lines from file
    let file = fs::File::open(&latest)
        .map_err(|e| format!("Cannot open log file: {}", e))?;
    let reader = BufReader::new(file);
    let all_lines: Vec<String> = reader
        .lines()
        .filter_map(|l| l.ok())
        .collect();

    // Return last N lines
    let n = lines as usize;
    let start = if all_lines.len() > n {
        all_lines.len() - n
    } else {
        0
    };
    Ok(all_lines[start..].to_vec())
}

/// Return the log directory path (for display in the UI).
#[tauri::command]
pub fn get_log_dir() -> Result<String, String> {
    let log_dir = logging::log_directory()
        .ok_or_else(|| "Logging not initialised".to_string())?;
    Ok(log_dir.display().to_string())
}

/// Find the most recently modified .log file in the directory.
fn find_latest_log(dir: &PathBuf) -> Result<PathBuf, String> {
    let mut entries: Vec<(PathBuf, std::time::SystemTime)> = fs::read_dir(dir)
        .map_err(|e| format!("Cannot read log dir: {}", e))?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .map_or(false, |ext| ext == "log")
        })
        .filter_map(|e| {
            let modified = e.metadata().ok()?.modified().ok()?;
            Some((e.path(), modified))
        })
        .collect();

    entries.sort_by(|a, b| b.1.cmp(&a.1));
    entries
        .into_iter()
        .next()
        .map(|(p, _)| p)
        .ok_or_else(|| "No log files found".to_string())
}
