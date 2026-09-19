"""
Ajith Rohana Enterprise — Lottery Manager MCP Server
=====================================================
Uses srilanka-lottery (PyPI) as the primary scraper.

Run locally:
  cd mcp && pip install -r requirements.txt
  python server.py

Connect in Claude Desktop (claude_desktop_config.json):
  {
    "mcpServers": {
      "lottery-manager": {
        "command": "python",
        "args": ["/path/to/mcp/server.py"]
      }
    }
  }

Or run as HTTP server (multi-client):
  python server.py --http --port 8765
"""

import os, sys, re, json, requests
from datetime import datetime
from fastmcp import FastMCP
from dotenv import load_dotenv

try:
    from srilanka_lottery import (
        scrape_nlb_active_lottery_names,
        scrape_nlb_latest_results,
        scrape_nlb_result,
        scrape_dlb_latest_results,
        scrape_dlb_result,
    )
    _HAS_LIB = True
except ImportError:
    _HAS_LIB = False

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

SUPABASE_URL     = os.getenv("VITE_SUPABASE_URL", "")
SUPABASE_API_KEY = os.getenv("VITE_SUPABASE_ANON_KEY", "")

mcp = FastMCP(
    name="Ajith Rohana Lottery Manager",
    version="2.0.0",
    instructions=(
        "Provides live NLB and DLB Sri Lanka lottery results using the srilanka-lottery library. "
        "Use get_nlb_games or get_dlb_games to see available lotteries, "
        "then fetch results by draw number, date, or get the latest results."
    ),
)

# ── Helpers ───────────────────────────────────────────────────────────────────

ZODIACS = {
    "ARIES","TAURUS","GEMINI","CANCER","LEO","VIRGO",
    "LIBRA","SCORPIO","SAGITTARIUS","CAPRICORN","AQUARIUS","PISCES",
}

DLB_SLUG_TO_NAME = {
    "ada-kotipathi": "Ada Kotipathi",
    "jaya-sampatha": "Jaya Sampatha",
    "kapruka": "Kapruka",
    "lagna-wasana": "Lagna Wasana",
    "sasiri": "Sasiri",
    "shanida": "Shanida",
    "super-ball": "Super Ball",
    "supiri-dhana-sampatha": "Supiri Dhana Sampatha",
    "waasi": "Waasi",
}

