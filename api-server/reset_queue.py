"""
Reset stuck sync_queue items so they are retried against the Go API.

Run AFTER:
  1. Go API is deployed and responding
  2. API Server URL and Device Key are saved in Settings
  3. A Full Sync has completed successfully from the TopBar

Usage:  python3 reset_queue.py
"""
import sqlite3, os, sys

DB_PATH = os.path.expanduser(
    "~/.local/share/com.ajithrohana.lotterymanager/ajith_rohana.db"
)

if not os.path.exists(DB_PATH):
    sys.exit(f"Database not found at {DB_PATH}")

conn = sqlite3.connect(DB_PATH)
stuck = conn.execute("SELECT COUNT(*) FROM sync_queue WHERE retry_count >= 3").fetchone()[0]
print(f"Found {stuck} stuck items (retry_count >= 3)")

if stuck == 0:
    print("Nothing to reset.")
    conn.close()
    sys.exit(0)

ans = input(f"Reset retry_count to 0 for {stuck} items? [y/N] ").strip().lower()
if ans != "y":
    print("Cancelled.")
    conn.close()
    sys.exit(0)

conn.execute("UPDATE sync_queue SET retry_count = 0, last_error = '' WHERE retry_count >= 3")
conn.commit()
print(f"Done. {stuck} items will be retried on the next background sync (within 60 seconds).")
conn.close()
