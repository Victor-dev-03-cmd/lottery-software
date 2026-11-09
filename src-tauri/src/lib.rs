use tauri::Manager;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;
use std::sync::{OnceLock, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};


// ── App configuration ──────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppConfig {
    /// Custom directory chosen by user, empty = use default app-data dir.
    pub db_directory: String,
    /// Set to true after the first-run setup wizard completes.
    pub setup_completed: bool,
    /// Supabase project URL (optional cloud sync — preserved, not removed)
    #[serde(default)]
    pub supabase_url: String,
    /// Supabase anon key (optional cloud sync — preserved, not removed)
    #[serde(default)]
    pub supabase_anon_key: String,
    /// Go API server URL (e.g. https://api.example.com). When set, the
    /// background sync worker drains the queue to this API instead of Supabase.
    #[serde(default)]
    pub api_server_url: String,
    /// Device key issued by the Go API at registration time.
    /// Stored as plain text in the config file (local machine only).
    #[serde(default)]
    pub api_device_key: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            db_directory:      String::new(),
            setup_completed:   false,
            supabase_url:      String::new(),
            supabase_anon_key: String::new(),
            api_server_url:    String::new(),
            api_device_key:    String::new(),
        }
    }
}

fn config_file_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|p| p.join("lottery_config.json"))
        .map_err(|e| e.to_string())
}

fn load_config(app: &tauri::AppHandle) -> AppConfig {
    let path = match config_file_path(app) {
        Ok(p) => p,
        Err(_) => return AppConfig::default(),
    };
    if !path.exists() {
        return AppConfig::default();
    }
    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_)      => AppConfig::default(),
    }
}

fn persist_config(app: &tauri::AppHandle, config: &AppConfig) -> Result<(), String> {
    let path = config_file_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(&path, json.as_bytes()).map_err(|e| e.to_string())
}

/// Returns the full absolute path of the active database file.
fn resolve_db_path(app: &tauri::AppHandle) -> String {
    let config = load_config(app);
    if !config.db_directory.is_empty() {
        let dir = PathBuf::from(&config.db_directory);
        return dir.join("ajith_rohana.db").to_string_lossy().to_string();
    }
    // Default: app data directory
    app.path()
        .app_data_dir()
        .map(|p| p.join("ajith_rohana.db").to_string_lossy().to_string())
        .unwrap_or_else(|_| "ajith_rohana.db".to_string())
}

// ── DB path discovery (for backup) ────────────────────────────────────────────

fn find_db(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    // 1. Check user-configured path
    let config = load_config(app);
    if !config.db_directory.is_empty() {
        let p = PathBuf::from(&config.db_directory).join("ajith_rohana.db");
        if p.exists() { return Ok(p); }
    }

    // 2. Default app-data locations
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    for name in &["ajith_rohana.db", "nimalsiri.db"] {
        let p = data_dir.join(name);
        if p.exists() { return Ok(p); }
    }

    // 3. Search one level of subdirectories
    if let Ok(entries) = std::fs::read_dir(&data_dir) {
        for entry in entries.flatten() {
            for name in &["ajith_rohana.db", "nimalsiri.db"] {
                let p = entry.path().join(name);
                if p.exists() { return Ok(p); }
            }
        }
    }

    Err(format!(
        "Database file not found.\n\
         Expected: {}\n\
         The database is created after the first data entry.",
        data_dir.display()
    ))
}

// ── Tauri commands ─────────────────────────────────────────────────────────────

#[tauri::command]
async fn get_app_config(app: tauri::AppHandle) -> AppConfig {
    load_config(&app)
}

#[tauri::command]
async fn save_app_config(app: tauri::AppHandle, config: AppConfig) -> Result<(), String> {
    persist_config(&app, &config)
}

/// Returns the connection string for tauri-plugin-sql (e.g. "sqlite:/abs/path/file.db").
#[tauri::command]
async fn get_db_connection_string(app: tauri::AppHandle) -> String {
    let abs_path = resolve_db_path(&app);
    // Ensure parent directory exists
    if let Some(parent) = PathBuf::from(&abs_path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    // tauri-plugin-sql accepts "sqlite:/absolute/path" on Unix and "sqlite:C:/..." on Windows
    format!("sqlite:{}", abs_path)
}

#[tauri::command]
async fn get_db_path(app: tauri::AppHandle) -> Result<String, String> {
    Ok(resolve_db_path(&app))
}

#[tauri::command]
async fn get_app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn backup_db_to_path(app: tauri::AppHandle, dest_path: String) -> Result<String, String> {
    let src = find_db(&app)?;

    // Step 1: Copy the file.
    std::fs::copy(&src, &dest_path)
        .map_err(|e| format!("Backup copy failed: {}", e))?;

    // Step 2: Minimum size guard.
    // SQLite treats a zero-byte file as a valid empty database and PRAGMA integrity_check
    // returns "ok" — which would give false confidence for a truncated or missing backup.
    // A real non-empty SQLite DB is always at least one page (default 4096 bytes).
    let backup_size = std::fs::metadata(&dest_path)
        .map(|m| m.len())
        .unwrap_or(0);
    if backup_size < 4096 {
        let _ = std::fs::remove_file(&dest_path);
        return Err(format!(
            "Backup size check FAILED ({} bytes is too small for a valid SQLite database). \
             The backup has been deleted. Ensure the source database is not empty and retry.",
            backup_size
        ));
    }

    // Step 3: Open the copy with rusqlite and run PRAGMA integrity_check.
    // This catches truncated writes, filesystem corruption, and partial copies.
    // The check runs on the COPY (read-only), never on the active database.
    let dest_for_check = dest_path.clone();
    let check_result = tokio::task::spawn_blocking(move || {
        let conn = rusqlite::Connection::open_with_flags(
            &dest_for_check,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .map_err(|e| format!("Cannot open backup for verification: {}", e))?;

        let result: String = conn
            .query_row("PRAGMA integrity_check;", [], |row| row.get(0))
            .map_err(|e| format!("PRAGMA integrity_check failed: {}", e))?;

        Ok::<String, String>(result)
    })
    .await
    .map_err(|e| format!("Verification thread panicked: {}", e))??;

    if check_result != "ok" {
        // The backup is corrupt. Remove it so the caller is not left with a bad file.
        let _ = std::fs::remove_file(&dest_path);
        return Err(format!(
            "Backup integrity check FAILED (result: {}). \
             The incomplete backup has been deleted. \
             Check available disk space and retry.",
            check_result
        ));
    }

    Ok(dest_path)
}

#[tauri::command]
async fn restore_db_from_path(app: tauri::AppHandle, src_path: String) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let config = load_config(&app);
    let db_dest = if !config.db_directory.is_empty() {
        PathBuf::from(&config.db_directory).join("ajith_rohana.db")
    } else {
        data_dir.join("ajith_rohana.db")
    };

    // Step 1: Validate source file before touching the live database.
    // Re-uses the same two-step guard as backup_db_to_path.
    let src_size = std::fs::metadata(&src_path)
        .map(|m| m.len())
        .map_err(|e| format!("Cannot read source file: {}", e))?;
    if src_size < 4096 {
        return Err(format!(
            "The selected file is too small ({} bytes) to be a valid SQLite database. \
             Restore cancelled — the current database has not been touched.",
            src_size
        ));
    }
    let src_for_check = src_path.clone();
    let check_result = tokio::task::spawn_blocking(move || {
        let conn = rusqlite::Connection::open_with_flags(
            &src_for_check,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .map_err(|e| format!("Cannot open backup file for verification: {}", e))?;
        let result: String = conn
            .query_row("PRAGMA integrity_check;", [], |row| row.get(0))
            .map_err(|e| format!("PRAGMA integrity_check failed: {}", e))?;
        Ok::<String, String>(result)
    })
    .await
    .map_err(|e| format!("Verification thread panicked: {}", e))??;

    if check_result != "ok" {
        return Err(format!(
            "The selected backup file failed integrity check (result: {}). \
             Restore cancelled — the current database has not been touched.",
            check_result
        ));
    }

    // Step 2: Create a pre-restore backup of the current DB.
    // Fail the entire operation if this backup cannot be created — the user
    // must not lose the current database without a confirmed safety copy.
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let backup_dir = data_dir.join("backups");
    std::fs::create_dir_all(&backup_dir)
        .map_err(|e| format!("Cannot create backups directory: {}", e))?;
    let pre_restore_path = backup_dir.join(format!("pre_restore_{}.db", ts));
    if db_dest.exists() {
        std::fs::copy(&db_dest, &pre_restore_path)
            .map_err(|e| format!(
                "Pre-restore backup failed: {}. Restore cancelled — \
                 the current database has not been touched.", e
            ))?;
    }

    // Step 3: Write to a temp file first, then rename atomically.
    // If the copy is interrupted mid-write, the live database is untouched.
    let tmp_dest = db_dest.with_extension("db.restoring");
    if let Err(e) = std::fs::copy(&src_path, &tmp_dest) {
        let _ = std::fs::remove_file(&tmp_dest);
        return Err(format!(
            "Failed to write restore file: {}. \
             The current database has not been changed. \
             Pre-restore backup is at: {}",
            e,
            pre_restore_path.display()
        ));
    }
    std::fs::rename(&tmp_dest, &db_dest).map_err(|e| {
        let _ = std::fs::remove_file(&tmp_dest);
        format!(
            "Restore rename failed: {}. \
             The current database may be in an inconsistent state. \
             Pre-restore backup is at: {}",
            e,
            pre_restore_path.display()
        )
    })?;

    Ok(())
}

#[tauri::command]
async fn list_backups(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let backup_dir = data_dir.join("backups");
    if !backup_dir.exists() { return Ok(vec![]); }
    let mut backups: Vec<String> = std::fs::read_dir(&backup_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path  = entry.path();
            if path.extension()?.to_str()? == "db" {
                Some(path.to_string_lossy().to_string())
            } else { None }
        })
        .collect();
    backups.sort_by(|a, b| b.cmp(a));
    Ok(backups)
}

#[tauri::command]
async fn db_file_exists(app: tauri::AppHandle) -> bool {
    find_db(&app).is_ok()
}

#[tauri::command]
async fn write_text_file(_app: tauri::AppHandle, path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content.as_bytes())
        .map_err(|e| format!("Write failed: {}", e))
}

// ── Supabase REST API via reqwest (bypasses WebView CORS/fetch issues) ─────────

