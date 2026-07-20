import React from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

const DonorMarketplace = ({ campaigns, firestoreError }) => {
  const navigate = useNavigate();

  const copyLink = (e, id) => {
    e.stopPropagation();
    const url = `${window.location.origin}/campaign/${id}`;
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

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 space-y-16">
      {/* Editorial Header */}
      <div className="border-b border-steel-horizon/20 pb-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="space-y-3">
          <span className="text-[10px] font-black text-steel-horizon uppercase tracking-widest font-display">PUBLIC REGISTER</span>
          <h1 className="text-4xl md:text-5xl font-bold text-archival-chalk font-display tracking-tight uppercase">
            Campaign <span className="text-parchment-wheat font-normal italic">Marketplace</span>
          </h1>
          <p className="text-steel-horizon text-sm max-w-xl">
            Verifiably inspect and sponsor humanitarian, ecological, and community initiatives deployed to the Stellar network.
          </p>
        </div>
        {campaigns.length > 0 && (
          <div className="font-mono text-xs text-parchment-wheat bg-carbon-ink border border-steel-horizon/30 px-3 py-1.5 rounded">
            TOTAL RECORDS: {campaigns.length.toString().padStart(2, '0')}
          </div>
        )}
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {campaigns.map(c => {
          const totalDonated = parseFloat(c.totalDonated || 0);
          const progress = c.goal > 0 ? Math.min((totalDonated / c.goal) * 100, 100) : 0;
          const remaining = Math.max(c.goal - totalDonated, 0);

          return (
            <div
              key={c.id}
              onClick={() => navigate(`/campaign/${c.id}`)}
              className="group bg-carbon-ink border border-steel-horizon/20 hover:border-parchment-wheat/40 p-6 rounded-2xl transition-all cursor-pointer flex flex-col justify-between h-[360px] relative overflow-hidden"
            >
              <div>
                <div className="flex justify-between items-start mb-6">
                  {/* Category Stamp */}
                  <span className="text-[9px] font-bold text-steel-horizon uppercase tracking-wider font-mono border border-steel-horizon/30 px-2 py-0.5 rounded">
                    {c.category || 'general'}
                  </span>
                  
                  <button
                    onClick={(e) => copyLink(e, c.id)}
                    className="p-1.5 bg-sage-slate/60 hover:bg-sage-slate border border-steel-horizon/20 rounded text-steel-horizon hover:text-parchment-wheat transition-colors"
                    title="Copy Share Link"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                  </button>
                </div>

                <h3 className="text-xl font-bold text-archival-chalk mb-2 font-display group-hover:text-parchment-wheat transition-colors line-clamp-1">
                  {c.name}
                </h3>
                <p className="text-steel-horizon text-xs line-clamp-4 leading-relaxed mb-6">
                  {c.description}
                </p>
              </div>

              {/* Progress and Ledger metrics */}
              <div className="space-y-4 pt-4 border-t border-steel-horizon/10 font-mono text-[10px]">
                <div className="flex justify-between text-steel-horizon">
                  <span>GOAL: {c.goal.toLocaleString()} XLM</span>
                  <span>REMAINING: {remaining.toLocaleString(undefined, { maximumFractionDigits: 1 })} XLM</span>
                </div>
                
                {/* Visual Progress Bar */}
                <div className="w-full h-1 bg-sage-slate rounded-full overflow-hidden">
                  <div
                    className="h-full bg-forest-moss transition-all duration-700"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <div className="flex justify-between items-center font-bold text-steel-horizon">
                  <span>{progress.toFixed(1)}% APPROVED</span>
                  <span className="text-parchment-wheat font-display tracking-widest text-[9px] uppercase group-hover:underline">Inspect Details →</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {firestoreError && (
        <div className="text-center py-16 border border-red-500/20 bg-carbon-ink rounded-2xl space-y-4">
          <div className="text-3xl">⚠️</div>
          <p className="text-red-400 font-bold text-sm">Database Sync Error</p>
          <p className="text-steel-horizon text-xs italic max-w-md mx-auto">{firestoreError}</p>
        </div>
      )}

      {!firestoreError && campaigns.length === 0 && (
        <div className="text-center py-24 border border-steel-horizon/20 bg-carbon-ink rounded-2xl space-y-4">
          <div className="text-3xl">🌌</div>
          <p className="text-archival-chalk font-bold text-sm">Empty Register</p>
          <p className="text-steel-horizon text-xs italic">The marketplace is quiet... be the first to launch a campaign!</p>
        </div>
      )}
    </div>
  );
};

export default DonorMarketplace;
