import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import App from './App';

// ─── Firebase Mock ────────────────────────────────────────────────────────────
vi.mock('./firebase', () => ({
  db: { collection: vi.fn(), doc: vi.fn() }
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  doc: vi.fn(),
  serverTimestamp: vi.fn(),
  orderBy: vi.fn()
}));

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
      getWalletName: vi.fn().mockResolvedValue('Freighter'),
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
    accountId: () => 'GBYQD3REQAS6Z34CPQFXBJFOID6ZQFSYAIQM2C57ZKXPPBMRLIONL2F6',
    sequenceNumber: () => '0',
    incrementSequenceNumber: () => {},
    balances: [{ asset_type: 'native', balance: '100.00' }],
  };
  return {
    ...actual,
    rpc: {
      Server: vi.fn().mockImplementation(function() {
        return {
          simulateTransaction: vi.fn().mockResolvedValue({ result: { retval: {} } }),
          sendTransaction: vi.fn().mockResolvedValue({ status: 'PENDING', hash: 'mock_hash' }),
          getTransaction: vi.fn().mockResolvedValue({ status: 'SUCCESS' }),
        };
      }),
      Api: {
        isSimulationSuccess: () => true,
        isSimulationError: vi.fn(() => false),
        GetTransactionStatus: { SUCCESS: 'SUCCESS' },
      },
      assembleTransaction: vi.fn(() => ({
        build: vi.fn(() => ({ toXDR: vi.fn(() => 'MOCK_XDR') })),
      })),
    },
    Horizon: {
      Account: vi.fn().mockImplementation(function(id, seq) {
        this.accountId = () => id;
        this.sequenceNumber = () => seq;
        this.incrementSequenceNumber = () => {};
      }),
      Server: vi.fn().mockImplementation(function() {
        return { loadAccount: vi.fn().mockResolvedValue(fakeAcct) };
      }),
    },
    Transaction: vi.fn().mockImplementation(function() {
      this.toEnvelope = () => ({});
      this.toXDR = () => 'MOCK_TX_XDR';
    }),
  };
});

// ─── Test Suite ───────────────────────────────────────────────────────────────
describe('Stellar Philanthropy DApp', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  const renderApp = (initialEntries = ['/']) => {
    return render(
      <HelmetProvider context={{}}>
        <MemoryRouter initialEntries={initialEntries}>
          <App />
        </MemoryRouter>
      </HelmetProvider>
    );
  };

  it('renders the landing page initially', async () => {
    renderApp();
    expect(screen.getByRole('heading', { level: 1, name: /Stellar Philanthropy/i })).toBeInTheDocument();
    expect(screen.getByText(/Campaign Admin/i)).toBeInTheDocument();
    expect(screen.getByText(/Philanthropist/i)).toBeInTheDocument();
  });

  it('connects the wallet and displays the truncated address in Navbar', async () => {
    renderApp();
    const connectBtns = screen.getAllByText(/Connect Wallet/i);
    fireEvent.click(connectBtns[0]);
    expect(await screen.findByText(/GBYQ\.\.\.L2F6/i)).toBeInTheDocument();
  });

  it('navigates to marketplace and shows campaigns placeholder', async () => {
    renderApp();
    const marketplaceBtn = screen.getByText(/View Marketplace/i);
    fireEvent.click(marketplaceBtn);
    expect(await screen.findByRole('heading', { name: /Campaign Marketplace/i })).toBeInTheDocument();
    expect(screen.getByText(/The marketplace is quiet/i)).toBeInTheDocument();
  });

  it('navigates to admin portal and shows empty state', async () => {
    renderApp();
    fireEvent.click(screen.getAllByText(/Connect Wallet/i)[0]);
    await screen.findByText(/GBYQ\.\.\.L2F6/i);
    const adminBtn = screen.getByText(/Enter Terminal/i);
    fireEvent.click(adminBtn);
    expect(await screen.findByRole('heading', { name: /Admin Terminal/i })).toBeInTheDocument();
    expect(screen.getByText(/No campaigns managed yet/i)).toBeInTheDocument();
  });
});
