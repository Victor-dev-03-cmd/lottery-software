# Release Security — Signed Update Migration

## Status: NOT FULLY RESOLVED

`dangerousInsecure: true` is set in `src-tauri/tauri.conf.json`. This means the
Tauri updater installs update packages without verifying their cryptographic
signature. A MITM attack or compromised GitHub release could serve a malicious
binary to existing installations.

The public key is already embedded in `tauri.conf.json`. The private signing key
is the missing piece.

## Why this cannot be removed immediately

Removing `dangerousInsecure: true` before all existing clients have received at
least one signed update will break the auto-updater for those clients. The safe
migration sequence is:

1. Add the private key as a GitHub secret → publish one signed release
2. Existing clients update to the signed release (still using dangerousInsecure: true)
3. Remove `dangerousInsecure: true` → subsequent releases enforce signature verification

## Migration Steps (repo owner action required)

### Step 1: Generate the signing key pair (one time, local machine)

```bash
bunx tauri signer generate -w lottery_updater_private.key
```

This creates:
- `lottery_updater_private.key` — **KEEP SECRET**. Do not commit. Add to .gitignore if in project directory.
- `lottery_updater_private.key.pub` — the public key

### Step 2: Verify the public key matches tauri.conf.json

The `pubkey` field in `tauri.conf.json` must match the content of
`lottery_updater_private.key.pub`. If the keys don't match, update `pubkey`
in `tauri.conf.json` and commit before proceeding.

### Step 3: Add GitHub Secrets

Go to: GitHub → Settings → Secrets and variables → Actions → New repository secret

- **Name:** `TAURI_SIGNING_PRIVATE_KEY`
  **Value:** full contents of `lottery_updater_private.key` (including headers)

- **Name:** `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
  **Value:** passphrase chosen during key generation (empty string if none)

### Step 4: Publish a release and verify it is signed

Push a version tag. Check the GitHub Actions run — the `ensure-manifest` job
should log "Signing key present — updates will be signed." (not the unsigned warning).
Verify the published `latest.json` contains a `signature` field for each platform.

### Step 5: Allow existing clients to receive the signed update

Wait for existing installations to auto-update to the signed release. Monitor
the release download count or wait an appropriate period.

### Step 6: Remove dangerousInsecure

Once signed updates are confirmed working, remove `"dangerousInsecure": true`
from the `plugins.updater` block in `src-tauri/tauri.conf.json` and publish a
new release. From this point on, all updates must be signed.

### Step 7: Delete the private key file

After adding to GitHub Secrets, delete `lottery_updater_private.key` from disk.
GitHub Secrets is the authoritative store.

## Remaining Risk

Until Steps 1–6 are completed by the repo owner, all software updates are
delivered and installed without cryptographic verification. A compromised
GitHub release or MITM attack could serve a malicious update binary.
