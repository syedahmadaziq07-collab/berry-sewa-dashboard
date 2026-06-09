import React from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer 
} from 'recharts';
import { 
  DollarSign, Clock, Users, ArrowUpRight, TrendingUp, 
  Settings, KeyRound, ShieldAlert, Heart, Calendar
} from 'lucide-react';
import { CardSkeleton } from './Skeleton';

interface OverviewData {
  tenant: {
    tenant_id: string;
    name: string;
    bot_username: string;
    status: string;
    rent_end: string;
    days_left: number;
  };
  todayRevenue: number;
  pendingOrdersCount: number;
  waitingApprovalCount: number;
  totalCompletedCount: number;
  totalUsersCount: number;
  totalRevenue: number;
  chartData: Array<{ date: string; revenue: number }>;
  topProducts: Array<{ id: string; name: string; salesCount: number; revenue: number }>;
  warnings: string[];
  recentLogs: Array<{ id: string; message: string; action: string; created_at: string }>;
}

interface TenantOverviewProps {
  data: OverviewData | null;
  loading: boolean;
  onNavigate: (tab: string) => void;
}

export function TenantOverview({ data, loading, onNavigate }: TenantOverviewProps) {
  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-gray-200 rounded w-1/4 animate-pulse"></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  const { tenant, todayRevenue, pendingOrdersCount, waitingApprovalCount, totalUsersCount, totalRevenue, chartData, topProducts, warnings, recentLogs } = data;

  return (
    <div className="space-y-6">
      {/* Upper Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Welcome, {tenant.name}</h2>
          <p className="text-gray-500 text-sm font-medium mt-1">Manage and audit your active bot gateway services.</p>
        </div>
        <div className="flex items-center space-x-2 bg-indigo-50 border border-indigo-100 rounded-full px-4 py-1.5 shrink-0 self-start md:self-auto">
          <div className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-ping"></div>
          <span className="text-indigo-900 text-xs font-bold leading-none">Status: {tenant.status.toUpperCase()}</span>
        </div>
      </div>

      {/* Warnings Panel */}
      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 shadow-xs">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-amber-800 font-semibold text-sm">Action Checklist Required</h4>
            <ul className="text-amber-700 text-xs mt-1.5 space-y-1 list-disc pl-4 font-medium leading-relaxed">
              {warnings.map((warn, i) => (
                <li key={i}>{warn}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Core KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* KPI 1 */}
        <div className="bg-white border border-gray-100 rounded-[24px] p-6 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Today Revenue</p>
            <p className="text-2xl font-bold mt-1 text-[#1D1D1F] font-mono">${todayRevenue.toFixed(2)}</p>
            <p className="text-[11px] text-gray-500 mt-1 font-medium">Accumulated since 12:00 AM</p>
          </div>
          <div className="bg-indigo-55 bg-indigo-50 text-indigo-600 p-3.5 rounded-2xl">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 2 */}
        <div 
          onClick={() => onNavigate('orders')}
          className="bg-white border border-gray-100 rounded-[24px] p-6 shadow-sm flex items-center justify-between hover:shadow-md transition-all cursor-pointer group"
        >
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Pending / Approval</p>
            <div className="flex items-baseline space-x-1 mt-1">
              <p className="text-2xl font-bold text-[#1D1D1F] font-mono">{pendingOrdersCount + waitingApprovalCount}</p>
              <p className="text-[11px] text-amber-600 font-medium">({waitingApprovalCount} Awaits Audit)</p>
            </div>
            <p className="text-[11px] text-indigo-600 font-semibold mt-1 flex items-center group-hover:underline">
              Review queue <ArrowUpRight className="w-3 h-3 ml-0.5" />
            </p>
          </div>
          <div className="bg-amber-50 text-amber-600 p-3.5 rounded-2xl">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-white border border-gray-100 rounded-[24px] p-6 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Total Customers</p>
            <p className="text-2xl font-bold mt-1 text-[#1D1D1F] font-mono">{totalUsersCount}</p>
            <p className="text-[11px] text-gray-500 mt-1 font-medium">Registered Telegram accounts</p>
          </div>
          <div className="bg-emerald-50 text-emerald-600 p-3.5 rounded-2xl">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-white border border-gray-100 rounded-[24px] p-6 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Full Shop Revenue</p>
            <p className="text-2xl font-semibold mt-1 text-[#1D1D1F] font-mono">${totalRevenue.toFixed(2)}</p>
            <p className="text-[11px] text-gray-500 mt-1 font-medium">Completed lifetime orders</p>
          </div>
          <div className="bg-purple-50 text-purple-600 p-3.5 rounded-2xl">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Charts & Side Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Area Chart */}
        <div className="bg-white border border-gray-100 rounded-[24px] p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-[#1D1D1F] text-sm">Revenue Trend</h3>
              <p className="text-xs text-gray-500 font-medium mt-0.5">Daily sales volume for the last 7 calendar days</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-gray-50 border border-gray-100 text-gray-500 rounded-full">USD ($)</span>
          </div>
          <div className="h-64 sm:h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#4F46E5" stopOpacity={0.00}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tickLine={false} axisLine={false} style={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tickLine={false} axisLine={false} style={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', shadow: 'none', fontSize: 11 }}
                  labelStyle={{ fontWeight: 'bold', color: '#1D1D1F' }}
                />
                <Area type="monotone" dataKey="revenue" name="Sales" stroke="#4F46E5" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Side Panel: Bot status and Quick actions */}
        <div className="space-y-6">
          {/* Bot health status card */}
          <div className="bg-white border border-gray-100 rounded-[24px] p-6 shadow-sm relative overflow-hidden">
            <div className="absolute right-0 top-0 translate-x-3 -translate-y-3 bg-indigo-50/50 w-24 h-24 rounded-full -z-10"></div>
            
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">GATEWAY ACTIVE</h4>
            <div className="flex items-center space-x-3 mt-4">
              <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 animate-pulse"></div>
              <h3 className="text-lg font-bold text-[#1D1D1F] font-mono">@{tenant.bot_username.replace('@','')}</h3>
            </div>
            
            <div className="mt-5 space-y-3 pt-4 border-t border-gray-100 text-xs font-semibold text-gray-700">
              <div className="flex justify-between">
                <span className="text-gray-450">Rental Period Ends</span>
                <span className="text-gray-900 font-mono flex items-center">
                  <Calendar className="w-3.5 h-3.5 mr-1 text-gray-400" />
                  {new Date(tenant.rent_end).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-450">License Limit Remaining</span>
                <span className={`font-mono font-bold ${tenant.days_left <= 7 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {tenant.days_left} days
                </span>
              </div>
            </div>
          </div>

          {/* Quick links & integrations */}
          <div className="bg-white border border-gray-100 rounded-[24px] p-6 shadow-sm space-y-3">
            <h4 className="font-bold text-[#1D1D1F] text-xs uppercase tracking-wider">Quick Admin Links</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button 
                onClick={() => onNavigate('products')}
                className="p-3 text-left bg-gray-50 hover:bg-gray-100/80 rounded-xl transition-all font-semibold text-gray-700 border border-gray-150 cursor-pointer"
              >
                📦 Products
              </button>
              <button 
                onClick={() => onNavigate('stocks')}
                className="p-3 text-left bg-gray-50 hover:bg-gray-100/80 rounded-xl transition-all font-semibold text-gray-700 border border-gray-150 cursor-pointer"
              >
                📊 Stock Levels
              </button>
              <button 
                onClick={() => onNavigate('credentials')}
                className="p-3 text-left bg-gray-50 hover:bg-gray-100/80 rounded-xl transition-all font-semibold text-gray-700 border border-gray-150 cursor-pointer"
              >
                🔑 Credentials
              </button>
              <button 
                onClick={() => onNavigate('settings')}
                className="p-3 text-left bg-gray-50 hover:bg-gray-100/80 rounded-xl transition-all font-semibold text-gray-700 border border-gray-150 cursor-pointer"
              >
                ⚙️ Config Settings
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Under columns segment: Top listings and audit audits */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top items */}
        <div className="bg-white border border-gray-100 rounded-[24px] p-6 shadow-sm">
          <h3 className="font-bold text-[#1D1D1F] mb-4 text-sm">Top Products by Volumes Sold</h3>
          {topProducts.length === 0 ? (
            <p className="text-xs text-gray-400 py-6 text-center font-medium">No sales recorded yet. Publish products to begin.</p>
          ) : (
            <div className="space-y-3">
              {topProducts.map((p, index) => (
                <div key={p.id} className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-150">
                  <div className="flex items-center space-x-3">
                    <span className="w-5 h-5 rounded-lg bg-indigo-50 text-indigo-600 font-bold text-xs flex items-center justify-center font-mono">
                      {index + 1}
                    </span>
                    <span className="text-xs font-bold text-gray-800 line-clamp-1">{p.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-gray-900 font-mono">{p.salesCount} units</p>
                    <p className="text-[10px] text-gray-400 font-semibold font-mono">${p.revenue.toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Audit logs */}
        <div className="bg-white border border-gray-100 rounded-[24px] p-6 shadow-sm">
          <h3 className="font-bold text-[#1D1D1F] mb-4 text-sm">Recent Security Audits</h3>
          {recentLogs.length === 0 ? (
            <p className="text-xs text-gray-400 py-6 text-center font-medium">System audit logs clear.</p>
          ) : (
            <div className="space-y-3">
              {recentLogs.map((log) => (
                <div key={log.id} className="flex items-start justify-between p-2.5 hover:bg-gray-50 rounded-xl transition-all">
                  <div>
                    <p className="text-xs font-semibold text-gray-800">{log.message}</p>
                    <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full mt-1.5 inline-block">
                      {log.action}
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-400 font-mono shrink-0">
                    {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