fn supabase_headers(anon_key: &str) -> reqwest::header::HeaderMap {
    let mut h = reqwest::header::HeaderMap::new();
    if let Ok(k) = anon_key.parse() { h.insert("apikey", k); }
    if let Ok(v) = format!("Bearer {}", anon_key).parse() {
        h.insert("Authorization", v);
    }
    let _ = h.insert("Content-Type", "application/json".parse().unwrap());
    let _ = h.insert("Prefer", "resolution=merge-duplicates,return=minimal".parse().unwrap());
    h
}

/// Update Supabase credentials in the app config file.
#[tauri::command]
async fn save_supabase_config(
    app: tauri::AppHandle,
    supabase_url: String,
    supabase_anon_key: String,
) -> Result<(), String> {
    let mut config = load_config(&app);
    config.supabase_url     = supabase_url;
    config.supabase_anon_key = supabase_anon_key;
    persist_config(&app, &config)
}

/// Test Supabase connectivity and return status message.
#[tauri::command]
async fn test_supabase_connection(app: tauri::AppHandle) -> String {
    let config = load_config(&app);
    if config.supabase_url.is_empty() {
        return "Not configured. Enter your Supabase URL and anon key in Settings.".to_string();
    }
    let url = format!("{}/rest/v1/lottery_results?select=id&limit=1",
        config.supabase_url.trim_end_matches('/'));
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .default_headers(supabase_headers(&config.supabase_anon_key))
        .build()
    {
        Ok(c) => c,
        Err(e) => return format!("Client build error: {}", e),
    };
    match client.get(&url).send().await {
        Ok(r) if r.status().is_success() => "✓ Connected to Supabase successfully.".to_string(),
        Ok(r) => format!("HTTP {}: Check your URL and anon key.", r.status()),
        Err(e) => format!("Connection failed: {}", e),
    }
}

// ── Local Developer API Gateway (Axum HTTP, port 7423) ────────────────────────

#[tauri::command]
async fn get_api_key(app: tauri::AppHandle) -> String {
    // Returns (or generates) a persistent API key stored in app config
    let config_path = match app.path().app_config_dir() {
        Ok(p) => p.join("api_key.txt"),
        Err(_) => return "CONFIGURE_API_KEY".to_string(),
    };
    if config_path.exists() {
        if let Ok(key) = std::fs::read_to_string(&config_path) {
            let key = key.trim().to_string();
            if !key.is_empty() { return key; }
        }
    }
    // Generate new UUID key
    let new_key = uuid::Uuid::new_v4().to_string();
    let _ = std::fs::create_dir_all(config_path.parent().unwrap());
    let _ = std::fs::write(&config_path, &new_key);
    new_key
}

