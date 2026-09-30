import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Modal,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { addReturn } from '../services/api';
import { GamePicker } from '../components/GamePicker';
import BarcodeScanner from '../components/BarcodeScanner';

const ACCENT = '#CF291D';

const RETURN_REASONS = [
  { value: 'Unsold', label: 'Unsold', labelSi: 'නොවිකිණූ' },
  { value: 'Damaged', label: 'Damaged', labelSi: 'හානි සහිත' },
  { value: 'Expired', label: 'Expired', labelSi: 'කල් ඉකුත් වූ' },
  { value: 'Other', label: 'Other', labelSi: 'වෙනත්' },
];

interface ScanTarget {
  field: 'barcode_start' | 'barcode_end';
  label: string;
  labelSi: string;
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function ReturnsScreen() {
  const [gameName, setGameName] = useState('');
  const [barcodeStart, setBarcodeStart] = useState('');
  const [barcodeEnd, setBarcodeEnd] = useState('');
  const [reason, setReason] = useState('Unsold');
  const [returnDate, setReturnDate] = useState(todayISO());
  const [notes, setNotes] = useState('');

  const [scanTarget, setScanTarget] = useState<ScanTarget | null>(null);
  const [reasonPickerVisible, setReasonPickerVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const startNum = parseInt(barcodeStart, 10);
  const endNum = parseInt(barcodeEnd, 10);
  const qty = !isNaN(startNum) && !isNaN(endNum) && endNum >= startNum ? endNum - startNum + 1 : null;

  const openScanner = (field: 'barcode_start' | 'barcode_end') => {
    setScanTarget(
      field === 'barcode_start'
        ? { field, label: 'Scan Start Barcode', labelSi: 'ආරම්භක බාර්කෝඩය' }
        : { field, label: 'Scan End Barcode', labelSi: 'අවසාන බාර්කෝඩය' }
    );
  };

  const handleScanned = (code: string) => {
    if (!scanTarget) return;
    if (scanTarget.field === 'barcode_start') setBarcodeStart(code);
    else setBarcodeEnd(code);
    setScanTarget(null);
  };

  const validate = (): string | null => {
    if (!gameName) return 'Please select a game.';
    if (!barcodeStart.trim()) return 'Start barcode is required.';
    if (!barcodeEnd.trim()) return 'End barcode is required.';
    if (qty === null || qty <= 0) return 'End barcode must be ≥ start barcode.';
    if (!reason) return 'Please select a return reason.';
    if (!returnDate) return 'Return date is required.';
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { Alert.alert('Validation', err); return; }

    setSubmitting(true);
    try {
      await addReturn({
        game_name: gameName,
        barcode_start: barcodeStart.trim(),
        barcode_end: barcodeEnd.trim(),
        qty: qty!,
        reason,
        return_date: returnDate,
        notes: notes.trim() || undefined,
      });
      Alert.alert('Success', `Return recorded: ${qty} tickets of ${gameName} (${reason})`, [
        {
          text: 'OK',
          onPress: () => {
            setGameName('');
            setBarcodeStart('');
            setBarcodeEnd('');
            setReason('Unsold');
            setReturnDate(todayISO());
            setNotes('');
          },
        },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? e?.message ?? 'Failed to save return.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Scanner modal ──────────────────────────────────────────────────────────
  if (scanTarget) {
    return (
      <BarcodeScanner
        label={scanTarget.label}
        labelSi={scanTarget.labelSi}
        onScanned={handleScanned}
        onClose={() => setScanTarget(null)}
      />
    );
  }

  const selectedReason = RETURN_REASONS.find((r) => r.value === reason);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.pageTitle}>Supplier Return</Text>
        <Text style={styles.pageTitleSi}>සැපයුම්කරු ආපසු ලබාදීම</Text>

        {/* Game */}
        <Field label="Game / ක්‍රීඩාව" required>
          <GamePicker value={gameName} onSelect={setGameName} placeholder="Select lottery game..." />
        </Field>

        {/* Start Barcode */}
        <Field label="Start Barcode / ආරම්භක බාර්කෝඩය" required>
          <BarcodeField
            value={barcodeStart}
            onChangeText={setBarcodeStart}
            onScan={() => openScanner('barcode_start')}
            placeholder="e.g. 1000001"
          />
        </Field>

        {/* End Barcode */}
        <Field label="End Barcode / අවසාන බාර්කෝඩය" required>
          <BarcodeField
            value={barcodeEnd}
            onChangeText={setBarcodeEnd}
            onScan={() => openScanner('barcode_end')}
            placeholder="e.g. 1000100"
          />
        </Field>

        {/* QTY display */}
        <View style={styles.qtyCard}>
          <View style={styles.qtyRow}>
            <View>
              <Text style={styles.qtyLabel}>Quantity (auto)</Text>
              <Text style={styles.qtyLabelSi}>ප්‍රමාණය (ස්වයංක්‍රීය)</Text>
            </View>
            <Text style={[styles.qtyValue, qty === null && styles.qtyDash]}>
              {qty !== null ? qty.toLocaleString() : '—'}
            </Text>
          </View>
          {qty !== null && qty > 0 && (
            <Text style={styles.qtyHint}>
              {barcodeStart} → {barcodeEnd} ({qty} tickets)
            </Text>
          )}
        </View>

        {/* Reason */}
        <Field label="Return Reason / ආපසු දීමේ හේතුව" required>
          <TouchableOpacity style={styles.reasonPicker} onPress={() => setReasonPickerVisible(true)}>
            <View>
              <Text style={styles.reasonText}>{selectedReason?.label ?? 'Select reason...'}</Text>
              <Text style={styles.reasonSi}>{selectedReason?.labelSi ?? ''}</Text>
            </View>
            <Feather name="chevron-down" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        </Field>

        {/* Return Date */}
        <Field label="Return Date / ආපසු දීමේ දිනය" required>
          <TextInput
            style={styles.input}
            value={returnDate}
            onChangeText={setReturnDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#9CA3AF"
          />
        </Field>

        {/* Notes */}
        <Field label="Notes / සටහන්">
          <TextInput
            style={[styles.input, styles.textarea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional notes..."
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </Field>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Feather name="refresh-cw" size={18} color="#FFFFFF" />
          )}
          <Text style={styles.submitText}>
            {submitting ? 'Saving...' : 'Save Return'}
          </Text>
          <Text style={styles.submitSi}>ආපසු දීම සුරකින්න</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Reason picker modal */}
      <Modal visible={reasonPickerVisible} transparent animationType="slide" onRequestClose={() => setReasonPickerVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Return Reason</Text>
              <Text style={styles.sheetSi}>ආපසු දීමේ හේතුව</Text>
              <TouchableOpacity onPress={() => setReasonPickerVisible(false)}>
                <Feather name="x" size={22} color="#1D1D1D" />
              </TouchableOpacity>
            </View>
            {RETURN_REASONS.map((r) => (
              <TouchableOpacity
                key={r.value}
                style={[styles.sheetItem, reason === r.value && styles.sheetItemSelected]}
                onPress={() => { setReason(r.value); setReasonPickerVisible(false); }}
              >
                <View>
                  <Text style={[styles.sheetItemText, reason === r.value && { color: ACCENT, fontWeight: '700' }]}>
                    {r.label}
                  </Text>
                  <Text style={styles.sheetItemSi}>{r.labelSi}</Text>
                </View>
                {reason === r.value && <Feather name="check" size={16} color={ACCENT} />}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  const [main, si] = label.split(' / ');
  return (
    <View style={styles.fieldGroup}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>
          {main}
          {required ? <Text style={{ color: ACCENT }}> *</Text> : null}
        </Text>
        {!required ? <Text style={styles.optionalTag}>Optional</Text> : null}
      </View>
      {si ? <Text style={styles.fieldLabelSi}>{si}</Text> : null}
      {children}
    </View>
  );
}

function BarcodeField({
  value,
  onChangeText,
  onScan,
  placeholder,
}: {
  value: string;
  onChangeText: (v: string) => void;
  onScan: () => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.barcodeRow}>
      <TextInput
        style={[styles.input, styles.barcodeInput]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        keyboardType="numeric"
      />
      <TouchableOpacity style={styles.scanBtn} onPress={onScan}>
        <Feather name="camera" size={18} color="#FFFFFF" />
        <Text style={styles.scanBtnText}>Scan</Text>
      </TouchableOpacity>
      {value ? (
        <View style={styles.codeBadge}>
          <Feather name="check" size={12} color="#16A34A" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 20, paddingBottom: 40 },
  pageTitle: { fontSize: 22, fontWeight: '800', color: '#1D1D1D', marginBottom: 2 },
  pageTitleSi: { fontSize: 11, color: '#9CA3AF', marginBottom: 20 },
  fieldGroup: { marginBottom: 16 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#1D1D1D' },
  fieldLabelSi: { fontSize: 10, color: '#9CA3AF', marginBottom: 6, marginTop: 1 },
  optionalTag: { fontSize: 10, color: '#9CA3AF', fontStyle: 'italic' },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 13,
    fontSize: 14,
    color: '#1D1D1D',
  },
  textarea: { minHeight: 80 },
  barcodeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barcodeInput: { flex: 1, letterSpacing: 1 },
  scanBtn: {
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scanBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  codeBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 16,
  },
  qtyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  qtyLabel: { fontSize: 13, fontWeight: '600', color: '#1D1D1D' },
  qtyLabelSi: { fontSize: 10, color: '#9CA3AF' },
  qtyValue: { fontSize: 28, fontWeight: '800', color: '#D97706' },
  qtyDash: { color: '#9CA3AF', fontSize: 22 },
  qtyHint: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
  reasonPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  reasonText: { fontSize: 14, color: '#1D1D1D', fontWeight: '500' },
  reasonSi: { fontSize: 10, color: '#9CA3AF' },
  submitBtn: {
    backgroundColor: '#D97706',
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 8,
  },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  submitSi: { color: 'rgba(255,255,255,0.6)', fontSize: 10 },
  btnDisabled: { opacity: 0.5 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#1D1D1D', flex: 1 },
  sheetSi: { fontSize: 11, color: '#9CA3AF', marginRight: 12 },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  sheetItemSelected: { backgroundColor: '#FEF2F2' },
  sheetItemText: { fontSize: 15, color: '#1D1D1D' },
  sheetItemSi: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
});

export default ReturnsScreen;
