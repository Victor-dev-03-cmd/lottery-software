# Brag Plan: Ajith Rohana Enterprises — Lottery Manager

## What is this app?
A Tauri v2 + React desktop app that gives Sri Lankan NLB/DLB wholesale lottery distributors an AI-powered command center: real-time financial health scoring, algorithmic inventory forecasting, agent credit risk management with one-click suspension, and natural-language AI queries — all secured behind admin token verification.

## The angle
Sri Lanka's lottery distribution industry runs on paper ledgers and phone calls. This app brings boardroom-grade business intelligence to the wholesale floor — a Business Health Score, live agent risk rankings, and AI that tells you who to call, what to reorder, and what to do next.

## Hook (first 2-3 seconds)
Black screen. One line appears in bold red:
**"WHOLESALE LOTTERY. MANAGED BY AI."**
The line holds for 1s, then the dashboard erupts into view.

## Key moments (the middle)
- Business Health Score dial animating from 40 → 75, Rs. figures materializing: Rs. 478,250 revenue, Rs. 212,593 net profit
- Inventory velocity table: MEGA POWER, Ada Kotipathi — red/green "Days Left" indicators, each row sliding in one by one
- Critical agent list: Chaminda Silva, Prasad Bandara highlighted in red — then "Execute" button click with admin token confirmation → green SUCCESS badge

## Outro / punchline
Logo slams in full-screen on dark: **AJITH ROHANA ENTERPRISES — LOTTERY MANAGER**.
Tagline below: *"Your business. Under control."*
Beat hold, then fade.

## User flow worth showing
Entry: App launches → AI Intelligence dashboard loads with live health score.
Key action: Critical agent list surfaces with overdue alerts → admin clicks Execute to suspend credit.
Result: Admin Token Verified → green SUCCESS badge → data reloads.

## Tone
- Preset: `cinematic`
- Creative direction: high-end corporate transformation film for Sri Lankan wholesale lottery distribution
- Interpretation: Epic, declarative text. Big type. Full-bleed dark scenes. Each highlight feels like a superpower being revealed. Music swells toward the logo slam.

## Format: landscape — 1920x1080
## Duration: 20 seconds

## Visual identity (from the project)
- Background: #1D1D1D (dark charcoal, from `C.muted` in codebase)
- Accent: #CF291D (strong red, from `C.red` in codebase)
- Text: #FFFFFF on dark, #1D1D1D on light
- Display font: Inter (from index.css body)
- Body font: Inter
- Strongest visual element: Business Health Score dial + red critical agent risk badges

## Share copy (draft)
Built an AI-powered desktop app for Sri Lankan lottery distributors — real-time health scoring, agent credit control, algorithmic inventory forecasting, and natural-language AI insights. Tauri v2 + React. 🎰

