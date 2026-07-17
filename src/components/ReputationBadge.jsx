import React from 'react';

const TIERS = [
  { min: 0,    label: 'Newcomer',    color: 'text-slate-400',  bg: 'bg-slate-800',          icon: '🌱', border: 'border-slate-600' },
  { min: 50,   label: 'Supporter',   color: 'text-blue-400',   bg: 'bg-blue-900/30',        icon: '💙', border: 'border-blue-500/40' },
  { min: 200,  label: 'Advocate',    color: 'text-indigo-400', bg: 'bg-indigo-900/30',      icon: '⭐', border: 'border-indigo-500/40' },
  { min: 500,  label: 'Champion',    color: 'text-purple-400', bg: 'bg-purple-900/30',      icon: '🏆', border: 'border-purple-500/40' },
  { min: 1500, label: 'Legendary',   color: 'text-amber-400',  bg: 'bg-amber-900/30',       icon: '👑', border: 'border-amber-500/40' },
];

function getTier(score) {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (score >= TIERS[i].min) return TIERS[i];
  }
  return TIERS[0];
}

function ScoreBar({ score }) {
  const nextTier = TIERS.find(t => t.min > score);
  const currentTier = getTier(score);
  const prevMin = currentTier.min;
  const nextMin = nextTier ? nextTier.min : prevMin + 1;
  const pct = Math.min(100, Math.round(((score - prevMin) / (nextMin - prevMin)) * 100));

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-slate-500">
        <span>{currentTier.label}</span>
        <span>{nextTier ? `${nextTier.label} at ${nextTier.min} pts` : 'Max Tier!'}</span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${currentTier.color.replace('text-', 'bg-')}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * ReputationBadge — inline card showing a donor's on-chain reputation.
 * @param {Object} props
 * @param {number} props.score - numeric score
 * @param {number} props.totalDonated - raw i128 stroops
 * @param {number} props.campaignCount - number of unique campaigns donated to
 * @param {string} [props.size] - 'sm' | 'md' (default 'md')
 */
export default function ReputationBadge({ score = 0, totalDonated = 0, campaignCount = 0, size = 'md' }) {
  const tier = getTier(score);
  const xlm = (Number(BigInt(totalDonated || 0)) / 10_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 });

  if (size === 'sm') {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-bold ${tier.bg} ${tier.border} ${tier.color}`}>
        <span>{tier.icon}</span>
        <span>{tier.label}</span>
        <span className="text-slate-500 font-normal">·</span>
        <span>{score.toLocaleString()} pts</span>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${tier.bg} ${tier.border}`}>
      <div className="flex items-center gap-3">
        <div className="text-3xl">{tier.icon}</div>
        <div>
          <div className={`font-black text-lg ${tier.color}`}>{tier.label}</div>
          <div className="text-xs text-slate-500">{score.toLocaleString()} reputation points</div>
        </div>
      </div>
      <ScoreBar score={score} />
      <div className="grid grid-cols-2 gap-2 pt-1">
        <div className="bg-slate-900/60 rounded-xl p-2 text-center">
          <div className="text-emerald-400 font-black">{xlm} XLM</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Total Donated</div>
        </div>
        <div className="bg-slate-900/60 rounded-xl p-2 text-center">
          <div className={`font-black ${tier.color}`}>{campaignCount}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Campaigns Backed</div>
        </div>
      </div>
    </div>
  );
}
