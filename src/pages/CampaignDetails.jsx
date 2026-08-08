import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Helmet } from 'react-helmet-async';
import { 
  Networks, 
  TransactionBuilder, 
  Operation, 
  Account, 
  rpc, 
  scValToNative,
  nativeToScVal 
} from "@stellar/stellar-sdk";
import toast from 'react-hot-toast';

import DonateXLMForm from '../components/SendXLMForm';
import DonorLeaderboard from '../components/DonorLeaderboard';
import LiveDonationFeed from '../components/LiveDonationFeed';
import WalletCard from '../components/WalletCard';
import ReputationBadge from '../components/ReputationBadge';
import MatchingPoolBanner from '../components/MatchingPoolBanner';
import ComplianceBanner from '../components/ComplianceBanner';
import AdminProfile from '../components/AdminProfile';

const CampaignDetails = ({ address, balance, isFetchingData, handleDonate, handleRegisterOnChain, deleteCampaign, isSending, txStatus, txHash, lastDonationAt, lastUpdated, fetchData }) => {
  const { id } = useParams();
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [reputation, setReputation] = useState(null);

  useEffect(() => {
    const docRef = doc(db, "campaigns", id);
    const unsubscribe = onSnapshot(docRef, async (docSnap) => {
      try {
        if (docSnap.exists()) {
          const data = { id: docSnap.id, ...docSnap.data() };
          const cid = data.donationContractId || data.contractId;
          
          let chainTotal = data.totalDonated || 0;
          let isOnChain = false;
          
          if (cid && cid.length === 56 && cid.startsWith('C')) {
            try {
              const rpcServer = new rpc.Server("https://soroban-testnet.stellar.org");
              const campaignSymbol = nativeToScVal(docSnap.id.substring(0, 32), { type: "symbol" });
              const builder = new TransactionBuilder(new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0"), { 
                fee: "100", 
                networkPassphrase: Networks.TESTNET 
              });
              
              const txInfo = builder.addOperation(Operation.invokeContractFunction({ 
                contract: cid, 
                function: "get_campaign_info", 
                args: [campaignSymbol] 
              })).setTimeout(30).build();
              
              const resInfo = await rpcServer.simulateTransaction(txInfo);
              if (rpc.Api.isSimulationSuccess(resInfo)) {
                const infoVal = scValToNative(resInfo.result.retval);
                if (infoVal !== null && infoVal !== undefined) {
                  isOnChain = true;
                  
                  const builder2 = new TransactionBuilder(new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0"), { 
                    fee: "100", 
                    networkPassphrase: Networks.TESTNET 
                  });
                  const txTotal = builder2.addOperation(Operation.invokeContractFunction({ 
                    contract: cid, 
                    function: "get_campaign_total", 
                    args: [campaignSymbol] 
                  })).setTimeout(30).build();
                  const resTotal = await rpcServer.simulateTransaction(txTotal);
                  if (rpc.Api.isSimulationSuccess(resTotal)) {
                    const val = scValToNative(resTotal.result.retval);
                    const onChainTotal = Number(BigInt(val)) / 10000000;
                    if (onChainTotal >= 0) {
                      chainTotal = onChainTotal;
                    }
                  }
                }
              }
            } catch (rpcErr) {
              console.warn("RPC check failed:", rpcErr);
            }
          }
          
          setCampaign({ ...data, totalDonated: chainTotal, isOnChain });
        } else {
          toast.error("Campaign not found");
        }
      } catch (e) {
        console.error("Error fetching campaign:", e);
      } finally {
        setLoading(false);
      }
    }, (error) => {
      console.error("onSnapshot error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [id, lastDonationAt]);

  useEffect(() => {
    if (!address || !campaign?.donationContractId) return;
    const fetchRep = async () => {
      try {
        const rpcServer = new rpc.Server('https://soroban-testnet.stellar.org');
        const cid = campaign.donationContractId || campaign.contractId;
        const { Address } = await import('@stellar/stellar-sdk');
        const builder = new TransactionBuilder(
          new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0'),
          { fee: '100', networkPassphrase: Networks.TESTNET }
        );
        const tx = builder.addOperation(Operation.invokeContractFunction({
          contract: cid,
          function: 'get_donor_reputation',
          args: [Address.fromString(address).toScVal()]
        })).setTimeout(30).build();
        const res = await rpcServer.simulateTransaction(tx);
        if (rpc.Api.isSimulationSuccess(res)) {
          const val = scValToNative(res.result.retval);
          if (val) setReputation(val);
        }
      } catch (e) {
        console.warn('Reputation fetch failed:', e);
      }
    };
    fetchRep();
  }, [address, campaign, lastDonationAt]);

  const handleRegister = async () => {
    setIsRegistering(true);
    const success = await handleRegisterOnChain(
      campaign.id,
      campaign.donationContractId || campaign.contractId,
      campaign.goal
    );
    if (success) {
      setCampaign(prev => ({ ...prev, isOnChain: true }));
    }
    setIsRegistering(false);
  };

  const copyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard", {
        icon: '🔗',
        style: {
          borderRadius: '8px',
          background: '#0A0D13',
          color: '#E2E8F0',
          border: '1px solid rgba(96, 115, 134, 0.2)'
        },
    });
  };

  const shareOnX = () => {
    const text = `I just supported ${campaign.name} on Stellar Philanthropy! Join me:`;
    const url = window.location.href;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
  };

  const shareOnLinkedIn = () => {
    const url = window.location.href;
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-steel-horizon/20 border-t-parchment-wheat rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
        <h2 className="text-xl font-bold text-archival-chalk font-display">Campaign not found</h2>
        <Link to="/donor" className="text-parchment-wheat hover:underline text-sm">Return to Marketplace</Link>
      </div>
    );
  }

  const chainTotal = parseFloat(campaign.totalDonated || 0);
  const progress = campaign.goal > 0 ? Math.min((chainTotal / campaign.goal) * 100, 100) : 0;

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <Helmet>
        <title>{campaign.name} | StellarPay</title>
        <meta property="og:title" content={campaign.name} />
        <meta property="og:description" content={campaign.description} />
      </Helmet>

      <Link to="/donor" className="inline-flex items-center gap-2 text-steel-horizon hover:text-parchment-wheat transition-colors mb-8 group text-xs font-bold font-mono">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        RETURN TO PUBLIC REGISTER
      </Link>

      {/* Deactivated Banner */}
      {!campaign.isActive && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 flex gap-4 mb-8 text-red-200">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
          <div>
            <h4 className="font-bold text-white text-sm">Campaign Deactivated</h4>
            <p className="text-steel-horizon text-xs mt-1">This campaign has been deactivated. No further donations can be received on-chain.</p>
          </div>
        </div>
      )}

      {/* Admin Panel controls banner */}
      {campaign.isActive && address && address.toLowerCase() === campaign.adminWallet?.toLowerCase() && (
        <div className="bg-carbon-ink border border-steel-horizon/30 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8">
          <div className="flex gap-4">
            <div className="w-10 h-10 rounded-xl bg-sage-slate border border-steel-horizon/20 flex items-center justify-center text-sm">⚙️</div>
            <div>
              <h4 className="font-bold text-archival-chalk text-sm">Administrative Authority</h4>
              <p className="text-steel-horizon text-xs mt-1">You own this campaign. You may deactivate it permanently to block donations.</p>
            </div>
          </div>
          <button 
            onClick={async () => {
              if (window.confirm("Deactivate this campaign? This blocks all donations on-chain permanently.")) {
                setIsDeactivating(true);
                await deleteCampaign(campaign.id);
                setIsDeactivating(false);
              }
            }}
            disabled={isDeactivating}
            className="px-4 py-2 bg-red-950 hover:bg-red-900 border border-red-500/20 text-red-300 font-bold rounded-lg text-xs transition-all shrink-0 cursor-pointer"
          >
            {isDeactivating ? 'Deactivating...' : 'Deactivate Campaign'}
          </button>
        </div>
      )}

      {/* On-Chain Registration Banner */}
      {!campaign.isOnChain && campaign.isActive && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8 text-amber-200">
          <div className="flex gap-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h4 className="font-bold text-white text-sm">Registration Missing on Stellar Ledger</h4>
              <p className="text-steel-horizon text-xs mt-1">This entry is local only and requires on-chain registration before donations can be accepted.</p>
            </div>
          </div>
          {address && address.toLowerCase() === campaign.adminWallet?.toLowerCase() && (
            <button 
              onClick={handleRegister}
              disabled={isRegistering}
              className="px-4 py-2 bg-amber-950 hover:bg-amber-900 border border-amber-500/20 text-amber-300 font-bold rounded-lg text-xs transition-all shrink-0 cursor-pointer"
            >
              {isRegistering ? 'Registering...' : 'Register On-Chain'}
            </button>
          )}
        </div>
      )}

      {/* Main layout grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Left Side: Campaign descriptions, metrics */}
        <div className="lg:col-span-7 space-y-12">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2">
              <span className="text-[9px] font-bold text-parchment-wheat font-mono border border-parchment-wheat/30 px-2 py-0.5 rounded uppercase">
                {campaign.category || 'general'}
              </span>
              <span className="text-[9px] font-bold text-steel-horizon font-mono border border-steel-horizon/30 px-2 py-0.5 rounded uppercase">
                {campaign.region || 'Global'}
              </span>
            </div>
            
            <h1 className="text-4xl md:text-5xl font-bold text-archival-chalk font-display uppercase tracking-tight">
              {campaign.name}
            </h1>
            <p className="text-steel-horizon text-sm leading-relaxed whitespace-pre-line">
              {campaign.description}
            </p>
          </div>

          {/* Ledger Board: Progress & Balance details */}
          <div className="border border-steel-horizon/20 bg-carbon-ink rounded-2xl p-6 space-y-6">
            <div className="flex justify-between items-center text-xs font-mono text-steel-horizon">
              <span>FUNDING PROGRESS</span>
              <span className="text-parchment-wheat">{progress.toFixed(1)}%</span>
            </div>

            <div className="w-full h-1.5 bg-sage-slate rounded-full overflow-hidden">
              <div 
                className="h-full bg-forest-moss transition-all duration-700" 
                style={{ width: `${progress}%` }}
              ></div>
            </div>

            <div className="grid grid-cols-3 gap-4 border-t border-steel-horizon/10 pt-6 font-mono">
              <div>
                <span className="text-[9px] uppercase tracking-wider text-steel-horizon">Target Goal</span>
                <div className="text-base sm:text-lg font-bold text-archival-chalk mt-1">{campaign.goal.toLocaleString()} XLM</div>
              </div>
              <div className="border-x border-steel-horizon/10 px-4">
                <span className="text-[9px] uppercase tracking-wider text-steel-horizon">Total Raised</span>
                <div className="text-base sm:text-lg font-bold text-archival-chalk mt-1">{chainTotal.toLocaleString()} XLM</div>
              </div>
              <div className="text-right">
                <span className="text-[9px] uppercase tracking-wider text-steel-horizon text-forest-moss">Remaining</span>
                <div className="text-base sm:text-lg font-bold text-forest-moss mt-1">
                  {Math.max(campaign.goal - chainTotal, 0).toLocaleString()} XLM
                </div>
              </div>
            </div>
          </div>

          <LiveDonationFeed contractId={campaign.donationContractId || campaign.contractId} />
        </div>

        {/* Right Side: Action Panel */}
        <div className="lg:col-span-5 space-y-8">
          <ComplianceBanner
            loggerContractId={import.meta.env.VITE_LOGGER_CONTRACT_ID}
            campaignId={campaign.contractCampaignId || campaign.id}
          />
          
          <MatchingPoolBanner
            vaultContractId={import.meta.env.VITE_VAULT_CONTRACT_ID}
            campaignId={campaign.contractCampaignId || campaign.id}
            lastDonationAt={lastDonationAt}
          />

          <DonateXLMForm 
            address={address} 
            onDonate={(r, a) => handleDonate(campaign.id, campaign.donationContractId || campaign.contractId, a)} 
            isSending={isSending} 
            txStatus={txStatus} 
            txHash={txHash} 
            disabled={!campaign.isOnChain || !campaign.isActive}
          />

          <DonorLeaderboard 
            contractId={campaign.donationContractId || campaign.contractId} 
            connectedWallet={address} 
            lastDonationAt={lastDonationAt}
            campaignId={campaign.id}
          />

          <WalletCard 
            address={address} 
            balance={balance} 
            isFetching={isFetchingData} 
            lastUpdated={lastUpdated.wallet}
            onBalanceRefresh={fetchData}
          />

          {reputation && (
            <ReputationBadge
              score={Number(BigInt(reputation.score || 0))}
              totalDonated={reputation.total_donated}
              campaignCount={Number(reputation.campaign_count || 0)}
            />
          )}

          {campaign.adminWallet && (
            <AdminProfile
              adminAddress={campaign.adminWallet}
              donationContractId={campaign.donationContractId || campaign.contractId}
              networkPassphrase={Networks.TESTNET}
              rpcUrl="https://soroban-testnet.stellar.org"
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default CampaignDetails;


// fmt
// fmt