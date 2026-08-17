import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Landing = () => {
  const navigate = useNavigate();
  const [receiptTorn, setReceiptTorn] = useState(false);

  return (
    <div className="min-h-[85vh] flex flex-col lg:flex-row items-center justify-between gap-16 px-6 max-w-6xl mx-auto py-12">
      {/* Editorial Branding Section */}
      <div className="flex-1 space-y-8 text-left">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-steel-horizon/30 bg-carbon-ink/40 text-xs font-bold text-parchment-wheat uppercase tracking-widest font-display">
            <span className="w-1.5 h-1.5 bg-forest-moss rounded-full animate-pulse"></span>
            Stellar Soroban Mainframe
          </div>
          <h1 className="text-5xl md:text-7xl font-bold text-archival-chalk font-display tracking-tight leading-none">
            STELLAR <span className="text-parchment-wheat font-normal italic">PHILANTHROPY</span>
          </h1>
          <p className="text-steel-horizon max-w-lg text-sm md:text-base leading-relaxed">
            A public, verifiable charity register powered by the Stellar network. No intermediaries, no hidden fees—just cryptographic proof of every dollar matching a real-world milestone.
          </p>
        </div>

        {/* Tactile Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md pt-4">
          <button 
            onClick={() => navigate('/donor')}
            className="group flex flex-col items-start p-6 rounded-2xl border border-steel-horizon/20 bg-carbon-ink hover:border-parchment-wheat/40 transition-all text-left"
          >
            <span className="text-[10px] uppercase tracking-widest text-steel-horizon font-bold mb-3">Philanthropist</span>
            <span className="text-lg font-bold text-archival-chalk font-display group-hover:text-parchment-wheat transition-colors">View Marketplace →</span>
            <span className="text-xs text-steel-horizon/80 mt-1">Fund verified campaigns and track impact receipts.</span>
          </button>

          <button 
            onClick={() => navigate('/admin')}
            className="group flex flex-col items-start p-6 rounded-2xl border border-steel-horizon/20 bg-carbon-ink hover:border-parchment-wheat/40 transition-all text-left"
          >
            <span className="text-[10px] uppercase tracking-widest text-steel-horizon font-bold mb-3">Campaign Admin</span>
            <span className="text-lg font-bold text-archival-chalk font-display group-hover:text-parchment-wheat transition-colors">Enter Terminal →</span>
            <span className="text-xs text-steel-horizon/80 mt-1">Initialize, manage, and verify milestone gates.</span>
          </button>
        </div>
      </div>

      {/* Signature Element: Interactive Perforated Receipt */}
      <div className="w-full max-w-sm flex-shrink-0 relative">
        {/* Receipt Slot Frame */}
        <div className="absolute top-[-10px] left-1/2 -translate-x-1/2 w-4/5 h-[8px] bg-[#07090D] border-x border-t border-steel-horizon/30 rounded-t-lg z-10"></div>
        
        {/* The Receipt Paper Card */}
        <div 
          className={`relative transition-all duration-700 ease-out transform ${
            receiptTorn 
              ? 'translate-y-[20px] rotate-2 opacity-95 shadow-md' 
              : 'translate-y-0 shadow-2xl hover:translate-y-[8px]'
          } bg-[#F5F4F0] text-[#1E2022] p-8 border border-[#D5D3C8] rounded-b-[4px] font-mono text-xs select-none`}
        >
          {/* Header */}
          <div className="text-center space-y-1 mb-6">
            <div className="font-bold text-[10px] uppercase tracking-widest text-[#6E7175]">Stellar Philanthropy Ledger</div>
            <div className="text-[9px] text-[#A1A4A8]">RECORD NO: REG-008492</div>
            <div className="border-b border-dashed border-[#C5C3B8] pt-2"></div>
          </div>

          {/* Details */}
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-[#6E7175]">METRIC:</span>
              <span className="font-bold">LIVE PLATFORM STATUS</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6E7175]">NETWORK:</span>
              <span className="font-bold">STELLAR TESTNET</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6E7175]">FUNDS:</span>
              <span className="font-bold">VERIFIABLE VAULTS</span>
            </div>
            
            <div className="border-b border-dashed border-[#C5C3B8] my-2"></div>

            <div className="space-y-2">
              <div className="flex justify-between text-[10px] font-bold">
                <span>ON-CHAIN TRUST METRIC</span>
                <span className="text-[#2C5E43]">✓ ENFORCED</span>
              </div>
              <div className="bg-[#EAE8DD] p-3 rounded font-mono text-[10px] space-y-1 text-[#2E3135]">
                <div>[x] MILESTONE VAULT GATES</div>
                <div>[x] SOUL-BOUND RECEIPTS</div>
                <div>[x] PUBLIC LOGGER HISTORY</div>
              </div>
            </div>

            <div className="border-b border-dashed border-[#C5C3B8] my-2"></div>

            <div className="space-y-1 text-center">
              <div className="text-[9px] text-[#8E9195] uppercase">Scan Cryptographic Proof</div>
              <div className="text-[10px] font-bold tracking-tight text-[#1E2022] truncate font-mono">
                CDBBFKGIDPUV65CYN7...
              </div>
            </div>
          </div>

          {/* Perforated Edge Bottom */}
          <div className="absolute bottom-[-6px] left-0 w-full h-[6px] perforated-edge"></div>

          {/* Tactile Tear Off Button */}
          {!receiptTorn ? (
            <button 
              onClick={() => {
                setReceiptTorn(true);
                setTimeout(() => setReceiptTorn(false), 5000); // resets after 5s
              }}
              className="mt-6 w-full py-2 bg-[#1E2022] hover:bg-[#2E3135] text-[#F5F4F0] text-[10px] font-bold uppercase tracking-wider rounded transition-colors text-center cursor-pointer"
            >
              ✂ Tear Off Receipt
            </button>
          ) : (
            <div className="mt-6 text-center text-[#2C5E43] font-bold text-[10px] uppercase tracking-wider py-2">
              ✓ Receipt Collected
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Landing;


// fmt
// fmt