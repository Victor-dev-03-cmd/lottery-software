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

    // Game name — startsWith first, then contains fallback
    String gameName = 'Unknown NLB';
    for (final entry in _nlbNames.entries) {
      if (upper.startsWith(entry.key) || upper.contains(entry.key)) {
        gameName = entry.value;
        break;
      }
    }

    // Date: YYYY/MM/DD or YYYY-MM-DD
    final dateMatch = RegExp(r'(\d{4}[/\-]\d{2}[/\-]\d{2})').firstMatch(text);
    final drawDate = dateMatch != null
        ? dateMatch.group(1)!.replaceAll('/', '-')
        : '';

    // Draw number: first standalone 3-5 digit token
    final parts = text.trim().split(RegExp(r'\s+'));
    String drawNumber = '';
    String serialNumber = '';

    for (final p in parts) {
      if (RegExp(r'^\d{3,5}$').hasMatch(p) && drawNumber.isEmpty) {
        drawNumber = p;
        continue;
      }
      // NLB serial: standalone 10-16 digit token (barcode on ticket)
      if (RegExp(r'^\d{10,16}$').hasMatch(p) && serialNumber.isEmpty) {
        serialNumber = p;
        break;
      }
    }

    // Fallback: scan the full text for any contiguous 9-16 digit sequence
    // (handles QR codes where barcode is not space-separated)
    if (serialNumber.isEmpty) {
      final allNums = RegExp(r'\d{9,16}').allMatches(text);
      for (final m in allNums) {
        final n = m.group(0)!;
        // Skip if it looks like a date (8 digits) or draw number
        if (n != drawNumber && n.length >= 9) {
          serialNumber = n;
          break;
        }
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

  // DLB: "SASIRI 1143 2026.10.13 1143 - 23456 - 2 - 15 ..."
  //      "SUPIRI DHANA SAMPATHA 1047 2026.10.13 1047 - 672103968 - 4 - 00 ..."
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

    // Draw number: first standalone 3-5 digit token
    final parts = text.trim().split(RegExp(r'\s+'));
    String drawNumber = '';
    for (final p in parts) {
      if (RegExp(r'^\d{3,5}$').hasMatch(p)) {
        drawNumber = p;
        break;
      }
    }

    // DLB serial pattern: "draw - serial - section - ticket"
    // Digit ranges made permissive to handle all DLB game formats:
    //   serial: 2-12 digits (some games have 4-5 digit serials, others 9)
    //   section: 1-4 digits
    //   ticket: 1-4 digits
    final serialMatch = RegExp(
      r'(\d{3,6})\s*[-–]\s*(\d{2,12})\s*[-–]\s*(\d{1,4})\s*[-–]\s*(\d{1,4})'
    ).firstMatch(text);

    String serialNumber = '';
    if (serialMatch != null) {
      serialNumber =
          '${serialMatch.group(1)!}-${serialMatch.group(2)!}-'
          '${serialMatch.group(3)!}-${serialMatch.group(4)!}';
    } else {
      // Fallback 1: 3-group pattern (no draw prefix in serial)
      final m3 = RegExp(
        r'(\d{3,12})\s*[-–]\s*(\d{1,4})\s*[-–]\s*(\d{1,4})'
      ).firstMatch(text);
      if (m3 != null) {
        serialNumber = '${m3.group(1)!}-${m3.group(2)!}-${m3.group(3)!}';
      } else {
        // Fallback 2: any standalone numeric token 5-14 digits (≠ draw number)
        for (final p in parts) {
          if (RegExp(r'^\d{5,14}$').hasMatch(p) && p != drawNumber) {
            serialNumber = p;
            break;
          }
        }
        // Fallback 3: regex scan for contiguous 5-14 digit sequences
        if (serialNumber.isEmpty) {
          final allNums = RegExp(r'\d{5,14}').allMatches(text);
          for (final m in allNums) {
            final n = m.group(0)!;
            if (n != drawNumber) {
              serialNumber = n;
              break;
            }
          }
        }
      }
    }

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
