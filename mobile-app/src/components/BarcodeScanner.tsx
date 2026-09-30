import React, { useState, useRef } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, ActivityIndicator, TextInput,
} from "react-native";
import { CameraView, CameraType, useCameraPermissions } from "expo-camera";

interface Props {
  visible: boolean;
  onScanned: (code: string) => void;
  onClose: () => void;
  label?: string;
}

export default function BarcodeScanner({ visible, onScanned, onClose, label }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned]     = useState<string | null>(null);
  const [scanning, setScanning]   = useState(false);
  const [manualMode, setManual]   = useState(false);
  const [manualValue, setManualValue] = useState("");
  const cameraRef = useRef<CameraView>(null);

  function handleBarcodeScanned({ data }: { data: string }) {
    if (scanning) {
      setScanning(false);
      // Keep only digits, trim to 11 chars
      const cleaned = data.replace(/\D/g, "").slice(0, 11);
      setScanned(cleaned || data);
    }
  }

  function handleConfirm() {
    if (scanned) {
      onScanned(scanned);
      setScanned(null);
      setScanning(false);
    }
  }

  function handleRetry() {
    setScanned(null);
    setScanning(false);
  }

  function handleManualSubmit() {
    const cleaned = manualValue.replace(/\D/g, "").slice(0, 11);
    if (cleaned) {
      onScanned(cleaned);
      setManualValue("");
      setManual(false);
      setScanned(null);
    }
  }

  function handleClose() {
    setScanned(null);
    setScanning(false);
    setManual(false);
    setManualValue("");
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={s.container}>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>📷 {label ?? "Scan Barcode"}</Text>
          <TouchableOpacity onPress={handleClose} style={s.closeBtn}>
            <Text style={s.closeTxt}>✕</Text>
          </TouchableOpacity>
        </View>

        {!permission?.granted ? (
          <View style={s.permBox}>
            <Text style={s.permText}>Camera permission is required for barcode scanning.</Text>
            <TouchableOpacity style={s.btn} onPress={requestPermission}>
              <Text style={s.btnTxt}>Grant Permission</Text>
            </TouchableOpacity>
          </View>
        ) : manualMode ? (
          /* ── Manual entry ── */
          <View style={s.manualBox}>
            <Text style={s.label}>Enter barcode manually:</Text>
            <TextInput
              style={s.manualInput}
              value={manualValue}
              onChangeText={setManualValue}
              keyboardType="numeric"
              placeholder="e.g. 62900474690"
              autoFocus
              maxLength={11}
            />
            <TouchableOpacity
              style={[s.btn, !manualValue && s.btnDisabled]}
              onPress={handleManualSubmit}
              disabled={!manualValue}>
              <Text style={s.btnTxt}>Use This Barcode</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.outlineBtn} onPress={() => setManual(false)}>
              <Text style={s.outlineTxt}>Back to Camera</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* ── Camera view ── */
          <View style={{ flex: 1 }}>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing={"back" as CameraType}
              onBarcodeScanned={scanning ? handleBarcodeScanned : undefined}
              barcodeScannerSettings={{ barcodeTypes: ["code128", "code39", "ean13", "ean8", "qr"] }}
            />

            {/* Corner overlay */}
            <View style={s.overlay}>
              <View style={s.frame}>
                <View style={[s.corner, s.tl]} />
                <View style={[s.corner, s.tr]} />
                <View style={[s.corner, s.bl]} />
                <View style={[s.corner, s.br]} />
                <Text style={s.frameHint}>
                  {scanning ? "Point at barcode…" : "Press 'Scan Now' to capture"}
                </Text>
              </View>
            </View>

            {/* Scanned result */}
            {scanned ? (
              <View style={s.resultBox}>
                <Text style={s.resultLabel}>Scanned:</Text>
                <Text style={s.resultCode}>{scanned}</Text>
                <View style={s.row}>
                  <TouchableOpacity style={[s.btn, { flex: 1, marginRight: 6 }]} onPress={handleConfirm}>
                    <Text style={s.btnTxt}>✓ Use</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.outlineBtn, { flex: 1 }]} onPress={handleRetry}>
                    <Text style={s.outlineTxt}>↩ Retry</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={s.ctrlBox}>
                <TouchableOpacity
                  style={[s.scanBtn, scanning && s.scanBtnActive]}
                  onPress={() => setScanning(true)}>
                  {scanning
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={s.scanBtnTxt}>📷  Scan Now</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={s.manualLink} onPress={() => setManual(true)}>
                  <Text style={s.manualLinkTxt}>Enter manually</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

const RED  = "#CF291D";
const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: "#000" },
  header:       { flexDirection:"row", alignItems:"center", justifyContent:"space-between", padding:16, backgroundColor:"#1D1D1D" },
  headerTitle:  { color:"#fff", fontSize:16, fontWeight:"700" },
  closeBtn:     { padding:6 },
  closeTxt:     { color:"#9CA3AF", fontSize:18, fontWeight:"700" },
  permBox:      { flex:1, alignItems:"center", justifyContent:"center", padding:24 },
  permText:     { color:"#fff", textAlign:"center", marginBottom:20, fontSize:14 },
  overlay:      { ...StyleSheet.absoluteFillObject, alignItems:"center", justifyContent:"center" },
  frame:        { width:260, height:180, alignItems:"center", justifyContent:"center" },
  frameHint:    { color:"rgba(255,255,255,0.75)", fontSize:12, marginTop:8 },
  corner:       { position:"absolute", width:24, height:24, borderColor:"#fff", borderWidth:3 },
  tl:           { top:0, left:0,  borderBottomWidth:0, borderRightWidth:0  },
  tr:           { top:0, right:0, borderBottomWidth:0, borderLeftWidth:0   },
  bl:           { bottom:0, left:0,  borderTopWidth:0, borderRightWidth:0  },
  br:           { bottom:0, right:0, borderTopWidth:0, borderLeftWidth:0   },
  resultBox:    { position:"absolute", bottom:100, left:16, right:16, backgroundColor:"rgba(0,0,0,0.85)", borderRadius:12, padding:16 },
  resultLabel:  { color:"#9CA3AF", fontSize:11, marginBottom:4 },
  resultCode:   { color:"#4ADE80", fontSize:20, fontWeight:"900", fontFamily:"monospace", marginBottom:12 },
  ctrlBox:      { position:"absolute", bottom:40, left:0, right:0, alignItems:"center" },
  scanBtn:      { backgroundColor:RED, paddingVertical:14, paddingHorizontal:40, borderRadius:30, flexDirection:"row", alignItems:"center" },
  scanBtnActive:{ backgroundColor:"#991B1B" },
  scanBtnTxt:   { color:"#fff", fontSize:16, fontWeight:"800" },
  manualLink:   { marginTop:14 },
  manualLinkTxt:{ color:"#9CA3AF", fontSize:13, textDecorationLine:"underline" },
  manualBox:    { flex:1, backgroundColor:"#fff", padding:24 },
  label:        { fontSize:13, fontWeight:"600", color:"#374151", marginBottom:8 },
  manualInput:  { borderWidth:2, borderColor:RED, borderRadius:8, padding:12, fontSize:16, fontFamily:"monospace", marginBottom:16 },
  btn:          { backgroundColor:RED, padding:14, borderRadius:8, alignItems:"center", marginBottom:8 },
  btnDisabled:  { backgroundColor:"#D1D5DB" },
  btnTxt:       { color:"#fff", fontWeight:"700", fontSize:14 },
  outlineBtn:   { borderWidth:1, borderColor:"#E5E7EB", padding:12, borderRadius:8, alignItems:"center", marginBottom:8 },
  outlineTxt:   { color:"#374151", fontWeight:"600", fontSize:14 },
  row:          { flexDirection:"row" },
});
