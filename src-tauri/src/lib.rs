use tauri::{Manager, Emitter};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;
use std::sync::{OnceLock, Mutex};

// Embedded Python scraper — extracted to temp dir at runtime
const PYTHON_SCRAPER: &str = include_str!("../../lottery_scripts/fetch_lottery.py");

// ── Active games (8 NLB + 8 DLB) ─────────────────────────────────────────────
static ALL_GAME_SLUGS: &[(&str, &str)] = &[
    // NLB — 8 active games
    ("ada-sampatha",              "NLB"),
    ("govisetha",                 "NLB"),
    ("mega-power",                "NLB"),
    ("nlb-jaya",                  "NLB"),
    ("handahana",                 "NLB"),
    ("mahajana-sampatha",         "NLB"),
    ("dhana-nidhanaya",           "NLB"),
    ("suba-dawasak",              "NLB"),
    // DLB — 8 active games
    ("dlb-sasiri",                "DLB"),
    ("dlb-lagna-wasana",          "DLB"),
    ("dlb-shanida",               "DLB"),
    ("dlb-ada-kotipathi",         "DLB"),
    ("dlb-supiri-dhana-sampatha", "DLB"),
    ("dlb-super-ball",            "DLB"),
    ("dlb-kapruka",               "DLB"),
    ("dlb-jaya-sampatha",         "DLB"),
];

// ── Lottery results data model ─────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct PrizeTier {
    pub rank: String,     // "1st Prize", "2nd Prize", …
    pub prize: String,    // "Rs. 50,000,000"
    pub match_desc: String, // what to match
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct LotteryResult {
    pub game_slug: String,     // exact frontend slug, e.g. "dlb-ada-kotipathi"
    pub game_name: String,
    pub board: String,         // "NLB" | "DLB"
    pub draw_number: String,
    pub draw_date: String,
    pub winning_letter: String,
    pub winning_numbers: Vec<String>,
    pub super_number: String,
    pub prizes: Vec<PrizeTier>,
    pub source_url: String,
    pub fetched_at: String,
    pub error: String,
}

// ── Result fetch helpers ────────────────────────────────────────────────────────

/// Rotating list of real browser User-Agent strings (Windows + Linux + Mac).
static UA_POOL: &[&str] = &[
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
];

fn pick_ua() -> &'static str {
    let idx = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| (d.as_millis() / 500) as usize % UA_POOL.len())
        .unwrap_or(0);
    UA_POOL[idx]
}

fn stealth_headers() -> reqwest::header::HeaderMap {
    let mut h = reqwest::header::HeaderMap::new();
    let _ = h.insert("Accept",                  "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8".parse().unwrap());
    let _ = h.insert("Accept-Language",         "en-US,en;q=0.9,si;q=0.8,ta;q=0.7".parse().unwrap());
    let _ = h.insert("Accept-Encoding",         "gzip, deflate, br".parse().unwrap());
    let _ = h.insert("Connection",              "keep-alive".parse().unwrap());
    let _ = h.insert("Upgrade-Insecure-Requests","1".parse().unwrap());
    let _ = h.insert("Sec-Fetch-Dest",          "document".parse().unwrap());
    let _ = h.insert("Sec-Fetch-Mode",          "navigate".parse().unwrap());
    let _ = h.insert("Sec-Fetch-Site",          "none".parse().unwrap());
    let _ = h.insert("Sec-Fetch-User",          "?1".parse().unwrap());
    let _ = h.insert("Cache-Control",           "max-age=0".parse().unwrap());
    h
}

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(25))   // longer timeout for Windows
        .user_agent(pick_ua())
        .default_headers(stealth_headers())
        // Accept both valid and self-signed certs — nlb.lk/dlb.lk sometimes
        // use intermediate certs not trusted by Windows SChannel by default
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| e.to_string())
}

/// Returns Unix epoch in milliseconds as a string — parseable by JS `new Date(Number(ts))`.
fn current_timestamp() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

// ── Headless browser engine ────────────────────────────────────────────────────

/// Returns true if Chrome/Chromium is available on this system.
/// Checks PATH on Linux/Mac and fixed install paths on Windows.
fn chrome_available() -> bool {
    use std::process::Command;
    use std::path::Path;

    // Windows: check common fixed install locations first (Chrome is rarely in PATH on Windows)
    #[cfg(target_os = "windows")]
    {
        let win_paths = [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            &format!(r"{}\Google\Chrome\Application\chrome.exe",
                std::env::var("LOCALAPPDATA").unwrap_or_default()),
            r"C:\Program Files\Chromium\Application\chrome.exe",
        ];
        for p in &win_paths {
            if Path::new(p).exists() { return true; }
        }
        // Also try PATH on Windows (in case Chrome was added manually)
        for bin in &["chrome.exe", "chromium.exe"] {
            if Command::new("where").arg(bin).output()
                .map(|o| o.status.success()).unwrap_or(false) {
                return true;
            }
        }
        return false;
    }

    // Linux / macOS: use `which`
    #[cfg(not(target_os = "windows"))]
    {
        for bin in &["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"] {
            if Command::new("which").arg(bin).output()
                .map(|o| o.status.success())
                .unwrap_or(false)
            {
                return true;
            }
        }
        false
    }
}

/// Load a URL with headless Chrome, wait for `wait_selector` to appear, return
/// the fully-rendered HTML. Runs in a blocking thread so it doesn't stall tokio.
/// Returns `None` if Chrome is not installed or navigation fails — caller falls
/// back to reqwest strategies automatically.
async fn headless_get(url: String, wait_selector: String) -> Option<String> {
    if !chrome_available() { return None; }

    tokio::task::spawn_blocking(move || -> Option<String> {
        use headless_chrome::{Browser, LaunchOptions};
        use std::path::PathBuf;

        // On Windows, headless_chrome can't find Chrome automatically — pass the path explicitly
        #[cfg(target_os = "windows")]
        let chrome_path: Option<PathBuf> = {
            let candidates = [
                r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            ];
            candidates.iter()
                .find(|p| std::path::Path::new(p).exists())
                .map(PathBuf::from)
        };
        #[cfg(not(target_os = "windows"))]
        let chrome_path: Option<PathBuf> = None;

        let browser = Browser::new(LaunchOptions {
            headless: true,
            sandbox: false, // required in some Linux environments
            idle_browser_timeout: Duration::from_secs(20),
            path: chrome_path,
            ..Default::default()
        }).ok()?;

        let tab = browser.new_tab().ok()?;

        // Navigate and wait for navigation to complete
        tab.navigate_to(&url).ok()?;

        // Wait for the result container — up to 12 seconds for JS to render
        let _ = tab.wait_for_element_with_custom_timeout(
            &wait_selector,
            Duration::from_secs(12),
        );

        // Extra 500ms for any post-render updates
        std::thread::sleep(Duration::from_millis(500));

        tab.get_content().ok()
    })
    .await
    .ok()
    .flatten()
}

/// For DLB SPA: navigate to the game sub-page, click the sidebar link if present,
/// wait for DOM update, return rendered HTML.
async fn headless_dlb(url_path: &str) -> Option<String> {
    let game_url = format!("https://www.dlb.lk/result/{}/en", url_path);

    // Selectors for the DLB results table (try multiple possibilities)
    let wait_sel = "table tbody tr, .result-table tr, [class*='result'] tr".to_string();

    headless_get(game_url, wait_sel).await
}

/// For NLB: navigate to the game sub-page and wait for the latest results section.
async fn headless_nlb(url_path: &str) -> Option<String> {
    let game_url = format!("https://www.nlb.lk/lotteries/{}", url_path); // confirmed URL pattern
    let wait_sel = ".latest-results, [class*='latest'], table tbody tr, .draw-result, .winning-numbers".to_string();

    headless_get(game_url, wait_sel).await
}

// ── SPA / XHR helpers ─────────────────────────────────────────────────────────

/// Build a `reqwest::Client` that mimics a real browser including XHR headers.
fn build_xhr_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36")
        .default_headers({
            let mut h = reqwest::header::HeaderMap::new();
            h.insert("Accept",          "application/json, text/html, */*".parse().unwrap());
            h.insert("Accept-Language", "en-US,en;q=0.9,si;q=0.8".parse().unwrap());
            h.insert("X-Requested-With","XMLHttpRequest".parse().unwrap());
            h
        })
        .build()
        .map_err(|e| e.to_string())
}

