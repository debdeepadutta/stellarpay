import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import AdminPanel from '../components/AdminPanel';

const RelativeTime = ({ timestamp }) => {
  const [seconds, setSeconds] = useState(() => Math.floor((Date.now() - timestamp) / 1000));
  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds(Math.floor((Date.now() - timestamp) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [timestamp]);
  return <>{seconds === 0 ? 'Just now' : `${seconds}s ago`}</>;
};

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
  VAULT_CONTRACT_ID,
  kit
}) => {
  if (!address) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-6">
        <div className="w-16 h-16 bg-carbon-ink border border-steel-horizon/30 rounded-full flex items-center justify-center text-2xl">🏛️</div>
        <h2 className="text-xl font-bold text-archival-chalk font-display uppercase tracking-tight">Admin Terminal Restricted</h2>
        <p className="text-steel-horizon text-xs max-w-sm text-center">Please connect your wallet to access administrative controls for the Stellar network.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 space-y-16">
      {/* Editorial Header */}
      <div className="border-b border-steel-horizon/20 pb-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="space-y-3">
          <span className="text-[10px] font-black text-steel-horizon uppercase tracking-widest font-display">MANAGEMENT PANEL</span>
          <h1 className="text-4xl md:text-5xl font-bold text-archival-chalk font-display tracking-tight uppercase">
            Admin <span className="text-parchment-wheat font-normal italic">Terminal</span>
          </h1>
          <p className="text-steel-horizon text-sm max-w-xl">
            Configure campaign configs, verify real-world milestone gates, and execute secure vault withdrawals.
          </p>
        </div>
      </div>

      {/* Metrics Board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-carbon-ink border border-steel-horizon/20 p-6 rounded-2xl relative overflow-hidden flex flex-col justify-between h-[120px]">
            <span className="text-[9px] font-bold text-steel-horizon uppercase tracking-widest font-mono">Managed Campaigns</span>
            <div className="text-3xl font-bold text-archival-chalk font-display mt-2">{campaigns.length}</div>
            <div className="text-[9px] text-steel-horizon font-mono">{campaigns.filter(c => c.isActive).length} Active · {campaigns.filter(c => !c.isActive).length} Inactive</div>
            <div className="absolute top-4 right-4 text-[8px] font-mono text-steel-horizon/60">
              <RelativeTime timestamp={lastUpdated.marketplace} />
            </div>
          </div>

          <div className="bg-carbon-ink border border-steel-horizon/20 p-6 rounded-2xl relative overflow-hidden flex flex-col justify-between h-[120px]">
            <span className="text-[9px] font-bold text-steel-horizon uppercase tracking-widest font-mono">Global Managed Funds</span>
            <div className="text-3xl font-bold text-parchment-wheat font-display mt-2">{totalDonations.toLocaleString()} XLM</div>
            <div className="text-[9px] text-steel-horizon font-mono">Stellar Escrowed Total</div>
            <div className="absolute top-4 right-4 text-[8px] font-mono text-steel-horizon/60">
              <RelativeTime timestamp={lastUpdated.vault} />
            </div>
          </div>
          <div className="bg-carbon-ink border border-steel-horizon/20 p-6 rounded-2xl relative overflow-hidden flex flex-col justify-between h-[120px]">
            <span className="text-[9px] font-bold text-steel-horizon uppercase tracking-widest font-mono">Total Platform Donors</span>
            <div className="text-3xl font-bold text-forest-moss font-display mt-2">{vaultStats.deposit_count}</div>
            <div className="text-[9px] text-steel-horizon font-mono">On-chain transaction logs</div>
            <div className="absolute top-4 right-4 text-[8px] font-mono text-steel-horizon/60">
              <RelativeTime timestamp={lastUpdated.vault} />
            </div>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Creation Form */}
        <div className="lg:col-span-5">
          <div className="bg-carbon-ink border border-steel-horizon/20 p-6 rounded-2xl space-y-6 sticky top-24">
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-archival-chalk font-display uppercase tracking-tight">Deploy Campaign</h3>
              <p className="text-steel-horizon text-xs">Initialize a new campaign on the Stellar ledger.</p>
            </div>

            <form onSubmit={handleCreateCampaign} className="space-y-4 text-xs font-mono">
              <div className="space-y-1.5">
                <label className="text-[10px] text-steel-horizon uppercase font-bold">Campaign Name</label>
                <input 
                  value={newCampaign.name}
                  onChange={e => setNewCampaign({...newCampaign, name: e.target.value})}
                  className="w-full bg-sage-slate border border-steel-horizon/20 p-3 rounded-lg text-archival-chalk focus:border-parchment-wheat outline-none transition-all text-xs"
                  placeholder="e.g. Save the Dams"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] text-steel-horizon uppercase font-bold">Target Goal (XLM)</label>
                <input 
                  type="number"
                  value={newCampaign.goal}
                  onChange={e => setNewCampaign({...newCampaign, goal: e.target.value})}
                  className="w-full bg-sage-slate border border-steel-horizon/20 p-3 rounded-lg text-archival-chalk focus:border-parchment-wheat outline-none transition-all text-xs"
                  placeholder="e.g. 5000"
                />
              </div>

              <div className="space-y-3 pt-3 border-t border-steel-horizon/10">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-steel-horizon uppercase font-bold">Donation Contract Address</label>
                  <input 
                    value={newCampaign.contractId}
                    onChange={e => setNewCampaign({...newCampaign, contractId: e.target.value})}
                    className="w-full bg-sage-slate border border-steel-horizon/20 p-2.5 rounded-lg text-[10px] text-parchment-wheat focus:border-steel-horizon outline-none transition-all font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-steel-horizon uppercase font-bold">Vault Contract Address</label>
                  <input 
                    value={newCampaign.vaultContractId}
                    onChange={e => setNewCampaign({...newCampaign, vaultContractId: e.target.value})}
                    className="w-full bg-sage-slate border border-steel-horizon/20 p-2.5 rounded-lg text-[10px] text-forest-moss focus:border-steel-horizon outline-none transition-all font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] text-steel-horizon uppercase font-bold">Description</label>
                <textarea 
                  value={newCampaign.description}
                  onChange={e => setNewCampaign({...newCampaign, description: e.target.value})}
                  className="w-full bg-sage-slate border border-steel-horizon/20 p-3 rounded-lg text-archival-chalk h-20 focus:border-parchment-wheat outline-none transition-all text-xs font-sans"
                  placeholder="Outline the real-world milestone details..."
                />
              </div>

              {/* Milestone Configuration */}
              <div className="space-y-3 pt-3 border-t border-steel-horizon/10">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-steel-horizon uppercase font-bold">Milestone Gates</label>
                  <span className="text-[9px] text-forest-moss font-mono font-bold">ON-CHAIN GATED</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {(newCampaign.milestones || [25, 50, 75, 100]).map((m, i) => (
                    <div key={i} className="bg-sage-slate border border-steel-horizon/20 rounded-lg p-2 text-center">
                      <div className="text-forest-moss font-black text-sm font-display">{m}%</div>
                      <div className="text-[8px] text-steel-horizon mt-0.5 font-mono">Gate {i + 1}</div>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-steel-horizon uppercase font-bold">Verifier Wallet Address</label>
                  <input 
                    value={newCampaign.verifier || ''}
                    onChange={e => setNewCampaign({...newCampaign, verifier: e.target.value})}
                    className="w-full bg-sage-slate border border-steel-horizon/20 p-2.5 rounded-lg text-[10px] text-archival-chalk focus:border-steel-horizon outline-none transition-all font-mono"
                    placeholder="G... (defaults to campaign admin)"
                  />
                </div>
              </div>

              {/* Category */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-steel-horizon uppercase font-bold">Category</label>
                <select
                  value={newCampaign.category || 'general'}
                  onChange={e => setNewCampaign({...newCampaign, category: e.target.value})}
                  className="w-full bg-sage-slate border border-steel-horizon/20 p-3 rounded-lg text-archival-chalk focus:border-parchment-wheat outline-none transition-all text-xs font-sans"
                >
                  <option value="general">🌐 General</option>
                  <option value="education">📚 Education</option>
                  <option value="health">❤️ Health</option>
                  <option value="environment">🌿 Environment</option>
                  <option value="disaster">🆘 Disaster Relief</option>
                  <option value="community">🏘️ Community</option>
                  <option value="arts">🎨 Arts & Culture</option>
                </select>
              </div>

              {/* Region */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-steel-horizon uppercase font-bold">Region</label>
                <select
                  value={newCampaign.region || 'Global'}
                  onChange={e => setNewCampaign({...newCampaign, region: e.target.value})}
                  className="w-full bg-sage-slate border border-steel-horizon/20 p-3 rounded-lg text-archival-chalk focus:border-parchment-wheat outline-none transition-all text-xs font-sans"
                >
                  <option value="Global">🌍 Global</option>
                  <option value="North America">🦅 North America</option>
                  <option value="South America">🦙 South America</option>
                  <option value="Europe">🏰 Europe</option>
                  <option value="Africa">🦁 Africa</option>
                  <option value="Asia">🐼 Asia</option>
                  <option value="Oceania">🦘 Oceania</option>
                </select>
              </div>

              <button 
                disabled={isSending}
                className="w-full py-3 bg-[#E2E8F0] hover:bg-[#F1EAD7] disabled:opacity-50 text-carbon-ink font-bold rounded-lg transition-all text-xs tracking-wider uppercase"
              >
                {isSending ? 'Deploying...' : 'Launch Campaign'}
              </button>
            </form>

          </div>
        </div>

        {/* Campaign List */}
        <div className="lg:col-span-7 space-y-6">
          <h3 className="text-lg font-bold text-archival-chalk font-display uppercase tracking-tight">Active Initiatives</h3>
          <div className="space-y-6">
            {campaigns.map(campaign => (
              <div key={campaign.id} className={`bg-carbon-ink border ${campaign.isActive ? 'border-steel-horizon/20' : 'border-red-500/10 opacity-70'} p-6 rounded-2xl space-y-6`}>
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-xl font-bold text-archival-chalk font-display uppercase tracking-tight">{campaign.name}</h4>
                    <p className="text-steel-horizon text-xs mt-1 font-sans">{(campaign.description || '').slice(0, 100)}...</p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                       onClick={() => {
                        const url = `${window.location.origin}/campaign/${campaign.id}`;
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
                      }}
                      className="p-1.5 bg-sage-slate border border-steel-horizon/20 rounded text-steel-horizon hover:text-parchment-wheat transition-colors"
                      title="Copy Share Link"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                      </svg>
                    </button>
                    {campaign.isActive && (
                      <button 
                        onClick={() => deleteCampaign(campaign.id)}
                        className="p-1.5 bg-red-950 border border-red-500/20 rounded text-red-400 hover:bg-red-900 transition-colors"
                        title="Deactivate"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                  campaignId={campaign.id}
                  compact={true}
                  onActionComplete={fetchData}
                  kit={kit}
                />
              </div>
            ))}
            {campaigns.length === 0 && (
              <div className="text-center py-12 border border-dashed border-steel-horizon/20 rounded-2xl">
                <p className="text-steel-horizon text-xs italic">No campaigns managed yet</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPortal;


// fmt