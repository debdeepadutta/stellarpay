import React, { useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';

const COLORS = ['#6366f1', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444', '#10b981'];

const ImpactDashboard = ({ campaigns }) => {
  const { byRegion, byCategory, totalGlobal, totalCampaigns } = useMemo(() => {
    let regionMap = {};
    let catMap = {};
    let total = 0;

    campaigns.forEach(c => {
      const vol = parseFloat(c.totalDonated || 0);
      const reg = c.region || 'Global';
      const cat = c.category || 'general';

      total += vol;

      if (!regionMap[reg]) regionMap[reg] = 0;
      regionMap[reg] += vol;

      if (!catMap[cat]) catMap[cat] = 0;
      catMap[cat] += vol;
    });

    const regionData = Object.keys(regionMap)
      .map(name => ({ name, value: regionMap[name] }))
      .sort((a, b) => b.value - a.value);
      
    const catData = Object.keys(catMap)
      .map(name => ({ name, value: catMap[name] }))
      .sort((a, b) => b.value - a.value);

    return { byRegion: regionData, byCategory: catData, totalGlobal: total, totalCampaigns: campaigns.length };
  }, [campaigns]);

  // Custom Tooltip for Charts
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 border border-white/10 p-3 rounded-xl shadow-xl">
          <p className="text-white font-bold text-sm mb-1">{label || payload[0].name}</p>
          <p className="text-indigo-400 font-mono text-xs">
            {payload[0].value.toLocaleString()} XLM
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-12 relative">
        <div className="absolute -top-10 -left-10 w-48 h-48 bg-indigo-500/20 blur-3xl rounded-full pointer-events-none"></div>
        <div className="absolute top-10 right-10 w-64 h-64 bg-emerald-500/10 blur-3xl rounded-full pointer-events-none"></div>
        
        <h1 className="text-4xl font-black text-white tracking-tight relative z-10 flex items-center gap-3">
          <span className="text-5xl">🌍</span> Global Impact Dashboard
        </h1>
        <p className="text-slate-400 mt-3 max-w-2xl text-sm font-medium relative z-10">
          Real-time metrics showing the reach and scale of our decentralized philanthropy network. 
          See how your contributions are making a difference across the globe.
        </p>
      </div>

      {/* Top Level Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        <div className="bg-gradient-to-br from-indigo-500/10 to-transparent border border-indigo-500/20 rounded-3xl p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-5xl">💎</div>
          <p className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-1">Total Impact Value</p>
          <h2 className="text-3xl font-mono text-white">{totalGlobal.toLocaleString()} <span className="text-sm text-slate-500">XLM</span></h2>
        </div>
        
        <div className="bg-slate-900/50 border border-white/5 rounded-3xl p-6">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Active Campaigns</p>
          <h2 className="text-3xl font-mono text-white">{totalCampaigns}</h2>
        </div>
        
        <div className="bg-slate-900/50 border border-white/5 rounded-3xl p-6">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Regions Reached</p>
          <h2 className="text-3xl font-mono text-white">{byRegion.length}</h2>
        </div>

        <div className="bg-slate-900/50 border border-white/5 rounded-3xl p-6">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Causes Supported</p>
          <h2 className="text-3xl font-mono text-white">{byCategory.length}</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Region Chart */}
        <div className="bg-slate-900 border border-white/5 rounded-3xl p-6 shadow-2xl">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400 text-lg">🗺️</div>
            <div>
              <h3 className="text-lg font-bold text-white">Impact by Region</h3>
              <p className="text-xs text-slate-400">Total XLM deployed per geographic area</p>
            </div>
          </div>
          
          <div className="h-80 w-full">
            {byRegion.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byRegion} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    stroke="#ffffff40" 
                    fontSize={12} 
                    tickLine={false}
                    axisLine={false}
                    dy={10}
                  />
                  <YAxis 
                    stroke="#ffffff40" 
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => val >= 1000 ? `${(val/1000).toFixed(1)}k` : val}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff05' }} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {byRegion.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-500">
                <span className="text-3xl mb-2">📊</span>
                <p className="text-sm font-medium">Not enough data to display.</p>
              </div>
            )}
          </div>
        </div>

        {/* Category Chart */}
        <div className="bg-slate-900 border border-white/5 rounded-3xl p-6 shadow-2xl">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-lg">🎯</div>
            <div>
              <h3 className="text-lg font-bold text-white">Funding by Cause</h3>
              <p className="text-xs text-slate-400">Distribution of donations across sectors</p>
            </div>
          </div>
          
          <div className="h-80 w-full">
            {byCategory.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byCategory}
                    cx="50%"
                    cy="45%"
                    innerRadius={80}
                    outerRadius={110}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {byCategory.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend 
                    verticalAlign="bottom" 
                    height={36} 
                    iconType="circle"
                    formatter={(value) => <span className="text-xs text-slate-300 font-medium ml-1">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-500">
                <span className="text-3xl mb-2">🍩</span>
                <p className="text-sm font-medium">Not enough data to display.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImpactDashboard;