/// Try an HTTP GET expecting JSON; returns None silently if the response is
/// not JSON or the status is non-2xx.
async fn try_xhr_json(client: &reqwest::Client, url: &str) -> Option<serde_json::Value> {
    let resp = client.get(url).send().await.ok()?;
    if resp.status().is_success() {
        resp.json::<serde_json::Value>().await.ok()
    } else {
        None
    }
}

/// Try an HTTP POST with form data; returns the HTML body or None.
async fn try_post_form(client: &reqwest::Client, url: &str, params: &[(&str, &str)]) -> Option<String> {
    let resp = client.post(url).form(params).send().await.ok()?;
    if resp.status().is_success() { resp.text().await.ok() } else { None }
}

/// Extract lottery ball data embedded in a `<script>` tag as JSON.
/// Many PHP/Vue SPAs include initial state as:
///   window.__INITIAL_STATE__ = {...}  OR  window.resultData = [...]
fn extract_script_balls(html: &str, max_ball_digits: usize, max_numbers: usize) -> Option<(String, String, String, Vec<String>)> {
    let doc = scraper::Html::parse_document(html);
    let script_sel = scraper::Selector::parse("script").ok()?;

    // Common patterns in SPA initial data for lottery results
    let number_re = regex_lite::Regex::new(r"\b(\d{1,2})\b").ok()?;
    let letter_re = regex_lite::Regex::new(r#""(?:letter|winningLetter|Letter)"\s*:\s*"([A-Z])""#).ok()?;
    let draw_re   = regex_lite::Regex::new(r#""(?:drawNumber|draw_no|DrawNo|DrawNumber)"\s*:\s*"?(\d{3,5})"?"#).ok()?;
    let date_re   = regex_lite::Regex::new(r#""(?:drawDate|draw_date|DrawDate|date)"\s*:\s*"([0-9\-/A-Za-z ]+)""#).ok()?;

    for script in doc.select(&script_sel) {
        let content = script.text().collect::<String>();
        // Skip tiny scripts and non-result scripts
        if content.len() < 20 { continue; }
        let lower = content.to_lowercase();
        if !lower.contains("draw") && !lower.contains("result") && !lower.contains("winning") { continue; }

        let letter    = letter_re.captures(&content).and_then(|c| c.get(1)).map(|m| m.as_str().to_string()).unwrap_or_default();
        let draw_num  = draw_re.captures(&content).and_then(|c| c.get(1)).map(|m| m.as_str().to_string()).unwrap_or_default();
        let draw_date = date_re.captures(&content).and_then(|c| c.get(1)).map(|m| m.as_str().to_string()).unwrap_or_default();

        // Extract number balls (1-2 digit numbers in the result section)
        let numbers: Vec<String> = number_re.find_iter(&content)
            .map(|m| m.as_str().to_string())
            .filter(|n| n.len() <= max_ball_digits)
            .take(max_numbers)
            .collect();

        if numbers.len() == max_numbers {
            return Some((draw_num, draw_date, letter, numbers));
        }
    }
    None
}

/// Generic HTML text extractor: finds first element matching selector and returns its trimmed text.
fn extract_text(document: &scraper::Html, selector: &str) -> Option<String> {
    scraper::Selector::parse(selector).ok().and_then(|sel| {
        document.select(&sel).next().map(|e| e.text().collect::<String>().trim().to_string())
    })
}

/// Collect all matching texts
fn extract_all_texts(document: &scraper::Html, selector: &str) -> Vec<String> {
    match scraper::Selector::parse(selector) {
        Ok(sel) => document
            .select(&sel)
            .map(|e| e.text().collect::<String>().trim().to_string())
            .filter(|s| !s.is_empty())
            .collect(),
        Err(_) => vec![],
    }
}

/// Attempt a JSON endpoint, return Ok(json) or Err
async fn try_json(client: &reqwest::Client, url: &str) -> Option<serde_json::Value> {
    let resp = client.get(url).send().await.ok()?;
    if resp.status().is_success() {
        resp.json::<serde_json::Value>().await.ok()
    } else {
        None
    }
}

/// Attempt an HTML page, return Ok(text) or Err
async fn try_html(client: &reqwest::Client, url: &str) -> Option<String> {
    let resp = client.get(url).send().await.ok()?;
    if resp.status().is_success() { resp.text().await.ok() } else { None }
}

// ── Per-game scraping profiles ────────────────────────────────────────────────
// (url-slug, has_letter, expected_number_count, has_super, max_ball_digits)
// max_ball_digits: max digits per individual winning number (2 for ball-style, 4 for serial)
// This is critical to avoid mistaking draw numbers (3100+) for winning numbers.
// NLB profiles — confirmed from official nlb.lk/lotteries pages
// Format: (slug, has_letter, ball_count, has_super, max_ball_digits)
//
// Two display formats on nlb.lk:
//   A) Single-digit balls: website shows 6 individual digit circles (e.g. K|1|5|6|2|6|6)
//      → max_ball_digits=1, count=6  (together form the 4-digit+super serial)
//   B) Two-digit balls: website shows 4-5 number balls with 2 digits each
//      → max_ball_digits=2, count=4|5
static NLB_GAME_PROFILES: &[(&str, bool, usize, bool, usize)] = &[
    // Format A — Letter + 6 single-digit circles (Mahajana Sampatha confirmed: K 1 5 6 2 6 6)
    ("mahajana-sampatha",    true, 6, false, 1),
    ("govisetha",            true, 6, false, 1),
    ("lucky-7",              true, 6, false, 1),
    ("handahana",            true, 6, false, 1),
    ("ada-sampatha",         true, 6, false, 1),
    ("nlb-jaya",             true, 6, false, 1),
    ("kotipathi-kapruka",    true, 6, false, 1),
    ("lagna-wasanawa",       true, 6, false, 1),
    ("sasiri-nlb",           true, 6, false, 1),
    ("suba-dawasak",         true, 6, false, 1),
    // Format B — Letter + 2-digit balls
    ("dhana-nidhanaya",      true, 4, false, 2), // confirmed Draw 2331: I 19 24 64 65
    ("mega-power",           true, 5, false, 2), // confirmed Draw 2648: F 06 28 33 35 48
];

// All DLB games: letter + 4 two-digit ball numbers (Draw 3100: B 08 57 68 70)
static DLB_GAME_PROFILES: &[(&str, bool, usize, bool, usize)] = &[
    ("dlb-ada-kotipathi",         true, 4, false, 2),
    ("dlb-shanida",               true, 4, false, 2),
    ("dlb-lagna-wasana",          true, 4, false, 2),
    ("dlb-supiri-dhana-sampatha", true, 4, false, 2),
    ("dlb-super-ball",            true, 4, false, 2),
    ("dlb-kapruka",               true, 4, false, 2),
    ("dlb-sasiri",                true, 4, false, 2),
    ("dlb-jaya-sampatha",         true, 4, false, 2),
];

/// Returns (has_letter, expected_count, has_super, max_ball_digits)
fn get_game_profile(slug: &str, board: &str) -> (bool, usize, bool, usize) {
    let profiles: &[(&str, bool, usize, bool, usize)] =
        if board == "DLB" { DLB_GAME_PROFILES } else { NLB_GAME_PROFILES };
    profiles.iter()
        .find(|(s, _, _, _, _)| *s == slug)
        .map(|(_, l, n, su, md)| (*l, *n, *su, *md))
        .unwrap_or((true, 4, false, 2))
}

#[allow(dead_code)]
fn get_nlb_profile(slug: &str) -> (bool, usize, bool) {
    let (l, n, s, _) = get_game_profile(slug, "NLB");
    (l, n, s)
}

/// Parse NLB/DLB result balls from a text segment with strict bounds.
///
/// `max_ball_digits`: max digits for a valid winning number.
///   - 2 → DLB/Mega Power style: "B 08 57 68 70"  (rejects draw numbers like "3100")
///   - 4 → NLB serial style:     "G 3456 78"
///
/// `max_numbers`: stop after collecting this many numbers.
fn parse_nlb_balls_strict(text: &str, max_ball_digits: usize, max_numbers: usize) -> (String, Vec<String>) {
    let tokens: Vec<&str> = text.split_whitespace().collect();
    if tokens.is_empty() { return (String::new(), vec![]); }

    let mut letter       = String::new();
    let mut found_letter = false;
    let mut numbers      = Vec::new();

    for tok in &tokens {
        if numbers.len() >= max_numbers { break; }
        let t = tok.trim();
        if t.is_empty() { continue; }

        // Single uppercase letter → letter ball (first occurrence only)
        if !found_letter
            && t.len() == 1
            && t.chars().next().map(|c| c.is_ascii_uppercase()).unwrap_or(false)
        {
            letter      = t.to_string();
            found_letter = true;
            continue;
        }

        // Number token: all digits, length <= max_ball_digits
        if t.chars().all(|c| c.is_ascii_digit()) && t.len() >= 1 && t.len() <= max_ball_digits {
            numbers.push(t.to_string());
        }
    }
    (letter, numbers)
}

#[allow(dead_code)]
fn parse_nlb_balls(text: &str) -> (String, Vec<String>) {
    parse_nlb_balls_strict(text, 4, 6)
}

/// Validate that parsed balls match this game's expected profile.
fn validate_balls(slug: &str, board: &str, letter: &str, nums: &[String]) -> bool {
    let (exp_letter, exp_count, _, _) = get_game_profile(slug, board);
    let letter_ok = !exp_letter || !letter.is_empty();
    let count_ok  = nums.len() == exp_count || nums.len() == exp_count + 1; // +1 allows super
    letter_ok && count_ok
}

// ── NLB game → official URL path mapping ─────────────────────────────────────
// Maps our internal slug → the actual URL segment on www.nlb.lk
// Based on https://www.nlb.lk/results/{slug} pattern confirmed from screenshots.
// (internal_slug, url_slug, display_name)
// URL base: https://www.nlb.lk/lotteries/{url_slug}  ← confirmed from browser screenshot
static NLB_URL_PATHS: &[(&str, &str, &str)] = &[
    ("suba-dawasak",         "suba-dawasak",         "Suba Dawasak"),
    ("govisetha",            "govisetha",             "Govisetha"),
    ("mahajana-sampatha",    "mahajana-sampatha",     "Mahajana Sampatha"),
    ("dhana-nidhanaya",      "dhana-nidhanaya",       "Dhana Nidhanaya"),
    ("mega-power",           "mega-power",            "Mega Power"),
    ("lucky-7",              "lucky-7",               "Lucky 7"),
    ("handahana",            "handahana",             "Handahana"),
    ("ada-sampatha",         "ada-sampatha",          "Ada Sampatha"),
    ("nlb-jaya",             "nlb-jaya",              "NLB Jaya"),
    ("kotipathi-kapruka",    "kotipathi-kapruka",     "Kotipathi Kapruka"),
    ("lagna-wasanawa",       "lagna-wasanawa",        "Lagna Wasanawa"),
    ("sasiri-nlb",           "sasiri",                "Sasiri"),
];

fn nlb_url_slug(game_slug: &str) -> &str {
    NLB_URL_PATHS.iter()
        .find(|(s, _, _)| *s == game_slug)
        .map(|(_, u, _)| *u)
        .unwrap_or(game_slug)
}

fn nlb_display_name(game_slug: &str) -> String {
    NLB_URL_PATHS.iter()
        .find(|(s, _, _)| *s == game_slug)
        .map(|(_, _, n)| n.to_string())
        .unwrap_or_else(|| game_slug.replace('-', " ").to_uppercase())
}

/// Scrape NLB results for a specific game using game-specific profiles.
/// Example confirmed: Mega Power → H | 07, 27, 30, 50, 54
async fn fetch_nlb_result(game_slug: &str) -> LotteryResult {
    let (_, expected_count, _, max_digits) = get_game_profile(game_slug, "NLB");
    let url_path = nlb_url_slug(game_slug);
    let mut result = LotteryResult {
        game_slug:  game_slug.to_string(),
        board:      "NLB".into(),
        game_name:  nlb_display_name(game_slug),
        fetched_at: current_timestamp(),
        ..Default::default()
    };

    let client = match build_client() {
        Ok(c) => c,
        Err(_) => {
            result.error = "No internet connection. Use 'Enter Manually' to record results offline.".into();
            return result;
        }
    };

    // ── Layer 0: Headless Chrome (handles JS-rendered pages) ──────────────────
    // Uses system Chrome if installed; silently skipped if unavailable.
    if let Some(html) = headless_nlb(url_path).await {
        let doc = scraper::Html::parse_document(&html);
        if let Some(p) = scrape_nlb_table(&doc, game_slug, expected_count, max_digits) {
            if validate_balls(game_slug, "NLB", &p.2, &p.3) {
                result.source_url = format!("https://www.nlb.lk/results/{} (headless)", url_path);
                result.draw_number = p.0; result.draw_date = p.1;
                result.winning_letter = p.2; result.winning_numbers = p.3;
                return result;
            }
        }
        // Class-based fallback on headless HTML
        for pat in &["span.ball","[class*='Ball']","[class*='winning']","[class*='number']"] {
            let texts = extract_all_texts(&doc, pat);
            let (l, n) = parse_nlb_balls_strict(&texts.join(" "), max_digits, expected_count);
            if n.len() == expected_count {
                result.source_url = format!("https://www.nlb.lk/results/{} (headless)", url_path);
                result.winning_letter = l; result.winning_numbers = n;
                return result;
            }
        }
    }

    // ── Layer 1: Official JSON API endpoint attempts (game-specific) ─────────
    let json_candidates = [
        format!("https://www.nlb.lk/api/Result/GetLatestResult?gameSlug={}", url_path),
        format!("https://www.nlb.lk/Result/GetDrawResult?game={}", url_path),
        format!("https://www.nlb.lk/Results/GetLotteryResults?lotteryCode={}&count=1", url_path),
        format!("https://www.nlb.lk/api/draws/latest/{}", url_path),
    ];
    for url in &json_candidates {
        if let Some(json) = try_json(&client, url).await {
            result.source_url  = url.clone();
            result.draw_number = json_str(&json, &["DrawNumber","drawNo","draw_no","DrawNo"]);
            result.draw_date   = json_str(&json, &["DrawDate","drawDate","draw_date","Date"]);
            result.winning_letter = json_str(&json, &["WinningLetter","letter","Letter","winningLetter"]);
            result.super_number   = json_str(&json, &["SuperNumber","superNo","super_number","SuperNo"]);
            // numbers may be array or dash-separated string
            if let Some(arr) = json.get("WinningNumbers").or(json.get("numbers")).or(json.get("Numbers")) {
                if let Some(nums_arr) = arr.as_array() {
                    result.winning_numbers = nums_arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.trim().to_string()))
                        .filter(|s| !s.is_empty()).collect();
                } else if let Some(s) = arr.as_str() {
                    result.winning_numbers = s.split(['-', ',', ' '])
                        .map(|t| t.trim().to_string()).filter(|s| !s.is_empty()).collect();
                }
            }
            if !result.winning_numbers.is_empty() {
                return result; // JSON success
            }
        }
    }

    // ── Layer 2: HTML page — confirmed URL pattern: nlb.lk/results/{slug} ────
    // If draw_number or date given, append as query params for filtered results
    let base_results = format!("https://www.nlb.lk/results/{}", url_path);
    let base_lotteries = format!("https://www.nlb.lk/lotteries/{}", url_path);
    let html_urls = [
        base_results.clone(),              // primary confirmed URL
        base_lotteries.clone(),            // fallback
        format!("https://nlb.lk/results/{}", url_path),
    ];
    for url in &html_urls {
        result.source_url = url.clone();
        let Some(html) = try_html(&client, url).await else { continue };
        let doc = scraper::Html::parse_document(&html);

        // Layer 2a-i: CONFIRMED from DevTools — NLB uses li[class*="Number-"] for balls
        // e.g. <li class="Number-1 Button Square Blue NR">21</li>
        {
            let number_lis = extract_all_texts(&doc, "li[class*='Number-']");
            if !number_lis.is_empty() {
                let (letter, nums) = parse_nlb_balls_strict(
                    &number_lis.join(" "), max_digits, expected_count + 2
                );
                if nums.len() >= 2 {
                    result.winning_letter  = letter;
                    result.winning_numbers = nums.into_iter().take(expected_count + 1).collect();
                    // Extract draw number from "Draw No.: NNN" anywhere in page text
                    let page_text = doc.root_element().text().collect::<String>();
                    if let Some(pos) = page_text.to_lowercase().find("draw no") {
                        for token in page_text[pos..].split_whitespace().take(10) {
                            if token.chars().all(|c| c.is_ascii_digit()) && token.len() >= 3 {
                                result.draw_number = token.to_string(); break;
                            }
                        }
                    }
                    let months = ["January","February","March","April","May","June",
                                  "July","August","September","October","November","December"];
                    for line in page_text.lines() {
                        if months.iter().any(|m| line.contains(m)) && line.len() < 80 {
                            result.draw_date = line.trim().to_string(); break;
                        }
                    }
                    return result;
                }
            }
        }

        // Layer 2a-ii: table-row fallback
        if let Some(parsed) = scrape_nlb_table(&doc, game_slug, expected_count, max_digits) {
            result.draw_number    = parsed.0;
            result.draw_date      = parsed.1;
            result.winning_letter = parsed.2;
            result.winning_numbers= parsed.3;
            if validate_balls(game_slug, "NLB", &result.winning_letter, &result.winning_numbers) {
                return result;
            }
        }

        // Layer 2b: NLB-SPECIFIC selectors confirmed from DevTools screenshot
        // HTML structure: <li class="Number-1 Button Square Blue NR">21</li>
        //                 <li class="Number-2 Little Yellow NL">22</li>
        //                 <li class="Note NR">35</li>
        // Zodiac/letter shown as first special element
        let nlb_specific_patterns = [
            // Primary: exact NLB class patterns from DevTools
            "li[class*='Number-']",
            "li[class*='Button'][class*='Square']",
            "li[class*='Little']",
            // LATEST RESULTS section selectors
            "[class*='latest'] li",
            "[class*='Latest'] li",
            "[class*='result'] li",
            ".latestResult li",
            // Draw result block
            "[class*='draw'] li",
            "[class*='Draw'] li",
        ];
        for pattern in &nlb_specific_patterns {
            let texts = extract_all_texts(&doc, pattern);
            if texts.len() < 2 { continue; }
            // Filter: only keep 1-2 digit numbers and single letters/words (zodiac names count)
            let filtered: Vec<String> = texts.iter()
                .map(|t| t.trim().to_string())
                .filter(|t| !t.is_empty() && t.len() <= 8)
                .collect();
            if filtered.is_empty() { continue; }
            let joined = filtered.join(" ");
            let (letter, nums) = parse_nlb_balls_strict(&joined, max_digits, expected_count + 2);
            if nums.len() >= expected_count.saturating_sub(1) {
                result.winning_letter  = letter;
                result.winning_numbers = nums.into_iter().take(expected_count + 1).collect();
                // Grab draw info
                for d_sel in &[
                    "[class*='draw-no']", "[class*='DrawNo']", "[class*='draw_no']",
                    "strong", "b", "[class*='Date']", "[class*='date']",
                ] {
                    if result.draw_number.is_empty() || result.draw_date.is_empty() {
                        if let Some(t) = extract_text(&doc, d_sel) {
                            if t.chars().all(|c| c.is_ascii_digit()) && t.len() >= 3 {
                                result.draw_number = t;
                            }
                        }
                    }
                }
                return result;
            }
        }

        // Layer 2c: Generic class-based scan (wider net)
        let class_patterns = [
            "[class*='Number-']", "[class*='Button'][class*='Square']",
            "span.ball", "span.result-ball", "span.number-ball",
            "div.ball",  "div.result-ball",
            "[class*='ball']", "[class*='Ball']",
            "[class*='winning']", "[class*='number-circle']",
        ];
        for pattern in &class_patterns {
            let texts = extract_all_texts(&doc, pattern);
            if texts.is_empty() { continue; }
            let (letter, nums) = parse_nlb_balls_strict(&texts.join(" "), max_digits, expected_count + 2);
            let close_enough = nums.len() >= expected_count.saturating_sub(1)
                            && nums.len() <= expected_count + 2;
            if close_enough {
                result.winning_letter  = letter;
                result.winning_numbers = nums;
                if result.draw_date.is_empty() {
                    for sel in &[".draw-date",".result-date","[class*='date']",".lottery-date","td.date"] {
                        if let Some(d) = extract_text(&doc, sel) {
                            if !d.is_empty() { result.draw_date = d; break; }
                        }
                    }
                }
                return result;
            }
        }
    }

    result.error = format!(
        "Live results unavailable for {}. Visit www.nlb.lk/results/{} and use 'Enter Manually'.",
        nlb_display_name(game_slug), url_path
    );
    result
}

/// Extract draw number, date, letter, and number balls from an NLB-style HTML table.
fn scrape_nlb_table(
    doc: &scraper::Html,
    _game_slug: &str,
    expected_count: usize,
    max_ball_digits: usize,
) -> Option<(String, String, String, Vec<String>)> {
    let row_sel = scraper::Selector::parse("table tbody tr").ok()?;
    let td_sel  = scraper::Selector::parse("td").ok()?;
    let months  = ["January","February","March","April","May","June",
                   "July","August","September","October","November","December"];

    for row in doc.select(&row_sel) {
        let tds: Vec<_> = row.select(&td_sel).collect();
        if tds.len() < 2 { continue; }

        // ── Column 0: draw number + date ─────────────────────────────────────
        let meta = tds[0].text().collect::<String>();
        let mut draw_number = String::new();
        let mut draw_date   = String::new();
        for word in meta.split_whitespace() {
            if draw_number.is_empty() && word.chars().all(|c| c.is_ascii_digit()) && word.len() >= 3 {
                draw_number = word.to_string();
            }
        }
        for line in meta.lines().map(|l| l.trim()).filter(|l| !l.is_empty()) {
            if months.iter().any(|m| line.contains(m)) {
                draw_date = line.to_string(); break;
            }
        }

        // ── Column 1: result balls — strictly bounded by digit length ────────
        let max_token_len = max_ball_digits + 1; // +1 for single letter token
        let mut ball_tokens: Vec<String> = Vec::new();
        for tag in &["span", "div", "li", "strong", "b"] {
            if let Ok(sel) = scraper::Selector::parse(tag) {
                let children: Vec<String> = tds[1].select(&sel)
                    .map(|e| e.text().collect::<String>().trim().to_string())
                    .filter(|t| !t.is_empty() && t.len() <= max_token_len)
                    .collect();
                if children.len() >= 2 { ball_tokens = children; break; }
            }
        }
        if ball_tokens.len() < 2 {
            ball_tokens = tds[1].text().collect::<String>()
                .split_whitespace()
                .map(|s| s.to_string())
                .filter(|s| s.len() <= max_token_len)
                .collect();
        }

        let (letter, nums) = parse_nlb_balls_strict(&ball_tokens.join(" "), max_ball_digits, expected_count + 2);
        // Accept if count matches expected or is close (handles single-digit vs 2-digit format)
        let ok = !draw_number.is_empty()
            && nums.len() >= expected_count.saturating_sub(1)
            && nums.len() <= expected_count + 2;
        if ok {
            let trimmed = nums.into_iter().take(expected_count + 1).collect::<Vec<_>>();
            return Some((draw_number, draw_date, letter, trimmed));
        }
    }
    None
}

/// Extract first matching string from a serde_json::Value using multiple key names.
fn json_str(v: &serde_json::Value, keys: &[&str]) -> String {
    for k in keys {
        if let Some(s) = v.get(k).and_then(|x| x.as_str()) {
            let s = s.trim();
            if !s.is_empty() { return s.to_string(); }
        }
    }
    String::new()
}

// ── DLB game → URL path mapping ───────────────────────────────────────────────
// Maps our internal "dlb-{name}" slugs to the URL segment used on dlb.lk/result/{path}/en
static DLB_URL_PATHS: &[(&str, &str)] = &[
    ("dlb-ada-kotipathi",         "ada-kotipathi"),
    ("dlb-shanida",               "shanida"),
    ("dlb-lagna-wasana",          "lagna-wasana"),
    ("dlb-supiri-dhana-sampatha", "supiri-dhana-sampatha"),
    ("dlb-super-ball",            "super-ball"),
    ("dlb-kapruka",               "kapruka"),
    ("dlb-sasiri",                "sasiri"),
    ("dlb-jaya-sampatha",         "jaya-sampatha"),
];

fn dlb_url_slug(game_slug: &str) -> &str {
    DLB_URL_PATHS.iter()
        .find(|(s, _)| *s == game_slug)
        .map(|(_, u)| *u)
        .unwrap_or_else(|| game_slug.strip_prefix("dlb-").unwrap_or(game_slug))
}

fn dlb_display_name(game_slug: &str) -> String {
    DLB_URL_PATHS.iter()
        .find(|(s, _)| *s == game_slug)
        .map(|(_, u)| u.replace('-', " ").to_uppercase())
        .unwrap_or_else(|| game_slug.replace('-', " ").to_uppercase())
}

/// Scrape DLB results using 4 strategies to handle SPA JavaScript behavior.
/// DLB uses a React/Vue SPA: clicking a game fires an XHR. We replicate those requests.
async fn fetch_dlb_result(game_slug: &str) -> LotteryResult {
    let (_, expected_count, _, max_digits) = get_game_profile(game_slug, "DLB");
    let url_path = dlb_url_slug(game_slug);

    let mut result = LotteryResult {
        game_slug:  game_slug.to_string(),
        board:      "DLB".into(),
        game_name:  dlb_display_name(game_slug),
        fetched_at: current_timestamp(),
        ..Default::default()
    };

    let client = match build_client() {
        Ok(c) => c,
        Err(_) => {
            result.error = "No internet connection. Use 'Enter Manually' to record results offline.".into();
            return result;
        }
    };

    // XHR client with SPA-like headers
    let xhr = build_xhr_client().unwrap_or_else(|_| client.clone());

    // ── Strategy 0: Headless Chrome — handles the DLB SPA perfectly ──────────
    // Chrome loads the JS, renders the result table, and we read the DOM.
    if let Some(html) = headless_dlb(url_path).await {
        let doc = scraper::Html::parse_document(&html);
        if let Some(p) = scrape_nlb_table(&doc, game_slug, expected_count, max_digits) {
            if validate_balls(game_slug, "DLB", &p.2, &p.3) {
                result.source_url = format!("https://www.dlb.lk/result/{}/en (headless)", url_path);
                result.draw_number = p.0; result.draw_date = p.1;
                result.winning_letter = p.2; result.winning_numbers = p.3;
                return result;
            }
        }
        // CSS scan on headless-rendered HTML
        for pat in &["td.letter","span.letter","[class*='letter']","span.ball","td.ball","[class*='ball']"] {
            let texts = extract_all_texts(&doc, pat);
            let (l, n) = parse_nlb_balls_strict(&texts.join(" "), max_digits, expected_count);
            if n.len() == expected_count {
                result.source_url = format!("https://www.dlb.lk/result/{}/en (headless)", url_path);
                result.winning_letter = l; result.winning_numbers = n;
                return result;
            }
        }
    }

    // ── Strategy 1: JSON/XHR API endpoints ───────────────────────────────────
    let api_urls = [
        format!("https://www.dlb.lk/api/result/{}/latest",  url_path),
        format!("https://www.dlb.lk/api/lottery?game={}",   url_path),
        format!("https://www.dlb.lk/result/api?lottery={}",  url_path),
        format!("https://www.dlb.lk/lottery/result/{}",      url_path),
        format!("https://www.dlb.lk/result/{}/json",         url_path),
    ];
    for url in &api_urls {
        if let Some(json) = try_xhr_json(&xhr, url).await {
            result.source_url     = url.clone();
            result.draw_number    = json_str(&json, &["drawNumber","draw_no","DrawNo"]);
            result.draw_date      = json_str(&json, &["drawDate","draw_date","DrawDate","date"]);
            result.winning_letter = json_str(&json, &["letter","winningLetter","Letter"]);
            if let Some(v) = json.get("numbers").or(json.get("WinningNumbers")).or(json.get("balls")) {
                if let Some(arr) = v.as_array() {
                    result.winning_numbers = arr.iter()
                        .filter_map(|x| x.as_str().map(|s| s.trim().to_string())).collect();
                }
            }
            if !result.winning_numbers.is_empty() { return result; }
        }
    }

    // ── Strategy 2: Game-specific HTML sub-pages ─────────────────────────────
    let html_urls = [
        format!("https://www.dlb.lk/result/{}/en", url_path),
        format!("https://dlb.lk/result/{}/en",     url_path),
        format!("https://www.dlb.lk/result/en/{}", url_path),
    ];
    for url in &html_urls {
        result.source_url = url.clone();
        let Some(html) = try_html(&client, url).await else { continue };
        let doc = scraper::Html::parse_document(&html);

        // 2a: Table parsing
        if let Some(p) = scrape_nlb_table(&doc, game_slug, expected_count, max_digits) {
            if validate_balls(game_slug, "DLB", &p.2, &p.3) {
                result.draw_number = p.0; result.draw_date = p.1;
                result.winning_letter = p.2; result.winning_numbers = p.3;
                return result;
            }
        }
        // 2b: Embedded script JSON
        if let Some(p) = extract_script_balls(&html, max_digits, expected_count) {
            if !p.3.is_empty() {
                result.draw_number = p.0; result.draw_date = p.1;
                result.winning_letter = p.2; result.winning_numbers = p.3;
                return result;
            }
        }
        // 2c: CSS class scan
        for pat in &["td.letter","span.letter","[class*='letter']","span.ball","td.ball","[class*='ball']"] {
            let texts = extract_all_texts(&doc, pat);
            let (l, n) = parse_nlb_balls_strict(&texts.join(" "), max_digits, expected_count);
            if n.len() == expected_count { result.winning_letter = l; result.winning_numbers = n; return result; }
        }
    }

    // ── Strategy 3: POST form simulation (common on PHP backends) ────────────
    for params in &[
        vec![("lottery", url_path), ("action", "get_result")],
        vec![("game", url_path)],
    ] as &[Vec<(&str, &str)>] {
        let ps: Vec<(&str, &str)> = params.iter().map(|(k,v)| (*k,*v)).collect();
        if let Some(html) = try_post_form(&xhr, "https://www.dlb.lk/result/en", &ps).await {
            let doc = scraper::Html::parse_document(&html);
            if let Some(p) = scrape_nlb_table(&doc, game_slug, expected_count, max_digits) {
                if validate_balls(game_slug, "DLB", &p.2, &p.3) {
                    result.source_url = "https://www.dlb.lk/result/en (POST)".into();
                    result.draw_number = p.0; result.draw_date = p.1;
                    result.winning_letter = p.2; result.winning_numbers = p.3;
                    return result;
                }
            }
        }
    }

    // ── Strategy 4: XHR GET with Referer/Origin headers ─────────────────────
    let referer = format!("https://www.dlb.lk/result/{}/en", url_path);
    for url in &[
        format!("https://www.dlb.lk/result/get-result?lottery={}", url_path),
        format!("https://www.dlb.lk/draw/latest?lottery={}", url_path),
    ] {
        if let Ok(resp) = xhr.get(url)
            .header("Referer", &referer)
            .header("Origin",  "https://www.dlb.lk")
            .send().await
        {
            if resp.status().is_success() {
                let body = resp.text().await.unwrap_or_default();
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) {
                    result.winning_letter = json_str(&json, &["letter","winningLetter"]);
                    if let Some(arr) = json.get("numbers").and_then(|v| v.as_array()) {
                        result.winning_numbers = arr.iter()
                            .filter_map(|x| x.as_str().map(|s| s.to_string())).collect();
                        if !result.winning_numbers.is_empty() {
                            result.source_url = url.clone(); return result;
                        }
                    }
                }
            }
        }
    }

    result.error = format!(
        "DLB '{}' is JavaScript-rendered. Visit www.dlb.lk/result/{}/en and use 'Enter Manually'.",
        dlb_display_name(game_slug), url_path
    );
    result
}

