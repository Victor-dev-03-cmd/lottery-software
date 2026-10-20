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