def supabase_headers():
    return {
        "apikey": SUPABASE_API_KEY,
        "Authorization": f"Bearer {SUPABASE_API_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }

def save_to_supabase(game_slug: str, game_name: str, board: str, result: dict):
    if not SUPABASE_URL or not SUPABASE_API_KEY:
        return
    payload = {
        "game_slug":       game_slug,
        "game_name":       game_name,
        "board":           board,
        "draw_number":     result.get("draw_number", ""),
        "draw_date":       result.get("draw_date", ""),
        "winning_letter":  result.get("winning_letter", ""),
        "winning_numbers": result.get("winning_numbers", []),
        "super_number":    "",
        "source":          "mcp-server",
    }
    try:
        requests.post(
            f"{SUPABASE_URL}/rest/v1/lottery_results",
            headers=supabase_headers(),
            json=payload,
            timeout=10,
        )
    except Exception:
        pass

def parse_nlb_date(date_str: str) -> str:
    if not date_str:
        return ""
    for fmt in ("%A %B %d, %Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return date_str

def parse_dlb_date(date_str: str) -> str:
    if not date_str:
        return ""
    try:
        return datetime.strptime(date_str.split()[0], "%Y-%b-%d").strftime("%Y-%m-%d")
    except Exception:
        return date_str

def split_letter_numbers(numbers: list) -> tuple:
    letter, balls = "", []
    for n in numbers:
        s = str(n).strip()
        if s.upper() in ZODIACS:
            letter = s.upper()
        elif re.match(r"^\d+$", s):
            balls.append(s)
    return letter, balls

# ── NLB TOOLS ─────────────────────────────────────────────────────────────────

NLB_GAMES = [
    "ada-sampatha", "govisetha", "mega-power", "nlb-jaya",
    "handahana", "mahajana-sampatha", "dhana-nidhanaya", "suba-dawasak",
]

@mcp.tool(description="List all available NLB (National Lotteries Board) game slugs.")
def get_nlb_games() -> dict:
    return {
        "board": "NLB",
        "url": "https://www.nlb.lk/results/{slug}",
        "games": NLB_GAMES,
        "tip": "Use these slugs in get_nlb_latest, get_nlb_by_date, get_nlb_by_draw.",
        "library_available": _HAS_LIB,
    }

@mcp.tool(
    description=(
        "Fetch the latest NLB lottery results. "
        "game_slug: e.g. 'mega-power', 'govisetha', 'suba-dawasak'. "
        "limit: number of results (1-20, default 3)."
    )
)
def get_nlb_latest(game_slug: str, limit: int = 3) -> dict:
    if not _HAS_LIB:
        return {"error": "srilanka-lottery not installed. Run: pip install srilanka-lottery"}
    if not 1 <= limit <= 20:
        return {"error": "limit must be between 1 and 20"}

    try:
        _, session = scrape_nlb_active_lottery_names()
        raw = scrape_nlb_latest_results(session, game_slug, limit=limit)
        entries = raw.get("NLB_Results", [])
        if not entries:
            return {"error": f"No results for '{game_slug}'. Check the slug."}

        results = []
        for r in entries:
            letter, balls = split_letter_numbers(r.get("numbers", []))
            letter = r.get("letter", "") or letter
            entry = {
                "draw_number":    r.get("draw", ""),
                "draw_date":      parse_nlb_date(r.get("date", "")),
                "winning_letter": letter,
                "winning_numbers": balls,
            }
            results.append(entry)
            save_to_supabase(game_slug, game_slug.replace("-", " ").title(), "NLB", entry)

        return {
            "board": "NLB", "game": game_slug,
            "source": f"https://www.nlb.lk/results/{game_slug}",
            "fetched": datetime.utcnow().isoformat() + "Z",
            "results": results,
        }
    except Exception as e:
        return {"error": str(e)}

@mcp.tool(
    description=(
        "Fetch NLB result for a specific draw number. "
        "game_slug: e.g. 'mega-power'. draw_number: e.g. '2648' or 2648."
    )
)
def get_nlb_by_draw(game_slug: str, draw_number: str) -> dict:
    if not _HAS_LIB:
        return {"error": "srilanka-lottery not installed."}
    try:
        raw = scrape_nlb_result(game_slug, str(draw_number))
        letter_raw = raw.get("letter", "")
        letter, balls = split_letter_numbers(raw.get("numbers", []))
        letter = letter_raw or letter
        if not balls:
            return {"error": f"Draw {draw_number} not found for {game_slug}."}
        entry = {
            "board": "NLB", "game": game_slug,
            "draw_number": str(draw_number),
            "draw_date": parse_nlb_date(raw.get("date", "")),
            "winning_letter": letter,
            "winning_numbers": balls,
        }
        save_to_supabase(game_slug, game_slug.replace("-", " ").title(), "NLB", entry)
        return entry
    except Exception as e:
        return {"error": str(e)}

@mcp.tool(
    description=(
        "Fetch NLB result for a specific date (YYYY-MM-DD). "
        "game_slug: e.g. 'govisetha'. date: '2026-09-06'."
    )
)
def get_nlb_by_date(game_slug: str, date: str) -> dict:
    if not re.match(r"\d{4}-\d{2}-\d{2}", date):
        return {"error": "Date must be YYYY-MM-DD."}

    # Check Supabase cache first
    if SUPABASE_URL:
        try:
            r = requests.get(
                f"{SUPABASE_URL}/rest/v1/lottery_results"
                f"?game_slug=eq.{game_slug}&draw_date=eq.{date}&select=*&limit=1",
                headers=supabase_headers(), timeout=8,
            )
            rows = r.json()
            if rows:
                row = rows[0]
                return {"source": "supabase-cache", "game": game_slug, "draw_date": date,
                        "draw_number": row.get("draw_number", ""),
                        "winning_letter": row.get("winning_letter", ""),
                        "winning_numbers": row.get("winning_numbers", [])}
        except Exception:
            pass

    if not _HAS_LIB:
        return {"error": "srilanka-lottery not installed."}

    try:
        raw = scrape_nlb_result(game_slug, date)
        letter_raw = raw.get("letter", "")
        letter, balls = split_letter_numbers(raw.get("numbers", []))
        letter = letter_raw or letter
        if not balls:
            return {"error": f"No result found for {game_slug} on {date}."}
        entry = {
            "board": "NLB", "game": game_slug,
            "draw_number": raw.get("draw_number", ""),
            "draw_date": date,
            "winning_letter": letter,
            "winning_numbers": balls,
        }
        save_to_supabase(game_slug, game_slug.replace("-", " ").title(), "NLB", entry)
        return entry
    except Exception as e:
        return {"error": str(e)}

# ── DLB TOOLS ─────────────────────────────────────────────────────────────────

DLB_GAMES = [
    "sasiri", "lagna-wasana", "shanida", "ada-kotipathi",
    "supiri-dhana-sampatha", "super-ball", "kapruka", "jaya-sampatha",
]

@mcp.tool(description="List all available DLB (Development Lotteries Board) game slugs.")
def get_dlb_games() -> dict:
    return {
        "board": "DLB",
        "url": "https://www.dlb.lk/result/{slug}/en",
        "games": DLB_GAMES,
        "tip": "Use these slugs in get_dlb_latest, get_dlb_by_draw.",
        "library_available": _HAS_LIB,
    }

@mcp.tool(
    description=(
        "Fetch the latest DLB lottery results. "
        "game_slug: e.g. 'ada-kotipathi', 'kapruka'. limit: 1-10 (default 3)."
    )
)
def get_dlb_latest(game_slug: str, limit: int = 3) -> dict:
    if not _HAS_LIB:
        return {"error": "srilanka-lottery not installed."}
    display_name = DLB_SLUG_TO_NAME.get(game_slug, game_slug)
    try:
        raw = scrape_dlb_latest_results(display_name, limit=limit)
        entries = raw.get("DLB_Results", [])
        if not entries:
            return {"error": f"No DLB results for '{game_slug}'."}

        results = []
        for r in entries:
            _, balls = split_letter_numbers(r.get("numbers", []))
            entry = {
                "draw_number":    r.get("draw", ""),
                "draw_date":      parse_dlb_date(r.get("date", "")),
                "winning_letter": r.get("letter", ""),
                "winning_numbers": balls,
            }
            results.append(entry)
            save_to_supabase(game_slug, display_name, "DLB", entry)

        return {
            "board": "DLB", "game": game_slug,
            "fetched": datetime.utcnow().isoformat() + "Z",
            "results": results,
        }
    except Exception as e:
        return {"error": str(e)}

@mcp.tool(
    description="Fetch DLB result for a specific draw number. game_slug: e.g. 'ada-kotipathi'. draw_number: e.g. '3106'."
)
def get_dlb_by_draw(game_slug: str, draw_number: str) -> dict:
    if not _HAS_LIB:
        return {"error": "srilanka-lottery not installed."}
    display_name = DLB_SLUG_TO_NAME.get(game_slug, game_slug)
    try:
        raw = scrape_dlb_result(display_name, str(draw_number))
        _, balls = split_letter_numbers(raw.get("numbers", []))
        if not balls:
            return {"error": f"Draw {draw_number} not found for {game_slug}."}
        date_info = raw.get("date_info", "")
        date_match = re.search(r"\d{4}-\w{3}-\d{2}", date_info)
        date_out = parse_dlb_date(date_match.group()) if date_match else ""
        entry = {
            "board": "DLB", "game": game_slug,
            "draw_number": str(draw_number),
            "draw_date": date_out,
            "winning_letter": raw.get("letter", ""),
            "winning_numbers": balls,
        }
        save_to_supabase(game_slug, display_name, "DLB", entry)
        return entry
    except Exception as e:
        return {"error": str(e)}

# ── SUPABASE QUERY TOOL ───────────────────────────────────────────────────────

@mcp.tool(
    description=(
        "Query saved lottery results from Supabase cloud database. "
        "board: 'NLB' or 'DLB'. game_slug: e.g. 'mega-power'. "
        "date: optional YYYY-MM-DD filter."
    )
)
def query_saved_results(board: str, game_slug: str, date: str = "") -> dict:
    if not SUPABASE_URL:
        return {"error": "Supabase not configured. Check .env file."}
    params = f"?board=eq.{board}&game_slug=eq.{game_slug}&order=draw_date.desc&limit=10"
    if date:
        params += f"&draw_date=eq.{date}"
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/lottery_results{params}",
            headers=supabase_headers(), timeout=8,
        )
        rows = r.json()
        return {"source": "supabase", "count": len(rows), "results": rows}
    except Exception as e:
        return {"error": f"Supabase query failed: {e}"}

# ── RESOURCES ─────────────────────────────────────────────────────────────────

@mcp.resource("lottery://nlb/games", name="NLB Game List", description="All NLB lottery slugs and draw schedules")
def nlb_games_resource() -> str:
    return """
# NLB (National Lotteries Board) — Available Lotteries

URL: https://www.nlb.lk/results/{slug}

| Slug                | Name                  | Format                      |
|---------------------|-----------------------|-----------------------------|
| suba-dawasak        | Suba Dawasak          | Zodiac + 3 main + promo     |
| govisetha           | Govisetha             | Letter + 4 two-digit balls  |
| mahajana-sampatha   | Mahajana Sampatha     | Letter + 6 single digits    |
| dhana-nidhanaya     | Dhana Nidhanaya       | Letter + 4 two-digit balls  |
| mega-power          | Mega Power            | Letter + 5 two-digit balls  |
| lucky-7             | Lucky 7               | Letter + 6 digit-circles    |
| handahana           | Handahana             | Letter + 4 two-digit balls  |
| ada-sampatha        | Ada Sampatha          | Letter + 6 digit-circles    |
| nlb-jaya            | NLB Jaya              | Letter + 4 digit-circles    |
"""

@mcp.resource("lottery://dlb/games", name="DLB Game List", description="All DLB lottery slugs")
def dlb_games_resource() -> str:
    return """
# DLB (Development Lotteries Board) — Available Lotteries

| Slug                         | Display Name          |
|------------------------------|-----------------------|
| ada-kotipathi                | Ada Kotipathi         |
| jaya-sampatha                | Jaya Sampatha         |
| kapruka                      | Kapruka               |
| lagna-wasana                 | Lagna Wasana          |
| sasiri                       | Sasiri                |
| shanida                      | Shanida               |
| super-ball                   | Super Ball            |
| supiri-dhana-sampatha        | Supiri Dhana Sampatha |
| waasi                        | Waasi                 |
"""

# ── PROMPTS ───────────────────────────────────────────────────────────────────

@mcp.prompt(name="check-result", description="Guide for checking a specific lottery result")
def check_result_prompt() -> str:
    return """
I want to check a Sri Lanka lottery result.

**Step 1:** Choose board
- NLB (National Lotteries Board) — call get_nlb_games()
- DLB (Development Lotteries Board) — call get_dlb_games()

**Step 2:** Choose game slug (e.g. 'mega-power', 'ada-kotipathi')

**Step 3:** Choose query type
- Latest: get_nlb_latest(game_slug, limit=1)
- By draw: get_nlb_by_draw(game_slug, draw_number)
- By date: get_nlb_by_date(game_slug, "YYYY-MM-DD")
"""

@mcp.prompt(name="sync-all-results", description="Fetch and cache latest results for all games")
def sync_all_prompt() -> str:
    return """
Refresh all lottery results:
1. Call get_nlb_latest for each NLB game (limit=1)
2. Call get_dlb_latest for each DLB game (limit=1)
3. Each call auto-saves to Supabase
4. Report: games updated, any errors
"""

# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Lottery Manager MCP Server")
    parser.add_argument("--http", action="store_true", help="Run as HTTP server")
    parser.add_argument("--port", type=int, default=8765, help="HTTP port")
    parser.add_argument("--host", default="127.0.0.1", help="HTTP host")
    args = parser.parse_args()

    if not _HAS_LIB:
        print("WARNING: srilanka-lottery not installed. Run: pip install srilanka-lottery", file=sys.stderr)

    if args.http:
        print(f"MCP Server running at http://{args.host}:{args.port}")
        mcp.run(transport="streamable-http", host=args.host, port=args.port)
    else:
        mcp.run()
