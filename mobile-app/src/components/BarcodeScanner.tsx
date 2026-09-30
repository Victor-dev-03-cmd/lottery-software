/**
 * BarcodeScanner — full-screen camera component (no internal Modal).
 * The parent is responsible for showing/hiding this component in a Modal.
 *
 * Usage:
 *   if (showScanner) {
 *     return <BarcodeScanner onScanned={handleScanned} onClose={() => setShow(false)} />;
 *   }
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, StatusBar,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  onScanned: (code: string) => void;
  onClose:   () => void;
  label?:    string;
  labelSi?:  string;
  // Legacy prop — accepted but ignored (parent handles modal visibility)
  visible?:  boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function BarcodeScanner({ onScanned, onClose, label, labelSi }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned,     setScanned]       = useState<string | null>(null);
  const [manualMode,  setManual]        = useState(false);
  const [manualValue, setManualValue]   = useState('');
  const [cameraReady, setCameraReady]   = useState(false);

  // Request permission on mount
  useEffect(() => {
    if (permission !== null && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function handleBarcodeScanned({ data }: { data: string }) {
    if (scanned) return;                          // already have one, wait for confirm
    const cleaned = data.replace(/\D/g, '').slice(0, 11);
    setScanned(cleaned || data);
  }

  function handleConfirm() {
    if (!scanned) return;
    onScanned(scanned);
    reset();
  }

  function handleManualSubmit() {
    const cleaned = manualValue.replace(/\D/g, '').slice(0, 11);
    if (!cleaned) return;
    onScanned(cleaned);
    reset();
  }

  function reset() {
    setScanned(null);
    setManual(false);
    setManualValue('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* ── Header ── */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>📷 {label ?? 'Scan Barcode'}</Text>
          {labelSi && <Text style={s.headerSi}>{labelSi}</Text>}
        </View>
        <TouchableOpacity onPress={handleClose} style={s.closeBtn} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
          <Text style={s.closeTxt}>✕  Close</Text>
        </TouchableOpacity>
      </View>

      {/* ── Permission gate ── */}
      {permission === null ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#CF291D" />
          <Text style={s.infoTxt}>Checking camera permission…</Text>
        </View>

      ) : !permission.granted ? (
        <View style={s.center}>
          <Text style={s.emoji}>📷</Text>
          <Text style={s.permTitle}>Camera Access Required</Text>
          <Text style={s.infoTxt}>
            Camera permission is needed to scan lottery barcodes.
          </Text>
          {permission.canAskAgain ? (
            <TouchableOpacity style={s.btn} onPress={requestPermission}>
              <Text style={s.btnTxt}>Grant Camera Permission</Text>
            </TouchableOpacity>
          ) : (
            <Text style={[s.infoTxt, { color: '#EF4444', marginTop: 8 }]}>
              Permission denied. Please enable camera access in your device Settings app.
            </Text>
          )}
          <TouchableOpacity style={s.outlineBtn} onPress={() => setManual(true)}>
            <Text style={s.outlineTxt}>Enter barcode manually instead</Text>
          </TouchableOpacity>
        </View>

      ) : manualMode ? (
        /* ── Manual entry ── */
        <View style={s.manualBox}>
          <Text style={s.permTitle}>Manual Barcode Entry</Text>
          <Text style={[s.infoTxt, { marginBottom: 16 }]}>
            Type the barcode number (11 digits)
          </Text>
          <TextInput
            style={s.manualInput}
            value={manualValue}
            onChangeText={setManualValue}
            keyboardType="numeric"
            placeholder="e.g. 62900474690"
            placeholderTextColor="#9CA3AF"
            autoFocus
            maxLength={11}
            returnKeyType="done"
            onSubmitEditing={handleManualSubmit}
          />
          <Text style={s.charCount}>{manualValue.length} / 11 digits</Text>
          <TouchableOpacity
            style={[s.btn, !manualValue && s.btnOff]}
            onPress={handleManualSubmit}
            disabled={!manualValue}>
            <Text style={s.btnTxt}>✓  Use This Barcode</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.outlineBtn} onPress={() => setManual(false)}>
            <Text style={s.outlineTxt}>← Back to Camera</Text>
          </TouchableOpacity>
        </View>

      ) : (
        /* ── Camera live view ── */
        <View style={{ flex: 1 }}>
          {/* Camera fills screen */}
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            onCameraReady={() => setCameraReady(true)}
            onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: ['code128', 'code39', 'ean13', 'ean8', 'itf14', 'qr'],
            }}
          />

          {/* Loading overlay until camera is ready */}
          {!cameraReady && (
            <View style={[StyleSheet.absoluteFill, s.camLoading]}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={s.infoTxt}>Starting camera…</Text>
            </View>
          )}

          {/* Target frame overlay */}
          <View style={s.overlay} pointerEvents="none">
            <View style={s.frameBorder}>
              <View style={[s.corner, s.tl]} />
              <View style={[s.corner, s.tr]} />
              <View style={[s.corner, s.bl]} />
              <View style={[s.corner, s.br]} />
            </View>
            <Text style={s.frameHint}>
              {scanned ? '' : 'Align barcode inside the frame'}
            </Text>
          </View>

          {/* Scanned result banner */}
          {scanned ? (
            <View style={s.resultBox}>
              <Text style={s.resultLbl}>Barcode Captured ✓</Text>
              <Text style={s.resultCode}>{scanned}</Text>
              <View style={s.row}>
                <TouchableOpacity style={[s.btn, { flex: 1, marginRight: 8 }]} onPress={handleConfirm}>
                  <Text style={s.btnTxt}>✓  Use</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.outlineBtn, { flex: 1 }]} onPress={reset}>
                  <Text style={s.outlineTxt}>↩  Retry</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            /* Bottom controls */
            <View style={s.ctrlBox}>
              <Text style={s.scanHint}>
                {cameraReady ? 'Camera active — point at barcode' : 'Initialising…'}
              </Text>
              <TouchableOpacity style={s.manualLink} onPress={() => setManual(true)}>
                <Text style={s.manualLinkTxt}>⌨  Enter manually</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const RED = '#CF291D';

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: '#000' },
  header:       { flexDirection:'row', alignItems:'center', justifyContent:'space-between',
                  paddingHorizontal:16, paddingVertical:14, backgroundColor:'#111827' },
  headerTitle:  { color:'#F1F5F9', fontSize:16, fontWeight:'700' },
  headerSi:     { color:'#64748B', fontSize:10, marginTop:2 },
  closeBtn:     { padding:4 },
  closeTxt:     { color:'#EF4444', fontSize:14, fontWeight:'700' },

  center:       { flex:1, alignItems:'center', justifyContent:'center', padding:32, backgroundColor:'#111827' },
  emoji:        { fontSize:48, marginBottom:16 },
  permTitle:    { color:'#F1F5F9', fontSize:18, fontWeight:'800', textAlign:'center', marginBottom:8 },
  infoTxt:      { color:'#94A3B8', fontSize:13, textAlign:'center', lineHeight:20 },

  btn:          { backgroundColor:RED, padding:15, borderRadius:10, alignItems:'center', marginBottom:10, width:'100%' },
  btnOff:       { backgroundColor:'#374151' },
  btnTxt:       { color:'#fff', fontWeight:'800', fontSize:15 },
  outlineBtn:   { borderWidth:1, borderColor:'#374151', padding:13, borderRadius:10,
                  alignItems:'center', marginBottom:8, width:'100%' },
  outlineTxt:   { color:'#94A3B8', fontWeight:'600', fontSize:14 },

  manualBox:    { flex:1, backgroundColor:'#111827', padding:24, paddingTop:32 },
  manualInput:  { borderWidth:2, borderColor:RED, borderRadius:10, padding:14,
                  fontSize:20, fontFamily:'monospace', color:'#F1F5F9',
                  backgroundColor:'#1E293B', marginBottom:4, letterSpacing:2 },
  charCount:    { color:'#64748B', fontSize:11, textAlign:'right', marginBottom:16 },

  overlay:      { ...StyleSheet.absoluteFillObject, alignItems:'center', justifyContent:'center' },
  frameBorder:  { width:260, height:160, position:'relative' },
  corner:       { position:'absolute', width:28, height:28, borderColor:'#fff', borderWidth:3 },
  tl:           { top:0,    left:0,   borderBottomWidth:0, borderRightWidth:0  },
  tr:           { top:0,    right:0,  borderBottomWidth:0, borderLeftWidth:0   },
  bl:           { bottom:0, left:0,   borderTopWidth:0,    borderRightWidth:0  },
  br:           { bottom:0, right:0,  borderTopWidth:0,    borderLeftWidth:0   },
  frameHint:    { color:'rgba(255,255,255,0.75)', fontSize:12, textAlign:'center', marginTop:12 },

  camLoading:   { backgroundColor:'rgba(0,0,0,0.6)', alignItems:'center', justifyContent:'center', gap:12 },

  resultBox:    { position:'absolute', bottom:0, left:0, right:0,
                  backgroundColor:'rgba(0,0,0,0.92)', padding:20 },
  resultLbl:    { color:'#4ADE80', fontSize:12, fontWeight:'700', marginBottom:4 },
  resultCode:   { color:'#FFFFFF', fontSize:22, fontWeight:'900', fontFamily:'monospace',
                  letterSpacing:2, marginBottom:14 },
  row:          { flexDirection:'row' },

  ctrlBox:      { position:'absolute', bottom:30, left:0, right:0, alignItems:'center' },
  scanHint:     { color:'rgba(255,255,255,0.7)', fontSize:12, marginBottom:12 },
  manualLink:   { paddingVertical:10, paddingHorizontal:20 },
  manualLinkTxt:{ color:'#94A3B8', fontSize:14, textDecorationLine:'underline' },
});
