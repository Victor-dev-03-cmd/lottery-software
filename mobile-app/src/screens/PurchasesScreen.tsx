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
import { addPurchase } from '../services/api';
import { GamePicker } from '../components/GamePicker';
import BarcodeScanner from '../components/BarcodeScanner';

const ACCENT = '#CF291D';

interface ScanTarget {
  field: 'barcode_start' | 'barcode_end';
  label: string;
  labelSi: string;
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function PurchasesScreen() {
  const [gameName, setGameName] = useState('');
  const [barcodeStart, setBarcodeStart] = useState('');
  const [barcodeEnd, setBarcodeEnd] = useState('');
  const [unitPrice, setUnitPrice] = useState('32.50');
  const [purchaseDate, setPurchaseDate] = useState(todayISO());
  const [supplierName, setSupplierName] = useState('');
  const [notes, setNotes] = useState('');

  const [scanTarget, setScanTarget] = useState<ScanTarget | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const startNum = parseInt(barcodeStart, 10);
  const endNum = parseInt(barcodeEnd, 10);
  const qty = !isNaN(startNum) && !isNaN(endNum) && endNum >= startNum ? endNum - startNum + 1 : null;

  const totalValue = qty !== null ? qty * parseFloat(unitPrice || '0') : null;

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
    if (!unitPrice || parseFloat(unitPrice) <= 0) return 'Unit price must be > 0.';
    if (!purchaseDate) return 'Purchase date is required.';
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { Alert.alert('Validation', err); return; }

    setSubmitting(true);
    try {
      await addPurchase({
        game_name: gameName,
        barcode_start: barcodeStart.trim(),
        barcode_end: barcodeEnd.trim(),
        qty: qty!,
        unit_price: parseFloat(unitPrice),
        purchase_date: purchaseDate,
        supplier_name: supplierName.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      Alert.alert('Success', `Purchase recorded: ${qty} tickets of ${gameName}`, [
        {
          text: 'OK',
          onPress: () => {
            setGameName('');
            setBarcodeStart('');
            setBarcodeEnd('');
            setUnitPrice('32.50');
            setPurchaseDate(todayISO());
            setSupplierName('');
            setNotes('');
          },
        },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? e?.message ?? 'Failed to save purchase.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Scanner modal ──────────────────────────────────────────────────────────
  if (scanTarget) {
    return (
      <Modal visible animationType="slide" onRequestClose={() => setScanTarget(null)}>
        <BarcodeScanner
          label={scanTarget.label}
          labelSi={scanTarget.labelSi}
          onScanned={handleScanned}
          onClose={() => setScanTarget(null)}
        />
      </Modal>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.pageTitle}>New Purchase</Text>
        <Text style={styles.pageTitleSi}>නව මිලදී ගැනීම</Text>

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

        {/* Unit Price */}
        <Field label="Unit Price (LKR) / යනකම මිල" required>
          <TextInput
            style={styles.input}
            value={unitPrice}
            onChangeText={setUnitPrice}
            keyboardType="decimal-pad"
            placeholder="32.50"
            placeholderTextColor="#9CA3AF"
          />
          {totalValue !== null && (
            <Text style={styles.totalHint}>
              Total: LKR {totalValue.toLocaleString('en-LK', { minimumFractionDigits: 2 })}
            </Text>
          )}
        </Field>

        {/* Purchase Date */}
        <Field label="Purchase Date / මිලදී ගැනීමේ දිනය" required>
          <TextInput
            style={styles.input}
            value={purchaseDate}
            onChangeText={setPurchaseDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#9CA3AF"
          />
        </Field>

        {/* Supplier */}
        <Field label="Supplier Name / සැපයුම්කරු">
          <TextInput
            style={styles.input}
            value={supplierName}
            onChangeText={setSupplierName}
            placeholder="Optional"
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
            <Feather name="save" size={18} color="#FFFFFF" />
          )}
          <Text style={styles.submitText}>
            {submitting ? 'Saving...' : 'Save Purchase'}
          </Text>
          <Text style={styles.submitSi}>මිලදී ගැනීම සුරකින්න</Text>
        </TouchableOpacity>
      </ScrollView>
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
        {required ? null : <Text style={styles.optionalTag}>Optional</Text>}
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
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1D1D1D',
    marginBottom: 2,
  },
  pageTitleSi: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 20,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1D1D1D',
  },
  fieldLabelSi: {
    fontSize: 10,
    color: '#9CA3AF',
    marginBottom: 6,
    marginTop: 1,
  },
  optionalTag: {
    fontSize: 10,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 13,
    fontSize: 14,
    color: '#1D1D1D',
  },
  textarea: {
    minHeight: 80,
  },
  barcodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barcodeInput: {
    flex: 1,
    letterSpacing: 1,
  },
  scanBtn: {
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scanBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
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
  qtyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  qtyLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1D1D1D',
  },
  qtyLabelSi: {
    fontSize: 10,
    color: '#9CA3AF',
  },
  qtyValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  qtyDash: {
    color: '#9CA3AF',
    fontSize: 22,
  },
  qtyHint: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
  },
  totalHint: {
    fontSize: 12,
    color: '#16A34A',
    fontWeight: '600',
    marginTop: 6,
  },
  submitBtn: {
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 8,
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  submitSi: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
  },
  btnDisabled: {
    opacity: 0.5,
  },
});

export default PurchasesScreen;