## Audio direction
- Role: Cinematic bed — steady, building energy that swells toward the logo outro
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` — 110 BPM, steady and clean, best for cinematic
- Music treatment: Start at 0s, volume 0.35, fade out in last 1s. Build toward the strong cues at ~8.74s, ~13.11s, and ~17.47s for scene transitions
- Music cue guidance: Preset available. Tempo 109.96 BPM. Strong cues: 8.74s (target Scene 3 start), 13.11s (target Scene 4 start), 17.47s (target Scene 5 start). Beat-grid windows for row reveals in Scene 3: ~2 beat-rows spacing (~0.55s each). For Scene 4 agent cards: reveal each row ~0.55s apart, then hold full set on screen.
- Audio-reactive treatment: subtle; use music RMS/bass to make the health score dial glow breathe and the red accent panels pulse gently. No waveform/equalizer visuals.
- SFX posture: cinematic — 2-3 big cues only: impactBell_heavy_000 for health score reveal, impactBell_heavy_003 for logo slam, interface/drop_001 for each agent card row arrival
- Audio-coupled moments: health score dial count-up, inventory row sequential reveal (card-slide sounds), Execute button click (mouseclick1), SUCCESS badge appearance (impactBell_heavy_003)
- Restraint rule: No SFX on every beat. The music does the work; SFX only punctuate the 3 key moments.

---

## Storyboard

### Scene 1 — Hook — 3s
**Visual:** Pure #1D1D1D background. From center-black, large ALL-CAPS text in #CF291D slams in at 0.3s, scale 1.2→1.0: **"WHOLESALE LOTTERY."** holds 0.6s, then below it: **"MANAGED BY AI."** slams in the same way. Both lines hold together. At 2.8s, transition begins.
Sequential/interaction: yes — two lines arrive sequentially: first at 0.3s, second at 1.1s; both hold until 2.8s
Audio intent: impact and authority — make the viewer sit up
Audio-coupled idea: impactSoft_medium_001 at 0.2s for first line; impactSoft_medium_002 at 1.0s for second line
Music: steady cinematic bed, building from intro
Transition mood: dramatic wipe with scale → Scene 2

### Scene 2 — AI Dashboard Reveal — 3.5s
**Visual:** Full-bleed recreation of the AIAnalytics dashboard header. Dark #1D1D1D panel. Center: a circular dial labeled "Business Health Score" animating from 40 → 75 with the needle sweeping and color changing amber→blue. Below the dial, three stat tiles appear one by one: **"Rs. 478,250"** (Revenue), **"Rs. 212,593"** (Net Profit), **"84%"** (Collection Rate). Each tile has a subtle red-accent left border. Label text in white, value in large white numerals.
Sequential/interaction: yes — dial animates 40→75 over 1.2s, then 3 stat tiles pop in one by one ~0.4s apart, values count up
Audio intent: reveal and awe — the numbers materializing feel like a spotlight turning on
Audio-coupled idea: impactBell_heavy_000 at the moment dial reaches 75 (approx 1.2s into scene); interface/drop_001 for each stat tile arrival
Music: cinematic bed building toward strong cue at 8.74s (absolute)
Transition mood: soft crossfade with scale → Scene 3

### Scene 3 — Inventory Intelligence — 3.5s
**Visual:** Inventory velocity table on dark background. Table title: **"DEMAND FORECAST"** in red. Three rows slide in from right, one by one: MEGA POWER (green "12 Days"), Ada Kotipathi (amber "5 Days"), Super Ball (red "2 Days — REORDER"). Each row has a mini horizontal bar showing velocity percentage. The "REORDER" badge on the last row pulses red.
Sequential/interaction: yes — 3 rows slide in from the right ~0.55s apart; "REORDER" badge pulses after row 3 lands
Audio intent: urgency building — the "2 Days" row should feel like a warning
Audio-coupled idea: casino/card-slide-3.ogg for each row arrival; interface/switch_001 when REORDER badge appears
Music: near strong cue target ~13.11s (absolute) — use for the REORDER badge beat
Transition mood: dramatic wipe → Scene 4

### Scene 4 — Agent Credit Control — 4s
**Visual:** Split dark panel. Left: "COLLECTION PRIORITY" header in red. Two agent rows slide in: **Chaminda Silva** — Rs. 89,500 overdue — red "CRITICAL" badge. **Prasad Bandara** — Rs. 67,200 — orange "HIGH" badge. Right side: an AI chat bubble appears: "Recommend: Suspend credit — Chaminda Silva. Reason: 47 days overdue." Below it, a red "EXECUTE" button. Cursor animates to hover, then clicks. A padlock icon appears with "Admin Token Verified" in green. Then a full-width green "SUCCESS" banner sweeps in.
Sequential/interaction: yes — agent rows arrive one by one (0.5s apart), then AI bubble appears, then cursor hover+click (500ms), then token verify, then success
Audio intent: decisive authority — the Execute click should feel final and powerful
Audio-coupled idea: casino/card-place-1.ogg for each agent row; ui/mouseclick1.ogg for Execute click; impactBell_heavy_003 for SUCCESS banner
Music: near strong cue ~17.47s (absolute) — align SUCCESS banner to this beat
Transition mood: slow crossfade with scale → Scene 5

### Scene 5 — Logo Outro — 4s
**Visual:** Fade to near-black. Center: logo mark (red lottery/ticket icon) fades in, then below it the full brand name **"AJITH ROHANA ENTERPRISES"** in white heavy caps, then in smaller text: **"LOTTERY MANAGER"** in #CF291D. Below that: tagline fades in: *"Your business. Under control."* Bottom: small QR code left, contact text right: "Contact us for a demo." All text arrives with gentle scale-in (0.95→1.0) and holds the full 3s.
Sequential/interaction: yes — logo icon at 0.5s, company name at 1.0s, tagline at 1.8s, CTA row at 2.4s
Audio intent: authority and resolution — everything lands on this moment
Audio-coupled idea: impactBell_heavy_004 when the company name slams in at 1.0s; music fades out over last 1.5s
Music: fade to ~0.1 volume over final 1.5s; impactBell_heavy_004 punctuates the logo arrival
Transition mood: fade to black (end)

**Music mood for this video:** cinematic / corporate build
**Audio summary:** Vol-12 runs as a steady cinematic bed throughout, building to the strong-cue anchors at 8.74s, 13.11s, and 17.47s; three key SFX moments (health score reveal, Execute success, logo slam) punctuate the visual peaks; audio-reactive bass breathes gently through the dashboard and agent panels.
