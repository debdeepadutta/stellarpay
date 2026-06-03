<div align="center">

<img src="src/assets/logo.png" alt="Stellar Philanthropy Logo" width="80"/>

# Stellar Philanthropy

### A Decentralized Philanthropy Marketplace on Stellar + Soroban

[![Stellar](https://img.shields.io/badge/Stellar-Testnet-7C3AED?style=for-the-badge&logo=stellar&logoColor=white)](https://stellar.org)
[![React](https://img.shields.io/badge/React-Vite-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://vitejs.dev)
[![Soroban](https://img.shields.io/badge/Soroban-Smart%20Contracts-FF6B35?style=for-the-badge)](https://soroban.stellar.org)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com)
[![Vitest](https://img.shields.io/badge/Tested-Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)](https://vitest.dev)
[![Vercel](https://img.shields.io/badge/Deployed-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://stellarpay-lac.vercel.app/)
[![CI/CD](https://github.com/debdeepadutta/stellarpay/actions/workflows/ci.yml/badge.svg)](https://github.com/debdeepadutta/stellarpay/actions/workflows/ci.yml)

**A production-ready decentralized philanthropy marketplace built on the Stellar blockchain using Soroban smart contracts. Admins launch fundraising campaigns on-chain. Donors browse a global marketplace, contribute XLM, and track impact in real time — all powered by a three-contract ecosystem with no central authority.**

[🌐 Live Demo](https://stellarpay-lac.vercel.app/) &nbsp;·&nbsp; [🎬 Demo Video](https://drive.google.com/file/d/1sBxUY_Wt0idMdf0WuAeqn7IarSZYihaf/view?usp=sharing) &nbsp;·&nbsp; [📜 Donation Contract](https://stellar.expert/explorer/testnet/contract/CBGFHRSQ275OQRZGOZXLO7JABDVTI5UIZLD7ETSAGJVI5WMIWGBC2TK4) &nbsp;·&nbsp; [🔗 Inter-Contract Tx](https://stellar.expert/explorer/testnet/tx/65c2af62d4160528de7342f7dc9df35a122999c06aba78f12a944b090ad493d3)

</div>

---

## 📋 Table of Contents

- [Architecture](#-architecture)
- [Features by Level](#-features-by-level)
- [Smart Contract Details](#-smart-contract-details)
- [Screenshots](#-screenshots)
- [Test Results](#-test-results)
- [Tech Stack](#-tech-stack)
- [Setup Instructions](#-setup-instructions)
- [Project Structure](#-project-structure)
- [Author](#-author)

---

## 🏛️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                      │
│                                                              │
│   Landing → Admin Portal          Landing → Donor Portal     │
│   ├── Create Campaign             ├── Campaign Marketplace   │
│   ├── Manage Vault                ├── Campaign Details       │
│   ├── View Analytics              ├── Donate XLM            │
│   └── Delete Campaigns            ├── Leaderboard           │
│                                   └── Live Feed             │
└────────────────────────┬────────────────────────────────────┘
                         │
          ┌──────────────▼──────────────┐
          │     Firebase Firestore       │  ← Campaign metadata
          │   (name, description, goal)  │     global persistence
          └──────────────┬──────────────┘
                         │
          ┌──────────────▼──────────────┐
          │      Horizon SSE Stream      │  ← Real-time events
          └──────────────┬──────────────┘
                         │
          ┌──────────────▼──────────────┐
          │       DONATION CONTRACT      │
          │  donate() │ get_total()      │
          │  create_campaign()           │
          │  get_campaign_info()         │
          │  get_campaign_admin()        │
          └──────┬───────────┬──────────┘
                 │           │
     inter-contract calls    │
                 │           │
     ┌───────────▼──┐  ┌─────▼──────────┐
     │   LOGGER     │  │     VAULT       │
     │  CONTRACT    │  │    CONTRACT     │
     │              │  │                 │
     │ log_donation()│  │ deposit()      │
     │ get_history() │  │ withdraw()     │
     │ get_recent()  │  │ get_stats()    │
     └──────────────┘  └────────────────┘
```

### What Lives Where

| Data | Storage | Reason |
|---|---|---|
| Campaign admin, goal, total raised | On-chain (Soroban) | Security-critical, tamper-proof |
| Vault balances per campaign | On-chain (Soroban) | Financial state |
| Donation history + events | On-chain (Logger) | Audit trail |
| Campaign name, description | Firebase Firestore | Rich metadata, cheaper off-chain |
| Real-time updates | Horizon SSE | Native Stellar streaming |

---

## ✨ Features by Level

### 🔹 Level 1 — Foundation

> Basic wallet connectivity and XLM transactions on Stellar Testnet.

| Feature | Status |
|--------|--------|
| 🔐 Connect Freighter wallet | ✅ |
| 💰 View live XLM balance | ✅ |
| 💸 Send XLM transactions | ✅ |
| ✅ Transaction success confirmation | ✅ |

---

### 🔹 Level 2 — Smart Contract Integration

> Full Soroban smart contract deployment with multi-wallet support.

| Feature | Status |
|--------|--------|
| 🧠 Soroban smart contract deployed on Stellar Testnet | ✅ |
| 💸 Donate XLM via `donate()` contract function | ✅ |
| 📊 Fetch cumulative total via `get_total()` | ✅ |
| 🔄 Real-time UI updates after each donation | ✅ |
| 🔐 Multi-wallet — Freighter, xBull, Albedo | ✅ |
| 📡 Transaction status indicators (Pending / Success / Failed) | ✅ |
| ⚠️ Error handling — wallet not found, rejected tx, low balance | ✅ |

---

### 🔹 Level 3 — Quality & Testing

> Production-grade UX, automated testing, and caching.

| Feature | Status |
|--------|--------|
| ⏳ Loading states and progress indicators | ✅ |
| ⚡ Donation total caching with `localStorage` | ✅ |
| 🧪 4 unit tests — all passing | ✅ |
| 📊 Improved UI feedback on all interactions | ✅ |
| 🎬 Demo video walkthrough | ✅ |

---

### 🔹 Level 4 — Production Ready 🚀

> Three-contract ecosystem, dual-portal marketplace, Firebase + blockchain hybrid, CI/CD pipeline.

| Feature | Status |
|--------|--------|
| 🏛️ Dual-portal architecture — Admin + Donor | ✅ |
| 🔁 Three-contract inter-contract ecosystem | ✅ |
| 🏪 Global campaign marketplace via Firebase Firestore | ✅ |
| 🔐 On-chain admin verification per campaign | ✅ |
| 💰 Per-campaign isolated vault balances | ✅ |
| 📋 Logger contract — full queryable donation history | ✅ |
| 🔗 Deep linking — shareable campaign URLs | ✅ |
| 📣 OG meta tags for social sharing (X, LinkedIn) | ✅ |
| ⚡ Horizon SSE real-time streaming | ✅ |
| 🧪 7 Rust contract-level tests (2 unit + 5 integration) | ✅ |
| ⚙️ CI/CD — contract compile + test + deploy pipeline | ✅ |
| 🛡️ Security scan — no hardcoded secrets in CI | ✅ |
| 📱 Fully responsive mobile UI | ✅ |
| 🔴 Error recovery for failed transactions | ✅ |

---

## 🧾 Smart Contract Details

| | Contract | Address |
|---|---|---|
| 💠 | **Donation Contract** | `CBGFHRSQ275OQRZGOZXLO7JABDVTI5UIZLD7ETSAGJVI5WMIWGBC2TK4` |
| 📋 | **Logger Contract** | `CDIK5KV222V3SJPN45PIYZEZ3EFI6QLNA5DAGFDAIZUMG5K3M53IX6LS` |
| 🏦 | **Vault Contract** | `CB7O4AJFIBTGQODDCOPQICCSHRA35WFTIA2ZZ5O6OUMKWV4ROZIE3BZD` |

- **Network:** Stellar Testnet
- **Language:** Rust → compiled to WASM via Soroban SDK
- **Deploy Date:** 2026-06-02

### Contract Functions

| Contract | Functions |
|---|---|
| **Donation** | `create_campaign()`, `donate()`, `get_total()`, `get_campaign_info()`, `get_campaign_admin()`, `get_campaign_total()` |
| **Logger** | `log_donation()`, `get_all_donations()`, `get_donor_history()`, `get_recent_donations()`, `get_donation_count()` |
| **Vault** | `deposit()`, `withdraw()`, `get_balance()`, `get_campaign_stats()`, `get_withdrawal_history()` |

### How One Donation Works — Atomic Transaction

```
Donor clicks "Send Donation"
         ↓
Donation Contract: donate(campaign_id, donor, amount)
         ↓                    ↓
Logger Contract          Vault Contract
log_donation()           deposit(campaign_id, amount)
         ↓                    ↓
On-chain audit trail     Funds held securely
         ↓
Single atomic transaction — all or nothing
```

**Inter-Contract Transaction Hash:**
```
65c2af62d4160528de7342f7dc9df35a122999c06aba78f12a944b090ad493d3
```
🔗 [View on Stellar Expert](https://stellar.expert/explorer/testnet/tx/65c2af62d4160528de7342f7dc9df35a122999c06aba78f12a944b090ad493d3)

---

## 📸 Screenshots

### 🔹 Level 1 — Wallet Connection & XLM Transactions

<table>
  <tr>
    <td align="center">
      <strong>Wallet Connected</strong><br/>
      <img src="level_1_screenshots/wallet_connected.png" alt="Wallet Connected" width="280"/>
    </td>
    <td align="center">
      <strong>Transaction Confirmation</strong><br/>
      <img src="level_1_screenshots/transaction_confirm.png" alt="Transaction Confirmation" width="280"/>
    </td>
    <td align="center">
      <strong>Transaction Success</strong><br/>
      <img src="level_1_screenshots/transaction_success.png" alt="Transaction Success" width="280"/>
    </td>
  </tr>
</table>

<table>
  <tr>
    <td align="center">
      <strong>Verified on Stellar Expert</strong><br/>
      <img src="level_1_screenshots/stellar_expert.png" alt="Stellar Expert Proof" width="860"/>
    </td>
  </tr>
</table>

> ✅ **Level 1 Proof:** Freighter wallet connected, live XLM balance visible, transaction confirmed on Stellar Testnet, verified on Stellar Expert.

---

### 🔹 Level 2 — Smart Contract & Multi-Wallet

<table>
  <tr>
    <td align="center">
      <strong>Multi-Wallet Selector</strong><br/>
      <img src="level_2_screenshots/wallet_options.png" alt="Wallet Options" width="280"/>
    </td>
    <td align="center">
      <strong>Donation Success</strong><br/>
      <img src="level_2_screenshots/donation_success.png" alt="Donation Success" width="280"/>
    </td>
    <td align="center">
      <strong>Contract Explorer Proof</strong><br/>
      <img src="level_2_screenshots/contract_proof.png" alt="Contract Proof" width="280"/>
    </td>
  </tr>
</table>

> ✅ **Level 2 Proof:** Multi-wallet selector active (Freighter / xBull / Albedo), XLM donated via Soroban contract, on-chain total updated in real time.

---

### 🔹 Level 3 — Testing & UX

<table>
  <tr>
    <td align="center">
      <strong>Unit Tests — All 4 Passing ✅</strong><br/>
      <img src="level_3_screenshots/test_cases.png" alt="Test Cases Passing" width="860"/>
    </td>
  </tr>
</table>

> ✅ **Level 3 Proof:** 4 Vitest unit tests passing covering landing page, wallet connection, marketplace navigation, and admin portal.

---

### 🔹 Level 4 — Production Features

**🏛️ Landing Page — Portal Selection**

<table>
  <tr>
    <td align="center">
      <img src="level_4_screenshots/landing_page.png" alt="Landing Page" width="860"/>
    </td>
  </tr>
</table>

**👑 Admin Portal — Campaign Management**

<table>
  <tr>
    <td align="center">
      <img src="level_4_screenshots/admin_portal.png" alt="Admin Portal" width="860"/>
    </td>
  </tr>
</table>

**💙 Donor Portal — Campaign Marketplace & Details**

<table>
  <tr>
    <td align="center">
      <strong>Campaign Marketplace — Browse All Campaigns</strong><br/>
      <img src="level_4_screenshots/philanthropist1.png" alt="Donor Marketplace" width="860"/>
    </td>
  </tr>
</table>

<table>
  <tr>
    <td align="center">
      <strong>Campaign Details — Donate + Leaderboard + Live Feed</strong><br/>
      <img src="level_4_screenshots/philanthropist2.png" alt="Campaign Details" width="860"/>
    </td>
  </tr>
</table>

**🔁 Inter-Contract Atomic Transaction on Stellar Expert**

<table>
  <tr>
    <td align="center">
      <img src="level_4_screenshots/inter_contract.png" alt="Inter-Contract Call" width="860"/>
    </td>
  </tr>
</table>

**📱 Mobile Responsive — Landing Page**

<table>
  <tr>
    <td align="center">
      <img src="level_4_screenshots/mobile_view_1.png" alt="Mobile Landing" width="300"/>
    </td>
  </tr>
</table>

**📱 Mobile Responsive — Admin Portal**

<table>
  <tr>
    <td align="center">
      <img src="level_4_screenshots/mobile_view_2_!.png" alt="Mobile Admin 1" width="280"/>
    </td>
    <td align="center">
      <img src="level_4_screenshots/mobile_view_2_2.png" alt="Mobile Admin 2" width="280"/>
    </td>
    <td align="center">
      <img src="level_4_screenshots/mobile_view_2_3.png" alt="Mobile Admin 3" width="280"/>
    </td>
  </tr>
</table>

**📱 Mobile Responsive — Donor Portal**

<table>
  <tr>
    <td align="center">
      <strong>Donor Marketplace</strong><br/>
      <img src="level_4_screenshots/mobile_view_3_1.png" alt="Mobile Donor 1" width="280"/>
    </td>
    <td align="center">
      <strong>Campaign Details Part 1</strong><br/>
      <img src="level_4_screenshots/mobile_view_3_2_1.png" alt="Mobile Donor 2" width="280"/>
    </td>
    <td align="center">
      <strong>Campaign Details Part 2</strong><br/>
      <img src="level_4_screenshots/mobile_view_3_2_2.png" alt="Mobile Donor 3" width="280"/>
    </td>
  </tr>
</table>

> ✅ **Level 4 Proof:** Dual-portal architecture, global Firebase marketplace, 3-contract ecosystem, atomic inter-contract transactions, deep linking, Horizon SSE streaming, 7 Rust tests, full CI/CD pipeline, fully responsive on all devices.

---

## 🧪 Test Results

### Rust Contract Tests (7 passing)

```
running 2 tests
test test::test_donation_flow                    ... ok
test test::test_top_donors                       ... ok
test result: ok. 2 passed; 0 failed; finished in 0.34s

running 5 tests
test test_edge_case_unauthorized_logger_call - should panic    ... ok
test test_edge_case_zero_donation - should panic               ... ok
test test_edge_case_unauthorized_vault_withdrawal - should panic... ok
test test_admin_functions                                      ... ok
test test_full_donation_flow_end_to_end                        ... ok
test result: ok. 5 passed; 0 failed; finished in 0.33s
```

### Vitest Frontend Tests (4 passing)

```
✓ Stellar Philanthropy DApp (4)
  ✓ renders the landing page initially
  ✓ connects the wallet and displays the truncated address in Navbar
  ✓ navigates to marketplace and shows campaigns placeholder
  ✓ navigates to admin portal and shows empty state

Test Files  1 passed (1)
     Tests  4 passed (4)
  Duration  3.60s
```

Run tests locally:

```bash
# Frontend tests
npm run test

# Contract tests
cd contracts && cargo test
cd logger_contract && cargo test
cd vault_contract && cargo test
```

---

## ⚙️ CI/CD Pipeline

Every push to `main` or `level-4-upgrade` triggers 4 automated jobs:

```
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│  Contract           │  │  Frontend           │  │  Security           │
│  Verification       │  │  Verification       │  │  Scan               │
│                     │  │                     │  │                     │
│  • Rust setup       │  │  • Node.js 20       │  │  • npm audit        │
│  • wasm32 target    │  │  • npm install      │  │  • No hardcoded     │
│  • cargo test (x3)  │  │  • vitest (4 tests) │  │    Firebase keys    │
│  • cargo build      │  │  • npm build        │  │                     │
└──────────┬──────────┘  └──────────┬──────────┘  └──────────┬──────────┘
           │                        │                         │
           └────────────────────────┴─────────────────────────┘
                                    │ all pass
                                    ▼
                        ┌─────────────────────┐
                        │  Production Deploy  │
                        │  (main only)        │
                        │  • Vercel deploy    │
                        └─────────────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19 (Vite) |
| **Routing** | React Router DOM v7 |
| **Styling** | Tailwind CSS |
| **Blockchain SDK** | Stellar SDK |
| **Smart Contracts** | Soroban — Rust compiled to WASM |
| **Wallet Integration** | StellarWalletsKit (Freighter, xBull, Albedo) |
| **Database** | Firebase Firestore |
| **Real-time** | Horizon SSE EventSource |
| **Testing** | Vitest (frontend) + Rust cargo test (contracts) |
| **CI/CD** | GitHub Actions |
| **Deployment** | Vercel |

---

## ⚙️ Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/debdeepadutta/stellarpay.git
cd stellarpay
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the root:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 4. Run Locally

```bash
npm run dev
```

### 5. Run Tests

```bash
npm run test
```

### 6. Prerequisites

- ✅ [Freighter](https://freighter.app/), [xBull](https://xbull.app/), or [Albedo](https://albedo.link/) wallet installed
- ✅ Wallet set to **Stellar Testnet**
- ✅ Wallet funded via [Stellar Friendbot](https://friendbot.stellar.org/)

---

## 📁 Project Structure

```
stellarpay/
├── contracts/                         # Donation Contract (Rust/Soroban)
│   └── src/
│       ├── lib.rs                     # create_campaign, donate, get_campaign_info
│       └── test.rs                    # Rust unit tests (2 passing)
│   └── tests/
│       └── integration_test.rs        # Rust integration tests (5 passing)
├── logger_contract/                   # Logger Contract (Rust/Soroban)
│   └── src/lib.rs                     # log_donation, get_history, get_recent
├── vault_contract/                    # Vault Contract (Rust/Soroban)
│   └── src/lib.rs                     # deposit, withdraw, get_campaign_stats
├── src/
│   ├── pages/
│   │   ├── Landing.jsx                # Portal selection (Admin / Donor)
│   │   ├── AdminPortal.jsx            # Campaign creation & management
│   │   ├── DonorMarketplace.jsx       # Browse all campaigns
│   │   └── CampaignDetails.jsx        # Campaign page with donate + leaderboard
│   ├── components/
│   │   ├── AdminPanel.jsx             # Vault controls per campaign
│   │   ├── AnalyticsDashboard.jsx     # Charts & donation stats
│   │   ├── DonorLeaderboard.jsx       # Top philanthropists ranking
│   │   ├── LiveDonationFeed.jsx       # Horizon SSE real-time feed
│   │   ├── Navbar.jsx                 # Navigation + wallet status
│   │   ├── RecentLogs.jsx             # Logger contract events
│   │   ├── SendXLMForm.jsx            # Donation input form
│   │   ├── TopDonors.jsx              # Top donors widget
│   │   ├── TransactionStatus.jsx      # Tx status indicator
│   │   ├── VaultStats.jsx             # Vault balance display
│   │   └── WalletCard.jsx             # Connected wallet info
│   ├── assets/
│   │   └── logo.png                   # Stellar Philanthropy logo
│   ├── firebase.js                    # Firebase Firestore config
│   └── App.jsx                        # Router + contract constants
├── .github/workflows/ci.yml           # GitHub Actions pipeline
├── level_1_screenshots/               # Level 1 proof
├── level_2_screenshots/               # Level 2 proof
├── level_3_screenshots/               # Level 3 proof
├── level_4_screenshots/               # Level 4 proof
│   ├── landing_page.png               # Portal selection screen
│   ├── admin_portal.png               # Admin campaign management
│   ├── philanthropist1.png            # Donor marketplace
│   ├── philanthropist2.png            # Campaign details + donate
│   ├── inter_contract.png             # Stellar Expert atomic tx
│   ├── mobile_view_1.png              # Mobile landing
│   ├── mobile_view_2_!.png            # Mobile admin part 1
│   ├── mobile_view_2_2.png            # Mobile admin part 2
│   ├── mobile_view_2_3.png            # Mobile admin part 3
│   ├── mobile_view_3_1.png            # Mobile donor marketplace
│   ├── mobile_view_3_2_1.png          # Mobile campaign details part 1
│   └── mobile_view_3_2_2.png          # Mobile campaign details part 2
├── contract_deployment_summary.txt    # Deployed contract addresses
└── README.md
```

---

## 📌 Challenge Journey

| Level | Focus | Key Deliverable |
|-------|-------|----------------|
| **Level 1** | Foundation | Freighter wallet + XLM send/receive on Testnet |
| **Level 2** | Smart Contracts | Soroban donation contract + multi-wallet support |
| **Level 3** | Quality & Polish | 4 unit tests, localStorage caching, UX improvements |
| **Level 4** | Production Protocol | 3-contract ecosystem, dual portals, Firebase marketplace, CI/CD |

---

## 🙌 Author

**Debdeepa Dutta**

[![GitHub](https://img.shields.io/badge/GitHub-debdeepadutta-181717?style=flat-square&logo=github)](https://github.com/debdeepadutta)

---

<div align="center">
  <sub>Built with ❤️ on the Stellar Blockchain · Stellar Developer Program</sub>
</div>
