import '../models/ticket_data.dart';

class QRParser {
  // Canonical name mapping — QR uses different spellings than our database
  static const _nlbNames = {
    'ADA SAMPATHA':       'Ada Sampatha',
    'DHANA NIDHANAYA':    'Dhana Nidhanaya',
    'GOVI SETHA':         'Govi Setha',
    'GOVISETHA':          'Govi Setha',
    'HADA HANA':          'Hada Hana',
    'HANDAHANA':          'Hada Hana',
    'MAHAJANA SAMPATHA':  'Mahajana Sampatha',
    'MEGA POWER':         'Mega Power',
    'NLB JAYA':           'NLB Jaya',
    'SUBA DAWASAK':       'Suba Dasawak',
    'SUBA DASAWAK':       'Suba Dasawak',
    'AYUBO':              'Ayubo',
  };

  static const _dlbNames = {
    'ADA KOTIPATHI':         'Ada Kotipathi',
    'JAYA SAMPATHA':         'Jaya Sampatha',
    'KAPRUKA':               'Kapruka',
    'KOTIPATHI KAPRUKA':     'Kapruka',
    'LAGNA WASANAWA':        'Lagna Wasanawa',
    'LAGNA WASANA':          'Lagna Wasanawa',
    'SASIRI':                'Sasiri',
    'SHANIDA WASANAWA':      'Shanida Wasanawa',
    'SHANIDA':               'Shanida Wasanawa',
    'SUPER BALL':            'Super Ball',
    'SUPIRI DHANA SAMPATHA': 'Supiri Dana Sampatha',
    'SUPIRI DANA SAMPATHA':  'Supiri Dana Sampatha',
  };

  static TicketData? parse(String raw) {
    final text  = raw.trim();
    final upper = text.toUpperCase();

    // Detect board — startsWith is primary, contains is fallback for QR codes
    // that have a non-printable encoding header before the game name.
    final isNlb = text.contains('nlb.lk') || text.contains('r.nlb.lk') ||
                  _nlbNames.keys.any((k) => upper.startsWith(k)) ||
                  _nlbNames.keys.any((k) => upper.contains(k));
    final isDlb = text.contains('dlb.lk') || text.contains('www.dlb.lk') ||
                  _dlbNames.keys.any((k) => upper.startsWith(k)) ||
                  _dlbNames.keys.any((k) => upper.contains(k));

    if (!isNlb && !isDlb) return null;

    try {
      return isNlb ? _parseNlb(text) : _parseDlb(text);
    } catch (_) {
      return null;
    }
  }

  // NLB: "SUBA DAWASAK 0455 2026/10/13 088004550203409 ..."
  static TicketData _parseNlb(String text) {
    final upper = text.toUpperCase();

    // Find game name — startsWith first, then contains fallback
    String gameName = 'Unknown NLB';
    for (final entry in _nlbNames.entries) {
      if (upper.startsWith(entry.key) || upper.contains(entry.key)) {
        gameName = entry.value;
        break;
      }
    }

    // Date pattern: YYYY/MM/DD or YYYY-MM-DD
    final dateMatch = RegExp(r'(\d{4}[/\-]\d{2}[/\-]\d{2})').firstMatch(text);
    final drawDate = dateMatch != null
        ? dateMatch.group(1)!.replaceAll('/', '-')
        : '';

    // Draw number: first 3-4 digit standalone number after game name
    final parts = text.trim().split(RegExp(r'\s+'));
    String drawNumber = '';
    String serialNumber = '';

    for (int i = 0; i < parts.length; i++) {
      final p = parts[i];
      if (RegExp(r'^\d{3,5}$').hasMatch(p) && drawNumber.isEmpty) {
        drawNumber = p;
        continue;
      }
      // NLB serial: long number (13-15 digits)
      if (RegExp(r'^\d{10,16}$').hasMatch(p) && serialNumber.isEmpty) {
        serialNumber = p;
        break;
      }
    }

    return TicketData(
      board: 'NLB',
      gameName: gameName,
      drawNumber: drawNumber,
      drawDate: drawDate,
      serialNumber: serialNumber,
      rawQr: text,
      scannedAt: DateTime.now(),
    );
  }

  // DLB: "SUPIRI DHANA SAMPATHA 1047 2026.10.13 1047 - 672103968 - 4 - 00 ..."
  static TicketData _parseDlb(String text) {
    final upper = text.toUpperCase();

    String gameName = 'Unknown DLB';
    for (final entry in _dlbNames.entries) {
      if (upper.startsWith(entry.key) || upper.contains(entry.key)) {
        gameName = entry.value;
        break;
      }
    }

    // Date: YYYY.MM.DD or YYYY-MM-DD or YYYY/MM/DD
    final dateMatch = RegExp(r'(\d{4}[.\-/]\d{2}[.\-/]\d{2})').firstMatch(text);
    final drawDate = dateMatch != null
        ? dateMatch.group(1)!.replaceAll('.', '-').replaceAll('/', '-')
        : '';

    // Draw number: first 3-4 digit number after game name
    final parts = text.trim().split(RegExp(r'\s+'));
    String drawNumber = '';
    for (final p in parts) {
      if (RegExp(r'^\d{3,5}$').hasMatch(p)) {
        drawNumber = p;
        break;
      }
    }

    // DLB serial: "1047 - 672103968 - 4 - 00" → "1047-672103968-4-00"
    final serialMatch = RegExp(
      r'(\d{3,5})\s*[-–]\s*(\d{6,10})\s*[-–]\s*(\d{1,2})\s*[-–]\s*(\d{2})'
    ).firstMatch(text);
    final serialNumber = serialMatch != null
        ? '${serialMatch.group(1)}-${serialMatch.group(2)}-${serialMatch.group(3)}-${serialMatch.group(4)}'
        : '';

    return TicketData(
      board: 'DLB',
      gameName: gameName,
      drawNumber: drawNumber,
      drawDate: drawDate,
      serialNumber: serialNumber,
      rawQr: text,
      scannedAt: DateTime.now(),
    );
  }
}
