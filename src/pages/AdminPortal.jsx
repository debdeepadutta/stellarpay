import React from 'react';
import AdminPanel from '../components/AdminPanel';

const AdminPortal = ({ 
  address, 
  campaigns, 
  isSending, 
  newCampaign, 
  setNewCampaign, 
  handleCreateCampaign, 
  deleteCampaign, 
  totalDonations, 
  vaultStats, 
  lastUpdated, 
  fetchData,
  CONTRACT_ID,
  VAULT_CONTRACT_ID
}) => {
  if (!address) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-6">
        <div className="w-20 h-20 bg-indigo-500/10 rounded-full flex items-center justify-center text-4xl">🏛️</div>
        <h2 className="text-2xl font-bold text-white">Admin Terminal Restricted</h2>
        <p className="text-slate-500">Please connect your wallet to access administrative controls.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 space-y-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-4xl font-black text-white italic tracking-tighter uppercase">Admin <span className="text-indigo-500">Terminal</span></h1>
          <p className="text-slate-500">Manage your philanthropy ecosystem across the Stellar Network.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl relative overflow-hidden">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Campaigns</span>
            <div className="text-4xl font-black text-white mt-2">{campaigns.length}</div>
            <div className="text-[10px] text-slate-500 mt-1">{campaigns.filter(c => c.isActive).length} Active / {campaigns.filter(c => !c.isActive).length} Inactive</div>
            <div className="absolute top-4 right-4 text-[8px] font-mono text-slate-600">
              {Math.floor((Date.now() - lastUpdated.marketplace) / 1000)}s ago
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl relative overflow-hidden">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Global Managed Funds</span>
            <div className="text-4xl font-black text-emerald-400 mt-2">{totalDonations.toLocaleString()} XLM</div>
            <div className="absolute top-4 right-4 text-[8px] font-mono text-slate-600">
              {Math.floor((Date.now() - lastUpdated.vault) / 1000)}s ago
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl relative overflow-hidden">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Donors</span>
            <div className="text-4xl font-black text-indigo-400 mt-2">{vaultStats.deposit_count}</div>
            <div className="absolute top-4 right-4 text-[8px] font-mono text-slate-600">
              {Math.floor((Date.now() - lastUpdated.vault) / 1000)}s ago
            </div>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Creation Form */}
        <div className="lg:col-span-5">
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-[40px] space-y-8 sticky top-24">
            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-white">Create New Campaign</h3>
              <p className="text-slate-500 text-sm">Deploy a new donation initiative to the blockchain.</p>
            </div>

            <form onSubmit={handleCreateCampaign} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Campaign Name</label>
                <input 
                  value={newCampaign.name}
                  onChange={e => setNewCampaign({...newCampaign, name: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 p-4 rounded-xl text-white focus:border-amber-500 outline-none transition-all"
                  placeholder="e.g. Save the Rainforest"
                />
              </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Target Goal (XLM)</label>
                  <input 
                    type="number"
                    value={newCampaign.goal}
                    onChange={e => setNewCampaign({...newCampaign, goal: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 p-4 rounded-xl text-white focus:border-amber-500 outline-none transition-all"
                    placeholder="e.g. 5000"
                  />
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-slate-800">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Donation Contract ID</label>
                    <span className="text-[10px] text-slate-600 font-mono">Instance ID</span>
                  </div>
                  <input 
                    value={newCampaign.contractId}
                    onChange={e => setNewCampaign({...newCampaign, contractId: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-xs font-mono text-indigo-400 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Vault Contract ID</label>
                    <span className="text-[10px] text-slate-600 font-mono">Reserve ID</span>
                  </div>
                  <input 
                    value={newCampaign.vaultContractId}
                    onChange={e => setNewCampaign({...newCampaign, vaultContractId: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-xs font-mono text-emerald-400 focus:border-emerald-500 outline-none transition-all"
                  />
                </div>
                <p className="text-[10px] text-slate-600 italic">Pre-filled with default test contracts. Change only if using a new deployment.</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Description</label>
                <textarea 
                  value={newCampaign.description}
                  onChange={e => setNewCampaign({...newCampaign, description: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 p-4 rounded-xl text-white h-24 focus:border-amber-500 outline-none transition-all"
                  placeholder="Tell donors why this cause matters..."
                />
              </div>

              <button 
                disabled={isSending}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl transition-all shadow-xl shadow-indigo-600/20"
              >
                {isSending ? 'Initializing...' : 'Launch Campaign'}
              </button>
            </form>
          </div>
        </div>

        {/* Campaign List */}
        <div className="lg:col-span-7 space-y-6">
          <h3 className="text-xl font-bold text-white px-2">Managed Campaigns</h3>
          <div className="space-y-4">
            {campaigns.map(campaign => (
              <div key={campaign.id} className={`bg-slate-900 border ${campaign.isActive ? 'border-slate-800' : 'border-red-500/20 opacity-75'} p-6 rounded-[32px] space-y-6`}>
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-xl font-bold text-white">{campaign.name}</h4>
                    <p className="text-slate-500 text-xs mt-1">{campaign.description.slice(0, 100)}...</p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                       onClick={() => {
                        const url = `${window.location.origin}/campaign/${campaign.id}`;
                        navigator.clipboard.writeText(url);
                        toast.success("Share link copied!");
                      }}
                      className="p-2 bg-slate-800 rounded-lg text-slate-400 hover:text-indigo-400 transition-colors"
                      title="Copy Share Link"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                      </svg>
                    </button>
                    {campaign.isActive && (
                      <button 
                        onClick={() => deleteCampaign(campaign.id)}
                        className="p-2 bg-red-500/10 rounded-lg text-red-500 hover:bg-red-500 hover:text-white transition-all"
                        title="Deactivate"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
                
                <AdminPanel 
                  contractId={campaign.donationContractId || campaign.contractId || CONTRACT_ID} 
                  vaultContractId={campaign.vaultContractId || VAULT_CONTRACT_ID} 
                  connectedWallet={address} 
                  initialAdmin={campaign.adminWallet}
                  compact={true}
                  onActionComplete={fetchData}
                />
              </div>
            ))}
            {campaigns.length === 0 && (
              <div className="text-center py-12 bg-slate-900/50 border border-slate-800 border-dashed rounded-[40px]">
                <p className="text-slate-500">No campaigns managed yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPortal;