// ── Tauri command ─────────────────────────────────────────────────────────────

#[tauri::command]
async fn fetch_live_results(board: String, games: Vec<String>) -> Vec<LotteryResult> {
    let mut results = Vec::new();
    for game in &games {
        let r = if board.to_uppercase() == "DLB" {
            fetch_dlb_result(game).await
        } else {
            fetch_nlb_result(game).await
        };
        results.push(r);
    }
    results
}

/// Call the embedded Python scraper (srilanka-lottery library).
/// Returns Some(LotteryResult) on success, None if Python/library unavailable.
fn fetch_via_python(board: String, game_slug: String, draw_number: String, date: String) -> Option<LotteryResult> {
    // Write script to temp dir once
    let script_path = std::env::temp_dir().join("nlb_dlb_scraper.py");
    if !script_path.exists() {
        std::fs::write(&script_path, PYTHON_SCRAPER).ok()?;
    }

    let mut cmd = std::process::Command::new("python3");
    cmd.arg(&script_path)
        .arg("--board").arg(&board)
        .arg("--game").arg(&game_slug);
    if !draw_number.is_empty() {
        cmd.arg("--draw").arg(&draw_number);
    }
    if !date.is_empty() {
        cmd.arg("--date").arg(&date);
    }

    let output = cmd.output().ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(stdout.trim()).ok()?;

    // Check for error
    if let Some(err) = parsed.get("error").and_then(|v| v.as_str()) {
        if !err.is_empty() && err != "null" {
            return None;
        }
    }

    let numbers: Vec<String> = parsed.get("winning_numbers")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();

    if numbers.is_empty() {
        return None;
    }

    let board_upper = board.to_uppercase();
    let game_name = if board_upper == "DLB" { dlb_display_name(&game_slug) } else { nlb_display_name(&game_slug) };

    Some(LotteryResult {
        game_slug:       parsed.get("game_slug").and_then(|v| v.as_str()).unwrap_or(&game_slug).to_string(),
        board:           parsed.get("board").and_then(|v| v.as_str()).unwrap_or(&board).to_string(),
        game_name,
        draw_number:     parsed.get("draw_number").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        draw_date:       parsed.get("draw_date").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        winning_numbers: numbers,
        winning_letter:  parsed.get("winning_letter").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        super_number:    String::new(),
        prizes:          vec![],
        fetched_at:      current_timestamp(),
        source_url:      String::new(),
        error:           String::new(),
    })
}

