# Backup and Restore Guide — Ajith Rohana Enterprise

## Important: Two separate backup systems

| Database | Purpose | Authoritative? | Backup method |
|----------|---------|---------------|---------------|
| **SQLite** (desktop) | All live business data | **YES** | Closed-application file copy |
| **PostgreSQL** (cloud) | Asynchronous replica | No | pg_dump |

**Never assume PostgreSQL is a substitute for the SQLite backup.**
PostgreSQL is a replica that may lag or have incomplete data.

---

## SQLite Backup Procedure

### Prerequisites

- The desktop application must be **fully closed** before backup.
- The database file is at:
  - **Windows:** `%APPDATA%\com.ajithrohana.lotterymanager\ajith_rohana.db`
  - **Linux:** `~/.local/share/com.ajithrohana.lotterymanager/ajith_rohana.db`

### Step-by-step

```bash
# 1. Close the application completely
# 2. Locate the database (Windows example):
DB="$APPDATA\com.ajithrohana.lotterymanager\ajith_rohana.db"

# 3. Create a timestamped backup in a DIFFERENT directory
BACKUP_DIR="$HOME/lottery_backups"
mkdir -p "$BACKUP_DIR"
BACKUP="$BACKUP_DIR/ajith_rohana_$(date +%Y%m%d_%H%M%S).db"
cp "$DB" "$BACKUP"

# 4. Verify backup integrity
sqlite3 "$BACKUP" "PRAGMA integrity_check;"
# Required output: ok

# 5. Record row counts
sqlite3 "$BACKUP" "
  SELECT 'agents', COUNT(*) FROM agents UNION ALL
  SELECT 'invoices', COUNT(*) FROM invoices UNION ALL
  SELECT 'inventory_batches', COUNT(*) FROM inventory_batches UNION ALL
  SELECT 'payments', COUNT(*) FROM payments;
" > "$BACKUP_DIR/row_counts_$(date +%Y%m%d).txt"
```

### Backup storage requirements

- Store backups **outside the application data directory**.
- Recommended: a different drive or a cloud storage folder (Dropbox, Google Drive).
- Keep at minimum: 7 daily backups.
- Label files with dates: `ajith_rohana_20261026_143022.db`

### Recommended schedule

| Frequency | Trigger | Retention |
|-----------|---------|-----------|
| Daily | End of business day | 7 days |
| Weekly | Friday end of day | 4 weeks |
| Monthly | Last day of month | 6 months |
| Before any migration or upgrade | Manual | Permanent |

---

## SQLite Restore Procedure

**NEVER overwrite the active database without confirmation.**

```bash
# 1. Close the application completely
# 2. Rename the current database (do not delete — you may need it)
mv "$DB" "${DB}.before_restore_$(date +%Y%m%d)"

# 3. Copy the backup into place
cp "$BACKUP_DIR/ajith_rohana_YYYYMMDD_HHMMSS.db" "$DB"

# 4. Verify the restored file
sqlite3 "$DB" "PRAGMA integrity_check;"
# Required: ok

# 5. Start the application and verify data appears correctly
```

If the restore produces unexpected data, restore from a different backup or
revert to the renamed `.before_restore_` file.

---

## PostgreSQL Backup Procedure

PostgreSQL holds a cloud replica of data synced from SQLite.
It is NOT the authoritative database. Restoring PostgreSQL alone
does not restore your business data — always restore SQLite first.

```bash
# Dump (run from the database host or a machine with pg_dump access)
pg_dump \
  --host=DB_HOST \
  --port=5432 \
  --username=lottery_readonly \
  --format=custom \
  --no-password \
  --file=/backups/lotterydb_$(date +%Y%m%d).dump \
  lotterydb

# Verify
pg_restore --list /backups/lotterydb_YYYYMMDD.dump | head -20

# Restore (to a test instance — never overwrite production without confirmation)
createdb lotterydb_restore
pg_restore \
  --host=HOST \
  --username=lottery_admin \
  --dbname=lotterydb_restore \
  /backups/lotterydb_YYYYMMDD.dump
```

---

## Error conditions and handling

| Error | Action |
|-------|--------|
| `PRAGMA integrity_check` returns anything other than `ok` | Do not use this backup. Try an earlier backup. |
| Backup file is 0 bytes | The application may not have been fully closed. Try again. |
| Restore produces wrong row counts | Compare with `row_counts_YYYYMMDD.txt`. Restore from a different date. |
| Disk full during backup | Free space before proceeding. Do not leave a partial backup. |
| Application will not open after restore | Restore the `.before_restore_` file. |

---

## What is NOT backed up by SQLite backup

- PostgreSQL-only tables (devices, app_config, sync_log, revoked_tokens)
- These are infrastructure only and can be recreated by re-registering the device.

## What is NOT backed up by PostgreSQL backup

- `workers`, `worker_salaries`, `supplier_returns`, `petty_cash_*`,
  `app_settings`, `company_settings` — these are not in the sync queue
  and may not be in PostgreSQL. Always treat SQLite as authoritative.
