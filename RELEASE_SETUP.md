# Release & Auto-Update Setup Guide
## Ajith Rohana Enterprise — Lottery Manager

---

## Step 1: Generate the Signing Key (Do this ONCE)

Run this on your local machine (requires Tauri CLI):

```bash
# Install Tauri CLI if not already installed
cargo install tauri-cli

# Generate the signing key pair
cargo tauri signer generate -w ~/.tauri/lottery-manager.key
```

This creates TWO files:
- `~/.tauri/lottery-manager.key`  ← PRIVATE KEY (keep secret!)
- `~/.tauri/lottery-manager.key.pub` ← PUBLIC KEY (paste in tauri.conf.json)

---

## Step 2: Add Public Key to tauri.conf.json

Open `src-tauri/tauri.conf.json` and replace `PASTE_YOUR_PUBLIC_KEY_HERE` with the
contents of your `.pub` file. Example:

```json
"plugins": {
  "updater": {
    "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk...",
    "endpoints": [
      "https://github.com/YOUR_USERNAME/lottery-software/releases/latest/download/latest.json"
    ]
  }
}
```

Also update the GitHub username in the endpoints URL.

---

## Step 3: Add GitHub Repository Secrets

Go to: **GitHub → Your Repo → Settings → Secrets and variables → Actions**

Add these 3 secrets:

| Secret Name | Value |
|-------------|-------|
| `TAURI_SIGNING_PRIVATE_KEY` | Full contents of `~/.tauri/lottery-manager.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password you set during key generation (leave blank if none) |
| `GITHUB_TOKEN` | Auto-created by GitHub — no action needed |

---

## Step 4: Push to GitHub

```bash
# Make sure your code is committed
git add .
git commit -m "feat: add auto-update support"
git push origin main
```

---

## Step 5: Create a Release (Triggers the Build)

```bash
# Tag the release with a version number
git tag v1.0.0
git push origin v1.0.0
```

This automatically:
1. Triggers GitHub Actions
2. Builds `.exe` + `.msi` on Windows runner
3. Builds `.deb` + `.AppImage` on Linux runner
4. Creates a GitHub Release with all 4 files + `latest.json`
5. Existing installed apps will detect the update on next launch

---

## Step 6: Future Releases

Each new release just needs a new tag:

```bash
# Bump version in src-tauri/tauri.conf.json first
# "version": "1.1.0"
git add .
git commit -m "feat: new features for v1.1.0"
git tag v1.1.0
git push origin main --tags
```

Users with v1.0.0 installed will see a "🚀 New Update Available" popup automatically.

---

## Build Times (approximate)
- Windows build: ~8-12 minutes
- Linux build: ~6-10 minutes
- Both run in parallel → total wait ~12 minutes

---

## Local Build (without GitHub Actions)

**Windows** (run on a Windows machine):
```bash
bun install
bun run tauri build
# Output: src-tauri/target/release/bundle/nsis/*.exe
#         src-tauri/target/release/bundle/msi/*.msi
```

**Linux** (run on Ubuntu/Debian):
```bash
bun install
bun run tauri build
# Output: src-tauri/target/release/bundle/deb/*.deb
#         src-tauri/target/release/bundle/appimage/*.AppImage
```

---

## Troubleshooting

**Build fails on Windows:** Make sure WebView2 is installed (it's auto-downloaded by the
`downloadBootstrapper` setting in tauri.conf.json).

**Update not showing:** Verify the `pubkey` in tauri.conf.json matches the generated key.
Verify the endpoint URL points to your GitHub repo.

**Linux deb install error:**
```bash
sudo apt --fix-broken install
sudo dpkg -i lottery-manager_1.0.0_amd64.deb
```