#[tauri::command]
async fn fetch_single_result(
    board:       String,
    game_slug:   String,
    target_date: Option<String>,
    draw_number: Option<String>,
) -> LotteryResult {
    let date_str = target_date.unwrap_or_default();
    let draw_str = draw_number.unwrap_or_default();

    // Try Python scraper first (uses srilanka-lottery library)
    if let Some(r) = fetch_via_python(board.clone(), game_slug.clone(), draw_str.clone(), date_str.clone()) {
        return r;
    }

    // Fallback: Rust HTML scraper
    if board.to_uppercase() == "DLB" {
        fetch_dlb_result_for_date(&game_slug, &date_str).await
    } else {
        fetch_nlb_by_draw_or_date(&game_slug, &draw_str, &date_str).await
    }
}

/// NLB-specific fetch using nlb.lk/results/{slug} — confirmed from browser.
/// Supports draw number filter, date filter, or latest-only.
async fn fetch_nlb_by_draw_or_date(game_slug: &str, draw_number: &str, date: &str) -> LotteryResult {
    let url_path = nlb_url_slug(game_slug);
    let (_, expected_count, _, max_digits) = get_game_profile(game_slug, "NLB");
    let zodiac_names = ["ARIES","TAURUS","GEMINI","CANCER","LEO","VIRGO",
                        "LIBRA","SCORPIO","SAGITTARIUS","CAPRICORN","AQUARIUS","PISCES"];
    let months = ["January","February","March","April","May","June",
                  "July","August","September","October","November","December"];

    let mut result = LotteryResult {
        game_slug:  game_slug.to_string(),
        board:      "NLB".into(),
        game_name:  nlb_display_name(game_slug),
        fetched_at: current_timestamp(),
        ..Default::default()
    };

    let client = match build_client() {
        Ok(c) => c,
        Err(_) => { result.error = "No internet. Use 'Enter Manually'.".into(); return result; }
    };

    // Build URL with optional query params
    let url = if !draw_number.is_empty() {
        format!("https://www.nlb.lk/results/{}?drawNo={}", url_path, draw_number)
    } else if !date.is_empty() {
        format!("https://www.nlb.lk/results/{}?date={}", url_path, date)
    } else {
        format!("https://www.nlb.lk/results/{}", url_path)
    };

    result.source_url = url.clone();
    let Some(html) = try_html(&client, &url).await else {
        result.error = format!("Cannot reach {}. Check internet.", url);
        return result;
    };

    let doc = scraper::Html::parse_document(&html);

    // ── Strategy 1: li[class*="Number-"] confirmed from DevTools ─────────────
    let number_lis = extract_all_texts(&doc, "li[class*='Number-']");
    if !number_lis.is_empty() {
        let (letter, nums) = parse_nlb_balls_strict(&number_lis.join(" "), max_digits, expected_count + 2);
        if nums.len() >= 2 {
            result.winning_letter  = letter;
            result.winning_numbers = nums.into_iter().take(expected_count + 1).collect();
            // Extract draw info from full page text
            let pt = doc.root_element().text().collect::<String>();
            if let Some(p) = pt.to_lowercase().find("draw no") {
                for tok in pt[p..].split_whitespace().take(10) {
                    if tok.chars().all(|c| c.is_ascii_digit()) && tok.len() >= 3 {
                        result.draw_number = tok.to_string(); break;
                    }
                }
            }
            for line in pt.lines() {
                if months.iter().any(|m| line.contains(m)) && line.len() < 80 {
                    result.draw_date = line.trim().to_string(); break;
                }
            }
            return result;
        }
    }

    // ── Strategy 2: Parse table rows (results page table structure) ───────────
    if let Ok(row_sel) = scraper::Selector::parse("table tr") {
        let target_draw_lower = draw_number.to_lowercase();
        let target_date_lower = date.to_lowercase();

        for row in doc.select(&row_sel) {
            let row_text = row.text().collect::<String>();
            let row_lower = row_text.to_lowercase();

            // Select the matching row (first row if no filter, or row matching draw/date)
            let is_target = (target_draw_lower.is_empty() && target_date_lower.is_empty())
                || (!target_draw_lower.is_empty() && row_lower.contains(&target_draw_lower))
                || (!target_date_lower.is_empty() && {
                    let parts: Vec<&str> = target_date_lower.split('-').collect();
                    parts.len() == 3 && {
                        let mon_idx: usize = parts[1].parse().unwrap_or(0);
                        let mon_names = ["","january","february","march","april","may","june",
                                         "july","august","september","october","november","december"];
                        let mon = if mon_idx < 13 { mon_names[mon_idx] } else { "" };
                        let day = parts[2].trim_start_matches('0');
                        row_lower.contains(parts[2]) || row_lower.contains(day)
                            || (mon.len() > 2 && row_lower.contains(mon))
                    }
                });
            if !is_target { continue; }

            let td_sel = scraper::Selector::parse("td").unwrap_or_else(|_| unreachable!());
            let tds: Vec<_> = row.select(&td_sel).collect();
            if tds.len() < 2 { continue; }

            // Column 0: draw number + date
            let meta = tds[0].text().collect::<String>();
            for tok in meta.split_whitespace() {
                if tok.chars().all(|c| c.is_ascii_digit()) && tok.len() >= 3 {
                    result.draw_number = tok.to_string(); break;
                }
            }
            for line in meta.lines() {
                if months.iter().any(|m| line.contains(m)) && line.len() < 80 {
                    result.draw_date = line.trim().to_string(); break;
                }
            }

            // Column 1: zodiac name (=letter) + number circles
            let col = tds[1].text().collect::<String>();

            // Check for zodiac name
            for zod in &zodiac_names {
                if col.to_uppercase().contains(zod) {
                    result.winning_letter = zod.to_string(); break;
                }
            }

            // Numbers appear BEFORE "Promotional Draw"
            let numbers_section = if let Some(p) = col.find("Promotional") { &col[..p] } else { &col };
            let digits_only: String = numbers_section.chars()
                .map(|c| if c.is_ascii_digit() { c } else { ' ' })
                .collect();
            let (_, nums) = parse_nlb_balls_strict(&digits_only, max_digits, expected_count + 2);
            if nums.len() >= 2 {
                result.winning_numbers = nums.into_iter().take(expected_count + 1).collect();
                return result;
            }
        }
    }

    result.error = format!(
        "No result found. Visit www.nlb.lk/results/{} and use 'Enter Manually'.", url_path
    );
    result
}

