import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useConnection } from '../services/connection';
import { checkHealth, parseNetworkError } from '../services/api';

const ACCENT = '#CF291D';

type TestStatus = 'idle' | 'testing' | 'ok' | 'fail';

function ConnectionScreen() {
  const { ip: savedIp, connected, setIP } = useConnection();
  const [inputIp, setInputIp] = useState<string>(savedIp);
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testMessage, setTestMessage] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const handleTest = async () => {
    const trimmed = inputIp.trim();
    if (!trimmed) {
      Alert.alert('Validation', 'Please enter a desktop IP address.');
      return;
    }
    // Basic IP validation
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(trimmed)) {
      Alert.alert('Validation', 'Enter a valid IP address (e.g. 192.168.1.100)');
      return;
    }

    setTestStatus('testing');
    setTestMessage('');

    try {
      // Test connection using the typed IP directly — no AsyncStorage race condition
      const health = await checkHealth(trimmed);
      // Only save IP after successful connection test
      await setIP(trimmed);
      setTestStatus('ok');
      setTestMessage(`✓ Connected to ${trimmed}:7423 — ${health.status ?? 'ok'}`);
    } catch (err: any) {
      setTestStatus('fail');
      setTestMessage(parseNetworkError(err));
    }
  };

  const handleSave = async () => {
    const trimmed = inputIp.trim();
    if (!trimmed) return;
    setSaving(true);
    await setIP(trimmed);
    setSaving(false);
    Alert.alert('Saved', `Desktop IP saved as ${trimmed}`);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.headerIcon}>
          <Feather name="wifi" size={32} color={ACCENT} />
        </View>
        <Text style={styles.title}>Desktop Connection</Text>
        <Text style={styles.titleSi}>ඩෙස්ක්ටොප් සම්බන්ධය</Text>
        <Text style={styles.desc}>
          Enter the local IP address of the computer running the Lottery desktop application.
          Both devices must be on the same WiFi network.
        </Text>
        <Text style={styles.descSi}>
          ලොතරැයි ඩෙස්ක්ටොප් යෙදුම ක්‍රියාත්මක වන පරිගණකයේ IP ලිපිනය ඇතුළු කරන්න.
        </Text>

        {/* Current connection status */}
        <View style={[styles.statusBanner, connected ? styles.statusOk : styles.statusOff]}>
          <View style={[styles.dot, { backgroundColor: connected ? '#16A34A' : '#EF4444' }]} />
          <Text style={styles.statusText}>
            {connected ? `Connected to ${savedIp}` : 'Not connected'}
          </Text>
        </View>

        {/* IP input */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Desktop IP Address</Text>
          <Text style={styles.labelSi}>ඩෙස්ක්ටොප් IP ලිපිනය</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={inputIp}
              onChangeText={(v) => {
                setInputIp(v);
                setTestStatus('idle');
              }}
              placeholder="e.g. 192.168.1.100"
              placeholderTextColor="#9CA3AF"
              keyboardType="decimal-pad"
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="done"
            />
            <View style={styles.portBadge}>
              <Text style={styles.portText}>:7423</Text>
            </View>
          </View>
        </View>

        {/* Live URL preview */}
        {inputIp.trim().length > 0 && (
          <View style={styles.urlPreview}>
            <Text style={styles.urlLabel}>Will connect to:</Text>
            <Text style={styles.urlValue}>http://{inputIp.trim()}:7423/api/v1/health</Text>
          </View>
        )}

        {/* Hint */}
        <View style={styles.hint}>
          <Feather name="info" size={14} color="#6B7280" />
          <Text style={styles.hintText}>
            Find desktop IP: open a terminal on the desktop computer and run{' '}
            <Text style={styles.mono}>ip addr</Text> (Linux) or{' '}
            <Text style={styles.mono}>ipconfig</Text> (Windows). Look for the IP on your WiFi adapter.
            The desktop Lottery app must be open and running.
          </Text>
        </View>

        {/* Test result */}
        {testStatus !== 'idle' && (
          <View style={[styles.testResult, testStatus === 'ok' ? styles.testOk : testStatus === 'fail' ? styles.testFail : styles.testPending]}>
            {testStatus === 'testing' ? (
              <ActivityIndicator size="small" color="#6B7280" />
            ) : (
              <Feather
                name={testStatus === 'ok' ? 'check-circle' : 'x-circle'}
                size={16}
                color={testStatus === 'ok' ? '#16A34A' : '#EF4444'}
              />
            )}
            <Text style={[styles.testText, testStatus === 'ok' ? { color: '#16A34A' } : testStatus === 'fail' ? { color: '#EF4444' } : {}]}>
              {testStatus === 'testing' ? 'Testing connection...' : testMessage}
            </Text>
          </View>
        )}

        {/* Buttons */}
        <TouchableOpacity
          style={[styles.testBtn, testStatus === 'testing' && styles.btnDisabled]}
          onPress={handleTest}
          disabled={testStatus === 'testing'}
        >
          {testStatus === 'testing' ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Feather name="zap" size={18} color="#FFFFFF" />
          )}
          <Text style={styles.testBtnText}>
            {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
          </Text>
          <Text style={styles.testBtnSi}>සම්බන්ධය පරීක්ෂා කරන්න</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.btnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator size="small" color={ACCENT} /> : <Feather name="save" size={16} color={ACCENT} />}
          <Text style={styles.saveBtnText}>Save IP Address</Text>
        </TouchableOpacity>

        {/* Common IPs guide */}
        <View style={styles.guide}>
          <Text style={styles.guideTitle}>Common IP ranges</Text>
          {['192.168.1.x', '192.168.0.x', '10.0.0.x'].map((range) => (
            <TouchableOpacity
              key={range}
              onPress={() => setInputIp(range.replace('x', '100'))}
              style={styles.guideItem}
            >
              <Feather name="chevron-right" size={14} color="#9CA3AF" />
              <Text style={styles.guideItemText}>{range}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  headerIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    alignSelf: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1D1D1D',
    textAlign: 'center',
  },
  titleSi: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 12,
  },
  desc: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  descSi: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
    lineHeight: 18,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
  },
  statusOk: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  statusOff: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1D1D1D',
    marginBottom: 2,
  },
  labelSi: {
    fontSize: 10,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#1D1D1D',
    letterSpacing: 1,
  },
  portBadge: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 14,
    marginLeft: 8,
  },
  portText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },
  hint: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  hintText: {
    flex: 1,
    fontSize: 12,
    color: '#374151',
    lineHeight: 18,
  },
  mono: {
    fontFamily: 'monospace',
    backgroundColor: '#DBEAFE',
    fontSize: 11,
  },
  urlPreview: {
    backgroundColor: '#1D1D1D',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  urlLabel: {
    fontSize: 9,
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  urlValue: {
    fontSize: 12,
    color: '#4ADE80',
    fontFamily: 'monospace',
  },
  testResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
  },
  testOk: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  testFail: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  testPending: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
  },
  testText: {
    flex: 1,
    fontSize: 13,
    color: '#374151',
  },
  testBtn: {
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 10,
  },
  testBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  testBtnSi: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
  },
  saveBtn: {
    borderWidth: 1,
    borderColor: ACCENT,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  saveBtnText: {
    color: ACCENT,
    fontSize: 15,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  guide: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  guideTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  guideItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  guideItemText: {
    fontSize: 13,
    color: '#374151',
    fontFamily: 'monospace',
  },
});

export default ConnectionScreen;
