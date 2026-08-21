import React from 'react';

const CATEGORY_ICONS = {
  general: '🌐',
  education: '📚',
  health: '❤️',
  environment: '🌿',
  disaster: '🆘',
  community: '🏘️',
  arts: '🎨',
};

const CATEGORY_COLORS = {
  general:     'border-slate-500/60 bg-slate-900/95 shadow-lg',
  education:   'border-blue-500/60 bg-slate-900/95 shadow-lg',
  health:      'border-red-500/60 bg-slate-900/95 shadow-lg',
  environment: 'border-emerald-500/60 bg-slate-900/95 shadow-lg',
  disaster:    'border-amber-500/60 bg-slate-900/95 shadow-lg',
  community:   'border-purple-500/60 bg-slate-900/95 shadow-lg',
  arts:        'border-pink-500/60 bg-slate-900/95 shadow-lg',
};

/**
 * ImpactReceiptCard — displays a single on-chain Impact Receipt (SBT).
 * Minimalist card design as requested.
 */
export default function ImpactReceiptCard({ receipt }) {
  if (!receipt) return null;

  const xlm = (Number(BigInt(receipt.amount || 0)) / 10_000_000).toLocaleString(undefined, {
    maximumFractionDigits: 4,
  });

  const date = receipt.timestamp
    ? new Date(Number(BigInt(receipt.timestamp)) * 1000).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric'
    })
    : '—';

  const catKey = receipt.category?.toString() || 'general';
  const icon = CATEGORY_ICONS[catKey] || '🌐';
  const colorClass = CATEGORY_COLORS[catKey] || CATEGORY_COLORS.general;

  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${colorClass} relative overflow-hidden`}>
      {/* Watermark */}
      <div className="absolute top-2 right-3 text-5xl opacity-5 select-none pointer-events-none">
        {icon}
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <div>
            <div className="text-xs text-slate-500 uppercase font-bold tracking-widest">Impact Receipt</div>
            <div className="text-white font-bold text-sm mt-0.5 leading-tight">
              {receipt.campaign_name?.toString() || receipt.campaign_id?.toString()}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-emerald-400 font-black text-lg">{xlm} XLM</div>
          <div className="text-[10px] text-slate-500">#{Number(receipt.id)}</div>
        </div>
      </div>

      <div className="flex justify-between items-center pt-1 border-t border-white/5 text-xs text-slate-500">
        <span>{date}</span>
        <span className="capitalize bg-white/5 px-2 py-0.5 rounded-full">{catKey}</span>
      </div>
    </div>
  );
}


// fmt
// fmt