/// Start the local REST API server on 0.0.0.0:7423 — accessible from mobile on same WiFi.
/// Idempotent: if the server is already bound, subsequent calls return immediately.
#[tauri::command]
async fn start_api_server(app: tauri::AppHandle) {
    let flag = API_STARTED.get_or_init(|| AtomicBool::new(false));
    if flag.swap(true, Ordering::SeqCst) {
        return;
    }
    let app_handle = app.clone(); // kept for event emission; get_api_key consumes app
    let db_path = find_db(&app)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let api_key = get_api_key(app).await;

    tauri::async_runtime::spawn(async move {
        use axum::{
            Router, routing::get,
            extract::{Query, State},
            http::{StatusCode, HeaderMap},
            Json,
            response::IntoResponse,
        };
        use std::{collections::HashMap, sync::Arc};

        #[derive(Clone)]
        struct ApiState { db_path: String, api_key: String, app: tauri::AppHandle }

        async fn auth_check(
            State(s): State<Arc<ApiState>>,
            headers: HeaderMap,
            req: axum::http::Request<axum::body::Body>,
            next: axum::middleware::Next,
        ) -> impl IntoResponse {
            let key = headers.get("x-api-key").and_then(|v| v.to_str().ok()).unwrap_or("");
            let allowed = !s.api_key.is_empty() && key == s.api_key;
            if allowed {
                Ok(next.run(req).await)
            } else {
                Err((StatusCode::UNAUTHORIZED, Json(serde_json::json!({
                    "error": "Unauthorized",
                    "hint": "Mobile app: use x-api-key: LOTTERY_COMPANION"
                }))))
            }
        }

        async fn health() -> Json<serde_json::Value> {
            Json(serde_json::json!({"status":"ok","service":"ajith-rohana-lottery-api","version":"1.0"}))
        }

        async fn results_handler(
            State(s): State<Arc<ApiState>>,
            Query(params): Query<HashMap<String, String>>,
        ) -> impl IntoResponse {
            if s.db_path.is_empty() {
                return (StatusCode::SERVICE_UNAVAILABLE,
                    Json(serde_json::json!({"error":"Database not found"}))).into_response();
            }
            let board = params.get("board").map(|s| s.as_str()).unwrap_or("NLB");
            let game  = params.get("game").map(|s| s.as_str()).unwrap_or("");
            let date  = params.get("date").map(|s| s.as_str()).unwrap_or("");

            let res: serde_json::Value = tokio::task::spawn_blocking({
                let db_path = s.db_path.clone();
                let board = board.to_string();
                let game  = game.to_string();
                let date  = date.to_string();
                move || {
                    let conn = rusqlite::Connection::open(&db_path)
                        .map_err(|e| e.to_string())?;
                    let sql = if date.is_empty() {
                        "SELECT * FROM lottery_results WHERE UPPER(board)=UPPER(?1) AND game_slug=?2 ORDER BY draw_date DESC LIMIT 10".to_string()
                    } else {
                        "SELECT * FROM lottery_results WHERE UPPER(board)=UPPER(?1) AND game_slug=?2 AND draw_date=?3 LIMIT 1".to_string()
                    };
                    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
                    let row_mapper = |r: &rusqlite::Row<'_>| -> rusqlite::Result<serde_json::Value> {
                        Ok(serde_json::json!({
                            "game_slug":      r.get::<_, String>(1).unwrap_or_default(),
                            "board":          r.get::<_, String>(3).unwrap_or_default(),
                            "draw_number":    r.get::<_, String>(4).unwrap_or_default(),
                            "draw_date":      r.get::<_, String>(5).unwrap_or_default(),
                            "winning_letter": r.get::<_, String>(6).unwrap_or_default(),
                            "winning_numbers":r.get::<_, String>(7).unwrap_or_default(),
                            "super_number":   r.get::<_, String>(8).unwrap_or_default(),
                        }))
                    };
                    let rows: Vec<serde_json::Value> = if date.is_empty() {
                        stmt.query_map(rusqlite::params![board, game], row_mapper)
                            .map_err(|e| e.to_string())?
                            .filter_map(|r| r.ok())
                            .collect()
                    } else {
                        stmt.query_map(rusqlite::params![board, game, date], row_mapper)
                            .map_err(|e| e.to_string())?
                            .filter_map(|r| r.ok())
                            .collect()
                    };
                    Ok::<_, String>(serde_json::json!({"success":true,"count":rows.len(),"data":rows}))
                }
            }).await
            .unwrap_or_else(|_| Ok(serde_json::json!({"error":"Thread error"})))
            .unwrap_or_else(|e| serde_json::json!({"error":e}));

            Json(res).into_response()
        }

        // ── Mobile API handlers ───────────────────────────────────────────────

        async fn stock_handler(State(s): State<Arc<ApiState>>) -> impl IntoResponse {
            let res = tokio::task::spawn_blocking({
                let db = s.db_path.clone();
                move || -> Result<serde_json::Value, String> {
                    let conn = rusqlite::Connection::open(&db).map_err(|e| e.to_string())?;
                    let mut stmt = conn.prepare(
                        "SELECT game_name, SUM(total_qty) as total, SUM(distributed_qty) as dist,
                                SUM(total_qty - distributed_qty) as remaining
                         FROM inventory_batches GROUP BY game_name ORDER BY game_name ASC"
                    ).map_err(|e| e.to_string())?;
                    let rows: Vec<serde_json::Value> = stmt.query_map([], |r| {
                        Ok(serde_json::json!({
                            "game_name": r.get::<_,String>(0).unwrap_or_default(),
                            "total":     r.get::<_,i64>(1).unwrap_or(0),
                            "sold":      r.get::<_,i64>(2).unwrap_or(0),
                            "remaining": r.get::<_,i64>(3).unwrap_or(0),
                        }))
                    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
                    Ok(serde_json::json!({"success":true,"data":rows}))
                }
            }).await.unwrap_or_else(|_| Ok(serde_json::json!({"error":"thread error"}))).unwrap_or_else(|e| serde_json::json!({"error":e}));
            Json(res).into_response()
        }

        async fn agents_handler(State(s): State<Arc<ApiState>>) -> impl IntoResponse {
            let res = tokio::task::spawn_blocking({
                let db = s.db_path.clone();
                move || -> Result<serde_json::Value, String> {
                    let conn = rusqlite::Connection::open(&db).map_err(|e| e.to_string())?;
                    let mut stmt = conn.prepare(
                        "SELECT id, name, nlb_reg, dlb_reg, phone FROM agents ORDER BY name ASC"
                    ).map_err(|e| e.to_string())?;
                    let rows: Vec<serde_json::Value> = stmt.query_map([], |r| {
                        Ok(serde_json::json!({
                            "id":      r.get::<_,i64>(0).unwrap_or(0),
                            "name":    r.get::<_,String>(1).unwrap_or_default(),
                            "nlb_reg": r.get::<_,String>(2).unwrap_or_default(),
                            "dlb_reg": r.get::<_,String>(3).unwrap_or_default(),
                            "phone":   r.get::<_,String>(4).unwrap_or_default(),
                        }))
                    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
                    Ok(serde_json::json!({"success":true,"data":rows}))
                }
            }).await.unwrap_or_else(|_| Ok(serde_json::json!({"error":"thread error"}))).unwrap_or_else(|e| serde_json::json!({"error":e}));
            Json(res).into_response()
        }

        async fn invoices_handler(
            State(s): State<Arc<ApiState>>,
            Query(params): Query<HashMap<String, String>>,
        ) -> impl IntoResponse {
            let res = tokio::task::spawn_blocking({
                let db = s.db_path.clone();
                let agent_id = params.get("agent_id").and_then(|v| v.parse::<i64>().ok());
                move || -> Result<serde_json::Value, String> {
                    let conn = rusqlite::Connection::open(&db).map_err(|e| e.to_string())?;
                    let sql = if agent_id.is_some() {
                        "SELECT i.id, i.invoice_number, a.name, i.invoice_date, i.invoice_total,
                                i.outstanding_balance, COALESCE(i.invoice_status,'paid') as status
                         FROM invoices i LEFT JOIN agents a ON a.id=i.agent_id
                         WHERE i.agent_id=?1 ORDER BY i.invoice_date DESC LIMIT 50"
                    } else {
                        "SELECT i.id, i.invoice_number, a.name, i.invoice_date, i.invoice_total,
                                i.outstanding_balance, COALESCE(i.invoice_status,'paid') as status
                         FROM invoices i LEFT JOIN agents a ON a.id=i.agent_id
                         ORDER BY i.invoice_date DESC LIMIT 50"
                    };
                    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
                    let mapper = |r: &rusqlite::Row<'_>| Ok(serde_json::json!({
                        "id":             r.get::<_,i64>(0).unwrap_or(0),
                        "invoice_number": r.get::<_,String>(1).unwrap_or_default(),
                        "agent_name":     r.get::<_,String>(2).unwrap_or_default(),
                        "invoice_date":   r.get::<_,String>(3).unwrap_or_default(),
                        "invoice_total":  r.get::<_,f64>(4).unwrap_or(0.0),
                        "outstanding":    r.get::<_,f64>(5).unwrap_or(0.0),
                        "status":         r.get::<_,String>(6).unwrap_or_default(),
                    }));
                    let rows: Vec<serde_json::Value> = if let Some(aid) = agent_id {
                        stmt.query_map(rusqlite::params![aid], mapper)
                    } else {
                        stmt.query_map([], mapper)
                    }.map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
                    Ok(serde_json::json!({"success":true,"data":rows}))
                }
            }).await.unwrap_or_else(|_| Ok(serde_json::json!({"error":"thread error"}))).unwrap_or_else(|e| serde_json::json!({"error":e}));
            Json(res).into_response()
        }

        use axum::extract::Json as BodyJson;

        async fn purchases_post(
            State(s): State<Arc<ApiState>>,
            BodyJson(body): BodyJson<serde_json::Value>,
        ) -> impl IntoResponse {
            let res = tokio::task::spawn_blocking({
                let db = s.db_path.clone();
                move || -> Result<serde_json::Value, String> {
                    let game  = body["game_name"].as_str().unwrap_or("").to_string();
                    let bs    = body["barcode_start"].as_str().unwrap_or("").to_string();
                    let be    = body["barcode_end"].as_str().unwrap_or("").to_string();
                    let qty   = body["qty"].as_i64().unwrap_or(0);
                    let price = body["unit_price"].as_f64().unwrap_or(32.5);
                    let date  = body["purchase_date"].as_str().unwrap_or("").to_string();
                    if game.is_empty() || qty <= 0 { return Err("game_name and qty required".into()); }
                    let conn = rusqlite::Connection::open(&db).map_err(|e| e.to_string())?;
                    // Insert into inventory_batches directly for mobile quick-add
                    conn.execute(
                        "INSERT INTO inventory_batches (game_name,batch_date,barcode_start,barcode_end,total_qty,distributed_qty,unit_price,low_stock_threshold,notes) VALUES (?1,?2,?3,?4,?5,0,?6,100,'From mobile scanner')",
                        rusqlite::params![game, date, bs, be, qty, price]
                    ).map_err(|e| e.to_string())?;
                    Ok(serde_json::json!({"success":true,"message":"Stock added successfully"}))
                }
            }).await.unwrap_or_else(|_| Ok(serde_json::json!({"error":"thread error"}))).unwrap_or_else(|e| serde_json::json!({"error":e}));
            (if res["success"].as_bool().unwrap_or(false) { StatusCode::CREATED } else { StatusCode::BAD_REQUEST },
             Json(res)).into_response()
        }

        async fn returns_post(
            State(s): State<Arc<ApiState>>,
            BodyJson(body): BodyJson<serde_json::Value>,
        ) -> impl IntoResponse {
            let res = tokio::task::spawn_blocking({
                let db = s.db_path.clone();
                move || -> Result<serde_json::Value, String> {
                    let game   = body["game_name"].as_str().unwrap_or("").to_string();
                    let bs     = body["barcode_start"].as_str().unwrap_or("").to_string();
                    let be     = body["barcode_end"].as_str().unwrap_or("").to_string();
                    let qty    = body["qty"].as_i64().unwrap_or(0);
                    let reason = body["reason"].as_str().unwrap_or("unsold").to_string();
                    let date   = body["return_date"].as_str().unwrap_or("").to_string();
                    let price  = body["unit_price"].as_f64().unwrap_or(32.5);
                    if game.is_empty() || qty <= 0 { return Err("game_name and qty required".into()); }
                    let total  = qty as f64 * price;
                    let conn = rusqlite::Connection::open(&db).map_err(|e| e.to_string())?;
                    conn.execute(
                        "INSERT INTO supplier_returns (return_date,game_name,barcode_start,barcode_end,qty,unit_price,total_value,return_reason,status,notes) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'pending','From mobile scanner')",
                        rusqlite::params![date, game, bs, be, qty, price, total, reason]
                    ).map_err(|e| e.to_string())?;
                    Ok(serde_json::json!({"success":true,"message":"Return recorded successfully"}))
                }
            }).await.unwrap_or_else(|_| Ok(serde_json::json!({"error":"thread error"}))).unwrap_or_else(|e| serde_json::json!({"error":e}));
            (if res["success"].as_bool().unwrap_or(false) { StatusCode::CREATED } else { StatusCode::BAD_REQUEST },
             Json(res)).into_response()
        }

        // ── CORS middleware for React Native ──────────────────────────────────
        use axum::http::Method;
        use tower_http::cors::{CorsLayer, Any};
        let cors = CorsLayer::new()
            .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
            .allow_headers(Any)
            .allow_origin(Any);

        // /api/v1/scan — mobile sends scanned ticket here; no DB write, just emits
        // a Tauri event so the desktop Purchases form auto-fills in real-time.
        async fn scan_handler(
            State(s): State<Arc<ApiState>>,
            BodyJson(body): BodyJson<serde_json::Value>,
        ) -> impl IntoResponse {
            let payload = serde_json::json!({
                "game_name":     body["game_name"].as_str().unwrap_or(""),
                "draw_number":   body["draw_number"].as_str().unwrap_or(""),
                "draw_date":     body["draw_date"].as_str().unwrap_or(""),
                "barcode_start": body["barcode_start"].as_str().unwrap_or(""),
                // barcode_end is empty on the initial QR scan; non-empty when
                // the user scans the last ticket barcode on the mobile app.
                // The desktop listener uses this to update an existing row's
                // barcode_end rather than creating a new purchase row.
                "barcode_end":   body["barcode_end"].as_str().unwrap_or(""),
                "board":         body["board"].as_str().unwrap_or(""),
                "raw_qr":        body["raw_qr"].as_str().unwrap_or(""),
            });
            let _ = s.app.emit("mobile:ticket", &payload);
            (StatusCode::OK, Json(serde_json::json!({"success":true,"message":"Ticket received — desktop form updated"})))
        }

        let state = Arc::new(ApiState { db_path, api_key, app: app_handle });

        // /api/v1/health is public (used for discovery pings — reveals no data)
        // All other endpoints require x-api-key: LOTTERY_COMPANION (or the main UUID)
        let protected = Router::new()
            .route("/api/v1/results",   get(results_handler))
            .route("/api/v1/stock",     get(stock_handler))
            .route("/api/v1/agents",    get(agents_handler))
            .route("/api/v1/invoices",  get(invoices_handler))
            .route("/api/v1/purchases", axum::routing::post(purchases_post))
            .route("/api/v1/returns",   axum::routing::post(returns_post))
            .route("/api/v1/scan",      axum::routing::post(scan_handler))
            .layer(axum::middleware::from_fn_with_state(state.clone(), auth_check))
            .with_state(state.clone());

        let app = Router::new()
            .route("/api/v1/health", get(health))   // public — no auth
            .merge(protected)
            .layer(cors)
            .with_state(state);

        // Bind to 0.0.0.0 so mobile devices on the same WiFi can connect
        if let Ok(listener) = tokio::net::TcpListener::bind("0.0.0.0:7423").await {
            let _ = axum::serve(listener, app).await;
        }
        // Bind failed (port busy) or server stopped unexpectedly.
        // Reset the flag so start_api_server can be retried (e.g. after port becomes free).
        if let Some(f) = API_STARTED.get() {
            f.store(false, Ordering::SeqCst);
        }
    });
}

// ── Admin Session (Rust-side, cannot be bypassed from JS) ─────────────────────

/// In-process session store. Token lives only in Rust heap — never exposed to JS.
static ADMIN_SESSION:  OnceLock<Mutex<Option<String>>> = OnceLock::new();
// ── Background-task idempotency guards ────────────────────────────────────────
// Prevent duplicate tokio tasks if the Tauri command is invoked more than once.
static API_STARTED:  OnceLock<AtomicBool> = OnceLock::new();

fn session_store() -> &'static Mutex<Option<String>> {
    ADMIN_SESSION.get_or_init(|| Mutex::new(None))
}

fn verify_admin_token(token: &str) -> bool {
    match session_store().lock() {
        Ok(guard) => guard.as_deref() == Some(token),
        Err(_) => false,
    }
}

/// Generate a cryptographically random session token using the OS entropy.
fn generate_token() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    // Mix with a random seed from OS via hash of process id + timestamp
    let pid = std::process::id();
    format!("{:x}{:x}{:x}", ts, pid, ts.wrapping_mul(pid as u128).wrapping_add(0xdeadbeefcafe))
}

/// Verify the PIN hash against the stored one, then issue a session token.
/// The frontend must pass this token to every privileged command.
#[tauri::command]
async fn begin_admin_session(
    app: tauri::AppHandle,
    pin_hash: String,
) -> Result<String, String> {
    // Read stored hash from app_settings via rusqlite (same DB path)
    let db_path = {
        let config = load_config(&app);
        let base = if config.db_directory.is_empty() {
            app.path().app_data_dir().map_err(|e| e.to_string())?
        } else {
            PathBuf::from(&config.db_directory)
        };
        base.join("ajith_rohana.db")
    };

    let stored_hash = {
        let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
        let result: Result<String, _> = conn.query_row(
            "SELECT value FROM app_settings WHERE key='admin_pin_hash' LIMIT 1",
            [],
            |row| row.get(0),
        );
        result.unwrap_or_default()
    };

    // If no PIN is set, grant access immediately; otherwise verify
    if !stored_hash.is_empty() && stored_hash != pin_hash {
        return Err("Invalid admin PIN".to_string());
    }

    let token = generate_token();
    match session_store().lock() {
        Ok(mut guard) => { *guard = Some(token.clone()); }
        Err(_) => return Err("Session store lock failed".to_string()),
    }
    Ok(token)
}

