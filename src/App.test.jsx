import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import App from './App';

// ─── Wallet Kit Mock ─────────────────────────────────────────────────────────
vi.mock("@creit.tech/stellar-wallets-kit", () => ({
  StellarWalletsKit: vi.fn().mockImplementation(function() {
    return {
      openModal: vi.fn(({ onWalletSelected }) => {
        onWalletSelected({ id: 'freighter', name: 'Freighter' });
      }),
      setWallet: vi.fn(),
      getAddress: vi.fn().mockResolvedValue({
        address: 'GBYQD3REQAS6Z34CPQFXBJFOID6ZQFSYAIQM2C57ZKXPPBMRLIONL2F6',
      }),
      signTransaction: vi.fn().mockResolvedValue({ signedTxXdr: 'MOCK_SIGNED_XDR' }),
      disconnect: vi.fn(),
    };
  }),
  WalletNetwork: { TESTNET: 'TESTNET' },
  FreighterModule: vi.fn(),
  xBullModule: vi.fn(),
  AlbedoModule: vi.fn(),
  HanaModule: vi.fn(),
  LobstrModule: vi.fn(),
  RabetModule: vi.fn(),
}));

// ─── Stellar SDK Mock ─────────────────────────────────────────────────────────
vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const actual = await importOriginal();

  const fakeAcct = {
    accountId:               () => 'GBYQD3REQAS6Z34CPQFXBJFOID6ZQFSYAIQM2C57ZKXPPBMRLIONL2F6',
    sequenceNumber:          () => '0',
    incrementSequenceNumber: () => {},
    balances: [{ asset_type: 'native', balance: '100.00' }],
  };

  return {
    ...actual,
    rpc: {
      Server: vi.fn().mockImplementation(function() {
        return {
          simulateTransaction: vi.fn().mockResolvedValue({ result: { retval: {} } }),
          sendTransaction:     vi.fn().mockResolvedValue({ status: 'PENDING', hash: 'mock_hash' }),
          getTransaction:      vi.fn().mockResolvedValue({ status: 'SUCCESS' }),
        };
      }),
      Api: {
        isSimulationSuccess: () => true,
        isSimulationError:   vi.fn(() => false),
        GetTransactionStatus: { SUCCESS: 'SUCCESS' },
      },
      assembleTransaction: vi.fn(() => ({
        build: vi.fn(() => ({ toXDR: vi.fn(() => 'MOCK_XDR') })),
      })),
    },
    Horizon: {
      Account: vi.fn().mockImplementation(function(id, seq) {
        this.accountId               = () => id;
        this.sequenceNumber          = () => seq;
        this.incrementSequenceNumber = () => {};
      }),
      Server: vi.fn().mockImplementation(function() {
        return { loadAccount: vi.fn().mockResolvedValue(fakeAcct) };
      }),
    },
    Transaction: vi.fn().mockImplementation(function() {
      this.toEnvelope = () => ({});
      this.toXDR      = () => 'MOCK_TX_XDR';
    }),
  };
});

// ─── Test Suite ───────────────────────────────────────────────────────────────
describe('Stellar Philanthropy DApp', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  // ── Test 1: Rendering & localStorage Cache ────────────────────────────────
  it('renders the header and shows the cached donation total', async () => {
    localStorage.setItem('stellar_total_donations', '500.00');
    render(<App />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Stellar Philanthropy/i);
    // findByText waits for the isFetchingTotal spinner to resolve
    expect(await screen.findByText(/500.00/i)).toBeInTheDocument();
  });

  // ── Test 2: Wallet Connection ─────────────────────────────────────────────
  it('connects the wallet and displays the truncated address', async () => {
    render(<App />);
    fireEvent.click(screen.getAllByText(/Connect Wallet/i)[0]);

    expect(await screen.findByText(/GBYQ\.\.\.L2F6/i)).toBeInTheDocument();
  });

  // ── Test 3: Donation Form Visibility ─────────────────────────────────────
  it('shows the donation form once a wallet is connected', async () => {
    render(<App />);
    fireEvent.click(screen.getAllByText(/Connect Wallet/i)[0]);

    expect(await screen.findByText(/Donate to Pool/i)).toBeInTheDocument();
  });

  // ── Test 4: Pool Snapshot Card Exists ────────────────────────────────────
  it('shows the Total Donations card with Pool Snapshot label', () => {
    render(<App />);

    expect(screen.getByText(/Total Donations/i)).toBeInTheDocument();
    expect(screen.getByText(/Pool Snapshot/i)).toBeInTheDocument();
  });
});
