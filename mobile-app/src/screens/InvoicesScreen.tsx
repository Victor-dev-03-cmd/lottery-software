import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getInvoices, getInvoice, getAgents, Invoice, Agent } from '../services/api';

const ACCENT = '#CF291D';

const STATUS_COLORS: Record<string, string> = {
  draft: '#6B7280',
  confirmed: '#1D4ED8',
  paid: '#16A34A',
};

const STATUS_LABELS_SI: Record<string, string> = {
  draft: 'කෙටුම්පත',
  confirmed: 'තහවුරු',
  paid: 'ගෙවූ',
};

export function InvoicesScreen() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [agentPickerVisible, setAgentPickerVisible] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [inv, agts] = await Promise.all([
        getInvoices(selectedAgentId ?? undefined),
        getAgents(),
      ]);
      setInvoices(inv);
      setAgents(agts);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load invoices.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedAgentId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const openDetail = async (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setDetailLoading(true);
    try {
      const detail = await getInvoice(invoice.id);
      setSelectedInvoice(detail);
    } catch {
      // keep summary if detail fails
    } finally {
      setDetailLoading(false);
    }
  };

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={ACCENT} size="large" />
        <Text style={styles.loadingText}>Loading invoices...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Feather name="alert-circle" size={48} color="#EF4444" style={{ marginBottom: 12 }} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={load}>
          <Feather name="refresh-cw" size={16} color={ACCENT} />
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Agent filter */}
      <View style={styles.filterBar}>
        <TouchableOpacity style={styles.agentFilter} onPress={() => setAgentPickerVisible(true)}>
          <Feather name="filter" size={14} color="#6B7280" />
          <Text style={styles.agentFilterText}>
            {selectedAgent ? selectedAgent.name : 'All Agents'}
          </Text>
          <Feather name="chevron-down" size={14} color="#9CA3AF" />
        </TouchableOpacity>
        {selectedAgentId !== null && (
          <TouchableOpacity style={styles.clearFilter} onPress={() => setSelectedAgentId(null)}>
            <Feather name="x" size={14} color="#9CA3AF" />
            <Text style={styles.clearFilterText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={invoices}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="file-text" size={40} color="#E5E7EB" />
            <Text style={styles.emptyText}>No invoices found</Text>
            <Text style={styles.emptySi}>ඉන්වොයිස් නොමැත</Text>
          </View>
        }
        renderItem={({ item }) => {
          const statusColor = STATUS_COLORS[item.status] ?? '#6B7280';
          return (
            <TouchableOpacity style={styles.card} onPress={() => openDetail(item)} activeOpacity={0.7}>
              <View style={styles.cardTop}>
                <View style={styles.invNumberBlock}>
                  <Text style={styles.invNumber}>{item.invoice_number}</Text>
                  <Text style={styles.invDate}>{item.issue_date}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusColor + '1A', borderColor: statusColor + '40' }]}>
                  <Text style={[styles.statusText, { color: statusColor }]}>
                    {item.status.toUpperCase()}
                  </Text>
                  <Text style={[styles.statusSi, { color: statusColor }]}>
                    {STATUS_LABELS_SI[item.status] ?? ''}
                  </Text>
                </View>
              </View>

              <View style={styles.cardBottom}>
                <View style={styles.agentBlock}>
                  <Feather name="user" size={13} color="#9CA3AF" />
                  <Text style={styles.agentName}>{item.agent_name ?? `Agent #${item.agent_id}`}</Text>
                </View>
                <Text style={styles.amount}>
                  LKR {(item.total_amount ?? 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })}
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color="#E5E7EB" style={styles.chevron} />
            </TouchableOpacity>
          );
        }}
      />

      {/* Agent picker modal */}
      <Modal visible={agentPickerVisible} transparent animationType="slide" onRequestClose={() => setAgentPickerVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Filter by Agent</Text>
              <Text style={styles.sheetSi}>නියෝජිතයෙකු අනුව</Text>
              <TouchableOpacity onPress={() => setAgentPickerVisible(false)}>
                <Feather name="x" size={22} color="#1D1D1D" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.sheetItem, selectedAgentId === null && styles.sheetItemSelected]}
              onPress={() => { setSelectedAgentId(null); setAgentPickerVisible(false); }}
            >
              <Text style={styles.sheetItemText}>All Agents</Text>
              {selectedAgentId === null && <Feather name="check" size={16} color={ACCENT} />}
            </TouchableOpacity>
            {agents.map((agent) => (
              <TouchableOpacity
                key={agent.id}
                style={[styles.sheetItem, selectedAgentId === agent.id && styles.sheetItemSelected]}
                onPress={() => { setSelectedAgentId(agent.id); setAgentPickerVisible(false); }}
              >
                <View>
                  <Text style={[styles.sheetItemText, selectedAgentId === agent.id && { color: ACCENT, fontWeight: '700' }]}>
                    {agent.name}
                  </Text>
                  {agent.area ? <Text style={styles.sheetItemSub}>{agent.area}</Text> : null}
                </View>
                {selectedAgentId === agent.id && <Feather name="check" size={16} color={ACCENT} />}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Invoice detail modal */}
      <Modal visible={!!selectedInvoice} animationType="slide" onRequestClose={() => setSelectedInvoice(null)}>
        {selectedInvoice && (
          <InvoiceDetail
            invoice={selectedInvoice}
            loading={detailLoading}
            onClose={() => setSelectedInvoice(null)}
          />
        )}
      </Modal>
    </View>
  );
}

