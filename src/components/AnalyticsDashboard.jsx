import React, { useState, useEffect, useCallback } from 'react';
import { 
  Networks, 
  TransactionBuilder, 
  Operation, 
  Account, 
  rpc, 
  scValToNative,
  nativeToScVal
} from "@stellar/stellar-sdk";
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area 
} from 'recharts';

const DUMMY_ACCOUNT = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");

const AnalyticsDashboard = ({ contractId, rpcUrl }) => {
  const [stats, setStats] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [topDonorsData, setTopDonorsData] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const rpcServer = new rpc.Server(rpcUrl || "https://soroban-testnet.stellar.org");
      
      const simulate = async (fn, args = []) => {
        const builder = new TransactionBuilder(DUMMY_ACCOUNT, { 
          fee: "100", 
          networkPassphrase: Networks.TESTNET 
        });
        const tx = builder
          .addOperation(Operation.invokeContractFunction({ contract: contractId, function: fn, args }))
          .setTimeout(30)
          .build();
        const res = await rpcServer.simulateTransaction(tx);
        return rpc.Api.isSimulationSuccess(res) ? scValToNative(res.result.retval) : null;
      };

      // Fetch all required data
      const [total, top, history] = await Promise.all([
        simulate("get_total"),
        simulate("get_top_donors"),
        simulate("get_recent_logs", [nativeToScVal(100, { type: "u32" })]) // Get last 100 for analytics
      ]);

      if (history) {
        const processedHistory = history.map(h => ({
          donor: h.donor,
          amount: Number(BigInt(h.amount)),
          timestamp: Number(h.timestamp) * 1000 // Convert to ms
        }));

        const uniqueDonors = new Set(processedHistory.map(h => h.donor)).size;
        const totalCount = processedHistory.length;
        const historyTotal = processedHistory.reduce((sum, h) => sum + h.amount, 0);
        const largest = Math.max(...processedHistory.map(h => h.amount), 0);
        const lastTime = totalCount > 0 ? new Date(processedHistory[processedHistory.length - 1].timestamp).toLocaleString() : "N/A";
        
        setStats({
          totalXLM: total !== null ? Number(BigInt(total)) : historyTotal,
          donorCount: uniqueDonors,
          donationCount: totalCount,
          average: totalCount > 0 ? ((total !== null ? Number(BigInt(total)) : historyTotal) / totalCount).toFixed(2) : 0,
          largest,
          lastTime
        });

        // Group by day for the last 7 days
        const now = Date.now();
        const last7Days = Array.from({ length: 7 }, (_, i) => {
          const date = new Date(now - (6 - i) * 24 * 60 * 60 * 1000);
          return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });

        const dailyVolume = last7Days.map(day => {
          const dayVolume = processedHistory
            .filter(h => new Date(h.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) === day)
            .reduce((sum, h) => sum + h.amount, 0);
          return { name: day, volume: dayVolume };
        });

        setChartData(dailyVolume);
      }

      if (top) {
        setTopDonorsData(top.map(d => ({
          name: `${d[0].slice(0, 4)}...${d[0].slice(-4)}`,
          amount: Number(d[1])
        })));
      }

    } catch (err) {
      console.error("Analytics fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [contractId, rpcUrl]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const Card = ({ title, value, sub, icon, color }) => (
    <div className={`relative p-0.5 rounded-2xl bg-gradient-to-br ${color} overflow-hidden group shadow-lg`}>
      <div className="bg-slate-900 rounded-[14px] p-5 h-full transition-all group-hover:bg-slate-900/80">
        <div className="flex justify-between items-start mb-4">
          <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">{title}</span>
          <div className="p-2 bg-white/5 rounded-lg text-white/50 group-hover:text-white transition-colors">
            {icon}
          </div>
        </div>
        <div className="text-3xl font-black text-white mb-1">{value}</div>
        <div className="text-[10px] text-slate-500 font-mono">{sub}</div>
      </div>
    </div>
  );

  if (loading && !stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="h-32 bg-slate-900 rounded-2xl border border-slate-800"></div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card 
          title="Total Donated" 
          value={`${stats?.totalXLM?.toLocaleString()} XLM`} 
          sub="Cumulative network contribution"
          color="from-indigo-500 to-purple-600"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <Card 
          title="Unique Donors" 
          value={stats?.donorCount} 
          sub="Total distinct wallet count"
          color="from-emerald-500 to-teal-600"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
        />
        <Card 
          title="Donation Count" 
          value={stats?.donationCount} 
          sub="Total successful operations"
          color="from-amber-500 to-orange-600"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>}
        />
        <Card 
          title="Average" 
          value={`${stats?.average} XLM`} 
          sub="Mean donation per transaction"
          color="from-cyan-500 to-blue-600"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
        />
        <Card 
          title="Largest Gift" 
          value={`${stats?.largest?.toLocaleString()} XLM`} 
          sub="Single highest contribution"
          color="from-pink-500 to-rose-600"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>}
        />
        <Card 
          title="Last Activity" 
          value={stats?.lastTime.split(',')[0]} 
          sub={stats?.lastTime.split(',')[1] || "Just now"}
          color="from-slate-500 to-slate-700"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Donation Volume Line Chart */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
          <h3 className="text-white font-bold mb-6 flex items-center justify-between">
            Weekly Volume
            <span className="text-[10px] text-slate-500 font-mono">Last 7 Days</span>
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}X`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Area type="monotone" dataKey="volume" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorVolume)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Donors Bar Chart */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
          <h3 className="text-white font-bold mb-6 flex items-center justify-between">
            Top Benefactors
            <span className="text-[10px] text-slate-500 font-mono">Ranked by XLM</span>
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topDonorsData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} width={80} />
                <Tooltip 
                  cursor={{ fill: '#ffffff05' }}
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                />
                <Bar dataKey="amount" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
