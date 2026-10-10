# Algoxilla Certificate Platform

The official tamper-proof credentials verification and retrieval platform for **Algoxilla** hackathons and technical competitions, starting with **Algothon’26** (held 4 October 2026).

---

## 📌 Phase 1 Status: Frontend UI Prototype & Design System

This codebase represents **Phase 1** of the Algoxilla Certificate Platform.

> **Important Notice on Phase 1 Boundaries:**
> - All participant data, certificate serials, metrics, and verification records in this phase are **strictly synthetic mock data**.
> - Real participant databases, Google Sheets live integrations, SMTP/email delivery systems, cryptographic private keys, and automated certificate issuance are deliberately isolated from this phase.
> - Client-side interactions simulate end-to-end user workflows for design, responsiveness, and accessibility review.

---

## ✨ Features Implemented in Phase 1

1. **Public Landing Page (`/`)**
   - High-contrast, minimalist design adhering strictly to Algoxilla brand guidelines (Rich Black `#09090B`, Algoxilla Red `#E50914`, Crisp White `#FFFFFF`, Slate `#A1A1AA`).
   - Algothon'26 event spotlight highlighting co-founders Dev Raj and Aditya Raj.
   - Quick certificate ID search bar linking directly to instant verification.
   - Interactive live certificate preview showcase with authentic template toggle.
   - Master implementation lifecycle roadmap tracker.

2. **Participant Retrieval Portal (`/portal`)**
   - **Step 1: Identity Lookup** — Accessible email input with validation and quick-fill demo presets. Demonstrates core eligibility rule (possession of email does not grant certificate unless matched on approved attendee roster).
   - **Step 2: Security Verification** — Segmented 6-digit OTP input with auto-advance, paste handling, backspace navigation, simulated 15-minute countdown, and resend trigger.
   - **Step 3: Certificate Details & Claim** — Full rendered certificate card matching the Algothon'26 vector layout, simulated 3-step PDF download progress, and direct link to public verification.
   - **Self-Service Typo Corrections** — Accessible modal dialog allowing participants to submit name/spelling adjustments with category selection and explanation notes.
   - **Ineligible / Unregistered State** — Friendly, informative rejection state explaining eligibility rules when an unregistered email is tested.

3. **Public Certificate Verification Page (`/verify` & `/verify/[id]`)**
   - **Authentic Valid State** (`/verify/MOCK-ALGO26-8942`):
     - Displays emerald authenticity badge: `VERIFIED AUTHENTIC & TAMPER-PROOF [MOCK]`.
     - Full event metadata: Event Name ("Algothon'26"), Date ("4 October 2026"), Recipient Name, Issuing Body ("Algoxilla"), and Co-Founders.
     - SHA-256 cryptographic verification fingerprint with one-click copy.
     - Rendered certificate preview.
   - **Unrecognized / Revoked State** (`/verify/invalid`):
     - Prominent warning badge: `CERTIFICATE NOT FOUND OR REVOKED`.
     - Anti-tamper integrity warning and organizer assistance guidance.
   - Instant state toggle to switch between valid and invalid demonstration states.

4. **Organizer Dashboard (`/admin`)**
   - **Operational Metrics**: Total Registrations (170 mock), Issued Certificates (150 mock), Downloads (120 mock), Pending Corrections (4 mock), and Public Verification Hits (318 mock).
   - **Participant Management Table**: Searchable, filterable by issuance status (Issued, Pending, Ineligible), with simulated pagination and verification links.
   - **Batch CSV Ingestion Simulator**: Dropzone matching the exact schema of the Google Forms responses (`Timestamp`, `First Name`, `Last Name`, `Email Address`, `Confirmation`), with pre-import dry-run validation preview.
   - **Name Correction Review Queue**: Review 4 realistic participant requests (capitalization, apostrophe formatting, middle initials) with interactive client-side `Approve & Reissue` and `Reject` actions.

---

## 🎨 Brand & Design System Compliance

- **Primary Colors**:
  - Core Black: `#09090B` / `#000000`
  - Algoxilla Red: `#E50914` / `#FF1E27`
  - Pure White: `#FFFFFF` / `#F4F4F5`
  - Slate Accent: `#27272A` / `#71717A`
- **Official Brand Assets**:
  - Algoxilla Official Logo: `public/brand/algoxilla-logo.jpg`
  - Algothon'26 Reference Certificate: `public/brand/algothon26-certificate-reference.png`
- **Signatories**: Dev Raj (Co-Founder, Algoxilla) & Aditya Raj (Co-Founder, Algoxilla).

---

## 🚀 Getting Started

### Prerequisites

- Node.js `v20.x` or later (tested on `v24.14.0`)
- npm `v10.x` or later (tested on `v11.9.0`)

### Installation

```bash
# Clone or navigate to the repository
cd algoxilla-certificate-platform

# Install dependencies
npm install
```

### Development Server

```bash
# Run local development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build & Verification

```bash
# Compile and build the Next.js application
npm run build

# Run linter
npm run lint
```

---

## 🔒 Security and Privacy Isolation (Phase 1)

- `.gitignore` strictly excludes all `.env*` secret files, `.next` build caches, `node_modules`, and raw spreadsheet records (`*.xlsx`, `*.csv`).
- `.env.example` provides non-sensitive placeholders for future backend phases.
- Zero external database connections or live network calls are executed in Phase 1.

---

## 🗺️ Master Phased Roadmap

| Phase | Milestone | Status |
| :--- | :--- | :--- |
| **Phase 0** | Workspace Inspection & Implementation Planning | **Completed** |
| **Phase 1** | Frontend UI Prototype & Labelled Mock Data System | **Completed** |
| **Phase 2** | Database Schema, Access Policies & Authorization | *Awaiting Approval* |
| **Phase 3** | Email Authentication & Eligibility Validation (OTP) | *Awaiting Approval* |
| **Phase 4** | PDF Generation Engine & QR Verification | *Awaiting Approval* |
| **Phase 5** | Self-Service Retrieval & Correction Workflows | *Awaiting Approval* |
| **Phase 6** | Admin Dashboard & Google Forms/CSV Ingestion | *Awaiting Approval* |
| **Phase 7** | End-to-End, Security & Regression Testing | *Awaiting Approval* |
| **Phase 8** | Deployment Readiness & Custom Domain Configuration | *Awaiting Approval* |

---

© 2026 Algoxilla. Build • Collaborate • Solve • Grow.