// ── Invoice Detail ─────────────────────────────────────────────────────────────

function InvoiceDetail({ invoice, loading, onClose }: { invoice: Invoice; loading: boolean; onClose: () => void }) {
  const statusColor = STATUS_COLORS[invoice.status] ?? '#6B7280';

  return (
    <View style={detailStyles.container}>
      <View style={detailStyles.header}>
        <TouchableOpacity onPress={onClose} style={detailStyles.backBtn}>
          <Feather name="arrow-left" size={22} color="#1D1D1D" />
        </TouchableOpacity>
        <View style={detailStyles.headerText}>
          <Text style={detailStyles.title}>{invoice.invoice_number}</Text>
          <Text style={detailStyles.titleSi}>ඉන්වොයිස් විස්තර</Text>
        </View>
        <View style={[detailStyles.statusBadge, { backgroundColor: statusColor + '1A' }]}>
          <Text style={[detailStyles.statusText, { color: statusColor }]}>
            {invoice.status.toUpperCase()}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={detailStyles.centered}>
          <ActivityIndicator color={ACCENT} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={detailStyles.content}>
          {/* Summary */}
          <View style={detailStyles.summaryCard}>
            <Row label="Invoice #" labelSi="ඉන්වොයිස් අංකය" value={invoice.invoice_number} />
            <Row label="Agent" labelSi="නියෝජිතයා" value={invoice.agent_name ?? `#${invoice.agent_id}`} />
            <Row label="Date" labelSi="දිනය" value={invoice.issue_date} />
            <Row
              label="Total"
              labelSi="මුළු"
              value={`LKR ${(invoice.total_amount ?? 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`}
              highlight
            />
          </View>

          {/* Items */}
          {invoice.items && invoice.items.length > 0 && (
            <>
              <Text style={detailStyles.sectionTitle}>Line Items · අයිතම</Text>
              {invoice.items.map((item, idx) => (
                <View key={item.id ?? idx} style={detailStyles.lineItem}>
                  <View style={detailStyles.lineHeader}>
                    <Text style={detailStyles.lineName}>{item.game_name}</Text>
                    <Text style={detailStyles.lineTotal}>
                      LKR {(item.line_total ?? 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })}
                    </Text>
                  </View>
                  <Text style={detailStyles.lineDetail}>
                    Barcodes: {item.barcode_start} → {item.barcode_end}
                  </Text>
                  <Text style={detailStyles.lineDetail}>
                    Qty: {item.qty.toLocaleString()} × LKR {item.unit_price.toFixed(2)}
                  </Text>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Row({ label, labelSi, value, highlight }: { label: string; labelSi: string; value: string; highlight?: boolean }) {
  return (
    <View style={detailStyles.row}>
      <View>
        <Text style={detailStyles.rowLabel}>{label}</Text>
        <Text style={detailStyles.rowLabelSi}>{labelSi}</Text>
      </View>
      <Text style={[detailStyles.rowValue, highlight && { color: ACCENT, fontWeight: '800', fontSize: 16 }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#F5F5F5' },
  loadingText: { fontSize: 14, color: '#6B7280', marginTop: 12 },
  errorText: { fontSize: 14, color: '#EF4444', textAlign: 'center', marginBottom: 16 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: ACCENT, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: ACCENT, fontWeight: '700' },
  filterBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  agentFilter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  agentFilterText: { flex: 1, fontSize: 14, color: '#374151' },
  clearFilter: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  clearFilterText: { fontSize: 12, color: '#9CA3AF' },
  list: { padding: 16, gap: 10, paddingBottom: 32 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  invNumberBlock: {},
  invNumber: { fontSize: 15, fontWeight: '700', color: '#1D1D1D' },
  invDate: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, alignItems: 'center' },
  statusText: { fontSize: 10, fontWeight: '700' },
  statusSi: { fontSize: 9 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  agentBlock: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  agentName: { fontSize: 13, color: '#6B7280' },
  amount: { fontSize: 15, fontWeight: '700', color: '#1D1D1D' },
  chevron: { position: 'absolute', right: 16, top: '50%' },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyText: { fontSize: 14, color: '#9CA3AF' },
  emptySi: { fontSize: 11, color: '#D1D5DB' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32, maxHeight: '60%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#1D1D1D', flex: 1 },
  sheetSi: { fontSize: 11, color: '#9CA3AF', marginRight: 12 },
  sheetItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  sheetItemSelected: { backgroundColor: '#FEF2F2' },
  sheetItemText: { fontSize: 15, color: '#1D1D1D' },
  sheetItemSub: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
});

const detailStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 16, paddingTop: 48, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', gap: 12 },
  backBtn: { padding: 4 },
  headerText: { flex: 1 },
  title: { fontSize: 17, fontWeight: '800', color: '#1D1D1D' },
  titleSi: { fontSize: 10, color: '#9CA3AF' },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  statusText: { fontSize: 11, fontWeight: '700' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingBottom: 40 },
  summaryCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  rowLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
  rowLabelSi: { fontSize: 10, color: '#9CA3AF' },
  rowValue: { fontSize: 14, fontWeight: '600', color: '#1D1D1D' },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  lineItem: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  lineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  lineName: { fontSize: 14, fontWeight: '700', color: '#1D1D1D', flex: 1 },
  lineTotal: { fontSize: 14, fontWeight: '700', color: ACCENT },
  lineDetail: { fontSize: 12, color: '#6B7280', marginTop: 2 },
});