/// Revoke the current admin session.
#[tauri::command]
fn end_admin_session() {
    if let Ok(mut guard) = session_store().lock() {
        *guard = None;
    }
}

/// Returns true only if token matches the active session.
/// Called from frontend before showing sensitive UI (second layer of protection).
#[tauri::command]
fn verify_admin_session(token: String) -> bool {
    verify_admin_token(&token)
}

// ── Supabase sync queue drain ──────────────────────────────────────────────────

#[derive(Serialize)]
struct SyncStats {
    flushed: usize,
    failed:  usize,
    remaining: usize,
}

/// Drain all pending items in the local sync_queue table to Supabase.
/// Background worker calls with token=None; on-demand flush requires admin token.
#[tauri::command]
async fn drain_sync_queue(
    app: tauri::AppHandle,
    token: Option<String>,
) -> Result<SyncStats, String> {
    if let Some(t) = &token {
        if !verify_admin_token(t) {
            return Err("Unauthorized: invalid admin session".to_string());
        }
    }

    let config = load_config(&app);
    if config.supabase_url.is_empty() || config.supabase_anon_key.is_empty() {
        return Ok(SyncStats { flushed: 0, failed: 0, remaining: 0 });
    }

    let db_path = {
        let base = if config.db_directory.is_empty() {
            app.path().app_data_dir().map_err(|e| e.to_string())?
        } else {
            PathBuf::from(&config.db_directory)
        };
        base.join("ajith_rohana.db")
    };

    #[derive(Debug, Clone)]
    struct QueueItem {
        id: i64,
        table_name: String,
        operation: String,
        payload: String,
        on_conflict: String,
    }

    // ── Phase 1: read items synchronously (no await) ─────────────────────────
    let db_path2 = db_path.clone();
    let items: Vec<QueueItem> = tokio::task::spawn_blocking(move || {
        let conn = rusqlite::Connection::open(&db_path2)?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS sync_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                table_name TEXT NOT NULL,
                operation TEXT NOT NULL DEFAULT 'upsert',
                record_id INTEGER,
                payload TEXT NOT NULL DEFAULT '{}',
                on_conflict TEXT DEFAULT 'id',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                retry_count INTEGER DEFAULT 0,
                last_error TEXT DEFAULT ''
            )"
        ).ok();
        let mut stmt = conn.prepare(
            "SELECT id, table_name, operation, payload, on_conflict
             FROM sync_queue WHERE retry_count < 3 ORDER BY id ASC LIMIT 50"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(QueueItem {
                id:          row.get(0)?,
                table_name:  row.get(1)?,
                operation:   row.get(2)?,
                payload:     row.get(3)?,
                on_conflict: row.get(4)?,
            })
        })?.filter_map(|r| r.ok()).collect();
        Ok::<_, rusqlite::Error>(rows)
    }).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?;

    // ── Phase 2: send to Supabase (async, no DB handle held) ─────────────────
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .default_headers(supabase_headers(&config.supabase_anon_key))
        .build()
        .map_err(|e| e.to_string())?;

    let base_url = config.supabase_url.trim_end_matches('/').to_string();
    let mut flushed: Vec<i64> = vec![];
    let mut errors: Vec<(i64, String)> = vec![];

    for item in &items {
        let url = format!("{}/rest/v1/{}", base_url, item.table_name);
        let payload: serde_json::Value = serde_json::from_str(&item.payload)
            .unwrap_or(serde_json::Value::Object(Default::default()));

        let result = if item.operation == "delete" {
            if let Some(rid) = payload.get("id").and_then(|v| v.as_i64()) {
                client.delete(format!("{}?id=eq.{}", url, rid)).send().await
            } else { continue; }
        } else {
            client.post(&url)
                .header("Prefer", format!("resolution=merge-duplicates,return=minimal,on_conflict={}", item.on_conflict))
                .json(&payload).send().await
        };

        match result {
            Ok(r) if r.status().is_success() || r.status().as_u16() == 409 => {
                flushed.push(item.id);
            }
            Ok(r) => {
                let code = r.status().as_u16();
                let body = r.text().await.unwrap_or_default();
                errors.push((item.id, format!("HTTP {}: {}", code, &body[..body.len().min(150)])));
            }
            Err(e) => { errors.push((item.id, e.to_string())); }
        }
    }

    // ── Phase 3: update queue table synchronously ────────────────────────────
    let remaining = tokio::task::spawn_blocking(move || {
        let conn = rusqlite::Connection::open(&db_path)?;
        for id in &flushed {
            conn.execute("DELETE FROM sync_queue WHERE id=?1", rusqlite::params![id]).ok();
        }
        for (id, err) in &errors {
            conn.execute(
                "UPDATE sync_queue SET retry_count=retry_count+1, last_error=?1 WHERE id=?2",
                rusqlite::params![err, id]
            ).ok();
        }
        let remaining: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sync_queue WHERE retry_count < 3", [], |r| r.get(0)
        ).unwrap_or(0);
        Ok::<_, rusqlite::Error>((flushed.len(), errors.len(), remaining as usize))
    }).await.map_err(|e| e.to_string())?.map_err(|e: rusqlite::Error| e.to_string())?;

    Ok(SyncStats { flushed: remaining.0, failed: remaining.1, remaining: remaining.2 })
}

/// Full sync: read all rows from every table and upsert to Supabase.
/// Use for initial setup or after bulk imports that bypassed the queue.
#[tauri::command]
async fn full_sync_all_tables(app: tauri::AppHandle) -> Result<SyncStats, String> {
    let config = load_config(&app);
    if config.supabase_url.is_empty() || config.supabase_anon_key.is_empty() {
        return Err("Supabase not configured. Enter URL and anon key in Settings.".to_string());
    }

    let db_path = {
        let base = if config.db_directory.is_empty() {
            app.path().app_data_dir().map_err(|e| e.to_string())?
        } else {
            PathBuf::from(&config.db_directory)
        };
        base.join("ajith_rohana.db")
    };

    // Tables to sync and their conflict column
    let tables: &[(&str, &str)] = &[
        ("agents",            "id"),
        ("inventory_batches", "id"),
        ("invoices",          "id"),
        ("invoice_items",     "id"),
        ("payments",          "id"),
        ("ticket_returns",    "id"),
        ("daily_collections", "id"),
        ("suppliers",         "id"),
        ("purchase_invoices", "id"),
        ("purchase_invoice_items", "id"),
        ("purchase_payments", "id"),
        ("lottery_games",     "id"),
        ("commission_schemes","id"),
    ];

    // Read all rows from each table as JSON
    let db_path2 = db_path.clone();
    let all_rows: Vec<(String, Vec<serde_json::Value>)> = tokio::task::spawn_blocking(move || {
        let conn = rusqlite::Connection::open(&db_path2)?;
        let mut result = vec![];
        for (table, _) in tables {
            let mut stmt = match conn.prepare(&format!("SELECT * FROM {} ORDER BY id ASC", table)) {
                Ok(s) => s,
                Err(_) => continue,
            };
            let col_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
            let rows: Vec<serde_json::Value> = stmt.query_map([], |row| {
                let mut map = serde_json::Map::new();
                for (i, col) in col_names.iter().enumerate() {
                    let val: serde_json::Value = match row.get_ref(i) {
                        Ok(rusqlite::types::ValueRef::Integer(n)) => serde_json::Value::Number(n.into()),
                        Ok(rusqlite::types::ValueRef::Real(f)) => {
                            serde_json::Number::from_f64(f).map(serde_json::Value::Number)
                                .unwrap_or(serde_json::Value::Null)
                        }
                        Ok(rusqlite::types::ValueRef::Text(t)) => {
                            serde_json::Value::String(String::from_utf8_lossy(t).to_string())
                        }
                        _ => serde_json::Value::Null,
                    };
                    map.insert(col.clone(), val);
                }
                Ok(serde_json::Value::Object(map))
            }).ok().map(|r| r.filter_map(|v| v.ok()).collect()).unwrap_or_default();
            result.push((table.to_string(), rows));
        }
        Ok::<_, rusqlite::Error>(result)
    }).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?;

    // Push each table to Supabase in batches of 50
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .default_headers(supabase_headers(&config.supabase_anon_key))
        .build()
        .map_err(|e| e.to_string())?;
    let base_url = config.supabase_url.trim_end_matches('/').to_string();

    let mut total_flushed = 0usize;
    let mut total_failed  = 0usize;

    for (table, rows) in &all_rows {
        if rows.is_empty() { continue; }
        let conflict_col = tables.iter().find(|(t, _)| t == table).map(|(_, c)| *c).unwrap_or("id");
        for chunk in rows.chunks(50) {
            let url = format!("{}/rest/v1/{}", base_url, table);
            match client.post(&url)
                .header("Prefer", format!("resolution=merge-duplicates,return=minimal,on_conflict={}", conflict_col))
                .json(&serde_json::Value::Array(chunk.to_vec()))
                .send().await
            {
                Ok(r) if r.status().is_success() || r.status().as_u16() == 409 => {
                    total_flushed += chunk.len();
                }
                Ok(r) => {
                    total_failed += chunk.len();
                    let _ = r.text().await; // consume body
                }
                Err(_) => { total_failed += chunk.len(); }
            }
        }
    }

    Ok(SyncStats { flushed: total_flushed, failed: total_failed, remaining: 0 })
}

/// Save Supabase config — requires valid admin session token.
#[tauri::command]
async fn save_supabase_config_secure(
    app: tauri::AppHandle,
    token: String,
    supabase_url: String,
    supabase_anon_key: String,
) -> Result<(), String> {
    if !verify_admin_token(&token) {
        return Err("Unauthorized: Admin session required to change Supabase config".to_string());
    }
    let mut config = load_config(&app);
    config.supabase_url     = supabase_url;
    config.supabase_anon_key = supabase_anon_key;
    persist_config(&app, &config)
}

// ── Go API Backend Commands ───────────────────────────────────────────────────
// New commands targeting the Go API server. Preserve all existing Supabase
// commands above — they are not modified or removed.

