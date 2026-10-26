# Deferred Risks and Known Gaps — Phase 1

## AP-04: Sync Queue Stale-Write Risk (NOT IMPLEMENTED — DEFERRED TO PHASE 2)

### Stale upsert overwriting current cloud state (Scenario QS-04)

**Sequence:**
1. Invoice updated → queue entry #100: `{op:'upsert', payload:{id:5, outstanding_balance:200}}`
2. Invoice updated again → queue entry #101: `{op:'upsert', payload:{id:5, outstanding_balance:300}}`
3. Drain: #100 FAILS (network error), #101 SUCCEEDS → cloud has balance=300
4. Next drain: #100 is retried → sends stale payload balance=200 → **cloud reverts to 200**

**Impact:** Cloud replica shows wrong outstanding balance. SQLite is unaffected (correct at 300).

**Mitigation not yet implemented:** The `superseded` column and `record_id` population fix (AP-04).

**Why Phase 1 is still safe:** Cloud is a backup replica only. No business operation reads from it. SQLite remains authoritative.

---

### Deleted-record resurrection (Scenario QS-06)

**Sequence:**
1. Invoice created → queue #100: `{op:'upsert', id:5}`
2. Invoice deleted → queue #101: `{op:'delete', id:5}`
3. Drain: #100 FAILS, #101 SUCCEEDS → cloud has no record id:5
4. Next drain: #100 retried → cloud creates ghost record id:5

**Impact:** Cloud contains a record that no longer exists in SQLite. Affects only `invoices` (the only table with delete sync).

**Mitigation not yet implemented:** Supersede-on-success logic (AP-04).

---

## AP-02: invoice_items Ongoing Sync (NOT IMPLEMENTED — DEFERRED)

**What is missing:** After the initial Full Sync snapshot, any invoice created or edited after migration will have no corresponding or stale `invoice_items` rows in PostgreSQL.

**Cloud data that will be wrong:**
- Line item details (ticket names, barcodes, quantities) for post-migration invoices
- `purchase_batch_id` references on items for edited invoices
- Per-ticket discount and net_value amounts

**What remains correct in cloud:**
- `invoice_total`, `outstanding_balance`, `invoice_status` (these are on the invoices row, which IS synced)
- Agent information, batch quantities, payment amounts

**When AP-02 matters:** Only when mobile app needs per-ticket invoice details, or when cloud-side reporting queries item-level data. Neither use case is implemented in Phase 1.

---

## PostgreSQL FK Behavior (AP-03 — Option A Implemented, Not Yet Signed Off)

No `ON DELETE` or `REFERENCES` constraints exist in the PostgreSQL schema. Cloud tables accumulate rows for locally-deleted records (agents, batches, payments, returns). This matches SQLite's permissive FK behavior and prevents sync failures from FK violations. See AP-03 for formal sign-off.

---

## JWT Signing Secret Persistence (AP-07 — Pending Decision)

JWT_SECRET is read from environment variable at startup. If the env var changes or the process restarts with a different value, all active JWTs become invalid. Desktop clients must re-authenticate. This is the current behavior. See AP-07 for persistence strategy decision.
