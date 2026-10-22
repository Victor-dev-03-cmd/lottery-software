class TicketData {
  final String board;        // 'NLB' or 'DLB'
  final String gameName;
  final String drawNumber;
  final String drawDate;
  final String serialNumber;
  final String rawQr;
  final DateTime scannedAt;

  TicketData({
    required this.board,
    required this.gameName,
    required this.drawNumber,
    required this.drawDate,
    required this.serialNumber,
    required this.rawQr,
    required this.scannedAt,
  });

  /// The numeric barcode to use as barcode_start in the purchases form.
  /// NLB: serialNumber as-is (already numeric).
  /// DLB: strip dashes — "1047-672103968-4-00" → "1047672103968400".
  String get barcodeStart {
    if (board == 'NLB') return serialNumber;
    return serialNumber.replaceAll('-', '').replaceAll(' ', '');
  }

  Map<String, dynamic> toJson() => {
    'board':         board,
    'game_name':     gameName,
    'draw_number':   drawNumber,
    'draw_date':     drawDate,
    'serial_number': serialNumber,
    'raw_qr':        rawQr,
    'scanned_at':    scannedAt.toIso8601String(),
  };
}
