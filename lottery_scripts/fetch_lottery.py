#!/usr/bin/env python3
"""
Lottery result fetcher using srilanka-lottery library.
Called by Rust backend via subprocess. Outputs JSON to stdout.

Usage:
  python3 fetch_lottery.py --board nlb --game mega-power [--draw 2654] [--date 2026-09-10]
  python3 fetch_lottery.py --board dlb --game "Ada Kotipathi" [--draw 3106]
"""

import sys
import json
import argparse
import re
from datetime import datetime

try:
    from srilanka_lottery import (
        scrape_nlb_active_lottery_names,
        scrape_nlb_latest_results,
        scrape_nlb_result,
        scrape_dlb_latest_results,
        scrape_dlb_result,
    )
except ImportError:
    print(json.dumps({"error": "srilanka-lottery not installed. Run: pip install srilanka-lottery"}))
    sys.exit(1)

# NLB slug → display name for DLB slug mapping
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

ZODIACS = {
    "ARIES","TAURUS","GEMINI","CANCER","LEO","VIRGO",
    "LIBRA","SCORPIO","SAGITTARIUS","CAPRICORN","AQUARIUS","PISCES"
}


def parse_nlb_date(date_str: str) -> str:
    """Convert 'Thursday September 10, 2026' → '2026-09-10'"""
    if not date_str:
        return ""
    try:
        # Try full weekday format
        dt = datetime.strptime(date_str, "%A %B %d, %Y")
        return dt.strftime("%Y-%m-%d")
    except ValueError:
        pass
    try:
        # Try ISO format passthrough
        datetime.strptime(date_str, "%Y-%m-%d")
        return date_str
    except ValueError:
        pass
    return date_str


def parse_dlb_date(date_str: str) -> str:
    """Convert '2026-Sep-10 Thursday' → '2026-09-10'"""
    if not date_str:
        return ""
    try:
        part = date_str.split()[0]  # "2026-Sep-10"
        dt = datetime.strptime(part, "%Y-%b-%d")
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return date_str


def extract_letter_and_numbers(numbers: list) -> tuple:
    """Split zodiac/letter from numeric balls."""
    letter = ""
    balls = []
    for n in numbers:
        s = str(n).strip()
        if s.upper() in ZODIACS:
            letter = s.upper()
        elif re.match(r"^\d+$", s):
            balls.append(s)
    return letter, balls


def _nlb_fetch_latest(game_slug: str) -> dict:
    """Fetch the latest available NLB result regardless of date."""
    _, session = scrape_nlb_active_lottery_names()
    raw = scrape_nlb_latest_results(session, game_slug, limit=1)
    results = raw.get("NLB_Results", [])
    if not results:
        return {"game_slug": game_slug, "board": "NLB", "error": f"No results for {game_slug}"}
    r = results[0]
    letter_extracted, balls = extract_letter_and_numbers(r.get("numbers", []))
    letter = r.get("letter", "") or letter_extracted
    return {
        "game_slug": game_slug,
        "board": "NLB",
        "draw_number": r.get("draw", ""),
        "draw_date": parse_nlb_date(r.get("date", "")),
        "winning_numbers": balls,
        "winning_letter": letter,
        "error": None,
    }


def fetch_nlb(game_slug: str, draw_number: str, date: str) -> dict:
    if draw_number or date:
        query = draw_number if draw_number else date
        raw = scrape_nlb_result(game_slug, query)
        letter_raw = raw.get("letter", "")
        numbers_raw = raw.get("numbers", [])
        letter_extracted, balls = extract_letter_and_numbers(numbers_raw)
        letter = letter_raw or letter_extracted
        draw = raw.get("draw_number", draw_number) or draw_number
        date_out = parse_nlb_date(raw.get("date", "")) or date
        # If date-specific fetch returned nothing (result not published yet), fall back to latest
        if not balls and date and not draw_number:
            return _nlb_fetch_latest(game_slug)
        return {
            "game_slug": game_slug,
            "board": "NLB",
            "draw_number": draw,
            "draw_date": date_out,
            "winning_numbers": balls,
            "winning_letter": letter,
            "error": None if balls else "No results found for that draw/date",
        }
    else:
        return _nlb_fetch_latest(game_slug)


def fetch_dlb(game_slug: str, draw_number: str, date: str) -> dict:
    # Strip "dlb-" prefix if present (frontend uses "dlb-ada-kotipathi" format)
    slug_key = game_slug.removeprefix("dlb-")
    display_name = DLB_SLUG_TO_NAME.get(slug_key, slug_key.replace("-", " ").title())

    def _fetch_latest_dlb() -> dict:
        raw = scrape_dlb_latest_results(display_name, limit=1)
        results = raw.get("DLB_Results", [])
        if not results:
            return {"game_slug": game_slug, "board": "DLB", "error": f"No DLB results for {display_name}"}
        r = results[0]
        _, balls = extract_letter_and_numbers(r.get("numbers", []))
        return {
            "game_slug": game_slug,
            "board": "DLB",
            "draw_number": r.get("draw", ""),
            "draw_date": parse_dlb_date(r.get("date", "")),
            "winning_numbers": balls,
            "winning_letter": r.get("letter", ""),
            "error": None,
        }

    if draw_number or date:
        query = draw_number if draw_number else date
        try:
            raw = scrape_dlb_result(display_name, query)
        except Exception:
            return _fetch_latest_dlb()
        letter = raw.get("letter", "")
        numbers_raw = raw.get("numbers", [])
        _, balls = extract_letter_and_numbers(numbers_raw)
        date_info = raw.get("date_info", "")
        date_match = re.search(r"\d{4}-\w{3}-\d{2}", date_info)
        date_out = parse_dlb_date(date_match.group()) if date_match else ""
        draw_match = re.search(r"\d+", date_info) if date_info else None
        draw = draw_match.group() if draw_match else draw_number
        # If date-specific fetch returned nothing, fall back to latest
        if not balls and date and not draw_number:
            return _fetch_latest_dlb()
        return {
            "game_slug": game_slug,
            "board": "DLB",
            "draw_number": draw,
            "draw_date": date_out or date,
            "winning_numbers": balls,
            "winning_letter": letter,
            "error": None if balls else "No results found",
        }
    else:
        return _fetch_latest_dlb()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--board", default="nlb", choices=["nlb", "NLB", "dlb", "DLB"])
    parser.add_argument("--game", required=True)
    parser.add_argument("--draw", default="")
    parser.add_argument("--date", default="")
    args = parser.parse_args()

    board = args.board.upper()
    try:
        if board == "NLB":
            result = fetch_nlb(args.game, args.draw, args.date)
        else:
            result = fetch_dlb(args.game, args.draw, args.date)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"game_slug": args.game, "board": board, "error": str(e)}))


if __name__ == "__main__":
    main()