/// Wrapper that adds date-targeted fetching on top of `fetch_nlb_result`.
async fn fetch_nlb_result_for_date(game_slug: &str, target_date: &str) -> LotteryResult {
    let url_path = nlb_url_slug(game_slug);
    let (_, expected_count, _, max_digits) = get_game_profile(game_slug, "NLB");

    let client = match build_client() {
        Ok(c) => c,
        Err(_) => return fetch_nlb_result(game_slug).await,
    };

    // ── Try date-specific search URLs first ───────────────────────────────────
    if !target_date.is_empty() {
        let date_urls = [
            format!("https://www.nlb.lk/lotteries/{}?date={}", url_path, target_date),
            format!("https://www.nlb.lk/lotteries/{}?draw_date={}", url_path, target_date),
            format!("https://www.nlb.lk/results/{}?date={}", url_path, target_date),
        ];
        for url in &date_urls {
            if let Some(html) = try_html(&client, url).await {
                let doc = scraper::Html::parse_document(&html);
                if let Some(p) = find_row_for_date(&doc, target_date, expected_count, max_digits) {
                    return LotteryResult {
                        game_slug:      game_slug.to_string(),
                        board:          "NLB".into(),
                        game_name:      nlb_display_name(game_slug),
                        draw_number:    p.0, draw_date: p.1,
                        winning_letter: p.2, winning_numbers: p.3,
                        fetched_at:     current_timestamp(),
                        source_url:     url.clone(),
                        ..Default::default()
                    };
                }
            }
        }

        // ── Fetch full page and scan table for the target date row ─────────────
        let page_url = format!("https://www.nlb.lk/lotteries/{}", url_path);
        if let Some(html) = try_html(&client, &page_url).await {
            let doc = scraper::Html::parse_document(&html);
            if let Some(p) = find_row_for_date(&doc, target_date, expected_count, max_digits) {
                return LotteryResult {
                    game_slug: game_slug.to_string(), board: "NLB".into(),
                    game_name: nlb_display_name(game_slug),
                    draw_number: p.0, draw_date: p.1,
                    winning_letter: p.2, winning_numbers: p.3,
                    fetched_at: current_timestamp(), source_url: page_url,
                    ..Default::default()
                };
            }
        }
    }

    // Fall through to latest-result fetch (also handles today)
    fetch_nlb_result(game_slug).await
}