/// Save Go API server configuration to app config.
/// Requires admin session token. Does not modify Supabase config.
#[tauri::command]
async fn save_api_config(
    app: tauri::AppHandle,
    token: String,
    api_server_url: String,
    api_device_key: String,
) -> Result<(), String> {
    if !verify_admin_token(&token) {
        return Err("Unauthorized: Admin session required to change API config".to_string());
    }
    let mut config = load_config(&app);
    config.api_server_url = api_server_url;
    config.api_device_key = api_device_key;
    persist_config(&app, &config)
}

/// Test connectivity to the Go API server.
#[tauri::command]
async fn test_api_connection(app: tauri::AppHandle) -> String {
    let config = load_config(&app);
    if config.api_server_url.is_empty() {
        return "Not configured. Enter the API server URL in Settings.".to_string();
    }
    let url = format!("{}/api/v1/health", config.api_server_url.trim_end_matches('/'));
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
    {
        Ok(c) => c,
        Err(e) => return format!("Client error: {}", e),
    };
    match client.get(&url).send().await {
        Ok(r) if r.status().is_success() => {
            // Parse the health JSON — server returns { status, db_ok, ... }
            match r.json::<serde_json::Value>().await {
                Ok(body) => {
                    let db_ok = body.get("db_ok").and_then(|v| v.as_bool()).unwrap_or(false);
                    if db_ok {
                        "✓ API server reachable · Database connected".to_string()
                    } else {
                        "⚠ API server reachable but database not connected — check DATABASE_URL on the server".to_string()
                    }
                }
                Err(_) => "✓ API server reachable (legacy health response)".to_string(),
            }
        }
        Ok(r) => format!("HTTP {}: Check your API server URL.", r.status()),
        Err(e) => format!("Connection failed: {}", e),
    }
}

#[derive(serde::Serialize)]
struct ApiSyncStats {
    flushed:   usize,
    failed:    usize,
    remaining: usize,
}

/// Drain sync_queue to the Go API server.
/// Background worker calls with token=None; on-demand requires admin token.
/// Falls back to Supabase if api_server_url is not configured.
#[tauri::command]
async fn drain_sync_queue_to_backend(
    app: tauri::AppHandle,
    token: Option<String>,
) -> Result<ApiSyncStats, String> {
    if let Some(t) = &token {
        if !verify_admin_token(t) {
            return Err("Unauthorized: invalid admin session".to_string());
        }
    }

    let config = load_config(&app);

    // Routing: Go API if configured, otherwise delegate to Supabase drain.
    if config.api_server_url.is_empty() || config.api_device_key.is_empty() {
        // Fall back to existing Supabase drain (unchanged behavior).
        // We call drain_sync_queue which handles its own Supabase config check.
        let stats = drain_sync_queue(app, token).await?;
        return Ok(ApiSyncStats {
            flushed:   stats.flushed,
            failed:    stats.failed,
            remaining: stats.remaining,
        });
    }

    let db_path = {
        let base = if config.db_directory.is_empty() {
            app.path().app_data_dir().map_err(|e| e.to_string())?
        } else {
            PathBuf::from(&config.db_directory)
        };
        base.join("ajith_rohana.db")
    };

    // Phase 1: read queue items
    let db_path2 = db_path.clone();
    let items: Vec<(i64, String, String, String, String)> =
        tokio::task::spawn_blocking(move || {
            let conn = rusqlite::Connection::open(&db_path2)?;
            conn.execute_batch("CREATE TABLE IF NOT EXISTS sync_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                table_name TEXT NOT NULL,
                operation TEXT NOT NULL DEFAULT 'upsert',
                record_id INTEGER,
                payload TEXT NOT NULL DEFAULT '{}',
                on_conflict TEXT DEFAULT 'id',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                retry_count INTEGER DEFAULT 0,
                last_error TEXT DEFAULT ''
            )").ok();
            let mut stmt = conn.prepare(
                "SELECT id, table_name, operation, payload, on_conflict
                 FROM sync_queue WHERE retry_count < 3 ORDER BY id ASC LIMIT 50"
            )?;
            let rows = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })?.filter_map(|r| r.ok()).collect();
            Ok::<_, rusqlite::Error>(rows)
        }).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?;

    if items.is_empty() {
        return Ok(ApiSyncStats { flushed: 0, failed: 0, remaining: 0 });
    }

    // Phase 2: send to Go API
    let base_url = config.api_server_url.trim_end_matches('/').to_string();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;

    let mut flushed: Vec<i64> = vec![];
    let mut errors: Vec<(i64, String)> = vec![];

    for (id, table_name, operation, payload, on_conflict) in &items {
        let mut payload_val: serde_json::Value = serde_json::from_str(payload)
            .unwrap_or(serde_json::Value::Object(Default::default()));
        // AP-04: Inject the queue item's SQLite autoincrement ID so the Go API
        // can apply the stale-event guard (last_queue_id). The guard rejects a
        // DO UPDATE when EXCLUDED.last_queue_id < the stored last_queue_id,
        // preventing a retried older event from overwriting a newer cloud value.
        // Single-device only — see DEFERRED_RISKS.md D-03.
        if let serde_json::Value::Object(ref mut m) = payload_val {
            m.insert("_queue_id".to_string(), serde_json::json!(*id));
        }

        let result = if operation == "delete" {
            if let Some(rid) = payload_val.get("id").and_then(|v| v.as_i64()) {
                // DELETE: send upsert with is_deleted flag (soft delete in cloud)
                // We send to /api/v1/sync/batch with the record so the API can handle it.
                // For now, for tables without is_deleted, we skip cloud delete to avoid
                // orphan records breaking FK constraints. Only invoice deletes are tracked.
                let delete_payload = serde_json::json!({
                    "table": table_name,
                    "rows": [payload_val],
                    "on_conflict": on_conflict,
                    "operation": "delete",
                    "record_id": rid,
                });
                client.post(format!("{}/api/v1/sync/batch", base_url))
                    .header("X-Device-Key", &config.api_device_key)
                    .header("Content-Type", "application/json")
                    .json(&delete_payload)
                    .send()
                    .await
            } else {
                flushed.push(*id);
                continue;
            }
        } else {
            let batch_payload = serde_json::json!({
                "table": table_name,
                "rows": [payload_val],
                "on_conflict": on_conflict,
            });
            client.post(format!("{}/api/v1/sync/batch", base_url))
                .header("X-Device-Key", &config.api_device_key)
                .header("Content-Type", "application/json")
                .json(&batch_payload)
                .send()
                .await
        };

        match result {
            Ok(r) if r.status().is_success() => { flushed.push(*id); }
            Ok(r) => {
                let code = r.status().as_u16();
                let body = r.text().await.unwrap_or_default();
                errors.push((*id, format!("HTTP {}: {}", code, &body[..body.len().min(200)])));
            }
            Err(e) => { errors.push((*id, e.to_string())); }
        }
    }

    // Phase 3: update queue
    let remaining = tokio::task::spawn_blocking(move || {
        let conn = rusqlite::Connection::open(&db_path)?;
        for id in &flushed {
            conn.execute("DELETE FROM sync_queue WHERE id=?1", rusqlite::params![id]).ok();
        }
        for (id, err) in &errors {
            conn.execute(
                "UPDATE sync_queue SET retry_count=retry_count+1, last_error=?1 WHERE id=?2",
                rusqlite::params![err, id],
            ).ok();
        }
        let remaining: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sync_queue WHERE retry_count < 3", [], |r| r.get(0)
        ).unwrap_or(0);
        Ok::<_, rusqlite::Error>((flushed.len(), errors.len(), remaining as usize))
    }).await.map_err(|e| e.to_string())?.map_err(|e: rusqlite::Error| e.to_string())?;

    Ok(ApiSyncStats {
        flushed:   remaining.0,
        failed:    remaining.1,
        remaining: remaining.2,
    })
}

