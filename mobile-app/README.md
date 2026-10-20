# Lottery Mobile Scanner

Flutter companion app for Ajith Rohana Enterprise lottery ticket management.
Scans NLB/DLB lottery QR codes and sends parsed data to the desktop Tauri app via Supabase Realtime.

---

## Build

### Prerequisites

- Flutter SDK >= 3.16.0
- Android SDK (API 21+)
- Java 17+

### Install dependencies

```bash
flutter pub get
```

### Build release APK

```bash
flutter build apk --release
```

Output: `build/app/outputs/flutter-apk/app-release.apk`

### Run in debug mode

```bash
flutter run
```

---

## How pairing works

1. On the desktop Tauri app go to **Settings → Backup & Security → Mobile Companion**.
   The desktop generates a pairing QR code encoding a URI of the form:

   ```
   lottery://pair?session=ABCD1234&url=https://your-project.supabase.co&key=eyJhbGci...
   ```

2. On the phone open the app and tap the link icon in the top-right corner (or the app
   will prompt to pair on first launch).

3. Tap **Scan Desktop QR** and point the camera at the QR on screen.

4. The app:
   - Initialises the Supabase client with the provided URL + anon key
   - Stores them in `SharedPreferences` for future launches
   - Subscribes to the Realtime channel `lottery-session-<sessionId>`

5. Every ticket scanned on the phone is broadcast over that channel as event
   `ticket_scanned` with the payload:

   ```json
   {
     "action": "stock_purchase | stock_return | invoice | winning",
     "ticket": { "board": "NLB", "game_name": "...", "draw_number": "...",
                 "draw_date": "...", "serial_number": "...", "raw_qr": "...",
                 "scanned_at": "2026-10-20T12:00:00.000Z" }
   }
   ```

6. The desktop Tauri app receives the broadcast and inserts the data into the appropriate
   form / table automatically.

Pairing works over **any** network (same WiFi, mobile data, VPN) because Supabase Realtime
is cloud-hosted.

---

## QR format parsing (`lib/services/qr_parser.dart`)

### NLB format

```
SUBA DAWASAK 0455 2026/10/13 088004550203409 Virgo Capricornus 18 29 49 https://r.nlb.lk/...
```

| Field        | Extraction rule                                    |
|--------------|-----------------------------------------------------|
| Game name    | Prefix match against known NLB names (uppercase)   |
| Draw number  | First 3-5 digit standalone token after game name   |
| Draw date    | Regex `\d{4}[/\-]\d{2}[/\-]\d{2}`, normalised to `YYYY-MM-DD` |
| Serial       | First 10-16 digit standalone token                 |
| Board detect | Contains `nlb.lk` OR prefix matches NLB name table |

### DLB format

```
SUPIRI DHANA SAMPATHA 1047 2026.10.13 1047 - 672103968 - 4 - 00 Y 7 6 9 8 7 9 828 293 www.dlb.lk
```

| Field        | Extraction rule                                                    |
|--------------|--------------------------------------------------------------------|
| Game name    | Prefix match against known DLB names (uppercase)                  |
| Draw number  | First 3-5 digit standalone token                                   |
| Draw date    | Regex `\d{4}[.\-/]\d{2}[.\-/]\d{2}`, normalised to `YYYY-MM-DD`  |
| Serial       | Pattern `NNN - NNNNNNNN - N - NN` joined with dashes               |
| Board detect | Contains `dlb.lk` OR prefix matches DLB name table                |

Both parsers include a canonical name map so QR text variants (e.g. `SUBA DAWASAK` vs
`SUBA DASAWAK`) always resolve to the same database name used by the desktop app.

---

## Screens

| Screen          | Action sent to desktop  | Notes                              |
|-----------------|-------------------------|------------------------------------|
| Purchases       | `stock_purchase`        | Populates barcode-start field      |
| Returns         | `stock_return`          | Includes return reason text        |
| Invoice         | `invoice`               | Batch scan, deduplicates by serial |
| Winning Tickets | `winning`               | Heavy haptic on scan               |
