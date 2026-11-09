<div align="center">
  <img src="src-tauri/icons/128x128.png" alt="Lottery Manager icon" width="92" />
  <h1>Ajith Rohana Enterprise</h1>
  <h2>Lottery Management System</h2>
  <p><strong>Offline-first desktop software for lottery stock, distribution, invoices, accounts and operational reporting.</strong></p>
  <p>Built for day-to-day lottery business operations in Sri Lanka.</p>

  <p>
    <img alt="Version" src="https://img.shields.io/badge/Version-1.0.33-2563eb?style=flat-square" />
    <img alt="Desktop" src="https://img.shields.io/badge/Desktop-Windows%20%7C%20Linux-334155?style=flat-square" />
    <img alt="Tauri" src="https://img.shields.io/badge/Tauri-v2-24C8DB?style=flat-square" />
    <img alt="React" src="https://img.shields.io/badge/React-19-149ECA?style=flat-square" />
    <img alt="SQLite" src="https://img.shields.io/badge/Database-SQLite-0F80CC?style=flat-square" />
  </p>

  <p><strong>Desktop first · Local data ownership · Structured business workflows</strong></p>
</div>

---

## Overview

**Lottery Manager** brings purchasing, stock tracking, sub-agent distribution, sales invoicing and accounting into one desktop application. Its primary operational database is **local SQLite**, so core workflows can work without a persistent internet connection. Optional network services support lottery-result lookups, AI features and configured cloud synchronization.

The interface is organized around the work an operator performs every day: receiving tickets, distributing stock, generating invoices, collecting payments, managing returns and reviewing balances.

> **Project scope:** This repository focuses on the Windows/Linux desktop application. The former Flutter companion app has been retired from the active source tree. The desktop's unnecessary mobile LAN startup and discovery tasks are disabled. Responsive layouts within the desktop UI are not a separate mobile app.

## Table of contents