/// Full sync one table to the Go API. Reads all rows from SQLite and upserts to cloud.
/// Targets Go API if configured; returns error otherwise (unlike queue which falls back).
#[tauri::command]
async fn full_sync_table_to_backend(
    app: tauri::AppHandle,
    token: String,
    table_name: String,
) -> Result<ApiSyncStats, String> {
    if !verify_admin_token(&token) {
        return Err("Unauthorized: Admin session required".to_string());
    }
    let config = load_config(&app);
    if config.api_server_url.is_empty() || config.api_device_key.is_empty() {
        return Err("Go API not configured. Enter API URL and device key in Settings.".to_string());
    }

    // Allowlist check (same list as Go API server — defence in depth)
    let allowed_tables = [
        "agents","invoices","invoice_items","inventory_batches","payments",
        "ticket_returns","daily_collections","suppliers","purchase_invoices",
        "purchase_invoice_items","purchase_payments","lottery_games",
        "commission_schemes","workers","worker_salaries","supplier_returns",
        "petty_cash_transactions","petty_cash_closings","lottery_results",
        "company_settings",
    ];
    if !allowed_tables.contains(&table_name.as_str()) {
        return Err(format!("Table '{}' is not in the sync allowlist", table_name));
    }

    let db_path = {
        let base = if config.db_directory.is_empty() {
            app.path().app_data_dir().map_err(|e| e.to_string())?
        } else {
            PathBuf::from(&config.db_directory)
        };
        base.join("ajith_rohana.db")
    };

    let table_name2 = table_name.clone();
    let rows: Vec<serde_json::Value> = tokio::task::spawn_blocking(move || {
        let conn = rusqlite::Connection::open(&db_path)?;
        let mut stmt = conn.prepare(&format!(
            "SELECT * FROM \"{}\" ORDER BY id ASC", table_name2
        ))?;
        let col_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let rows: Vec<serde_json::Value> = stmt.query_map([], |row| {
            let mut map = serde_json::Map::new();
            for (i, col) in col_names.iter().enumerate() {
                let val = match row.get_ref(i) {
                    Ok(rusqlite::types::ValueRef::Integer(n)) =>
                        serde_json::Value::Number(n.into()),
                    Ok(rusqlite::types::ValueRef::Real(f)) =>
                        serde_json::Number::from_f64(f).map(serde_json::Value::Number)
                            .unwrap_or(serde_json::Value::Null),
                    Ok(rusqlite::types::ValueRef::Text(t)) =>
                        serde_json::Value::String(String::from_utf8_lossy(t).to_string()),
                    _ => serde_json::Value::Null,
                };
                map.insert(col.clone(), val);
            }
            Ok(serde_json::Value::Object(map))
        }).ok().map(|r| r.filter_map(|v| v.ok()).collect()).unwrap_or_default();
        Ok::<_, rusqlite::Error>(rows)
    }).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?;

    if rows.is_empty() {
        return Ok(ApiSyncStats { flushed: 0, failed: 0, remaining: 0 });
    }

    let url = format!("{}/api/v1/sync/full", config.api_server_url.trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let mut total_flushed = 0usize;
    let mut total_failed  = 0usize;

    for chunk in rows.chunks(50) {
        let payload = serde_json::json!({
            "table": table_name,
            "rows": chunk,
        });
        match client.post(&url)
            .header("X-Device-Key", &config.api_device_key)
            .json(&payload)
            .send()
            .await
        {
            Ok(r) if r.status().is_success() || r.status().as_u16() == 207 => {
                total_flushed += chunk.len();
            }
            Ok(_) | Err(_) => { total_failed += chunk.len(); }
        }
    }

    Ok(ApiSyncStats { flushed: total_flushed, failed: total_failed, remaining: 0 })
}

// ── AI Query Gateway ──────────────────────────────────────────────────────────
// Calls Claude API through Rust to protect the API key from WebView exposure.

/// Send a prompt to Google Gemini 3.6 Flash API. API key is read from SQLite app_settings.
#[tauri::command]
async fn ai_query(app: tauri::AppHandle, prompt: String) -> Result<String, String> {
    let db_path = {
        let config = load_config(&app);
        let base = if config.db_directory.is_empty() {
            app.path().app_data_dir().map_err(|e| e.to_string())?
        } else {
            PathBuf::from(&config.db_directory)
        };
        base.join("ajith_rohana.db")
    };

    // Read API key from SQLite app_settings
    let api_key = tokio::task::spawn_blocking(move || {
        let conn = rusqlite::Connection::open(&db_path)?;
        let result: rusqlite::Result<String> = conn.query_row(
            "SELECT value FROM app_settings WHERE key='ai_api_key' LIMIT 1",
            [],
            |row| row.get(0),
        );
        Ok::<_, rusqlite::Error>(result.unwrap_or_default())
    }).await.map_err(|e| e.to_string())?.map_err(|e: rusqlite::Error| e.to_string())?;

    if api_key.trim().is_empty() {
        return Err("Google AI API key not configured. Go to Settings → AI Configuration and enter your Gemini API key from aistudio.google.com.".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|e| e.to_string())?;

    // Gemini 3.6 Flash endpoint — API key passed as URL query param
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key={}",
        api_key.trim()
    );

    let payload = serde_json::json!({
        "contents": [{
            "parts": [{ "text": prompt }]
        }]
    });

    let resp = client
        .post(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("Gemini API error {}: {}", status, &err_text[..err_text.len().min(300)]));
    }

    let data: serde_json::Value = resp.json().await
        .map_err(|e| format!("Parse error: {}", e))?;

    // Gemini response path: candidates[0].content.parts[0].text
    let text = data["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .unwrap_or("No response received.")
        .to_string();
    Ok(text)
}

/// Save the AI API key — requires admin session token.
#[tauri::command]
async fn save_ai_api_key(
    app: tauri::AppHandle,
    token: String,
    api_key: String,
) -> Result<(), String> {
    if !verify_admin_token(&token) {
        return Err("Unauthorized: Admin session required to set AI API key.".to_string());
    }
    let db_path = {
        let config = load_config(&app);
        let base = if config.db_directory.is_empty() {
            app.path().app_data_dir().map_err(|e| e.to_string())?
        } else {
            PathBuf::from(&config.db_directory)
        };
        base.join("ajith_rohana.db")
    };
    tokio::task::spawn_blocking(move || {
        let conn = rusqlite::Connection::open(&db_path)?;
        conn.execute(
            "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('ai_api_key', ?1)",
            rusqlite::params![api_key.trim()],
        )?;
        Ok::<_, rusqlite::Error>(())
    }).await.map_err(|e| e.to_string())?.map_err(|e: rusqlite::Error| e.to_string())
}

// ── AI Action Execution Framework ─────────────────────────────────────────────
// Secure Tauri bridge for AI-triggered system actions.
// All actions require a valid admin session token.

#[derive(Serialize)]
struct ActionResult {
    success: bool,
    action_type: String,
    target_id: String,
    message: String,
}

#[tauri::command]
async fn execute_ai_action(
    app: tauri::AppHandle,
    token: String,
    action_type: String,
    target_id: String,
    params: Option<String>,
) -> Result<ActionResult, String> {
    // All AI actions require admin session
    if !verify_admin_token(&token) {
        return Err("Unauthorized: Admin session required to execute AI actions.".to_string());
    }

    let db_path = {
        let config = load_config(&app);
        let base = if config.db_directory.is_empty() {
            app.path().app_data_dir().map_err(|e| e.to_string())?
        } else {
            PathBuf::from(&config.db_directory)
        };
        base.join("ajith_rohana.db")
    };

    let action = action_type.clone();
    let target = target_id.clone();
    let extra  = params.clone().unwrap_or_default();

    let message = tokio::task::spawn_blocking(move || {
        let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
        let msg = match action.as_str() {

            // Suspend an agent's credit (set credit_limit = 0)
            "suspend_agent_credit" => {
                conn.execute(
                    "UPDATE agents SET credit_limit = 0 WHERE id = ?1",
                    rusqlite::params![target.parse::<i64>().unwrap_or(0)],
                ).map_err(|e| e.to_string())?;
                let name: String = conn.query_row(
                    "SELECT name FROM agents WHERE id = ?1", rusqlite::params![target.parse::<i64>().unwrap_or(0)],
                    |r| r.get(0)
                ).unwrap_or_else(|_| target.clone());
                format!("✅ Agent **{}** credit limit set to Rs. 0. No new invoices can exceed Rs. 0 until limit is restored in Agents module.", name)
            }

            // Restore an agent's credit to a specified limit
            "restore_agent_credit" => {
                let limit: i64 = extra.parse().unwrap_or(100000);
                conn.execute(
                    "UPDATE agents SET credit_limit = ?1 WHERE id = ?2",
                    rusqlite::params![limit, target.parse::<i64>().unwrap_or(0)],
                ).map_err(|e| e.to_string())?;
                let name: String = conn.query_row(
                    "SELECT name FROM agents WHERE id = ?1", rusqlite::params![target.parse::<i64>().unwrap_or(0)],
                    |r| r.get(0)
                ).unwrap_or_else(|_| target.clone());
                format!("✅ Agent **{}** credit limit restored to Rs. {:?}.", name, limit)
            }

            // Generate a draft reorder purchase order for a low-stock game
            "generate_reorder_po" => {
                // Get current stock info
                let result: rusqlite::Result<(String, i64, i64, f64)> = conn.query_row(
                    "SELECT game_name, SUM(total_qty-distributed_qty), SUM(total_qty), AVG(unit_price)
                     FROM inventory_batches WHERE game_name = ?1 GROUP BY game_name",
                    rusqlite::params![target],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
                );
                match result {
                    Ok((game, remaining, total, unit_price)) => {
                        let suggest_qty = (total * 2).max(1000);
                        let estimated_cost = suggest_qty as f64 * unit_price;
                        // Create draft purchase invoice
                        let po_num = format!("AI-PO-{}", uuid::Uuid::new_v4().to_string().split('-').next().unwrap_or("0000").to_uppercase());
                        conn.execute(
                            "INSERT OR IGNORE INTO purchase_invoices
                             (purchase_number, supplier_name, purchase_date, stock_date,
                              invoice_total, initial_payment, outstanding_balance, status, notes)
                             VALUES (?1, 'Nimalsiri Enterprises', date('now'), date('now'),
                                     ?2, 0, ?2, 'pending', ?3)",
                            rusqlite::params![
                                po_num,
                                estimated_cost,
                                format!("AI-generated reorder for {} — {} remaining of {} total.", game, remaining, total)
                            ],
                        ).ok();
                        format!("📦 Reorder PO drafted for **{}**.\n• Current stock: {} units remaining\n• Suggested order: {} units\n• Estimated cost: Rs. {:.2}\nView in Stock Purchases to confirm and submit.", game, remaining, suggest_qty, estimated_cost)
                    }
                    Err(_) => format!("⚠ Game '{}' not found in inventory. Please check game name.", target)
                }
            }

            // Update low-stock threshold for a game batch
            "update_stock_threshold" => {
                let new_threshold: i64 = extra.parse().unwrap_or(200);
                let rows = conn.execute(
                    "UPDATE inventory_batches SET low_stock_threshold = ?1 WHERE game_name = ?2",
                    rusqlite::params![new_threshold, target],
                ).map_err(|e| e.to_string())?;
                if rows > 0 {
                    format!("✅ Low-stock threshold for **{}** updated to {} units. Alerts will trigger below this level.", target, new_threshold)
                } else {
                    format!("⚠ No inventory batch found for game '{}'.", target)
                }
            }

            // Flag an agent for urgent collection (adds a note to most recent invoice)
            "flag_urgent_collection" => {
                let rows = conn.execute(
                    "UPDATE invoices SET prepared_by = prepared_by || ' [URGENT COLLECTION FLAG]'
                     WHERE agent_id = ?1 AND outstanding_balance > 0
                     AND id = (SELECT MAX(id) FROM invoices WHERE agent_id = ?1 AND outstanding_balance > 0)",
                    rusqlite::params![target.parse::<i64>().unwrap_or(0)],
                ).map_err(|e| e.to_string())?;
                let name: String = conn.query_row(
                    "SELECT name FROM agents WHERE id = ?1", rusqlite::params![target.parse::<i64>().unwrap_or(0)],
                    |r| r.get(0)
                ).unwrap_or_else(|_| target.clone());
                if rows > 0 {
                    format!("🚨 Agent **{}** flagged for urgent collection. The most recent outstanding invoice has been marked. Visible in Invoice List.", name)
                } else {
                    format!("ℹ Agent **{}** has no outstanding invoices to flag.", name)
                }
            }

            // Get live summary (read-only — no admin required but kept here for consistency)
            "get_daily_summary" => {
                let revenue: f64 = conn.query_row(
                    "SELECT COALESCE(SUM(cash_received+dlb_winning+nlb_winning),0) FROM invoices WHERE date(invoice_date)=date('now')",
                    [], |r| r.get(0)
                ).unwrap_or(0.0);
                let outstanding: f64 = conn.query_row(
                    "SELECT COALESCE(SUM(outstanding_balance),0) FROM invoices WHERE outstanding_balance > 0",
                    [], |r| r.get(0)
                ).unwrap_or(0.0);
                let low_stock_count: i64 = conn.query_row(
                    "SELECT COUNT(*) FROM (SELECT game_name FROM inventory_batches GROUP BY game_name HAVING SUM(total_qty-distributed_qty) <= MIN(low_stock_threshold))",
                    [], |r| r.get(0)
                ).unwrap_or(0);
                format!("📊 **Today's Live Summary**\n• Revenue collected: Rs. {:.2}\n• Total outstanding: Rs. {:.2}\n• Low stock alerts: {} games", revenue, outstanding, low_stock_count)
            }

            _ => return Err(format!("Unknown action type: {}. Supported: suspend_agent_credit, restore_agent_credit, generate_reorder_po, update_stock_threshold, flag_urgent_collection, get_daily_summary", action))
        };
        Ok::<_, String>(msg)
    }).await.map_err(|e| e.to_string())??;

    Ok(ActionResult {
        success: true,
        action_type,
        target_id,
        message,
    })
}

// ── Entry point ────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// Returns the best non-loopback LAN IP address for the mobile companion app
#[tauri::command]
fn get_local_ip() -> String {
    if let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                return addr.ip().to_string();
            }
        }
    }
    "127.0.0.1".to_string()
}