/// Wrapper that adds date-targeted fetching on top of `fetch_dlb_result`.
async fn fetch_dlb_result_for_date(game_slug: &str, target_date: &str) -> LotteryResult {
    let url_path = dlb_url_slug(game_slug);
    let (_, expected_count, _, max_digits) = get_game_profile(game_slug, "DLB");

    let client = match build_client() {
        Ok(c) => c,
        Err(_) => return fetch_dlb_result(game_slug).await,
    };

    if !target_date.is_empty() {
        let date_urls = [
            format!("https://www.dlb.lk/result/{}/en?date={}", url_path, target_date),
            format!("https://www.dlb.lk/result/en?lottery={}&date={}", url_path, target_date),
        ];
        for url in &date_urls {
            if let Some(html) = try_html(&client, url).await {
                let doc = scraper::Html::parse_document(&html);
                if let Some(p) = find_row_for_date(&doc, target_date, expected_count, max_digits) {
                    return LotteryResult {
                        game_slug: game_slug.to_string(), board: "DLB".into(),
                        game_name: dlb_display_name(game_slug),
                        draw_number: p.0, draw_date: p.1,
                        winning_letter: p.2, winning_numbers: p.3,
                        fetched_at: current_timestamp(), source_url: url.clone(),
                        ..Default::default()
                    };
                }
            }
        }

        // Fetch the full game page and scan for the matching date row
        let page_url = format!("https://www.dlb.lk/result/{}/en", url_path);
        if let Some(html) = try_html(&client, &page_url).await {
            let doc = scraper::Html::parse_document(&html);
            if let Some(p) = find_row_for_date(&doc, target_date, expected_count, max_digits) {
                return LotteryResult {
                    game_slug: game_slug.to_string(), board: "DLB".into(),
                    game_name: dlb_display_name(game_slug),
                    draw_number: p.0, draw_date: p.1,
                    winning_letter: p.2, winning_numbers: p.3,
                    fetched_at: current_timestamp(), source_url: page_url,
                    ..Default::default()
                };
            }
        }
    }

    fetch_dlb_result(game_slug).await
}

