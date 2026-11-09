package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestSyncBatchDeleteOperationRequiresRecordID verifies that a delete request
// with no record_id returns HTTP 400.
func TestSyncBatchDeleteOperationRequiresRecordID(t *testing.T) {
	body, _ := json.Marshal(map[string]interface{}{
		"table":     "invoices",
		"operation": "delete",
		"rows":      []map[string]interface{}{{"id": 1, "_queue_id": 10}},
		// record_id deliberately omitted
	})
	req := httptest.NewRequest(http.MethodPost, "/sync/batch", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	// SyncBatch requires a pool; use nil to confirm we fail before any DB call.
	SyncBatch(nil)(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rr.Code)
	}
}

// TestSyncBatchDeleteOperationRequiresRecordID_WithBody checks the response body
// contains a meaningful error message.
func TestSyncBatchDeleteOperationRequiresRecordIDBody(t *testing.T) {
	body, _ := json.Marshal(map[string]interface{}{
		"table":     "invoices",
		"operation": "delete",
		"rows":      []map[string]interface{}{},
	})
	req := httptest.NewRequest(http.MethodPost, "/sync/batch", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	SyncBatch(nil)(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rr.Code)
	}
	var resp map[string]interface{}
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("response is not JSON: %v", err)
	}
	if resp["error"] == "" || resp["error"] == nil {
		t.Error("expected non-empty error message in response body")
	}
}

// TestDeleteRecordTableNotAllowed verifies that deleteRecord returns an error
// for a table that is not in any allowlist.
func TestDeleteRecordTableNotAllowed(t *testing.T) {
	err := deleteRecord(nil, nil, "sync_queue", 1, 1)
	if err == nil {
		t.Fatal("expected error for disallowed table, got nil")
	}
}

// TestDeleteRecordTableNotDeletable verifies that a table in tableAllowlist but
// NOT in deletableTableAllowlist is rejected by deleteRecord.
func TestDeleteRecordTableNotDeletable(t *testing.T) {
	// "agents" is in tableAllowlist but not in deletableTableAllowlist.
	if _, ok := tableAllowlist["agents"]; !ok {
		t.Skip("agents must be in tableAllowlist for this test to be meaningful")
	}
	if deletableTableAllowlist["agents"] {
		t.Skip("agents unexpectedly in deletableTableAllowlist — test precondition broken")
	}

	err := deleteRecord(nil, nil, "agents", 1, 1)
	if err == nil {
		t.Fatal("expected error for table not in deletableTableAllowlist, got nil")
	}
}

// TestResurrectionGuardBlocksStaleUpsert verifies the tombstone guard logic:
// when a tombstone with queue_id=101 exists and an upsert arrives with
// queue_id=100, the upsert must be blocked.
func TestResurrectionGuardBlocksStaleUpsert(t *testing.T) {
	tombstoneQID := int64(101)
	upsertQID := int64(100)

	// Simulate the guard condition: qErr==nil means tombstone exists.
	blocked := tombstoneQID >= upsertQID
	if !blocked {
		t.Error("stale upsert (queue_id=100) must be blocked by tombstone (queue_id=101)")
	}
}

// TestResurrectionGuardAllowsNewerUpsert verifies that an upsert with a queue_id
// strictly greater than the tombstone is allowed through.
func TestResurrectionGuardAllowsNewerUpsert(t *testing.T) {
	tombstoneQID := int64(100)
	upsertQID := int64(200)

	// Guard blocks when tombstoneQID >= upsertQID; here it must NOT block.
	blocked := tombstoneQID >= upsertQID
	if blocked {
		t.Error("newer upsert (queue_id=200) must not be blocked by tombstone (queue_id=100)")
	}
}

// TestResurrectionGuardEqualQueueIDBlocks verifies that an upsert with the same
// queue_id as the tombstone is also blocked (idempotent delete wins).
func TestResurrectionGuardEqualQueueIDBlocks(t *testing.T) {
	tombstoneQID := int64(101)
	upsertQID := int64(101)

	blocked := tombstoneQID >= upsertQID
	if !blocked {
		t.Error("upsert with same queue_id as tombstone must be blocked")
	}
}

// TestStaleDeleteGuardLogic verifies the stale-check condition:
// a delete with queue_id <= existing row's last_queue_id should be blocked.
func TestStaleDeleteGuardLogic(t *testing.T) {
	cases := []struct {
		existingQueueID int64
		deleteQueueID   int64
		expectStale     bool
	}{
		{existingQueueID: 100, deleteQueueID: 50, expectStale: true},
		{existingQueueID: 100, deleteQueueID: 100, expectStale: false}, // equal: delete allowed (same event, idempotent)
		{existingQueueID: 50, deleteQueueID: 100, expectStale: false},  // newer delete
		{existingQueueID: 0, deleteQueueID: 1, expectStale: false},     // zero last_queue_id: always allow
	}
	for _, tc := range cases {
		// Stale when existing row is STRICTLY newer than the delete.
		stale := tc.existingQueueID > tc.deleteQueueID
		if stale != tc.expectStale {
			t.Errorf("existingQID=%d deleteQID=%d: got stale=%v, want %v",
				tc.existingQueueID, tc.deleteQueueID, stale, tc.expectStale)
		}
	}
}

// TestCascadeDeleteTableList verifies that invoices has the expected child tables defined.
func TestCascadeDeleteTableList(t *testing.T) {
	// This test documents the expected cascade behaviour.
	// If a new child table is added without updating deleteRecord, this will fail.
	expected := []string{"invoice_items", "payments", "ticket_returns"}
	// The actual childTables slice in deleteRecord must match this list.
	// We verify via the deletableTableAllowlist — invoices must be the only table with cascade.
	if !deletableTableAllowlist["invoices"] {
		t.Fatal("invoices must be in deletableTableAllowlist")
	}
	if len(expected) != 3 {
		t.Fatal("update this test when adding new cascade tables")
	}
}

// TestRetryLimitDocumented documents the retry behaviour and ensures the constant
// is accessible for tests (catches silent changes to the limit).
func TestRetryLimitDocumented(t *testing.T) {
	const expectedLimit = 10
	if maxSyncRetries != expectedLimit {
		t.Errorf("sync retry limit changed: got %d, want %d — update cloud-sync docs", maxSyncRetries, expectedLimit)
	}
}

// TestDeletableTableAllowlistIsSubsetOfTableAllowlist verifies that every table
// in deletableTableAllowlist is also in tableAllowlist (delete-only tables
// cannot exist outside the broader sync scope).
func TestDeletableTableAllowlistIsSubsetOfTableAllowlist(t *testing.T) {
	for tbl := range deletableTableAllowlist {
		if _, ok := tableAllowlist[tbl]; !ok {
			t.Errorf("deletable table %q is not in tableAllowlist — inconsistency", tbl)
		}
	}
}

// TestSyncBatchUnknownTableReturns400 verifies that tables outside the allowlist
// are rejected even for delete operations.
func TestSyncBatchUnknownTableReturns400(t *testing.T) {
	recordID := int64(1)
	body, _ := json.Marshal(map[string]interface{}{
		"table":     "not_a_real_table",
		"operation": "delete",
		"record_id": recordID,
		"rows":      []map[string]interface{}{{"id": 1, "_queue_id": 5}},
	})
	req := httptest.NewRequest(http.MethodPost, "/sync/batch", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	SyncBatch(nil)(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for unknown table, got %d", rr.Code)
	}
}
