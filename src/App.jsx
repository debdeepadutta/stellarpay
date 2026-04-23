import React, { useState, useEffect } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { 
  Horizon, 
  TransactionBuilder, 
  Asset, 
  Operation, 
  Networks, 
  StrKey,
  Transaction 
} from "@stellar/stellar-sdk";
import { 
  isConnected as isFreighterConnected, 
  requestAccess, 
  signTransaction 
} from "@stellar/freighter-api";
import Navbar from './components/Navbar';
import WalletCard from './components/WalletCard';
import SendXLMForm from './components/SendXLMForm';
import TransactionStatus from './components/TransactionStatus';

const server = new Horizon.Server("https://horizon-testnet.stellar.org");

function App() {
  // UI and Wallet States
  const [address, setAddress] = useState('');
  const [balance, setBalance] = useState('0.00');
  const [isFetchingBalance, setIsFetchingBalance] = useState(false);
  const [error, setError] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [txStatus, setTxStatus] = useState(null);
  const [txHash, setTxHash] = useState('');
  const [txCount, setTxCount] = useState(0);
  
  const connected = !!address;

  // Fetch Balance Logic
  const fetchBalance = async (pubKey) => {
    setIsFetchingBalance(true);
    try {
      const account = await server.loadAccount(pubKey);
      const native = account.balances.find(b => b.asset_type === 'native');
      setBalance(native ? parseFloat(native.balance).toFixed(4) : '0.00');
    } catch (e) {
      if (e.response?.status === 404) {
        setBalance('0.00');
        setError('Account not funded. Use Friendbot to start.');
      }
    } finally {
      setIsFetchingBalance(false);
    }
  };

  useEffect(() => {
    if (address) {
      fetchBalance(address);
    }
  }, [address]);

  // Handlers
  const handleConnect = async () => {
    setError(null);
    setIsConnecting(true);
    const connectionToast = toast.loading('Connecting to Freighter...');
    
    try {
      // Robust check for Freighter extension
      const isAvailable = (await isFreighterConnected()) || !!window.freighter || !!window.stlr;
      
      if (!isAvailable) {
        toast.error('Freighter not found!', { id: connectionToast });
        setError('Freighter wallet is not found. Please ensure it is installed and enabled.');
        return;
      }

      // requestAccess() is the modern way to get the public key
      const response = await requestAccess();
      
      // In Freighter v6, the public key is returned in the 'address' property
      const publicKey = typeof response === 'object' ? response.address : response;
      
      if (publicKey && typeof publicKey === 'string') {
        setAddress(publicKey);
        toast.success('Wallet connected!', { id: connectionToast });
      } else {
        throw new Error("No public key returned. Please ensure you are logged into Freighter.");
      }
    } catch (e) {
      console.error("Link failed:", e);
      const isRejection = e.message?.includes('User rejected') || e === 'User rejected';
      const msg = isRejection ? 'Connection rejected.' : (e.message || 'Failed to connect.');
      toast.error(msg, { id: connectionToast });
      setError(msg);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    setAddress('');
    setBalance('0.00');
    setError(null);
    setTxStatus(null);
    toast.success('Wallet disconnected');
  };

  const handleSend = async (recipient, amount) => {
    setIsSending(true);
    setError(null);
    setTxStatus(null);
    setTxHash('');

    const txToast = toast.loading('Building transaction...');

    try {
      // 1. Logic
      if (!StrKey.isValidEd25519PublicKey(recipient)) throw new Error("Invalid recipient address.");
      if (parseFloat(amount) > parseFloat(balance)) throw new Error("Insufficient balance.");

      // 2. Build
      toast.loading('Building Step...', { id: txToast });
      const account = await server.loadAccount(address);
      const baseFee = await server.fetchBaseFee();
      
      const transaction = new TransactionBuilder(account, {
        fee: baseFee,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(Operation.payment({
          destination: recipient,
          asset: Asset.native(),
          amount: String(amount),
        }))
        .setTimeout(60)
        .build();

      // 3. Sign
      toast.loading('Signing Step...', { id: txToast });
      const signResult = await signTransaction(transaction.toXDR(), { 
        network: 'TESTNET',
        networkPassphrase: Networks.TESTNET 
      });

      if (signResult?.error) throw new Error(`Signing failed: ${signResult.error}`);
      
      // Handle different return types (some versions return string, some object)
      const signedXdr = typeof signResult === 'object' ? signResult.signedTxXdr : signResult;
      if (!signedXdr) throw new Error("Wallet signed but returned no transaction data.");

      // 4. Submit
      toast.loading('Submitting Step...', { id: txToast });
      
      // In SDK v15+, it's safer to reconstruct the transaction object from the signed XDR
      const transactionToSubmit = new Transaction(signedXdr, Networks.TESTNET);
      const result = await server.submitTransaction(transactionToSubmit);
      
      setTxStatus('success');
      setTxHash(result.hash);
      setTxCount(prev => prev + 1);
      toast.success('Confirmed!', { id: txToast });
      
      setTimeout(() => fetchBalance(address), 2000);
    } catch (e) {
      console.error("Critical Flow Error:", e);
      let msg = e.response?.data?.extras?.result_codes?.transaction || e.message;
      if (msg?.includes("Main Net")) msg = "Switch to Testnet in Freighter.";
      
      toast.error(`Error: ${msg}`, { id: txToast, duration: 8000 });
      setError(msg);
      setTxStatus('failure');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-stellar-blue/30 overflow-x-hidden">
      <Toaster 
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#1e293b',
            color: '#f8fafc',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '16px',
            padding: '12px 20px',
          },
        }}
      />
      
      <Navbar 
        isConnected={connected} 
        address={address} 
        onConnect={handleConnect} 
        onDisconnect={handleDisconnect} 
      />

      <main className="max-w-4xl mx-auto px-6 pt-32 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column */}
          <div className="lg:col-span-7 space-y-8 animate-in fade-in slide-in-from-left duration-700">
            <div className="space-y-2">
              <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">
                Stellar <span className="text-stellar-blue">Dashboard</span>
              </h1>
              <p className="text-slate-400 text-lg md:text-xl">Secure and seamless XLM transfers.</p>
            </div>

            <WalletCard address={address} balance={balance} isFetching={isFetchingBalance} />
            
            {(error || txStatus) && (
              <TransactionStatus 
                status={error ? 'failure' : txStatus} 
                hash={txHash}
                message={error} 
              />
            )}
          </div>

          {/* Right Column */}
          <div className="lg:col-span-5 animate-in fade-in slide-in-from-right duration-700 delay-200">
            {connected ? (
              <SendXLMForm key={txCount} onSend={handleSend} isSending={isSending} />
            ) : (
              <div className="p-8 rounded-3xl glass border border-dashed border-white/10 flex flex-col items-center justify-center text-center space-y-6 py-20 group hover:border-stellar-blue/30 transition-colors">
                <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center text-slate-500 group-hover:scale-110 transition-transform duration-500">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div className="space-y-2">
                  <h3 className="text-white font-bold text-xl">Get Started</h3>
                  <p className="text-slate-400 text-sm max-w-[200px] mx-auto">Connect your wallet to manage your Stellar assets today.</p>
                </div>
                <button 
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className={`px-10 py-4 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-bold transition-all flex items-center gap-3 active:scale-95 shadow-xl ${isConnecting ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isConnecting ? (
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                    </svg>
                  ) : <span className="text-lg">Connect Wallet</span>}
                </button>
              </div>
            )}
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto px-6 py-8 border-t border-white/5 text-center">
        <p className="text-slate-500 text-sm">
          Built for Stellar Testnet • Powered by Freighter Wallet
        </p>
      </footer>
    </div>
  );
}

export default App;