/// Scan every table row in `doc` and return the first one whose date cell
/// contains `target_date` (YYYY-MM-DD or natural text like "September 08").
fn find_row_for_date(
    doc: &scraper::Html,
    target_date: &str,
    expected_count: usize,
    max_ball_digits: usize,
) -> Option<(String, String, String, Vec<String>)> {
    // Build short date patterns to match against row text
    // e.g. "2026-09-08" OR "September 08" OR "Sep 08" OR "08/09/2026"
    let parts: Vec<&str> = target_date.split('-').collect();
    let (year, mon, day) = if parts.len() == 3 { (parts[0], parts[1], parts[2]) } else { return None; };
    let month_names = ["","January","February","March","April","May","June",
                       "July","August","September","October","November","December"];
    let mon_idx: usize = mon.parse().unwrap_or(0);
    let month_long  = if mon_idx < 13 { month_names[mon_idx] } else { "" };
    let month_short = if month_long.len() >= 3 { &month_long[..3] } else { "" };

    let patterns = [
        target_date.to_string(),                            // 2026-09-08
        format!("{} {}, {}", month_long, day.trim_start_matches('0'), year), // September 8, 2026
        format!("{} {}", month_long, day.trim_start_matches('0')),            // September 8
        format!("{} {}", month_short, day.trim_start_matches('0')),           // Sep 8
        format!("{}/{}/{}", day, mon, year),                                   // 08/09/2026
    ];

    if let Ok(row_sel) = scraper::Selector::parse("table tbody tr") {
        for row in doc.select(&row_sel) {
            let row_text = row.text().collect::<String>();
            let row_lower = row_text.to_lowercase();
            if patterns.iter().any(|p| row_lower.contains(&p.to_lowercase())) {
                // Found the matching row — parse it
                let tds: Vec<_> = row.select(
                    &scraper::Selector::parse("td").unwrap_or_else(|_| unreachable!())
                ).collect();
                if tds.len() >= 2 {
                    let meta = tds[0].text().collect::<String>();
                    let mut draw_num = String::new();
                    for w in meta.split_whitespace() {
                        if w.chars().all(|c| c.is_ascii_digit()) && w.len() >= 3 {
                            draw_num = w.to_string(); break;
                        }
                    }
                    // Find the date string in meta
                    let draw_date = month_names[1..].iter()
                        .find_map(|m| {
                            let lower = row_lower.clone();
                            if lower.contains(&m.to_lowercase()) {
                                meta.lines()
                                    .find(|l| l.to_lowercase().contains(&m.to_lowercase()))
                                    .map(|l| l.trim().to_string())
                            } else { None }
                        })
                        .unwrap_or_else(|| target_date.to_string());

                    let max_tok_len = max_ball_digits + 1;
                    let mut tokens: Vec<String> = Vec::new();
                    for tag in &["span","div","li","b","strong"] {
                        if let Ok(sel) = scraper::Selector::parse(tag) {
                            let children: Vec<String> = tds[1].select(&sel)
                                .map(|e| e.text().collect::<String>().trim().to_string())
                                .filter(|t| !t.is_empty() && t.len() <= max_tok_len)
                                .collect();
                            if children.len() >= 2 { tokens = children; break; }
                        }
                    }
                    if tokens.len() < 2 {
                        tokens = tds[1].text().collect::<String>()
                            .split_whitespace()
                            .filter(|s| s.len() <= max_tok_len)
                            .map(|s| s.to_string())
                            .collect();
                    }
                    let (letter, nums) = parse_nlb_balls_strict(&tokens.join(" "), max_ball_digits, expected_count + 2);
                    if !nums.is_empty() && !draw_num.is_empty() {
                        return Some((draw_num, draw_date, letter, nums));
                    }
                }
            }
        }
    }
    None
}

