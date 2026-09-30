/**
 * BarcodeScanner — uses world-class multi-frame verification pipeline.
 * See src/utils/barcodeValidation.ts for the validation/verification logic.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, StatusBar,
  Animated, Vibration,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  FrameVerifier, cleanDigits, validateCandidate, dbg,
} from '../utils/barcodeValidation';

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  onScanned: (code: string) => void;
  onClose:   () => void;
  label?:    string;
  labelSi?:  string;
  visible?:  boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function BarcodeScanner({ onScanned, onClose, label, labelSi }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady,    setCameraReady]   = useState(false);
  const [manualMode,     setManual]        = useState(false);
  const [manualValue,    setManualValue]   = useState('');

  // Live pipeline state
  const [confidence,     setConfidence]    = useState(0);
  const [liveCode,       setLiveCode]      = useState('');
  const [liveType,       setLiveType]      = useState('');
  const [pipelineMsg,    setPipelineMsg]   = useState('');  // reject reason or status
  const [accepted,       setAccepted]      = useState(false);

  // Animations
  const confAnim  = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Verifier — one instance per scanner open, reset on close
  const verifier   = useRef(new FrameVerifier());
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Permission request ────────────────────────────────────────────────────
  useEffect(() => {
    if (permission !== null && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission]);

  // ── Confidence bar animation ──────────────────────────────────────────────
  useEffect(() => {
    Animated.timing(confAnim, {
      toValue: confidence,
      duration: 120,
      useNativeDriver: false,
    }).start();
  }, [confidence]);

  // ── Pulse on accept ───────────────────────────────────────────────────────
  useEffect(() => {
    if (accepted) {
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 100, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 100, useNativeDriver: true }),
      ]).start();
    }
  }, [accepted]);

  // ── Core scan handler ─────────────────────────────────────────────────────
  const handleBarcodeScanned = useCallback(
    ({ data, type }: { data: string; type: string }) => {
      if (accepted) return;

      dbg('camera:raw', { data, type });

      // Reset idle timer
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => {
        verifier.current.reset();
        setConfidence(0);
        setLiveCode('');
        setLiveType('');
        setPipelineMsg('');
        dbg('idle:reset', 'No scan for 4s, verifier cleared');
      }, 4000);

      const {
        confidence:   conf,
        ready,
        acceptedCode,
        rejectedReason,
      } = verifier.current.feed(data, type);

      // Update live display (shows current candidate even before accept)
      const cleanedData = cleanDigits(data);
      setLiveCode(cleanedData);
      setLiveType(type);
      setConfidence(conf);
      setPipelineMsg(rejectedReason ?? '');

      if (ready && acceptedCode) {
        dbg('ACCEPTED', { code: acceptedCode, type, streak: verifier.current.currentStreak });
        setAccepted(true);
        Vibration.vibrate(80);
        setTimeout(() => {
          onScanned(acceptedCode);
          handleClose();
        }, 600);
      }
    },
    [accepted, onScanned]
  );

  // ── Manual submit ─────────────────────────────────────────────────────────
  function handleManualSubmit() {
    const code = cleanDigits(manualValue);
    if (!code || code.length < 6) return;
    dbg('manual:submit', { code });
    Vibration.vibrate(60);
    onScanned(code);
    handleClose();
  }

  // ── Close / reset ─────────────────────────────────────────────────────────
  function handleClose() {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    verifier.current.reset();
    setConfidence(0); setLiveCode(''); setLiveType('');
    setPipelineMsg(''); setManual(false); setManualValue('');
    setAccepted(false); setCameraReady(false);
    onClose();
  }

  // ── Confidence bar color ──────────────────────────────────────────────────
  const confColor = confidence < 0.4 ? '#F59E0B'
    : confidence < 0.99             ? '#3B82F6'
    : '#22C55E';

  const confWidth = confAnim.interpolate({
    inputRange: [0, 1], outputRange: ['0%', '100%'],
  });

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>📷 {label ?? 'Scan Barcode'}</Text>
          {labelSi && <Text style={s.headerSi}>{labelSi}</Text>}
        </View>
        <TouchableOpacity onPress={handleClose} style={s.closeBtn}
          hitSlop={{ top:8, bottom:8, left:12, right:12 }}>
          <Text style={s.closeTxt}>✕  Close</Text>
        </TouchableOpacity>
      </View>

      {/* Permission loading */}
      {permission === null && (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#CF291D" />
          <Text style={s.infoTxt}>Checking camera permission…</Text>
        </View>
      )}

      {/* Permission denied */}
      {permission !== null && !permission.granted && (
        <View style={s.center}>
          <Text style={s.emoji}>📷</Text>
          <Text style={s.permTitle}>Camera Access Required</Text>
          <Text style={s.infoTxt}>Allow camera access to scan lottery barcodes.</Text>
          {permission.canAskAgain ? (
            <TouchableOpacity style={s.btn} onPress={requestPermission}>
              <Text style={s.btnTxt}>Grant Camera Permission</Text>
            </TouchableOpacity>
          ) : (
            <Text style={[s.infoTxt, { color:'#EF4444', marginTop:8 }]}>
              Permission denied. Enable camera in device Settings.
            </Text>
          )}
          <TouchableOpacity style={s.outlineBtn} onPress={() => setManual(true)}>
            <Text style={s.outlineTxt}>⌨  Enter manually</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Manual entry */}
      {permission?.granted && manualMode && (
        <View style={s.manualBox}>
          <Text style={s.permTitle}>Manual Barcode Entry</Text>
          <Text style={s.infoTxt}>Type digits — hyphens/spaces optional</Text>
          <TextInput
            style={s.manualInput}
            value={manualValue}
            onChangeText={setManualValue}
            keyboardType="numeric"
            placeholder="e.g. 3125-130631350-2-09"
            placeholderTextColor="#475569"
            autoFocus
            maxLength={28}
            returnKeyType="done"
            onSubmitEditing={handleManualSubmit}
          />
          <Text style={s.charCount}>{cleanDigits(manualValue).length} digits</Text>
          <TouchableOpacity
            style={[s.btn, cleanDigits(manualValue).length < 6 && s.btnOff]}
            onPress={handleManualSubmit}
            disabled={cleanDigits(manualValue).length < 6}>
            <Text style={s.btnTxt}>✓  Use This Barcode</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.outlineBtn} onPress={() => setManual(false)}>
            <Text style={s.outlineTxt}>← Back to Camera</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Camera view */}
      {permission?.granted && !manualMode && (
        <View style={{ flex:1 }}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            onCameraReady={() => setCameraReady(true)}
            onBarcodeScanned={accepted ? undefined : handleBarcodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: [
                'code128', 'code39', 'code93', 'codabar',
                'ean13',   'ean8',   'upc_a', 'upc_e',
                'itf14',   'pdf417', 'datamatrix', 'qr',
              ],
            }}
          />

          {/* Camera loading overlay */}
          {!cameraReady && (
            <View style={[StyleSheet.absoluteFill, s.camLoading]}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={s.infoTxt}>Starting camera…</Text>
            </View>
          )}

          {/* Frame target + pipeline overlay */}
          <View style={s.overlay} pointerEvents="none">
            <Animated.View style={[
              s.frameBorder,
              accepted && s.frameBorderOk,
              { transform:[{ scale: pulseAnim }] },
            ]}>
              <View style={[s.corner, s.tl, accepted && s.cornerOk]} />
              <View style={[s.corner, s.tr, accepted && s.cornerOk]} />
              <View style={[s.corner, s.bl, accepted && s.cornerOk]} />
              <View style={[s.corner, s.br, accepted && s.cornerOk]} />

              {/* Live candidate code */}
              {liveCode !== '' && !accepted && (
                <View style={s.livePreview}>
                  <Text style={s.liveCode}>{liveCode}</Text>
                  {liveType !== '' && (
                    <Text style={s.liveType}>{liveType.toUpperCase()} · {liveCode.length}d</Text>
                  )}
                </View>
              )}

              {accepted && (
                <View style={s.acceptedBadge}>
                  <Text style={s.acceptedTxt}>✓  VERIFIED</Text>
                </View>
              )}
            </Animated.View>

            <Text style={s.frameHint}>
              {accepted         ? 'Barcode verified ✓'
               : liveCode !== '' ? `Verifying… ${Math.round(confidence * 100)}%`
               : 'Align barcode inside frame'}
            </Text>
          </View>

          {/* Confidence pipeline panel */}
          <View style={s.pipeline}>
            {/* Progress bar */}
            <View style={s.confTrack}>
              <Animated.View style={[s.confFill, { width: confWidth, backgroundColor: confColor }]} />
            </View>

            {/* Stage indicators */}
            <View style={s.stages}>
              {[
                { icon:'🎯', label:'Detect',   active: liveCode !== '' },
                { icon:'✅', label:'Validate', active: confidence > 0   },
                { icon:'🔄', label:'Verify',   active: confidence > 0.33},
                { icon:'🔒', label:'Accept',   active: confidence >= 1  },
              ].map(st => (
                <View key={st.label} style={s.stage}>
                  <Text style={[s.stageIcon, !st.active && s.stageDim]}>{st.icon}</Text>
                  <Text style={[s.stageLbl,  !st.active && s.stageDim]}>{st.label}</Text>
                </View>
              ))}
            </View>

            {/* Reject reason */}
            {pipelineMsg !== '' && (
              <Text style={s.rejectMsg} numberOfLines={2}>⚠ {pipelineMsg}</Text>
            )}

            {/* Confidence detail */}
            {liveCode !== '' && !accepted && confidence > 0 && (
              <Text style={s.confScore}>
                {Math.round(confidence * 100)}% · {verifier.current.currentStreak}/3 consistent frames
              </Text>
            )}
          </View>

          {/* Bottom controls */}
          <View style={s.bottom}>
            <TouchableOpacity style={s.manualLink} onPress={() => setManual(true)}>
              <Text style={s.manualLinkTxt}>⌨  Enter manually</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const RED = '#CF291D';

const s = StyleSheet.create({
  root:         { flex:1, backgroundColor:'#000' },
  header:       { flexDirection:'row', alignItems:'center', justifyContent:'space-between',
                  paddingHorizontal:16, paddingVertical:14, backgroundColor:'#0F172A',
                  borderBottomWidth:1, borderBottomColor:'#1E293B' },
  headerTitle:  { color:'#F1F5F9', fontSize:15, fontWeight:'700' },
  headerSi:     { color:'#475569', fontSize:10, marginTop:2 },
  closeBtn:     { padding:4 },
  closeTxt:     { color:'#EF4444', fontSize:13, fontWeight:'700' },
  center:       { flex:1, alignItems:'center', justifyContent:'center', padding:32, backgroundColor:'#0F172A' },
  emoji:        { fontSize:48, marginBottom:16 },
  permTitle:    { color:'#F1F5F9', fontSize:18, fontWeight:'800', textAlign:'center', marginBottom:8 },
  infoTxt:      { color:'#94A3B8', fontSize:13, textAlign:'center', lineHeight:20 },
  btn:          { backgroundColor:RED, padding:15, borderRadius:10, alignItems:'center', marginBottom:10, width:'100%' },
  btnOff:       { backgroundColor:'#374151' },
  btnTxt:       { color:'#fff', fontWeight:'800', fontSize:15 },
  outlineBtn:   { borderWidth:1, borderColor:'#334155', padding:13, borderRadius:10, alignItems:'center', marginBottom:8, width:'100%' },
  outlineTxt:   { color:'#94A3B8', fontWeight:'600', fontSize:14 },
  manualBox:    { flex:1, backgroundColor:'#0F172A', padding:24, paddingTop:32 },
  manualInput:  { borderWidth:2, borderColor:RED, borderRadius:10, padding:14,
                  fontSize:18, fontFamily:'monospace', color:'#F1F5F9',
                  backgroundColor:'#1E293B', marginBottom:4, letterSpacing:1 },
  charCount:    { color:'#475569', fontSize:11, textAlign:'right', marginBottom:16 },
  overlay:      { ...StyleSheet.absoluteFillObject, alignItems:'center', justifyContent:'center' },
  frameBorder:  { width:280, height:170, position:'relative', alignItems:'center', justifyContent:'center' },
  frameBorderOk:{ },
  corner:       { position:'absolute', width:28, height:28, borderColor:'rgba(255,255,255,0.8)', borderWidth:3 },
  cornerOk:     { borderColor:'#22C55E' },
  tl:           { top:0,    left:0,   borderBottomWidth:0, borderRightWidth:0 },
  tr:           { top:0,    right:0,  borderBottomWidth:0, borderLeftWidth:0  },
  bl:           { bottom:0, left:0,   borderTopWidth:0,    borderRightWidth:0 },
  br:           { bottom:0, right:0,  borderTopWidth:0,    borderLeftWidth:0  },
  livePreview:  { alignItems:'center', backgroundColor:'rgba(0,0,0,0.75)', borderRadius:8, paddingHorizontal:12, paddingVertical:5 },
  liveCode:     { color:'#FCD34D', fontSize:13, fontFamily:'monospace', fontWeight:'800', letterSpacing:1 },
  liveType:     { color:'#475569', fontSize:9, marginTop:1 },
  acceptedBadge:{ backgroundColor:'rgba(34,197,94,0.92)', paddingHorizontal:18, paddingVertical:8, borderRadius:20 },
  acceptedTxt:  { color:'#fff', fontSize:16, fontWeight:'900', letterSpacing:1 },
  frameHint:    { color:'rgba(255,255,255,0.6)', fontSize:12, textAlign:'center', marginTop:14 },
  camLoading:   { backgroundColor:'rgba(0,0,0,0.7)', alignItems:'center', justifyContent:'center', gap:12 },
  pipeline:     { position:'absolute', bottom:56, left:0, right:0, paddingHorizontal:20 },
  confTrack:    { height:5, backgroundColor:'rgba(255,255,255,0.1)', borderRadius:3, marginBottom:9, overflow:'hidden' },
  confFill:     { height:'100%', borderRadius:3 },
  stages:       { flexDirection:'row', justifyContent:'space-between', marginBottom:6 },
  stage:        { alignItems:'center', gap:2 },
  stageIcon:    { fontSize:13 },
  stageLbl:     { color:'rgba(255,255,255,0.75)', fontSize:9, fontWeight:'600' },
  stageDim:     { opacity:0.25 },
  rejectMsg:    { color:'#FBBF24', fontSize:10, textAlign:'center', marginBottom:4, lineHeight:14 },
  confScore:    { color:'rgba(255,255,255,0.4)', fontSize:10, textAlign:'center' },
  bottom:       { position:'absolute', bottom:0, left:0, right:0, paddingBottom:14, alignItems:'center', backgroundColor:'rgba(0,0,0,0.45)' },
  manualLink:   { paddingVertical:10, paddingHorizontal:20 },
  manualLinkTxt:{ color:'#64748B', fontSize:13, textDecorationLine:'underline' },
});
