import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useConnection } from '../services/connection';
import { getDashboardStats, DashboardStats } from '../services/api';
import { StatCard } from '../components/StatCard';

const ACCENT = '#CF291D';

export function HomeScreen() {
  const navigation = useNavigation<any>();
  const { ip, connected, connecting, lastChecked, refresh } = useConnection();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = useCallback(async () => {
    if (!connected) return;
    setLoadingStats(true);
    try {
      const data = await getDashboardStats();
      setStats(data);
    } catch {
      // silently fail; connectivity error handled by ConnectionContext
    } finally {
      setLoadingStats(false);
    }
  }, [connected]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    await loadStats();
    setRefreshing(false);
  }, [refresh, loadStats]);

  const formatLastChecked = () => {
    if (!lastChecked) return 'Never';
    return lastChecked.toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
    >
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appName}>Lottery Scanner</Text>
          <Text style={styles.appNameSi}>ලොතරැයි ස්කෑනර්</Text>
        </View>
        <View style={styles.logoMark}>
          <Feather name="activity" size={22} color={ACCENT} />
        </View>
      </View>

      {/* Connection card */}
      <View style={[styles.connCard, connected ? styles.connOk : styles.connFail]}>
        <View style={styles.connRow}>
          <View style={[styles.connDot, { backgroundColor: connecting ? '#F59E0B' : connected ? '#16A34A' : '#EF4444' }]} />
          <View style={styles.connText}>
            <Text style={styles.connStatus}>
              {connecting ? 'Connecting...' : connected ? 'Connected to Desktop' : 'Not Connected'}
            </Text>
            <Text style={styles.connSi}>
              {connecting ? 'සම්බන්ධ වෙමින්...' : connected ? 'ඩෙස්ක්ටොප් සමග සම්බන්ධ වී ඇත' : 'සම්බන්ධ නොවේ'}
            </Text>
          </View>
          {connecting && <ActivityIndicator size="small" color="#F59E0B" />}
        </View>
        {ip ? (
          <Text style={styles.ipText}>
            <Feather name="wifi" size={11} /> {ip}:7423
          </Text>
        ) : (
          <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
            <Text style={styles.setIpLink}>Tap to configure desktop IP →</Text>
          </TouchableOpacity>
        )}
        {lastChecked && (
          <Text style={styles.lastChecked}>Last checked: {formatLastChecked()}</Text>
        )}
      </View>

      {/* Stat cards */}
      <Text style={styles.sectionTitle}>Overview · දළ විශ්ලේෂණය</Text>
      {loadingStats ? (
        <View style={styles.statsLoading}>
          <ActivityIndicator color={ACCENT} />
          <Text style={styles.loadingText}>Loading statistics...</Text>
        </View>
      ) : (
        <>
          <View style={styles.statsRow}>
            <StatCard
              title="Total Stock"
              titleSi="මුළු තොගය"
              value={stats?.total_stock ?? '—'}
              color="#1D4ED8"
              icon="package"
            />
            <StatCard
              title="Today's Purchases"
              titleSi="අද මිලදී ගැනීම්"
              value={stats?.todays_purchases ?? '—'}
              color="#16A34A"
              icon="shopping-cart"
            />
          </View>
          <View style={styles.statsRow}>
            <StatCard
              title="Pending Returns"
              titleSi="ආපසු ලබාදීම"
              value={stats?.pending_returns ?? '—'}
              color="#D97706"
              icon="refresh-cw"
            />
            <StatCard
              title="Active Agents"
              titleSi="සක්‍රිය නියෝජිතයන්"
              value={stats?.active_agents ?? '—'}
              color="#7C3AED"
              icon="users"
            />
          </View>
        </>
      )}

      {/* Quick actions */}
      <Text style={styles.sectionTitle}>Quick Actions · ශීඝ්‍ර ක්‍රියා</Text>
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#16A34A' }]} onPress={() => navigation.navigate('Purchases')}>
          <Feather name="shopping-cart" size={20} color="#FFFFFF" />
          <Text style={styles.actionText}>New Purchase</Text>
          <Text style={styles.actionSi}>නව මිලදී ගැනීම</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#D97706' }]} onPress={() => navigation.navigate('Returns')}>
          <Feather name="refresh-cw" size={20} color="#FFFFFF" />
          <Text style={styles.actionText}>New Return</Text>
          <Text style={styles.actionSi}>ආපසු ලබාදීම</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#1D4ED8' }]} onPress={() => navigation.navigate('Stock')}>
          <Feather name="package" size={20} color="#FFFFFF" />
          <Text style={styles.actionText}>View Stock</Text>
          <Text style={styles.actionSi}>තොගය බලන්න</Text>
        </TouchableOpacity>
      </View>

      {/* About */}
      <Text style={styles.footer}>Nimalsiri Enterprises · Lottery Management</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 8,
  },
  appName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1D1D1D',
  },
  appNameSi: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 1,
  },
  logoMark: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Connection card
  connCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
  },
  connOk: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  connFail: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  connRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 10,
  },
  connDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  connText: {
    flex: 1,
  },
  connStatus: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1D1D1D',
  },
  connSi: {
    fontSize: 10,
    color: '#9CA3AF',
  },
  ipText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  setIpLink: {
    fontSize: 13,
    color: ACCENT,
    fontWeight: '600',
    marginTop: 4,
  },
  lastChecked: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 6,
  },
  // Section
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 12,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statsLoading: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  // Actions
  actions: {
    gap: 10,
  },
  actionBtn: {
    borderRadius: 14,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  actionSi: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
  },
  footer: {
    textAlign: 'center',
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 32,
  },
});