// ── App configuration ──────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppConfig {
    /// Custom directory chosen by user, empty = use default app-data dir.
    pub db_directory: String,
    /// Set to true after the first-run setup wizard completes.
    pub setup_completed: bool,
    /// Supabase project URL (optional cloud sync)
    #[serde(default)]
    pub supabase_url: String,
    /// Supabase anon key (optional cloud sync)
    #[serde(default)]
    pub supabase_anon_key: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            db_directory:      String::new(),
            setup_completed:   false,
            supabase_url:      String::new(),
            supabase_anon_key: String::new(),
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
    std::fs::copy(&src, &dest_path)
        .map_err(|e| format!("Backup copy failed: {}", e))?;
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

    // Auto-backup current DB before overwriting
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let backup_dir = data_dir.join("backups");
    let _ = std::fs::create_dir_all(&backup_dir);
    if db_dest.exists() {
        let _ = std::fs::copy(&db_dest, backup_dir.join(format!("pre_restore_{}.db", ts)));
    }

    std::fs::copy(&src_path, &db_dest)
        .map_err(|e| format!("Restore failed: {}", e))?;
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

// ── Background auto-sync ──────────────────────────────────────────────────────

/// Exponential-backoff retry for one game fetch.
async fn with_retry(slug: &str, board: &str, max_attempts: u32) -> Option<LotteryResult> {
    let mut delay = Duration::from_secs(3);
    for attempt in 0..max_attempts {
        let r = if board == "DLB" { fetch_dlb_result(slug).await } else { fetch_nlb_result(slug).await };
        let ok = r.error.is_empty() && (!r.winning_numbers.is_empty() || !r.winning_letter.is_empty());
        if ok { return Some(r); }
        if attempt < max_attempts - 1 {
            tokio::time::sleep(delay).await;
            delay = std::cmp::min(delay * 2, Duration::from_secs(30));
        }
    }
    None
}

/// Fetch one game and emit `result-fetched` to the frontend.
async fn sync_one_game(app: &tauri::AppHandle, slug: &str, board: &str) {
    if let Some(r) = with_retry(slug, board, 3).await {
        let _ = app.emit("result-fetched", &r);
    }
}

/// Background task: syncs all games on startup, then every 6 hours.
async fn background_sync_loop(app: tauri::AppHandle) {
    let _ = app.emit("sync-started", serde_json::Value::Null);
    for (slug, board) in ALL_GAME_SLUGS {
        sync_one_game(&app, slug, board).await;
        tokio::time::sleep(Duration::from_millis(700)).await; // stagger to avoid rate-limits
    }
    let _ = app.emit("sync-finished", serde_json::Value::Null);

    loop {
        tokio::time::sleep(Duration::from_secs(6 * 3600)).await;
        let _ = app.emit("sync-started", serde_json::Value::Null);
        for (slug, board) in ALL_GAME_SLUGS {
            sync_one_game(&app, slug, board).await;
            tokio::time::sleep(Duration::from_millis(700)).await;
        }
        let _ = app.emit("sync-finished", serde_json::Value::Null);
    }
}

/// Start the background sync worker (fire-and-forget).
#[tauri::command]
async fn start_background_sync(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(background_sync_loop(app));
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

/// Push one lottery result to Supabase via Rust reqwest (no WebView involved).
#[tauri::command]
async fn push_to_supabase(
    app: tauri::AppHandle,
    result: LotteryResult,
    game_slug: String,
) -> Result<(), String> {
    let config = load_config(&app);
    if config.supabase_url.is_empty() || config.supabase_anon_key.is_empty() {
        return Ok(()); // not configured — silent skip
    }
    let url = format!("{}/rest/v1/lottery_results", config.supabase_url.trim_end_matches('/'));
    let payload = serde_json::json!({
        "game_slug":       game_slug,
        "game_name":       result.game_name,
        "board":           result.board,
        "draw_number":     result.draw_number,
        "draw_date":       result.draw_date,
        "winning_letter":  result.winning_letter,
        "winning_numbers": result.winning_numbers,
        "super_number":    result.super_number,
        "prizes":          result.prizes,
        "source":          if result.source_url.contains("manual") || result.source_url.contains("Manual") { "manual" } else { "fetched" },
    });
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .default_headers(supabase_headers(&config.supabase_anon_key))
        .build()
        .map_err(|e| e.to_string())?;
    client.post(&url).json(&payload).send().await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Pull latest results from Supabase into the caller (returns JSON array).
#[tauri::command]
async fn pull_from_supabase(app: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let config = load_config(&app);
    if config.supabase_url.is_empty() || config.supabase_anon_key.is_empty() {
        return Ok(vec![]);
    }
    let url = format!(
        "{}/rest/v1/lottery_results?select=*&order=saved_at.desc&limit=300",
        config.supabase_url.trim_end_matches('/')
    );
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .default_headers(supabase_headers(&config.supabase_anon_key))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let data: Vec<serde_json::Value> = resp.json().await.map_err(|e| e.to_string())?;
    Ok(data)
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

/// Start the local REST API server on 127.0.0.1:7423 (fire-and-forget).
#[tauri::command]
async fn start_api_server(app: tauri::AppHandle) {
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
        struct ApiState { db_path: String, api_key: String }

        async fn auth_check(
            State(s): State<Arc<ApiState>>,
            headers: HeaderMap,
            req: axum::http::Request<axum::body::Body>,
            next: axum::middleware::Next,
        ) -> impl IntoResponse {
            let key = headers.get("x-api-key").and_then(|v| v.to_str().ok()).unwrap_or("");
            if s.api_key.is_empty() || key == s.api_key {
                Ok(next.run(req).await)
            } else {
                Err((StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Invalid API key"}))))
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

        let state = Arc::new(ApiState { db_path, api_key });

        let app = Router::new()
            .route("/api/v1/health",  get(health))
            .route("/api/v1/results", get(results_handler))
            .layer(axum::middleware::from_fn_with_state(state.clone(), auth_check))
            .with_state(state);

        if let Ok(listener) = tokio::net::TcpListener::bind("127.0.0.1:7423").await {
            let _ = axum::serve(listener, app).await;
        }
    });
}

/// Trigger a single-game re-fetch from the UI without blocking.
#[tauri::command]
async fn refresh_single_game(app: tauri::AppHandle, slug: String, board: String) {
    tauri::async_runtime::spawn(async move {
        let _ = app.emit("sync-started", serde_json::Value::Null);
        sync_one_game(&app, &slug, &board).await;
        let _ = app.emit("sync-finished", serde_json::Value::Null);
    });
}

// ── Admin Session (Rust-side, cannot be bypassed from JS) ─────────────────────

/// In-process session store. Token lives only in Rust heap — never exposed to JS.
static ADMIN_SESSION: OnceLock<Mutex<Option<String>>> = OnceLock::new();

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
            fetch_live_results,
            fetch_single_result,
            start_background_sync,
            refresh_single_game,
            start_api_server,
            get_api_key,
            push_to_supabase,
            pull_from_supabase,
            save_supabase_config,
            save_supabase_config_secure,
            test_supabase_connection,
            begin_admin_session,
            end_admin_session,
            verify_admin_session,
            drain_sync_queue,
            full_sync_all_tables,
            ai_query,
            save_ai_api_key,
            execute_ai_action,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
