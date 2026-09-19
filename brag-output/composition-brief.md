# Hyperframes Composition Brief: Ajith Rohana Enterprises — Lottery Manager

## Objective
Create a 20-second cinematic launch video for Ajith Rohana Enterprises Lottery Manager — an AI-powered Tauri v2 + React desktop app for Sri Lankan NLB/DLB wholesale lottery distributors.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 20 seconds

## Source Material
- Project root: `/media/laxsan_victor/.../lottery_software`
- Primary files read: `index.html`, `src/App.tsx`, `src/components/AIAnalytics.tsx`, `src/components/AgentDashboard.tsx`, `src/index.css`
- Product name: Ajith Rohana Enterprises — Lottery Manager
- Tagline: "Your business. Under control."
- Key UI moments recreated:
  - AI Business Intelligence dashboard: Business Health Score dial (40→75), revenue/profit/collection stats
  - Inventory velocity table: MEGA POWER, Ada Kotipathi, Super Ball with days-remaining indicators
  - Agent credit control: Chaminda Silva (CRITICAL), Prasad Bandara (HIGH), Execute action + SUCCESS flow
- Copy verbatim:
  - "WHOLESALE LOTTERY. MANAGED BY AI."
  - "AI Business Intelligence"
  - "AJITH ROHANA ENTERPRISES"
  - "LOTTERY MANAGER"
  - "Your business. Under control."
  - "Contact us for a demo"

## Creative Direction
- Tone preset: `cinematic`
- Creative direction: high-end corporate transformation film for Sri Lankan wholesale lottery distribution
- Interpretation: Epic declarative text, dark charcoal backgrounds, strong red accent (#CF291D), dramatic reveals, product-first — the app is the hero
- Angle: Wholesale lottery distribution upgraded from paper ledgers to AI-powered intelligence
- Hook: "WHOLESALE LOTTERY. / MANAGED BY AI." — two lines slam in sequentially on black
- Outro punchline: Full-bleed dark screen. Logo, company name slams on strong cue. "Your business. Under control."
- Avoid: Generic SaaS language. Abstract motion filler. Any visual that could belong to a different product.

## Visual Identity
- Background: #0E0E0E (scenes 1 and 5), #161616 (dashboard scenes)
- Text: #FFFFFF
- Accent: #CF291D (red — from `C.red` in AgentDashboard.tsx)
- Display font: system-ui (Inter equivalent on Linux/macOS)
- Visual references: Business Health Score dial, red CRITICAL badges, dark card panels with left red border

## Storyboard (5 scenes, 20s total)
1. Hook — 3.7s — "WHOLESALE LOTTERY." + "MANAGED BY AI." slam in on black with red/white large type
2. Dashboard — 4.7s — Dial animates 40→75, 3 stat tiles pop in counting up: Rs.478,250 / Rs.212,593 / 84%
3. Inventory — 3.7s — 3 rows slide in from right: MEGA POWER 12d / Ada Kotipathi 5d / Super Ball 2d REORDER
4. Agent Credit — 4.2s — 2 agent rows slide in, AI bubble, Execute click (cursor sim), Token Verified, SUCCESS banner
5. Outro — 4.5s — Logo + company name slams at 17.47s strong cue + tagline + CTA

## Audio
- Audio role: cinematic bed, building through scenes, swelling toward logo slam
- Audio arc: steady vol-12 bed → peaks at Execute/SUCCESS → strong logo slam → fade out at 19s
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3`
- Music treatment: data-volume="0.35", fade to 0 at 19.0s over 1s
- Music cue guidance: bundled preset (vol-12, 109.96 BPM). Beat-locked moments:
  - Row 2 inventory reveal: 8.74s (strong cue, 0.99)
  - Execute button click: 13.11s (strong cue, 0.98)
  - Company name final slam: 17.47s (strong cue, 0.99)
- Audio-reactive treatment: subtle; dialRing drop-shadow breathes with bass; s5-company textShadow glows with treble. Per-frame AUDIO_DATA loaded from `assets/music/cues/audio-data-20s.js`.
- Audio-coupled moments:
  - Scene 1 slams: impactSoft_medium_001/002 at 0.22s / 1.05s
  - Dial peak: impactBell_heavy_000 at 5.15s
  - Stat tiles: drop_001/002 at 5.4s / 5.95s / 6.5s
  - Inventory rows: card-slide-3 at 8.3s / 8.85s / 9.4s
  - Agent rows: card-place-1/2 at 12.0s / 12.55s
  - Execute click: mouseclick1 at 13.1s (beat-locked: 13.11s)
  - SUCCESS banner: impactBell_heavy_003 at 14.05s
  - Logo slam: impactBell_heavy_004 at 17.0s (resolved at strong cue 17.47s)
- SFX analysis guidance: `/home/laxsan_victor/.claude/plugins/cache/brag/brag/0.2.2/skills/brag/assets/sfx/sfx-analysis.md`
- Audio-reactive extraction: `assets/music/cues/audio-data-20s.js` — 601 frames at 30fps, fields: {rms, bass, mid, treble}
