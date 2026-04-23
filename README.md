# 🚀 StellarPay: Modern Testnet dApp

StellarPay is a premium, high-performance decentralized application (dApp) built on the **Stellar Testnet**. It enables users to connect their Freighter wallet, monitor their XLM balances in real-time, and send secure transactions with a sleek, modern UI.

![StellarPay Logo](https://raw.githubusercontent.com/stellar/.github/master/stellar-logo.png)

## ✨ Features

- **🔐 Wallet Integration**: Seamless one-click connection using the [Freighter Wallet](https://www.freighter.app/) extension.
- **📊 Real-time Balance**: Automatically fetches and updates your XLM balance from the Stellar Horizon API.
- **💸 Secure Transfers**: Send XLM to any Stellar address with built-in validation and real-time transaction status.
- **🎨 Premium UI/UX**: Built with Tailwind CSS featuring glassmorphism, responsive layouts, and smooth micro-animations.
- **🔔 Interactive Feedback**: Real-time toast notifications for Every step of the transaction lifecycle.

## 🛠️ Tech Stack

- **Frontend**: [React](https://reactjs.org/) + [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Blockchain SDK**: [@stellar/stellar-sdk](https://github.com/stellar/js-stellar-sdk)
- **Wallet API**: [@stellar/freighter-api](https://github.com/stellar/freighter)
- **Notifications**: [React Hot Toast](https://react-hot-toast.com/)

## 🚀 Getting Started

Follow these steps to get your local development environment up and running.

### Prerequisites

1.  **Node.js**: Ensure you have Node.js installed (v16+ recommended).
2.  **Freighter Wallet**: Install the [Freighter Extension](https://www.freighter.app/) in your browser.
3.  **Testnet Account**: Fund your testnet account using the [Stellar Friendbot](https://laboratory.stellar.org/#account-creator?network=testnet).

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/your-username/stellar-pay-dapp.git
    cd stellar-pay-dapp
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Run the development server**:
    ```bash
    npm run dev
    ```

4.  **Open in browser**:
    Navigate to `http://localhost:5173` to see your dApp in action!

## 📸 Screenshots

| Dashboard View | Connect Wallet |
| :--- | :--- |
| ![Dashboard Placeholder](https://via.placeholder.com/400x250?text=StellarPay+Dashboard) | ![Connect Placeholder](https://via.placeholder.com/400x250?text=Freighter+Connection) |

## 🔮 Future Improvements

- [ ] **Transaction History**: Display a list of recent payments and receipts.
- [ ] **Asset Support**: Enable sending and receiving custom Stellar assets (tokens).
- [ ] **QR Code Support**: Scan recipient addresses for faster mobile transfers.
- [ ] **Dark/Light Mode**: Dynamic theme switching based on user preference.
- [ ] **Multi-sig Support**: Integrate multi-signature transaction workflows.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

Built with ❤️ for the Stellar Ecosystem.
