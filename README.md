<div align="center">

# 🚀 Stellar Philanthropy

### A Multi-Wallet Donation dApp on the Stellar Blockchain

[![Stellar](https://img.shields.io/badge/Stellar-Testnet-7C3AED?style=for-the-badge&logo=stellar&logoColor=white)](https://stellar.org)
[![React](https://img.shields.io/badge/React-Vite-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://vitejs.dev)
[![Soroban](https://img.shields.io/badge/Soroban-Smart%20Contract-FF6B35?style=for-the-badge)](https://soroban.stellar.org)
[![Vercel](https://img.shields.io/badge/Deployed-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://stellarpay-lac.vercel.app/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

**A modern decentralized application (dApp) that enables users to donate XLM using multiple wallets, powered by Soroban smart contracts on the Stellar Testnet.**

[🌐 Live Demo](https://stellarpay-lac.vercel.app/) · [📜 Smart Contract](https://stellar.expert/explorer/testnet/contract/CA4AINMRJWDKJUURUX4NGLA27XOWFAAEDLCMT5FHLHBTJ2X3CRPUBQOD) · [🔍 Sample Transaction](https://stellar.expert/explorer/testnet/tx/af5cb8470fa8e614a24b89bcb2e5eeb3a786768345f9300a5596d2bbbd217213)

</div>

---

## 📋 Table of Contents

- [Features](#-features)
- [Smart Contract](#-smart-contract)
- [Screenshots](#-screenshots)
- [Tech Stack](#-tech-stack)
- [Setup Instructions](#-setup-instructions)
- [Project Structure](#-project-structure)
- [Author](#-author)

---

## ✨ Features

### 🔹 Level 1 — Foundation

| Feature | Description |
|--------|-------------|
| 🔐 Wallet Connection | Connect your Freighter wallet seamlessly |
| 💰 Balance View | Check your live XLM balance |
| 💸 Send XLM | Send XLM transactions on the Stellar network |
| ✅ Transaction Feedback | Real-time success/failure notifications |

### 🔹 Level 2 — Smart Contract Integration

| Feature | Description |
|--------|-------------|
| 🧠 Soroban Integration | Full Soroban smart contract deployment and interaction |
| 💸 Donate via Contract | Donate XLM atomically through the `donate` contract function |
| 📊 Live Donation Totals | Query `get_total` and see updates in real time |
| 🔄 Real-time Updates | UI refreshes automatically after each donation |
| 🔐 Multi-Wallet Support | Compatible with Freighter, xBull, and Albedo wallets |
| 📡 Transaction Status | Clear Pending / Success / Failed state indicators |

### ⚠️ Error Handling

- Wallet extension not found
- User rejected transaction
- Insufficient XLM balance

---

## 🧾 Smart Contract

| Property | Value |
|----------|-------|
| **Network** | Stellar Testnet |
| **Contract Address** | `CA4AINMRJWDKJUURUX4NGLA27XOWFAAEDLCMT5FHLHBTJ2X3CRPUBQOD` |
| **Language** | Rust (compiled to WASM) |
| **Functions** | `donate(amount)`, `get_total()` |

🔗 **Contract Explorer:**
[View on Stellar Expert →](https://stellar.expert/explorer/testnet/contract/CA4AINMRJWDKJUURUX4NGLA27XOWFAAEDLCMT5FHLHBTJ2X3CRPUBQOD)

🔗 **Sample Transaction Hash:**
```
af5cb8470fa8e614a24b89bcb2e5eeb3a786768345f9300a5596d2bbbd217213
```
[View Transaction on Stellar Expert →](https://stellar.expert/explorer/testnet/tx/af5cb8470fa8e614a24b89bcb2e5eeb3a786768345f9300a5596d2bbbd217213)

---

## 📸 Screenshots

### 🔹 Level 1 — Basic Wallet & Transactions

<table>
  <tr>
    <td align="center">
      <strong>Wallet Connected</strong><br/>
      <img src="level_1_screenshots/wallet_connected.png" alt="Wallet Connected" width="320"/>
    </td>
    <td align="center">
      <strong>Transaction Confirmation</strong><br/>
      <img src="level_1_screenshots/transaction_confirm.png" alt="Transaction Confirmation" width="320"/>
    </td>
    <td align="center">
      <strong>Transaction Success</strong><br/>
      <img src="level_1_screenshots/transaction_success.png" alt="Transaction Success" width="320"/>
    </td>
  </tr>
</table>

---

### 🔹 Level 2 — Smart Contract & Multi-Wallet

<table>
  <tr>
    <td align="center">
      <strong>Multi-Wallet Options</strong><br/>
      <img src="level_2_screenshots/wallet_options.png" alt="Wallet Options" width="320"/>
    </td>
    <td align="center">
      <strong>Donation Success & Updated Total</strong><br/>
      <img src="level_2_screenshots/donation_success.png" alt="Donation Success" width="320"/>
    </td>
    <td align="center">
      <strong>Contract Explorer Proof</strong><br/>
      <img src="level_2_screenshots/contract_proof.png" alt="Contract Proof" width="320"/>
    </td>
  </tr>
</table>

---

### 🔹 Development — Implementation Plan (VS Code + Antigravity)

<img src="level_1_screenshots/stellar_expert.png" alt="Stellar Expert Explorer" width="700"/>

> Smart contract verified on Stellar Expert Testnet explorer.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React (Vite) |
| **Styling** | Tailwind CSS |
| **Blockchain SDK** | Stellar SDK |
| **Smart Contracts** | Soroban (Rust → WASM) |
| **Wallet Integration** | StellarWalletsKit (Freighter, xBull, Albedo) |
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

### 3. Run Locally

```bash
npm run dev
```

### 4. Requirements

Before using the app, make sure you have:

- ✅ [Freighter](https://freighter.app/) or [xBull](https://xbull.app/) or [Albedo](https://albedo.link/) wallet installed
- ✅ Network switched to **Stellar Testnet** in your wallet
- ✅ Wallet funded using [Stellar Friendbot](https://friendbot.stellar.org/)

---

## 📁 Project Structure

```
stellarpay/
├── contracts/               # Soroban smart contract (Rust)
│   ├── src/
│   │   └── lib.rs           # Contract logic (donate, get_total)
│   └── Cargo.toml
├── src/                     # React frontend
│   └── App.jsx              # Main app with multi-wallet & contract calls
├── level_1_screenshots/     # Level 1 demo screenshots
├── level_2_screenshots/     # Level 2 demo screenshots
├── public/
├── package.json
└── .gitignore
```

---

## 📌 Project Context

This dApp was built as part of the **Stellar Developer Program — Level 2 Challenge**, demonstrating end-to-end blockchain development skills:

- ✅ Smart contract design, build, and deployment on Stellar Testnet
- ✅ Frontend–contract interaction via Soroban SDK
- ✅ Multi-wallet integration using StellarWalletsKit
- ✅ Real-time blockchain state updates in the UI

---

## 🙌 Author

**Debdeepa Dutta**

[![GitHub](https://img.shields.io/badge/GitHub-debdeepadutta-181717?style=flat-square&logo=github)](https://github.com/debdeepadutta)

---

<div align="center">
  <sub>Built with ❤️ on the Stellar Blockchain</sub>
</div>
