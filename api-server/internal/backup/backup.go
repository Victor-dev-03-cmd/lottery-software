// Package backup provides PostgreSQL backup documentation and tooling.
// SQLite backups are handled by the Tauri desktop application (see Rust commands).
// This file documents the recommended PostgreSQL backup procedure.
package backup

// PostgreSQL Backup Procedure (documented here, not automated in Phase 1)
//
// SCHEDULE:
//   Daily: pg_dump at a low-traffic time (e.g. 02:00 local)
//   Retention: keep 7 daily + 4 weekly backups
//
// COMMAND (run on the PostgreSQL host or from a machine with network access):
//   pg_dump \
//     --host=DB_HOST \
//     --port=5432 \
//     --username=lottery_readonly \
//     --format=custom \
//     --no-password \
//     --file=/backups/lotterydb_$(date +%Y%m%d_%H%M%S).dump \
//     lotterydb
//
// VERIFY:
//   pg_restore --list /backups/lotterydb_TIMESTAMP.dump | head -20
//
// RESTORE (to a separate test instance — never overwrite production without confirmation):
//   createdb lotterydb_restore
//   pg_restore --host=HOST --username=lottery_admin --dbname=lotterydb_restore \
//     /backups/lotterydb_TIMESTAMP.dump
//
// NOTE: PostgreSQL backups do NOT replace SQLite backups.
// SQLite is the authoritative database. Always back up SQLite separately.
// The closed-application SQLite backup procedure is documented in BACKUP.md.
