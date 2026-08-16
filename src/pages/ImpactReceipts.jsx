import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  Networks,
  TransactionBuilder,
  Operation,
  Account,
  rpc,
  scValToNative,
  nativeToScVal,
  Address,
} from '@stellar/stellar-sdk';
import { Toaster } from 'react-hot-toast';
import ImpactReceiptCard from '../components/ImpactReceiptCard';
import ReputationBadge from '../components/ReputationBadge';

const SBT_CONTRACT_ID = import.meta.env.VITE_SBT_CONTRACT_ID || '';
const DONATION_CONTRACT_ID = import.meta.env.VITE_CONTRACT_ID || '';
const RPC_URL = 'https://soroban-testnet.stellar.org';

async function simulate(rpcServer, contractId, fn, args = []) {
  try {
    const builder = new TransactionBuilder(
      new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0'),
      { fee: '100', networkPassphrase: Networks.TESTNET }
    );
    const tx = builder
      .addOperation(Operation.invokeContractFunction({ contract: contractId, function: fn, args }))
      .setTimeout(30)
      .build();
    const res = await rpcServer.simulateTransaction(tx);
    if (rpc.Api.isSimulationSuccess(res)) {
      return scValToNative(res.result.retval);
    }
    return null;
  } catch {
    return null;
  }
}

export default function ImpactReceipts({ address, reputation }) {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address || !SBT_CONTRACT_ID) return;
    const fetchReceipts = async () => {
      setLoading(true);
      try {
        const rpcServer = new rpc.Server(RPC_URL);
        const donorAddr = Address.fromString(address).toScVal();

        // Get receipt IDs for donor
        const ids = await simulate(rpcServer, SBT_CONTRACT_ID, 'get_donor_receipts', [donorAddr]);
        if (!ids || ids.length === 0) {
          setReceipts([]);
          return;
        }

        // Fetch each receipt
        const fetches = ids.map(id =>
          simulate(rpcServer, SBT_CONTRACT_ID, 'get_receipt', [nativeToScVal(id, { type: 'u64' })])
        );
        const raw = await Promise.all(fetches);
        setReceipts(raw.filter(Boolean).reverse()); // newest first
      } catch (e) {
        console.error('Receipt fetch error:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchReceipts();
  }, [address]);

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <Helmet>
        <title>Impact Receipts | StellarPay</title>
        <meta name="description" content="Your on-chain impact receipts — soul-bound donation records stored permanently on Stellar." />
      </Helmet>

      <Link to="/donor" className="inline-flex items-center gap-2 text-slate-500 hover:text-indigo-400 transition-colors mb-8 group text-sm">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Marketplace
      </Link>

      <div className="space-y-2 mb-8">
        <h1 className="text-4xl font-black text-white tracking-tighter italic uppercase">Impact Receipts</h1>
        <p className="text-slate-400 text-sm">
          Soul-bound on-chain records of every donation you've made. Non-transferable, permanent.
        </p>
      </div>

      {!address && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center space-y-4">
          <div className="text-4xl">🔐</div>
          <h2 className="text-xl font-bold text-white">Connect Your Wallet</h2>
          <p className="text-slate-500 text-sm">Connect your wallet to view your impact receipts.</p>
        </div>
      )}

      {address && !SBT_CONTRACT_ID && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-3xl p-8 text-center space-y-2">
          <div className="text-3xl">⚠️</div>
          <p className="text-amber-300 font-bold">SBT contract not deployed yet.</p>
          <p className="text-slate-500 text-xs">Set VITE_SBT_CONTRACT_ID in your .env file after deploying sbt_contract.</p>
        </div>
      )}

      {address && SBT_CONTRACT_ID && (
        <>
          {reputation && (
            <div className="mb-6">
              <ReputationBadge
                score={Number(BigInt(reputation.score || 0))}
                totalDonated={reputation.total_donated}
                campaignCount={Number(reputation.campaign_count || 0)}
              />
            </div>
          )}

          {loading && (
            <div className="flex justify-center py-16">
              <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          )}

          {!loading && receipts.length === 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center space-y-4">
              <div className="text-5xl">🌱</div>
              <h2 className="text-xl font-bold text-slate-300">No Receipts Yet</h2>
              <p className="text-slate-500 text-sm">Make your first donation to earn an Impact Receipt.</p>
              <Link to="/donor" className="inline-block mt-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all text-sm">
                Browse Campaigns
              </Link>
            </div>
          )}

          {!loading && receipts.length > 0 && (
            <div className="space-y-4">
              <div className="flex justify-between items-center text-xs text-slate-500 uppercase tracking-widest font-bold px-1">
                <span>{receipts.length} Receipt{receipts.length !== 1 ? 's' : ''}</span>
                <span className="text-emerald-500">On-Chain ✓</span>
              </div>
              {receipts.map(r => (
                <ImpactReceiptCard key={Number(r.id)} receipt={r} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}


// fmt