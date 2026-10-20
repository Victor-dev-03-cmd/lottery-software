// Prevents additional console window on Windows in release — DO NOT REMOVE
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::panic;

fn main() {
    // ── Global panic hook ─────────────────────────────────────────────────────
    // On any Rust panic:
    //   1. Write full details to %APPDATA%\com.ajithrohana.lotterymanager\app.log
    //      (falls back to %TEMP%\lottery-manager-crash.log if app dir unavailable)
    //   2. Show a Windows MessageBox in release mode so the user sees the error
    //      instead of a silent crash
    panic::set_hook(Box::new(|info| {
        let msg = format!(
            "[{}] PANIC\nLocation: {}\nMessage: {}\n\n",
            chrono_now(),
            info.location()
                .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
                .unwrap_or_else(|| "unknown".into()),
            info.payload()
                .downcast_ref::<&str>()
                .copied()
                .or_else(|| info.payload().downcast_ref::<String>().map(String::as_str))
                .unwrap_or("(non-string panic payload)"),
        );

        // Write to log file
        let log_path = log_file_path();
        if let Some(ref path) = log_path {
            // Append — keep previous crashes
            use std::io::Write;
            if let Ok(mut f) = std::fs::OpenOptions::new()
                .create(true).append(true).open(path)
            {
                let _ = f.write_all(msg.as_bytes());
            }
        }

        // On Windows release builds show a dialog so the user sees the crash
        #[cfg(all(target_os = "windows", not(debug_assertions)))]
        show_windows_error(&msg, log_path.as_deref());
    }));

    // ── Start application ─────────────────────────────────────────────────────
    // `run()` contains all plugin registration, DB init, and the Tauri event loop.
    // Any panic inside it is caught by the hook above.
    tauri_app_lib::run();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Returns the path to write the crash log.
/// Prefers the Tauri app-data dir; falls back to TEMP.
fn log_file_path() -> Option<std::path::PathBuf> {
    // Try %APPDATA%\com.ajithrohana.lotterymanager\app.log first
    if let Some(data) = dirs_log() {
        let dir = std::path::PathBuf::from(&data);
        if std::fs::create_dir_all(&dir).is_ok() {
            return Some(dir.join("app.log"));
        }
    }
    // Fallback: %TEMP% / /tmp
    std::env::var("TEMP")
        .or_else(|_| std::env::var("TMP"))
        .or_else(|_| std::env::var("TMPDIR"))
        .ok()
        .map(|t| std::path::PathBuf::from(t).join("lottery-manager-crash.log"))
}

/// Resolve the Tauri app-config directory without a running app handle.
fn dirs_log() -> Option<String> {
    // Windows: %APPDATA%\<identifier>
    // Linux:  ~/.config/<identifier>
    #[cfg(target_os = "windows")]
    {
        std::env::var("APPDATA")
            .ok()
            .map(|a| format!("{a}\\com.ajithrohana.lotterymanager"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("HOME")
            .ok()
            .map(|h| format!("{h}/.config/com.ajithrohana.lotterymanager"))
    }
}

/// Minimal timestamp without pulling in a full chrono crate.
fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Format as YYYY-MM-DD HH:MM:SS UTC (integer arithmetic only)
    let s  = secs;
    let ss = s % 60;
    let mm = (s / 60) % 60;
    let hh = (s / 3600) % 24;
    let days = s / 86400;
    // Rough Gregorian date from days since epoch (good enough for a log line)
    let year = 1970 + days / 365;
    let doy  = days % 365;
    let mon  = (doy / 30) + 1;
    let day  = (doy % 30) + 1;
    format!("{year:04}-{mon:02}-{day:02} {hh:02}:{mm:02}:{ss:02} UTC")
}

/// Show a Windows MessageBox with the crash message and log path.
#[cfg(all(target_os = "windows", not(debug_assertions)))]
fn show_windows_error(msg: &str, log_path: Option<&std::path::Path>) {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    let log_hint = log_path
        .map(|p| format!("\n\nCrash log: {}", p.display()))
        .unwrap_or_default();

    let full = format!(
        "Lottery Manager encountered an unexpected error and must close.\n\n{msg}{log_hint}\n\nPlease send the log file to support."
    );

    // Encode as wide string for MessageBoxW
    let wide: Vec<u16> = OsStr::new(&full)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let title: Vec<u16> = OsStr::new("Lottery Manager — Error")
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    // Safety: we call a well-defined Win32 API with valid null-terminated wide strings.
    unsafe {
        #[allow(non_snake_case)]
        extern "system" {
            fn MessageBoxW(hWnd: *mut std::ffi::c_void, lpText: *const u16, lpCaption: *const u16, uType: u32) -> i32;
        }
        MessageBoxW(
            std::ptr::null_mut(),
            wide.as_ptr(),
            title.as_ptr(),
            0x0010, // MB_ICONERROR
        );
    }
}
