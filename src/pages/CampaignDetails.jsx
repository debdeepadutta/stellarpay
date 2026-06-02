import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Helmet } from 'react-helmet-async';
import { 
  Networks, 
  TransactionBuilder, 
  Operation, 
  Account, 
  rpc, 
  scValToNative 
} from "@stellar/stellar-sdk";
import toast from 'react-hot-toast';

import DonateXLMForm from '../components/SendXLMForm';
import DonorLeaderboard from '../components/DonorLeaderboard';
import LiveDonationFeed from '../components/LiveDonationFeed';
import WalletCard from '../components/WalletCard';

const CampaignDetails = ({ address, balance, isFetchingData, handleDonate, isSending, txStatus, txHash, lastDonationAt, lastUpdated }) => {
  const { id } = useParams();
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCampaign = async () => {
      try {
        const docRef = doc(db, "campaigns", id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = { id: docSnap.id, ...docSnap.data() };
          const cid = data.donationContractId || data.contractId;
          
          let chainTotal = data.totalDonated || 0;
          // Only query the chain if we have a valid Soroban contract ID (56 chars, starts with C)
          if (cid && cid.length === 56 && cid.startsWith('C')) {
            try {
              const rpcServer = new rpc.Server("https://soroban-testnet.stellar.org");
              const builder = new TransactionBuilder(new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0"), { 
                fee: "100", 
                networkPassphrase: Networks.TESTNET 
              });
              const tx = builder.addOperation(Operation.invokeContractFunction({ contract: cid, function: "get_total", args: [] })).setTimeout(30).build();
              const res = await rpcServer.simulateTransaction(tx);
              if (rpc.Api.isSimulationSuccess(res)) {
                const val = scValToNative(res.result.retval);
                chainTotal = Number(BigInt(val));
              }
            } catch (rpcErr) {
              // Silently ignore — contract may not exist on testnet anymore
            }
          }
          
          setCampaign({ ...data, totalDonated: chainTotal });
        } else {
          toast.error("Campaign not found");
        }
      } catch (e) {
        console.error("Error fetching campaign:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchCampaign();
  }, [id, lastDonationAt]);

  const copyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast.success("Link copied! Share to get more donors", {
        icon: '🔗',
        style: {
          borderRadius: '10px',
          background: '#1e293b',
          color: '#fff',
          border: '1px solid #334155'
        },
    });
  };

  const shareOnX = () => {
    const text = `I just supported ${campaign.name} on Stellar Philanthropy! Join me in making a difference:`;
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
        <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
        <h2 className="text-2xl font-bold text-white">Campaign not found</h2>
        <Link to="/donor" className="text-indigo-400 hover:underline">Return to Marketplace</Link>
      </div>
    );
  }

  const chainTotal = parseFloat(campaign.totalDonated || 0);
  const isUsingOldContract = (campaign.donationContractId || campaign.contractId) === "CCYNUO7LFWI3IT2IZMFEFU4CQUYGI7JPOODXEHJ7UQEP5JKSBPY2SLCG";
  
  // UI-side fix: If they are using the old contract, the history makes the bar look full.
  // We show the real progress but warn the user.
  const progress = campaign.goal > 0 ? Math.min((chainTotal / campaign.goal) * 100, 100) : 0;

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <Helmet>
        <title>{campaign.name} | Stellar Philanthropy</title>
        <meta property="og:title" content={campaign.name} />
        <meta property="og:description" content={campaign.description} />
        <meta property="og:url" content={window.location.href} />
      </Helmet>

      <Link to="/donor" className="inline-flex items-center gap-2 text-slate-500 hover:text-indigo-400 transition-colors mb-8 group">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to Marketplace
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Left Column: Details & Feed */}
        <div className="lg:col-span-7 space-y-12">
          <div className="space-y-6">
            <div className="flex justify-between items-start">
              <h1 className="text-4xl md:text-5xl font-black text-white italic tracking-tighter uppercase">{campaign.name}</h1>
              <div className="flex gap-2">
                <button onClick={copyLink} className="p-3 bg-slate-900 border border-slate-800 rounded-xl hover:border-indigo-500 transition-all text-slate-400 hover:text-indigo-400" title="Copy Link">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                </button>
                <button onClick={shareOnX} className="p-3 bg-slate-900 border border-slate-800 rounded-xl hover:border-sky-500 transition-all text-slate-400 hover:text-sky-400" title="Share on X">
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </button>
                <button onClick={shareOnLinkedIn} className="p-3 bg-slate-900 border border-slate-800 rounded-xl hover:border-blue-500 transition-all text-slate-400 hover:text-blue-400" title="Share on LinkedIn">
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451c.981 0 1.778-.773 1.778-1.729V1.729C24 .774 23.206 0 22.225 0z"/></svg>
                </button>
              </div>
            </div>
            <p className="text-slate-400 text-lg leading-relaxed">{campaign.description}</p>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-[40px] space-y-6">
            {isUsingOldContract && (
              <div className="bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-2xl flex gap-3 items-start">
                <span className="text-xl">ℹ️</span>
                <div>
                  <h4 className="text-indigo-400 font-bold text-sm">Shared Testing Mode</h4>
                  <p className="text-indigo-400/60 text-xs mt-1">This campaign is using the platform's default test contract. Progress shown reflects the collective history of all test campaigns.</p>
                </div>
              </div>
            )}
            <div className="flex justify-between items-center bg-slate-950/50 p-6 rounded-3xl border border-white/5">
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest text-indigo-400">Target Goal</span>
                <div className="text-2xl font-black text-white">{campaign.goal.toLocaleString()} XLM</div>
              </div>
              <div className="h-12 w-px bg-slate-800 hidden md:block"></div>
              <div className="space-y-1 text-right">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest text-emerald-400">Remaining</span>
                <div className="text-2xl font-black text-emerald-400">
                  {Math.max(campaign.goal - chainTotal, 0).toLocaleString()} XLM
                </div>
              </div>
            </div>
          </div>

          <LiveDonationFeed contractId={campaign.donationContractId || campaign.contractId} />
        </div>

        {/* Right Column: Interaction */}
        <div className="lg:col-span-5 space-y-8">
           <DonateXLMForm 
            address={address} 
            onDonate={(r, a) => handleDonate(campaign.donationContractId || campaign.contractId, a)} 
            isSending={isSending} 
            txStatus={txStatus} 
            txHash={txHash} 
          />
          <DonorLeaderboard 
            contractId={campaign.donationContractId || campaign.contractId} 
            connectedWallet={address} 
            lastDonationAt={lastDonationAt}
          />
          <WalletCard 
            address={address} 
            balance={balance} 
            isFetching={isFetchingData} 
            lastUpdated={lastUpdated.wallet} 
          />
        </div>
      </div>
    </div>
  );
};

export default CampaignDetails;