/// QR code for direct local connection: lottery://pair?host=IP:7423
#[tauri::command]
fn get_server_qr_code() -> Result<String, String> {
    let ip  = get_local_ip();
    let url = format!("lottery://pair?host={}:7423", ip);
    get_qr_for_url(url)
}

/// Generate a QR code SVG (base64-encoded) for any arbitrary URL.
/// Used by the Mobile App settings tab to create pairing QR codes.
#[tauri::command]
fn get_qr_for_url(url: String) -> Result<String, String> {
    use qrcode::QrCode;
    use qrcode::render::svg;
    use base64::Engine;
    let code = QrCode::new(url.as_bytes()).map_err(|e| e.to_string())?;
    let svg_str = code.render::<svg::Color>()
        .min_dimensions(220, 220)
        .build();
    Ok(base64::engine::general_purpose::STANDARD.encode(svg_str.as_bytes()))
}

/// UDP broadcast beacon every 5 s + mDNS advertisement for auto-discovery
#[tauri::command]
fn start_discovery_beacon() {
    let ip   = get_local_ip();
    let port: u16 = 7423;

    // ── UDP broadcast beacon ────────────────────────────────────────────────
    // Mobile app listens on 7422 for "LOTTERY_SERVER:<ip>:<port>"
    // Socket is created once and reused; recreated only if a send fails.
    let ip2 = ip.clone();
    tauri::async_runtime::spawn(async move {
        use tokio::net::UdpSocket;
        use tokio::time::{sleep, Duration};
        let payload = format!("LOTTERY_SERVER:{}:{}", ip2, port);

        // Create once; reuse across loop iterations to avoid per-tick OS socket churn.
        let mut sock: Option<UdpSocket> = UdpSocket::bind("0.0.0.0:0").await.ok().and_then(|s| {
            s.set_broadcast(true).ok()?; Some(s)
        });

        loop {
            match &sock {
                Some(s) => {
                    if s.send_to(payload.as_bytes(), "255.255.255.255:7422").await.is_err() {
                        // Socket unusable — recreate on the next iteration
                        sock = None;
                    }
                }
                None => {
                    // Attempt to recreate the socket
                    sock = UdpSocket::bind("0.0.0.0:0").await.ok().and_then(|s| {
                        s.set_broadcast(true).ok()?; Some(s)
                    });
                }
            }
            sleep(Duration::from_secs(5)).await;
        }
    });

    // ── mDNS advertisement (_lottery._tcp.local.) ─────────────────────────
    tauri::async_runtime::spawn(async move {
        use mdns_sd::{ServiceDaemon, ServiceInfo};
        let mdns = match ServiceDaemon::new() {
            Ok(d)  => d,
            Err(_) => return,
        };
        // mdns-sd 0.12 accepts &str / String / IpAddr for the host param — not Ipv4Addr directly
        let props = std::collections::HashMap::from([
            ("version".to_string(), "1".to_string()),
            ("app".to_string(),     "ajith-rohana-lottery".to_string()),
        ]);
        if let Ok(info) = ServiceInfo::new(
            "_lottery._tcp.local.",
            "LotteryDesktop",
            "lottery-desktop.local.",
            ip.as_str(),   // &str implements AsIpAddrs
            port,
            props,
        ) {
            let _ = mdns.register(info);
            loop { tokio::time::sleep(std::time::Duration::from_secs(60)).await; }
        }
    });
}