- [Business features](#business-features)
- [Architecture](#architecture)
- [Technology stack](#technology-stack)
- [Getting started](#getting-started)
- [Windows test installer](#windows-test-installer)
- [Admin PIN and operator access](#admin-pin-and-operator-access)
- [Backups and synchronization](#backups-and-synchronization)
- [Performance and troubleshooting](#performance-and-troubleshooting)
- [Repository layout](#repository-layout)
- [Development and verification](#development-and-verification)
- [Release and safety notes](#release-and-safety-notes)

## Business features

| Area | Available workflows |
| :--- | :--- |
| **Dashboard & alerts** | Business overview, alerts and operational shortcuts |
| **Lottery purchasing** | Purchase invoices, supplier balances, purchase payments |
| **Inventory control** | Ticket batches, barcode ranges, quantities, stock calculations and low-stock indicators |
| **Agent management** | Agent details, distribution records and related financial views |
| **Sales & invoicing** | Draft, confirmed, paid and cancelled invoice screens; invoice creation and editing |
| **Printing & exports** | Invoice templates, A4-oriented previews, printable/exportable business records |
| **Payments & ledger** | Agent payments, invoice-linked ledger and outstanding-balance views |
| **Returns & settlement** | Ticket returns, supplier returns, agent settlement and stock reconciliation workflows |
| **Daily collections** | Cash, cheque and lottery-winning collection records |
| **Commission & expenses** | Commission schemes and petty-cash transaction records |
| **Payroll** | Worker records and monthly salary workflows |
| **Reports & analytics** | Business reports, profit analysis and distribution summaries |
| **Lottery results** | NLB/DLB results interface; network requests depend on provider availability |
| **Optional AI** | AI analytics/configuration features requiring the selected provider and credentials |
| **Settings & protection** | Company configuration, access PINs, backup/restore and integration settings |

*Actual access to a feature depends on the current operator role, configuration and the data already entered.*

## Architecture

The desktop remains the primary place where business transactions are recorded.

\`\`\`mermaid
flowchart LR
    O[Desktop operator] --> UI[Tauri + React interface]
    UI --> DB[(Local SQLite<br/>authoritative business data)]
    DB --> Q[Offline sync queue]
    Q --> R[Rust / Tauri commands]
    R --> API[Optional Go API]
    API --> PG[(PostgreSQL replica)]
    R --> SB[(Optional Supabase integration)]
    UI --> EX[Printing and reports]
    UI --> LR[On-demand lottery results]
\`\`\`

**Important architectural distinctions**

- **SQLite is the source of operational truth** on the desktop.
- **PostgreSQL is a synchronized backend**, not a substitute for backing up the SQLite file.
- **Supabase support exists in the codebase**, but must be configured and verified for the intended deployment.
- Network features are optional where supported; they should not prevent the normal local business workflow from opening.
- The mobile companion project is no longer required for the desktop workflow.

## Technology stack

| Layer | Technologies |
| :--- | :--- |
| Desktop shell | Tauri 2 and Rust |
| Frontend | React 19, TypeScript, Vite |
| Interface | Tailwind CSS, Iconsax/Lucide icons |
| Local data | SQLite via Tauri SQL plugin and Rust SQLite operations |
| Backend service | Go HTTP API (optional deployment) |
| Cloud storage | PostgreSQL; optional Supabase synchronization paths |
| Background work | Local synchronization queue and on-demand results fetching |
| Packaging | Tauri Windows NSIS and Linux desktop bundles |

## Getting started

### Requirements

For local development, install **Bun**, **Rust stable / Cargo**, and the platform-specific [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). On Windows, the Tauri application uses Microsoft WebView2.

### Clone and run

\`\`\`bash
git clone https://github.com/Victor-dev-03-cmd/lottery-software.git
cd lottery-software
bun install
bun run tauri dev
\`\`\`

To compile the frontend without creating a desktop installer:

\`\`\`bash
bun run build
\`\`\`

To produce a Windows NSIS installer on a supported Windows build environment:

\`\`\`bash
bun run tauri build --bundles nsis
\`\`\`

**First run:** Complete the in-app setup wizard, select or confirm the database location, review company information and configure the administrative PIN. Test with a non-production database before importing actual client transactions.

## Windows test installer

The development integration branch has a **test-only Windows installer workflow**. It is separate from the production release workflow and does not publish a version tag or modify the updater feed.

1. Open [Windows Performance Test Installer — GitHub Actions](https://github.com/Victor-dev-03-cmd/lottery-software/actions/workflows/windows-performance-test-installer.yml).
2. Choose a successful run from \`integration/security-and-perf\`.
3. Open **Artifacts** and download the test ZIP.
4. Extract the installer and the included \`Measure-WindowsPerformance.ps1\` script.
5. Back up current client data and test on a separate/non-production setup.

A passing CI build establishes that compilation/packaging succeeded on the runner. It **does not prove** performance on the client's computer.

## Admin PIN and operator access

The application has **admin** and **cashier** interface roles. Admin PIN configuration and protected actions are managed under:

**Settings → Backup & Security**

For UI deletion operations that request administrator verification:

- **No PIN configured:** deletion is blocked and the operator is directed to set an Admin PIN.
- **Wrong PIN or cancelled prompt:** the deletion is not performed.
- **Correct PIN:** the protected UI action may proceed, subject to its business rules.

The current frontend includes PIN checks for invoice-related deletion and other destructive business screens. **Frontend prompts alone are not a complete data-access security boundary**; backend/database authorization and the latest integration fixes must be reviewed before production release.

Never commit PINs, signing keys, cloud secrets or real customer databases.

## Backups and synchronization

**Back up SQLite before upgrades, test installations, database migrations or restore operations.** Keep a dated backup on a different drive and verify it can be restored.

- [Backup and restore guide](BACKUP.md)
- [Release setup reference](RELEASE_SETUP.md)
- [Security and signing migration notes — integration branch](https://github.com/Victor-dev-03-cmd/lottery-software/blob/integration/security-and-perf/RELEASE_SECURITY.md)

Cloud synchronization is asynchronous; an invoice saved locally may not be reflected immediately in PostgreSQL or a configured cloud integration. Inspect sync failures before assuming the replica is current.

## Performance and troubleshooting

The desktop-focused code avoids starting unused mobile network services during the normal application launch. All-game lottery-result fetching is deferred until the **Live Results** page is opened.

| Symptom | What to check |
| :--- | :--- |
| Other Windows applications become slow | Task Manager CPU, memory, disk and network usage while Lottery Manager is open |
| High startup CPU | Startup background processes, antivirus scans and database initialization |
| Slow invoice operations | Local database size, query behavior, disk speed and antivirus exclusions (only when justified) |
| Results page takes time | Internet connectivity, upstream lottery websites and any browser-based fetch fallback |
| Cloud records lag behind | Sync queue, backend availability, credentials and retry state |
| Printing is incorrect | A4 page size, printer margins, scaling and print-preview settings |

For repeatable measurements, run the included Windows test script twice: once with the previous build and once with the new test build, using the **same machine, comparable database copy and identical workload**. Compare idle CPU, working-set memory and startup behavior.

**Do not disable SQLite synchronization or delete business tables as a performance shortcut.**

## Repository layout

\`\`\`text
lottery-software/
├── src/                 React / TypeScript application
│   ├── components/      Business screens and shared interface
│   ├── contexts/        Role and session context
│   ├── hooks/           Admin PIN and interface hooks
│   └── services/        SQLite operations and synchronization
├── src-tauri/           Rust desktop shell, commands, packaging
├── api-server/          Optional Go + PostgreSQL backend
├── .github/workflows/   CI, test-installer and release workflows
├── BACKUP.md            Data backup and restore reference
├── RELEASE_SETUP.md     Historical release setup reference
└── README.md            Project documentation
\`\`\`

The deprecated \`mobile-app/\` Flutter folder has been removed from the current default-branch source tree; it remains recoverable in older Git commits.

## Development and verification

\`\`\`bash
# Frontend checks
bun run build
bunx tsc --noEmit

# Go API tests (from the API project directory)
cd api-server
go test ./...
cd ..

# Rust desktop checks
cd src-tauri
cargo check
cargo test
\`\`\`

When testing Windows behavior, also validate the full Tauri package and actual interactions for invoices, printing, barcode scanning and database backups. Use an isolated database rather than the client's live database.

## Release and safety notes

> [!IMPORTANT]
> **Development/test build ≠ approved production release.** The updater configuration currently contains \`dangerousInsecure: true\` while signed-update migration remains outstanding. Do not publish a production update until the signing setup and release-security review are complete.

This repository intentionally separates **test installer artifacts** from official tagged releases. Do not tag a test-only build as a production release.

---

<div align="center">
  <strong>Ajith Rohana Enterprise — Lottery Manager</strong>
  <br/>
  Designed for practical Sri Lankan lottery distribution and business management.
  <br/>
  <sub>© 2026 Ajith Rohana Enterprise · Powered by Asroz</sub>
</div>
