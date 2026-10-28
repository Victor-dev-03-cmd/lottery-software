-- Run this against the LOCAL ajith_rohana.db AFTER you have:
--   1. Configured API Server URL + Device Key in Settings
--   2. Run a Full Sync successfully from the TopBar
--
-- It resets the retry counter so the 48 stuck items are retried.
-- These items are partial invoice-status updates; they will succeed on the
-- Go API once the full invoice row exists in PostgreSQL from the Full Sync.
--
-- Run with: python3 reset_queue.py
-- (or use any SQLite browser to run this SQL directly)

UPDATE sync_queue
SET retry_count = 0, last_error = ''
WHERE retry_count >= 3;