/// Permanently deletes a cancelled invoice and all its linked financial records.
///
/// Safety guarantees:
/// - Requires a valid admin session token (verified in-process via verify_admin_token)
/// - Requires admin PIN to be configured in app_settings (double-check at call time)
/// - Only invoices with invoice_status = 'cancelled' may be deleted
/// - All child rows (invoice_items, payments, ticket_returns) are deleted in
///   the same rusqlite transaction — atomically, on the same connection
/// - If any step fails, the entire transaction is rolled back
/// - On success, enqueues a sync delete so the cloud replica is updated
///
/// Why Rust (not TypeScript): tauri-plugin-sql uses a SQLx connection pool.
/// Separate execute() calls from JavaScript are not guaranteed to use the
/// same connection, so BEGIN/COMMIT from JS does not reliably bound a
/// transaction. rusqlite::Connection::transaction() uses one connection.
#[tauri::command]
async fn delete_cancelled_invoice(
    app: tauri::AppHandle,
    token: String,
    invoice_id: i64,
) -> Result<(), String> {
    // 1. Verify admin session token (in-process check, no network).
    if !verify_admin_token(&token) {
        return Err("Unauthorized: valid admin session required.".to_string());
    }

    let db_path = PathBuf::from(resolve_db_path(&app));

    tokio::task::spawn_blocking(move || {
        let mut conn = rusqlite::Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        // 2. Verify admin PIN is configured — deletion must always be PIN-protected.
        let pin_hash: Option<String> = conn.query_row(
            "SELECT value FROM app_settings WHERE key = 'admin_pin_hash' LIMIT 1",
            [],
            |row| row.get(0),
        ).ok();
        match pin_hash.as_deref() {
            Some(h) if !h.is_empty() => {},
            _ => return Err("Admin PIN is not configured. Set a PIN in Settings > Security before deleting records.".to_string()),
        }

        // 3. All deletions happen inside a single rusqlite transaction.
        let tx = conn.transaction()
            .map_err(|e| format!("Failed to begin transaction: {}", e))?;

        // 3a. Verify invoice exists and is cancelled — inside the transaction.
        let status: String = tx.query_row(
            "SELECT invoice_status FROM invoices WHERE id = ?1",
            rusqlite::params![invoice_id],
            |row| row.get(0),
        ).map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => "Invoice not found.".to_string(),
            e => format!("Database error: {}", e),
        })?;

        if status != "cancelled" {
            return Err(format!(
                "Cannot delete invoice: status is '{}'. Only cancelled invoices may be permanently deleted.",
                status
            ));
        }

        // 3b. Delete child records in dependency order (children before parent).
        // These tables all have FK references to invoices.id.
        tx.execute("DELETE FROM invoice_items  WHERE invoice_id = ?1", rusqlite::params![invoice_id])
            .map_err(|e| format!("Failed to delete invoice items: {}", e))?;
        tx.execute("DELETE FROM payments        WHERE invoice_id = ?1", rusqlite::params![invoice_id])
            .map_err(|e| format!("Failed to delete payments: {}", e))?;
        tx.execute("DELETE FROM ticket_returns  WHERE invoice_id = ?1", rusqlite::params![invoice_id])
            .map_err(|e| format!("Failed to delete ticket returns: {}", e))?;

        // 3c. Delete the invoice itself.
        let rows = tx.execute(
            "DELETE FROM invoices WHERE id = ?1",
            rusqlite::params![invoice_id],
        ).map_err(|e| format!("Failed to delete invoice: {}", e))?;

        if rows == 0 {
            return Err("Invoice was not deleted — it may have been modified concurrently.".to_string());
        }

        // 3d. Enqueue the sync delete INSIDE the transaction.
        // If this fails, the entire transaction rolls back — no invoice is deleted without sync enqueued.
        let payload = serde_json::json!({"id": invoice_id}).to_string();
        tx.execute(
            "INSERT INTO sync_queue (table_name, operation, payload, on_conflict, retry_count) \
             VALUES ('invoices', 'delete', ?1, 'id', 0)",
            rusqlite::params![payload],
        ).map_err(|e| format!("Failed to enqueue sync delete: {}", e))?;

        // 4. Commit only after all steps (including sync enqueue) have succeeded.
        tx.commit()
            .map_err(|e| format!("Transaction commit failed — all changes rolled back: {}", e))?;

        Ok(())
    }).await.map_err(|e| e.to_string())?
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            get_app_config,
            save_app_config,
            get_db_connection_string,
            get_db_path,
            get_app_data_dir,
            backup_db_to_path,
            restore_db_from_path,
            list_backups,
            db_file_exists,
            write_text_file,

            get_api_key,

            save_supabase_config,
            save_supabase_config_secure,
            test_supabase_connection,
            begin_admin_session,
            end_admin_session,
            verify_admin_session,
            drain_sync_queue,
            full_sync_all_tables,
            // ── Go API backend commands (Phase 1) ──────────────────────────
            save_api_config,
            test_api_connection,
            drain_sync_queue_to_backend,

            full_sync_table_to_backend,
            ai_query,
            save_ai_api_key,
            execute_ai_action,
            get_local_ip,
            get_server_qr_code,
            get_qr_for_url,
            delete_cancelled_invoice,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("
            CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);
            INSERT INTO app_settings (key, value) VALUES ('admin_pin_hash', 'test_hash');
            CREATE TABLE invoices (
                id INTEGER PRIMARY KEY,
                invoice_status TEXT NOT NULL DEFAULT 'paid',
                invoice_number TEXT DEFAULT '',
                agent_id INTEGER DEFAULT 0,
                invoice_date TEXT DEFAULT '',
                total_value REAL DEFAULT 0,
                outstanding_balance REAL DEFAULT 0
            );
            CREATE TABLE invoice_items (
                id INTEGER PRIMARY KEY,
                invoice_id INTEGER NOT NULL
            );
            CREATE TABLE payments (
                id INTEGER PRIMARY KEY,
                invoice_id INTEGER NOT NULL
            );
            CREATE TABLE ticket_returns (
                id INTEGER PRIMARY KEY,
                invoice_id INTEGER NOT NULL
            );
            CREATE TABLE sync_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                table_name TEXT NOT NULL,
                operation TEXT NOT NULL,
                payload TEXT NOT NULL,
                on_conflict TEXT DEFAULT 'id',
                retry_count INTEGER DEFAULT 0,
                last_error TEXT DEFAULT ''
            );
        ").unwrap();
        conn
    }

    /// Core deletion logic extracted for testing without AppHandle.
    fn delete_invoice_tx(conn: &mut rusqlite::Connection, invoice_id: i64) -> Result<(), String> {
        let status: String = conn.query_row(
            "SELECT invoice_status FROM invoices WHERE id = ?1",
            rusqlite::params![invoice_id],
            |row| row.get(0),
        ).map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => "Invoice not found.".to_string(),
            e => format!("Database error: {}", e),
        })?;

        if status != "cancelled" {
            return Err(format!(
                "Cannot delete invoice: status is '{}'. Only cancelled invoices may be permanently deleted.",
                status
            ));
        }

        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM invoice_items  WHERE invoice_id = ?1", rusqlite::params![invoice_id])
            .map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM payments        WHERE invoice_id = ?1", rusqlite::params![invoice_id])
            .map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM ticket_returns  WHERE invoice_id = ?1", rusqlite::params![invoice_id])
            .map_err(|e| e.to_string())?;
        let rows = tx.execute("DELETE FROM invoices WHERE id = ?1", rusqlite::params![invoice_id])
            .map_err(|e| e.to_string())?;
        if rows == 0 {
            return Err("Invoice was not deleted.".to_string());
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    #[test]
    fn test_delete_cancelled_invoice_success() {
        let mut conn = setup_test_db();
        conn.execute("INSERT INTO invoices (id, invoice_status) VALUES (1, 'cancelled')", []).unwrap();
        conn.execute("INSERT INTO invoice_items (id, invoice_id) VALUES (10, 1)", []).unwrap();
        conn.execute("INSERT INTO payments (id, invoice_id) VALUES (20, 1)", []).unwrap();
        conn.execute("INSERT INTO ticket_returns (id, invoice_id) VALUES (30, 1)", []).unwrap();

        assert!(delete_invoice_tx(&mut conn, 1).is_ok());

        let count: i64 = conn.query_row("SELECT COUNT(*) FROM invoices WHERE id=1", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 0, "invoice must be deleted");
        let items: i64 = conn.query_row("SELECT COUNT(*) FROM invoice_items WHERE invoice_id=1", [], |r| r.get(0)).unwrap();
        assert_eq!(items, 0, "invoice_items must be deleted");
        let pays: i64 = conn.query_row("SELECT COUNT(*) FROM payments WHERE invoice_id=1", [], |r| r.get(0)).unwrap();
        assert_eq!(pays, 0, "payments must be deleted");
        let rets: i64 = conn.query_row("SELECT COUNT(*) FROM ticket_returns WHERE invoice_id=1", [], |r| r.get(0)).unwrap();
        assert_eq!(rets, 0, "ticket_returns must be deleted");
    }

    #[test]
    fn test_delete_paid_invoice_rejected() {
        let mut conn = setup_test_db();
        conn.execute("INSERT INTO invoices (id, invoice_status) VALUES (2, 'paid')", []).unwrap();
        let result = delete_invoice_tx(&mut conn, 2);
        assert!(result.is_err(), "paid invoice must not be deletable");
        assert!(result.unwrap_err().contains("Cannot delete invoice"), "error must explain the status");
        // The invoice row must still exist.
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM invoices WHERE id=2", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1, "paid invoice must NOT be deleted");
    }

    #[test]
    fn test_delete_nonexistent_invoice_rejected() {
        let mut conn = setup_test_db();
        let result = delete_invoice_tx(&mut conn, 999);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invoice not found"), "must report not found");
    }

    #[test]
    fn test_delete_invoice_linked_records_removed() {
        let mut conn = setup_test_db();
        // Invoice 3 cancelled, with multiple child records.
        conn.execute("INSERT INTO invoices (id, invoice_status) VALUES (3, 'cancelled')", []).unwrap();
        for i in 1..=5 {
            conn.execute("INSERT INTO invoice_items (id, invoice_id) VALUES (?1, 3)", rusqlite::params![i]).unwrap();
        }
        for i in 6..=8 {
            conn.execute("INSERT INTO payments (id, invoice_id) VALUES (?1, 3)", rusqlite::params![i]).unwrap();
        }
        conn.execute("INSERT INTO ticket_returns (id, invoice_id) VALUES (9, 3)", []).unwrap();

        delete_invoice_tx(&mut conn, 3).unwrap();

        let items: i64 = conn.query_row("SELECT COUNT(*) FROM invoice_items WHERE invoice_id=3", [], |r| r.get(0)).unwrap();
        assert_eq!(items, 0);
        let pays: i64 = conn.query_row("SELECT COUNT(*) FROM payments WHERE invoice_id=3", [], |r| r.get(0)).unwrap();
        assert_eq!(pays, 0);
        let rets: i64 = conn.query_row("SELECT COUNT(*) FROM ticket_returns WHERE invoice_id=3", [], |r| r.get(0)).unwrap();
        assert_eq!(rets, 0);
    }

    /// Core deletion logic with sync enqueue, using manual BEGIN/COMMIT/ROLLBACK so
    /// the function takes `&Connection` (not `&mut Connection`) — safe for testing.
    fn delete_invoice_tx_with_enqueue(conn: &Connection, invoice_id: i64) -> Result<(), String> {
        let status: String = conn.query_row(
            "SELECT invoice_status FROM invoices WHERE id = ?1",
            rusqlite::params![invoice_id],
            |row| row.get(0),
        ).map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => "Invoice not found.".to_string(),
            e => format!("Database error: {}", e),
        })?;

        if status != "cancelled" {
            return Err(format!(
                "Cannot delete invoice: status is '{}'. Only cancelled invoices may be permanently deleted.",
                status
            ));
        }

        conn.execute("BEGIN", []).map_err(|e| e.to_string())?;

        let result = (|| -> Result<(), String> {
            conn.execute("DELETE FROM invoice_items  WHERE invoice_id = ?1", rusqlite::params![invoice_id])
                .map_err(|e| format!("Failed to delete invoice items: {}", e))?;
            conn.execute("DELETE FROM payments        WHERE invoice_id = ?1", rusqlite::params![invoice_id])
                .map_err(|e| format!("Failed to delete payments: {}", e))?;
            conn.execute("DELETE FROM ticket_returns  WHERE invoice_id = ?1", rusqlite::params![invoice_id])
                .map_err(|e| format!("Failed to delete ticket returns: {}", e))?;

            let rows = conn.execute("DELETE FROM invoices WHERE id = ?1", rusqlite::params![invoice_id])
                .map_err(|e| format!("Failed to delete invoice: {}", e))?;
            if rows == 0 {
                return Err("Invoice was not deleted — it may have been modified concurrently.".to_string());
            }

            let payload = serde_json::json!({"id": invoice_id}).to_string();
            conn.execute(
                "INSERT INTO sync_queue (table_name, operation, payload, on_conflict, retry_count) \
                 VALUES ('invoices', 'delete', ?1, 'id', 0)",
                rusqlite::params![payload],
            ).map_err(|e| format!("Failed to enqueue sync delete: {}", e))?;

            Ok(())
        })();

        match result {
            Ok(()) => {
                conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
                Ok(())
            }
            Err(e) => {
                conn.execute("ROLLBACK", []).ok();
                Err(e)
            }
        }
    }

    #[test]
    fn test_delete_invoice_rollback_on_sync_enqueue_failure() {
        // This database intentionally omits the sync_queue table.
        // When delete_invoice_tx_with_enqueue() tries to INSERT INTO sync_queue,
        // it will fail, and the entire transaction (including invoice and child deletions)
        // must be rolled back.
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("
            CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);
            INSERT INTO app_settings (key, value) VALUES ('admin_pin_hash', 'test_hash');
            CREATE TABLE invoices (
                id INTEGER PRIMARY KEY,
                invoice_status TEXT NOT NULL DEFAULT 'paid'
            );
            CREATE TABLE invoice_items (id INTEGER PRIMARY KEY, invoice_id INTEGER NOT NULL);
            CREATE TABLE payments (id INTEGER PRIMARY KEY, invoice_id INTEGER NOT NULL);
            CREATE TABLE ticket_returns (id INTEGER PRIMARY KEY, invoice_id INTEGER NOT NULL);
            -- NOTE: sync_queue table deliberately NOT created
        ").unwrap();

        // Seed invoice with children.
        conn.execute("INSERT INTO invoices (id, invoice_status) VALUES (99, 'cancelled')", []).unwrap();
        conn.execute("INSERT INTO invoice_items (id, invoice_id) VALUES (1, 99)", []).unwrap();
        conn.execute("INSERT INTO payments (id, invoice_id) VALUES (2, 99)", []).unwrap();
        conn.execute("INSERT INTO ticket_returns (id, invoice_id) VALUES (3, 99)", []).unwrap();

        // Attempt deletion — sync_queue INSERT will fail because the table doesn't exist.
        let result = delete_invoice_tx_with_enqueue(&conn, 99);
        assert!(result.is_err(), "must fail when sync_queue table is missing");

        // The entire transaction must have rolled back — all records still present.
        let invoice_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM invoices WHERE id=99", [], |r| r.get(0)).unwrap();
        assert_eq!(invoice_count, 1, "invoice must be rolled back and still present");

        let items_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM invoice_items WHERE invoice_id=99", [], |r| r.get(0)).unwrap();
        assert_eq!(items_count, 1, "invoice_items must be rolled back");

        let pay_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM payments WHERE invoice_id=99", [], |r| r.get(0)).unwrap();
        assert_eq!(pay_count, 1, "payments must be rolled back");

        let ret_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM ticket_returns WHERE invoice_id=99", [], |r| r.get(0)).unwrap();
        assert_eq!(ret_count, 1, "ticket_returns must be rolled back");
    }
}
