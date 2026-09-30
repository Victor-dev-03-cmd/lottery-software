import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getStock, StockItem } from '../services/api';

const ACCENT = '#CF291D';

type StockFilter = 'all' | 'in_stock' | 'low' | 'out';

const LOW_THRESHOLD = 50;

function stockStatus(item: StockItem): StockFilter {
  if (item.remaining <= 0) return 'out';
  if (item.remaining <= LOW_THRESHOLD) return 'low';
  return 'in_stock';
}

function statusColor(status: StockFilter): string {
  if (status === 'out') return '#EF4444';
  if (status === 'low') return '#F59E0B';
  return '#16A34A';
}

function statusLabel(status: StockFilter): string {
  if (status === 'out') return 'Out of Stock';
  if (status === 'low') return 'Low Stock';
  return 'In Stock';
}

function statusLabelSi(status: StockFilter): string {
  if (status === 'out') return 'නොමැත';
  if (status === 'low') return 'අඩු';
  return 'ඇත';
}

export function StockScreen() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StockFilter>('all');

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await getStock();
      setItems(data);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load stock.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const filtered = items.filter((item) => {
    const matchSearch =
      !search ||
      item.game_name.toLowerCase().includes(search.toLowerCase()) ||
      (item.game_name_si ?? '').includes(search);

    const status = stockStatus(item);
    const matchFilter = filter === 'all' || status === filter;

    return matchSearch && matchFilter;
  });

  // Summary counts
  const counts = {
    all: items.length,
    in_stock: items.filter((i) => stockStatus(i) === 'in_stock').length,
    low: items.filter((i) => stockStatus(i) === 'low').length,
    out: items.filter((i) => stockStatus(i) === 'out').length,
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={ACCENT} size="large" />
        <Text style={styles.loadingText}>Loading stock...</Text>
        <Text style={styles.loadingSi}>තොග විස්තර ලබා ගනිමින්...</Text>
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
      {/* Search */}
      <View style={styles.searchBar}>
        <Feather name="search" size={16} color="#9CA3AF" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search games..."
          placeholderTextColor="#9CA3AF"
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Feather name="x" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Filter chips */}
      <View style={styles.chipRow}>
        {(['all', 'in_stock', 'low', 'out'] as StockFilter[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.chip, filter === f && styles.chipActive]}
            onPress={() => setFilter(f)}
          >
            <View style={[styles.chipDot, { backgroundColor: f === 'all' ? '#6B7280' : statusColor(f) }]} />
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
              {f === 'all' ? 'All' : statusLabel(f)} ({counts[f]})
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.game_name}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="package" size={40} color="#E5E7EB" />
            <Text style={styles.emptyText}>No games found</Text>
          </View>
        }
        renderItem={({ item }) => {
          const status = stockStatus(item);
          const color = statusColor(status);
          const pct = item.total_purchased > 0
            ? Math.min(100, (item.remaining / item.total_purchased) * 100)
            : 0;

          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleBlock}>
                  <Text style={styles.cardTitle}>{item.game_name}</Text>
                  {item.game_name_si ? (
                    <Text style={styles.cardTitleSi}>{item.game_name_si}</Text>
                  ) : null}
                </View>
                <View style={[styles.statusBadge, { backgroundColor: color + '1A', borderColor: color + '40' }]}>
                  <View style={[styles.statusDot, { backgroundColor: color }]} />
                  <View>
                    <Text style={[styles.statusText, { color }]}>{statusLabel(status)}</Text>
                    <Text style={[styles.statusSi, { color }]}>{statusLabelSi(status)}</Text>
                  </View>
                </View>
              </View>

              {/* Progress bar */}
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: color }]} />
              </View>

              {/* Stats row */}
              <View style={styles.statsRow}>
                <MiniStat label="Purchased" labelSi="මිලදී ගත්" value={item.total_purchased} />
                <MiniStat label="Returned" labelSi="ආපසු" value={item.total_returned} color="#D97706" />
                <MiniStat label="Invoiced" labelSi="ඉන්වොයිස්" value={item.total_invoiced} color="#7C3AED" />
                <MiniStat label="Remaining" labelSi="ඉතිරි" value={item.remaining} color={color} bold />
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

function MiniStat({
  label, labelSi, value, color = '#6B7280', bold,
}: {
  label: string; labelSi: string; value: number; color?: string; bold?: boolean;
}) {
  return (
    <View style={styles.miniStat}>
      <Text style={[styles.miniValue, { color }, bold && { fontWeight: '800', fontSize: 16 }]}>
        {value.toLocaleString()}
      </Text>
      <Text style={styles.miniLabel}>{label}</Text>
      <Text style={styles.miniSi}>{labelSi}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#F5F5F5' },
  loadingText: { fontSize: 14, color: '#6B7280', marginTop: 12 },
  loadingSi: { fontSize: 11, color: '#9CA3AF' },
  errorText: { fontSize: 14, color: '#EF4444', textAlign: 'center', marginBottom: 16 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: ACCENT, borderRadius: 10,
    paddingHorizontal: 20, paddingVertical: 10,
  },
  retryText: { color: ACCENT, fontWeight: '700' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#1D1D1D' },
  chipRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipActive: {
    backgroundColor: '#FEF2F2',
    borderColor: ACCENT,
  },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipText: { fontSize: 11, color: '#6B7280', fontWeight: '600' },
  chipTextActive: { color: ACCENT },
  list: { padding: 16, gap: 12, paddingBottom: 32 },
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
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  cardTitleBlock: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1D1D1D' },
  cardTitleSi: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  statusSi: { fontSize: 9 },
  progressTrack: {
    height: 4,
    backgroundColor: '#F3F4F6',
    borderRadius: 2,
    marginBottom: 12,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 2 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  miniStat: { alignItems: 'center', flex: 1 },
  miniValue: { fontSize: 14, fontWeight: '700', color: '#6B7280' },
  miniLabel: { fontSize: 10, color: '#9CA3AF', marginTop: 1 },
  miniSi: { fontSize: 9, color: '#D1D5DB' },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyText: { fontSize: 14, color: '#9CA3AF' },
});
