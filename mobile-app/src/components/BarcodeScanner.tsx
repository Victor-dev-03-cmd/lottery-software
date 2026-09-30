import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { Feather } from '@expo/vector-icons';

interface BarcodeScannerProps {
  onScanned: (code: string) => void;
  onClose: () => void;
  label?: string;
  labelSi?: string;
}

type ScanState = 'idle' | 'processing' | 'result' | 'manual';

export function BarcodeScanner({ onScanned, onClose, label = 'Scan Barcode', labelSi }: BarcodeScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [scannedCode, setScannedCode] = useState<string>('');
  const [manualInput, setManualInput] = useState<string>('');
  const cameraRef = useRef<any>(null);

  // ── Permission gate ──────────────────────────────────────────────────────────
  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#CF291D" size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Feather name="camera-off" size={48} color="#CF291D" style={{ marginBottom: 16 }} />
        <Text style={styles.permTitle}>Camera Permission Required</Text>
        <Text style={styles.permSi}>කැමරා අවසරය අවශ්‍යයි</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelLink} onPress={() => setScanState('manual')}>
          <Text style={styles.cancelLinkText}>Enter manually instead</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelLink} onPress={onClose}>
          <Text style={[styles.cancelLinkText, { color: '#9CA3AF' }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Manual entry mode ────────────────────────────────────────────────────────
  if (scanState === 'manual') {
    return (
      <View style={styles.manualContainer}>
        <View style={styles.manualHeader}>
          <Text style={styles.manualTitle}>Enter Barcode Manually</Text>
          <Text style={styles.manualSi}>අතින් ඇතුළත් කරන්න</Text>
        </View>
        <TextInput
          style={styles.manualInput}
          placeholder="e.g. 1234567"
          placeholderTextColor="#9CA3AF"
          value={manualInput}
          onChangeText={setManualInput}
          keyboardType="numeric"
          autoFocus
          maxLength={20}
        />
        <TouchableOpacity
          style={[styles.confirmBtn, !manualInput.trim() && styles.btnDisabled]}
          onPress={() => {
            if (manualInput.trim()) {
              onScanned(manualInput.trim());
            }
          }}
          disabled={!manualInput.trim()}
        >
          <Feather name="check" size={18} color="#FFFFFF" />
          <Text style={styles.confirmBtnText}>Confirm</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => { setScanState('idle'); setManualInput(''); }}
        >
          <Feather name="camera" size={16} color="#CF291D" />
          <Text style={styles.secondaryBtnText}>Back to Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={onClose}>
          <Feather name="x" size={16} color="#9CA3AF" />
          <Text style={[styles.secondaryBtnText, { color: '#9CA3AF' }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Scan result ──────────────────────────────────────────────────────────────
  if (scanState === 'result' && scannedCode) {
    return (
      <View style={styles.resultContainer}>
        <View style={styles.resultBadge}>
          <Feather name="check-circle" size={40} color="#16A34A" style={{ marginBottom: 12 }} />
          <Text style={styles.resultLabel}>{label}</Text>
          {labelSi ? <Text style={styles.resultLabelSi}>{labelSi}</Text> : null}
          <Text style={styles.resultCode}>{scannedCode}</Text>
        </View>
        <TouchableOpacity style={styles.confirmBtn} onPress={() => onScanned(scannedCode)}>
          <Feather name="check" size={18} color="#FFFFFF" />
          <Text style={styles.confirmBtnText}>Use This Code</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => { setScanState('idle'); setScannedCode(''); }}
        >
          <Feather name="refresh-cw" size={16} color="#CF291D" />
          <Text style={styles.secondaryBtnText}>Retry Scan</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => setScanState('manual')}>
          <Feather name="edit-2" size={16} color="#9CA3AF" />
          <Text style={[styles.secondaryBtnText, { color: '#9CA3AF' }]}>Enter Manually</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Camera view ──────────────────────────────────────────────────────────────
  const handleScanNow = async () => {
    if (!cameraRef.current || scanState === 'processing') return;
    setScanState('processing');
    try {
      // expo-camera v15: barcode scanning fires through onBarcodeScanned stream callback.
      // takePictureAsync gives visual feedback / future snapshot-decode hook.
      await cameraRef.current.takePictureAsync({ base64: false, quality: 0.8 });
      setScanState('idle'); // keep camera live; code arrives via onBarcodeScanned
    } catch (err: any) {
      setScanState('idle');
      Alert.alert('Camera Error', err?.message ?? 'Could not capture image.');
    }
  };

  return (
    <View style={styles.cameraContainer}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={'back' as CameraType}
        onBarcodeScanned={
          scanState !== 'processing'
            ? ({ data }) => {
                setScannedCode(data);
                setScanState('result');
              }
            : undefined
        }
        barcodeScannerSettings={{
          barcodeTypes: ['code128', 'code39', 'ean13', 'ean8', 'qr', 'interleaved2of5'],
        }}
      >
        {/* Overlay */}
        <View style={styles.overlay}>
          {/* Top bar */}
          <View style={styles.topBar}>
            <Text style={styles.labelText}>{label}</Text>
            {labelSi ? <Text style={styles.labelSi}>{labelSi}</Text> : null}
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Scanner frame */}
          <View style={styles.frameWrapper}>
            <View style={styles.frame}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
            <Text style={styles.hint}>Point at barcode and tap Scan</Text>
            <Text style={styles.hintSi}>බාර්කෝඩය දෙස ස්කෑන් ඔබන්න</Text>
          </View>

          {/* Bottom controls */}
          <View style={styles.bottomBar}>
            {scanState === 'processing' ? (
              <ActivityIndicator color="#FFFFFF" size="large" />
            ) : (
              <TouchableOpacity style={styles.scanBtn} onPress={handleScanNow}>
                <Feather name="zap" size={22} color="#FFFFFF" />
                <Text style={styles.scanBtnText}>Scan Now</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.manualLink} onPress={() => setScanState('manual')}>
              <Feather name="edit-2" size={14} color="rgba(255,255,255,0.7)" />
              <Text style={styles.manualLinkText}>Enter manually</Text>
            </TouchableOpacity>
          </View>
        </View>
      </CameraView>
    </View>
  );
}

const ACCENT = '#CF291D';

const styles = StyleSheet.create({
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'space-between',
  },
  topBar: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 20,
    paddingTop: 48,
    flexDirection: 'row',
    alignItems: 'center',
  },
  labelText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  labelSi: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    marginRight: 12,
  },
  closeBtn: {
    padding: 4,
  },
  frameWrapper: {
    alignItems: 'center',
  },
  frame: {
    width: 260,
    height: 120,
    borderRadius: 4,
    position: 'relative',
    marginBottom: 12,
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: '#FFFFFF',
    borderWidth: 3,
  },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  hint: {
    color: '#FFFFFF',
    fontSize: 13,
    textAlign: 'center',
  },
  hintSi: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 2,
  },
  bottomBar: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 24,
    alignItems: 'center',
    gap: 14,
  },
  scanBtn: {
    backgroundColor: ACCENT,
    borderRadius: 30,
    paddingHorizontal: 40,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scanBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  manualLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 4,
  },
  manualLinkText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
  },
  // Manual entry
  manualContainer: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    padding: 24,
    paddingTop: 60,
  },
  manualHeader: {
    marginBottom: 24,
  },
  manualTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1D1D1D',
  },
  manualSi: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  manualInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    fontSize: 22,
    color: '#1D1D1D',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 16,
  },
  // Result
  resultContainer: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    padding: 24,
    paddingTop: 60,
    alignItems: 'center',
  },
  resultBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    width: '100%',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 3,
  },
  resultLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },
  resultLabelSi: {
    fontSize: 10,
    color: '#9CA3AF',
    marginBottom: 12,
  },
  resultCode: {
    fontSize: 28,
    fontWeight: '800',
    color: '#16A34A',
    letterSpacing: 1,
    marginTop: 8,
  },
  // Shared buttons
  confirmBtn: {
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    justifyContent: 'center',
    marginBottom: 10,
  },
  btnDisabled: {
    opacity: 0.4,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    justifyContent: 'center',
    marginBottom: 10,
  },
  secondaryBtnText: {
    color: ACCENT,
    fontSize: 14,
    fontWeight: '600',
  },
  // Permission
  centered: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  permTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1D1D1D',
    textAlign: 'center',
  },
  permSi: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
    marginBottom: 24,
    textAlign: 'center',
  },
  permBtn: {
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginBottom: 12,
  },
  permBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelLink: {
    padding: 10,
  },
  cancelLinkText: {
    color: ACCENT,
    fontSize: 14,
  },
});
