import React, { useState } from 'react';
import { Tenant } from '../types';
import { 
  Users, DollarSign, ShieldAlert, Sparkles, Plus, 
  HelpCircle, Eye, RefreshCw, Calendar, FileText, CheckCircle2, Lock, Unlock, Key
} from 'lucide-react';
import { TableSkeleton } from './Skeleton';
import { EmptyState } from './EmptyState';

interface MasterViewsProps {
  overview: {
    totalTenants: number;
    activeTenants: number;
    trialTenants: number;
    expiredTenants: number;
    suspendedTenants: number;
    offlineBots: number;
    expiringSoonCount: number;
    totalRentalRevenue: number;
    systemWarnings: string[];
  } | null;
  tenants: any[];
  rentalMonitor: any;
  loading: boolean;
  activeTab: string;
  setActiveTab: (val: string) => void;
  onCreateTenant: (form: any) => Promise<Tenant>;
  onExtendRent: (id: string, months: number) => Promise<void>;
  onSuspendTenant: (id: string) => Promise<void>;
  onActivateTenant: (id: string) => Promise<void>;
  onResetPassword: (id: string) => Promise<void>;
  onToggleDashboard: (id: string, enable: boolean) => Promise<void>;
}

export function MasterViews({
  overview, tenants, rentalMonitor, loading, activeTab, setActiveTab,
  onCreateTenant, onExtendRent, onSuspendTenant, onActivateTenant, onResetPassword, onToggleDashboard
}: MasterViewsProps) {
  
  // Create Form states
  const [storeName, setStoreName] = useState('');
  const [botUsername, setBotUsername] = useState('');
  const [telegramId, setTelegramId] = useState('');
  const [ownerUsername, setOwnerUsername] = useState('');
  const [monthlyPrice, setMonthlyPrice] = useState('39.00');
  const [durationMonths, setDurationMonths] = useState('1');
  const [serviceUrl, setServiceUrl] = useState('');
  const [notes, setNotes] = useState('');
  
  // Provision response config
  const [createdTenantResult, setCreatedTenantResult] = useState<Tenant | null>(null);

  // General detail modal
  const [detailedTenant, setDetailedTenant] = useState<any | null>(null);
  const [extendAmt, setExtendAmt] = useState('1');

  // Monitor categorization tabs
  const [monitorCategory, setMonitorCategory] = useState('all');

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim() || !botUsername.trim() || !telegramId.trim()) return;

    try {
      const res = await onCreateTenant({
        store_name: storeName,
        bot_username: botUsername,
        owner_telegram_id: telegramId,
        owner_username: ownerUsername,
        monthly_price: parseFloat(monthlyPrice) || 0,
        duration_months: parseInt(durationMonths) || 1,
        service_url: serviceUrl,
        notes
      });
      setCreatedTenantResult(res);
      // Clear
      setStoreName('');
      setBotUsername('');
      setTelegramId('');
      setOwnerUsername('');
      setServiceUrl('');
      setNotes('');
    } catch (err) {
      console.error(err);
    }
  };

  const getStatusBadge = (status: Tenant['status']) => {
    switch (status) {
      case 'active':
        return <span className="bg-emerald-50 border border-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Active</span>;
      case 'trial':
        return <span className="bg-blue-50 border border-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Trial</span>;
      case 'expired':
        return <span className="bg-rose-50 border border-rose-100 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase animate-pulse">License Expired</span>;
      case 'suspended':
        return <span className="bg-gray-100 border border-gray-200 text-gray-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Lock Suspended</span>;
      default:
        return <span className="bg-gray-50 border border-gray-100 text-gray-500 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">{status}</span>;
    }
  };

  // Environment configuration template display
  const renderEnvTemplate = (tenant: Tenant) => {
    return `BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN_HERE
ADMIN_ID=${tenant.owner_telegram_id}
TENANT_ID=${tenant.tenant_id}
REQUIRED_CHANNEL=
REQUIRED_CHANNEL_URL=
SUPABASE_URL=https://your-supabase-project.supabase.co
SUPABASE_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
DASHBOARD_ADMIN_SECRET=berry_master_secret_2026`;
  };

  if (loading) {
    return <TableSkeleton />;
  }

  // 1. MASTER OVERVIEW PAGE
  if (activeTab === 'overview') {
    if (!overview) return null;
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">System Owner Overview</h2>
          <p className="text-sm text-gray-500 mt-1">Supervise running store tenant gateway loops, monitor license expirations and income averages.</p>
        </div>

        {/* Global warnings */}
        {overview.systemWarnings.length > 0 && (
          <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 flex gap-3 shadow-xs">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-rose-800 font-bold text-sm">System Alerts Flagged</h4>
              <ul className="text-rose-700 text-xs mt-1 space-y-1 list-disc pl-4 font-semibold">
                {overview.systemWarnings.map((warn, i) => (
                  <li key={i}>{warn}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Counts Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-gray-100 rounded-[24px] p-5 shadow-sm">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest"> Rented bots</p>
            <p className="text-2xl font-black mt-1 font-mono text-[#1D1D1F]">{overview.totalTenants}</p>
            <div className="flex space-x-2 mt-1 text-[10px] font-semibold text-gray-500">
              <span className="text-emerald-600">{overview.activeTenants} active</span>
              <span>•</span>
              <span className="text-rose-600">{overview.expiredTenants} expired</span>
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-[24px] p-5 shadow-sm">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Offline Bots</p>
            <p className="text-2xl font-black mt-1 font-mono text-rose-600">{overview.offlineBots}</p>
            <p className="text-[10px] text-gray-400 mt-1 font-medium">Missed heartbeat reports</p>
          </div>

          <div className="bg-white border border-gray-100 rounded-[24px] p-5 shadow-sm">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Alert Expirations</p>
            <p className="text-2xl font-black mt-1 font-mono text-amber-600">{overview.expiringSoonCount}</p>
            <p className="text-[10px] text-gray-400 mt-1 font-medium">Expiring within 7 calendar days</p>
          </div>

          <div className="bg-white border border-gray-100 rounded-[24px] p-5 shadow-sm">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Monthly Licenses run-rate</p>
            <p className="text-2xl font-black mt-1 font-mono text-indigo-600">${overview.totalRentalRevenue.toFixed(2)}</p>
            <p className="text-[10px] text-gray-400 mt-1 font-medium">Estimated monthly billing revenue</p>
          </div>
        </div>

        {/* Recent detailed actions row */}
        <div className="bg-white border border-gray-100 rounded-[24px] p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="font-bold text-[#1D1D1F] text-sm">Tenant Billing Stats</h3>
              <p className="text-xs text-gray-400 mt-0.5">View license properties regarding active customers</p>
            </div>
            <button 
              onClick={() => setActiveTab('tenants')}
              className="text-xs text-indigo-600 font-bold hover:underline cursor-pointer"
            >
              Audits Tenants list &rarr;
            </button>
          </div>

          {tenants.length === 0 ? (
            <p className="text-xs text-gray-400 font-semibold py-8 text-center">No tenants found.</p>
          ) : (
            <div className="space-y-3.5 text-xs text-gray-700">
              {tenants.slice(0, 3).map(t => (
                <div key={t.tenant_id} className="flex flex-col sm:flex-row justify-between sm:items-center p-3 hover:bg-gray-50/50 border border-gray-100 rounded-xl transition-all gap-2">
                  <div>
                    <h4 className="font-bold text-gray-950">{t.name} <span className="text-[10px] font-bold font-mono text-gray-400">({t.tenant_id})</span></h4>
                    <p className="text-[10px] text-gray-400 mt-0.5">Gateway: {t.bot_username}</p>
                  </div>
                  <div className="flex items-center space-x-6 self-end sm:self-auto font-semibold">
                    <div>
                      Month Rent: <span className="font-mono font-bold text-gray-900">${t.monthly_price}</span>
                    </div>
                    <div>
                      Days left: <span className={`font-mono font-bold ${t.days_left <= 7 ? 'text-rose-600' : 'text-emerald-600'}`}>{t.days_left}d</span>
                    </div>
                    {getStatusBadge(t.status)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 2. TENANTS LIST PAGE
  if (activeTab === 'tenants') {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h2 className="text-2xl font-bold text-[#1D1D1F] tracking-tight">Rented Bots Catalog</h2>
          <p className="text-sm text-gray-500 mt-1">Supervise active sub-shops, extend rentals, suspend accounts, and reset dashboard passwords.</p>
        </div>

        <div className="bg-white border border-gray-100 rounded-[24px] shadow-sm overflow-hidden">
          <div className="hidden lg:block">
            <table className="w-full text-left border-collapse text-xs text-gray-700">
              <thead>
                <tr className="bg-gray-50 text-gray-500 font-bold uppercase border-b border-gray-100 tracking-wider">
                  <th className="p-4 pl-6">Store details</th>
                  <th className="p-4">Owner Profile</th>
                  <th className="p-4">License Duration</th>
                  <th className="p-4">Rented Price</th>
                  <th className="p-4">Orders count</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 pr-6 text-right">Administrative Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tenants.map(t => (
                  <tr key={t.tenant_id} className="hover:bg-gray-50/50 transition-all font-semibold">
                    <td className="p-4 pl-6">
                      <p className="font-bold text-gray-900">{t.name}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5 font-mono">{t.bot_username}</p>
                    </td>
                    <td className="p-4">
                      <p className="text-gray-900">ID: {t.owner_telegram_id}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5 font-mono">{t.owner_username ? `@${t.owner_username}` : 'No username'}</p>
                    </td>
                    <td className="p-4">
                      <p className="text-gray-900">{new Date(t.rent_end).toLocaleDateString()}</p>
                      <p className={`text-[10px] font-bold mt-0.5 ${t.days_left <= 7 ? 'text-rose-600 animate-pulse' : 'text-gray-400'}`}>
                        {t.days_left > 0 ? `${t.days_left} Days Remaining` : 'Expired'}
                      </p>
                    </td>
                    <td className="p-4 font-bold text-gray-950 font-mono">${t.monthly_price}/mo</td>
                    <td className="p-4 font-mono font-bold text-gray-900">{t.stats?.total_ordersCount || 0} checks</td>
                    <td className="p-4">{getStatusBadge(t.status)}</td>
                    <td className="p-4 pr-6 text-right">
                      <button
                        onClick={() => {
                          setDetailedTenant(t);
                          setExtendAmt('1');
                        }}
                        className="px-3 py-1.5 bg-gray-50 hover:bg-gray-150 border border-gray-200 text-gray-700 rounded-lg font-bold transition-all inline-flex items-center space-x-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Manage / Extensions</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Fallback list */}
          <div className="grid grid-cols-1 gap-4 p-4 lg:hidden text-xs">
            {tenants.map(t => (
              <div key={t.tenant_id} className="bg-gray-50/50 border border-gray-100 rounded-2xl p-4 flex flex-col justify-between gap-2">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-gray-900">{t.name}</h4>
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">{t.bot_username}</p>
                  </div>
                  <span>{getStatusBadge(t.status)}</span>
                </div>
                <div className="space-y-1 text-gray-600 font-semibold my-1">
                  <p><span className="text-gray-400">Telegram Admin:</span> {t.owner_username ? `@${t.owner_username}` : t.owner_telegram_id}</p>
                  <p><span className="text-gray-400">License ends:</span> {new Date(t.rent_end).toLocaleDateString()} ({t.days_left}d left)</p>
                  <p><span className="text-gray-400">Sub Price:</span> <span className="font-mono text-gray-900 font-bold">${t.monthly_price}/mo</span></p>
                </div>
                <button
                  onClick={() => {
                    setDetailedTenant(t);
                    setExtendAmt('1');
                  }}
                  className="w-full text-center py-2 bg-white border border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
                >
                  Manage properties
                </button>
              </div>
            ))}
          </div>

        </div>

        {/* Detailed edit modal parameters popup drawer */}
        {detailedTenant && (
          <div className="fixed inset-0 bg-black/55 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-gray-100 max-h-[90vh] flex flex-col">
              <div className="p-5 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-gray-900 text-base">Administrative Dashboard: {detailedTenant.name}</h3>
                  <p className="text-[11px] text-gray-400 font-mono mt-0.5">Tenant unique: {detailedTenant.tenant_id}</p>
                </div>
                <button 
                  onClick={() => setDetailedTenant(null)}
                  className="p-1 px-2 border border-gray-200 rounded-xl bg-white text-gray-400 cursor-pointer hover:bg-gray-50"
                >
                  Close
                </button>
              </div>

              <div className="p-6 space-y-6 overflow-y-auto flex-1 text-xs font-semibold text-gray-700">
                {/* Stats summary */}
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-3 bg-gray-50 border border-gray-100 rounded-2xl">
                    <p className="text-[10px] text-gray-400 uppercase font-black uppercase">Registered Users</p>
                    <p className="text-lg font-mono font-black text-gray-900 mt-1">{detailedTenant.stats?.total_usersCount || 0}</p>
                  </div>
                  <div className="p-3 bg-gray-50 border border-gray-100 rounded-2xl">
                    <p className="text-[10px] text-gray-400 uppercase font-black uppercase">Cleared Orders</p>
                    <p className="text-lg font-mono font-black text-gray-900 mt-1">{detailedTenant.stats?.total_ordersCount || 0}</p>
                  </div>
                  <div className="p-3 bg-gray-50 border border-gray-100 rounded-2xl">
                    <p className="text-[10px] text-gray-400 uppercase font-black uppercase">Store Revenue</p>
                    <p className="text-lg font-mono font-black text-emerald-600 mt-1">${(detailedTenant.stats?.revenue || 0).toFixed(2)}</p>
                  </div>
                </div>

                {/* Sub price details */}
                <div className="space-y-2 pb-4 border-b border-gray-50">
                  <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-600">Quick Properties Extensions</h4>
                  <div className="flex gap-2 items-center bg-gray-50 p-4 border border-gray-100 rounded-2xl">
                    <div className="flex-1">
                      <span className="text-[10px] text-gray-400">Duration Count (Months)</span>
                      <select 
                        value={extendAmt} 
                        onChange={(e) => setExtendAmt(e.target.value)}
                        className="w-full bg-transparent font-bold text-gray-900 text-sm mt-1 focus:outline-none"
                      >
                        <option value="1">1 Month Extension</option>
                        <option value="3">3 Months Extension</option>
                        <option value="6">6 Months Extension</option>
                        <option value="12">12 Months (Annual)</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await onExtendRent(detailedTenant.tenant_id, parseInt(extendAmt));
                        setDetailedTenant(null);
                      }}
                      className="px-4 py-2.5 bg-indigo-600 text-white text-[11px] font-bold rounded-xl transition-all cursor-pointer shadow-xs hover:bg-indigo-700"
                    >
                      Authorize Extension
                    </button>
                  </div>
                </div>

                {/* Access locks */}
                <div className="space-y-4 pt-2">
                  <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-600">System Gateway Security</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Reset dashboard password */}
                    <button
                      type="button"
                      onClick={async () => {
                        await onResetPassword(detailedTenant.tenant_id);
                        alert("Dashboard credential reset initialized. Customer will configure a new password upon next portal sign in!");
                        setDetailedTenant(null);
                      }}
                      className="p-3 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-all text-rose-800 rounded-2xl text-left font-bold flex select-none flex-col items-start gap-1 justify-between cursor-pointer"
                    >
                      <div className="bg-rose-100 p-1.5 rounded-xl text-rose-600"><Key className="w-4 h-4" /></div>
                      <span className="mt-1">Reset Password</span>
                    </button>

                    {/* Disable/Enable */}
                    {detailedTenant.dashboard_enabled ? (
                      <button
                        type="button"
                        onClick={async () => {
                          await onToggleDashboard(detailedTenant.tenant_id, false);
                          setDetailedTenant(null);
                        }}
                        className="p-3 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-all text-amber-800 rounded-2xl text-left font-bold flex select-none flex-col items-start gap-1 justify-between cursor-pointer"
                      >
                        <div className="bg-amber-100 p-1.5 rounded-xl text-amber-600"><Lock className="w-4 h-4" /></div>
                        <span className="mt-1">Lock Portal login</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          await onToggleDashboard(detailedTenant.tenant_id, true);
                          setDetailedTenant(null);
                        }}
                        className="p-3 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-all text-indigo-800 rounded-2xl text-left font-bold flex select-none flex-col items-start gap-1 justify-between cursor-pointer"
                      >
                        <div className="bg-indigo-100 p-1.5 rounded-xl text-indigo-600"><Unlock className="w-4 h-4" /></div>
                        <span className="mt-1">Authorize Login</span>
                      </button>
                    )}

                    {/* Suspend or activate */}
                    {detailedTenant.status === 'suspended' ? (
                      <button
                        type="button"
                        onClick={async () => {
                          await onActivateTenant(detailedTenant.tenant_id);
                          setDetailedTenant(null);
                        }}
                        className="p-3 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-all text-emerald-800 rounded-2xl text-left font-bold flex select-none flex-col items-start gap-1 justify-between col-span-2 cursor-pointer"
                      >
                        <span className="mt-1">Activate Bot Gateway subscription</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          await onSuspendTenant(detailedTenant.tenant_id);
                          setDetailedTenant(null);
                        }}
                        className="p-3 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-all text-rose-800 rounded-2xl text-left font-bold flex select-none flex-col items-start gap-1 justify-between col-span-2 cursor-pointer"
                      >
                        <span className="mt-1">Freeze Sub / Suspend Bot loop</span>
                      </button>
                    )}
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

      </div>
    );
  }

  // 3. CREATE TENANT FORM PAGE
  if (activeTab === 'create') {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Provision bot Tenant</h2>
          <p className="text-sm text-gray-500 mt-1">Boot up a isolated Telegram shop database space. Generate initial configurations and daemon templates dynamically.</p>
        </div>

        {createdTenantResult ? (
          <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-xs space-y-5">
            <div className="flex items-center space-x-3.5 pb-4 border-b border-gray-150">
              <div className="w-11 h-11 bg-emerald-50 text-emerald-700 rounded-xl flex items-center justify-center font-bold">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">Store workspace provisioned successfully!</h3>
                <p className="text-xs text-gray-400">Notify the client of their credentials to secure login properties.</p>
              </div>
            </div>

            <div className="text-xs font-semibold text-gray-700 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3.5 bg-gray-50 border border-gray-100 rounded-xl">
                <span className="text-gray-400 block mb-0.5">TENANT IDENTIFIER ID</span>
                <span className="font-mono text-gray-900 font-bold">{createdTenantResult.tenant_id}</span>
              </div>
              <div className="p-3.5 bg-gray-50 border border-gray-100 rounded-xl">
                <span className="text-gray-400 block mb-0.5">Custom Bot Identifier</span>
                <span className="font-mono text-gray-950">{createdTenantResult.bot_username}</span>
              </div>
              <div className="p-3.5 bg-gray-50 border border-gray-100 rounded-xl">
                <span className="text-gray-400 block mb-0.5">Telegram Administrative ID</span>
                <span className="font-mono text-gray-950">{createdTenantResult.owner_telegram_id}</span>
              </div>
              <div className="p-3.5 bg-gray-50 border border-gray-100 rounded-xl">
                <span className="text-gray-400 block mb-0.5">Monthly Rented rate</span>
                <span className="font-mono text-gray-950 font-bold">${createdTenantResult.monthly_price}/mo</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block font-mono">CLIENT DAEMON CONFIG ENVIRONMENT VARIABLES (.env)</label>
              <pre className="p-4 bg-gray-950 text-emerald-400 rounded-2xl font-mono text-[11px] overflow-x-auto select-all leading-relaxed whitespace-pre shadow-lg border border-gray-900">
                {renderEnvTemplate(createdTenantResult)}
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setCreatedTenantResult(null)}
                className="px-5 py-2.5 bg-gray-950 hover:bg-gray-900 text-white font-bold text-xs rounded-full cursor-pointer transition-all"
              >
                Provision Another Store
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-xs max-w-xl">
            <h3 className="font-bold text-gray-950 text-base mb-4">Provision Config Properties</h3>
            
            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs font-semibold text-gray-600">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-gray-500 block mb-1">Store Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Omega vouchers"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs text-gray-900"
                  />
                </div>
                <div>
                  <label className="text-gray-500 block mb-1">Bot Username</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. @OmegaAdminBot"
                    value={botUsername}
                    onChange={(e) => setBotUsername(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs text-gray-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-gray-500 block mb-1">Owner Telegram ID</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 85720491"
                    value={telegramId}
                    onChange={(e) => setTelegramId(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs text-gray-900"
                  />
                </div>
                <div>
                  <label className="text-gray-500 block mb-1">Owner username (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. omega_dev"
                    value={ownerUsername}
                    onChange={(e) => setOwnerUsername(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs text-gray-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-gray-500 block mb-1">Monthly Cost ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={monthlyPrice}
                    onChange={(e) => setMonthlyPrice(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs text-gray-900 font-mono"
                  />
                </div>
                <div>
                  <label className="text-gray-500 block mb-1">Rental Duration (Months)</label>
                  <select
                    value={durationMonths}
                    onChange={(e) => setDurationMonths(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-xs text-gray-900"
                  >
                    <option value="1">1 Month</option>
                    <option value="3">3 Months</option>
                    <option value="6">6 Months</option>
                    <option value="12">12 Months (Annual)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-gray-500 block mb-1">Rental Service URL (Optional webhook endpoint)</label>
                <input
                  type="text"
                  placeholder="https://client-daemon.herokuapp.com"
                  value={serviceUrl}
                  onChange={(e) => setServiceUrl(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs text-gray-900"
                />
              </div>

              <div>
                <label className="text-gray-500 block mb-1">Private Administration Notes</label>
                <textarea
                  rows={2}
                  placeholder="Insert notes, business tags, or client terms..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs text-gray-900 resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-full transition-all cursor-pointer shadow-sm hover:shadow-md"
                >
                  Create Tenant Space
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  // 4. QUALITY MONITOR PAGE (Tabs filtering logic)
  if (activeTab === 'monitor') {
    if (!rentalMonitor) return null;

    const categories = [
      { id: 'all', label: 'All Active bots', list: rentalMonitor.active },
      { id: 'expiring', label: 'Expiring soon', list: rentalMonitor.expiringSoon },
      { id: 'expired', label: 'Expired Licenses', list: rentalMonitor.expired },
      { id: 'suspended', label: 'Suspended', list: rentalMonitor.suspended },
      { id: 'offline', label: 'Offline bots', list: rentalMonitor.offlineBots },
      { id: 'no_products', label: 'No products loaded', list: rentalMonitor.noProducts },
      { id: 'no_qr', label: 'No Payment QR', list: rentalMonitor.noPaymentQR },
      { id: 'no_creds', label: 'No credentials available', list: rentalMonitor.noCredentials }
    ];

    const currentTabDetails = categories.find(c => c.id === monitorCategory) || categories[0];

    return (
      <div className="space-y-6 animate-fade-in text-xs font-semibold text-gray-700">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">System Rental Audit Logs</h2>
          <p className="text-sm text-gray-500 mt-1 font-medium">Verify system status. Identify offline routes, tenants lacking stock properties, or pending QR banners.</p>
        </div>

        {/* Categorization selections */}
        <div className="flex flex-wrap gap-1 bg-gray-50 p-1 border border-gray-150 rounded-2xl w-fit">
          {categories.map(c => (
            <button
              key={c.id}
              onClick={() => setMonitorCategory(c.id)}
              className={`px-3.5 py-1.5 rounded-xl font-bold uppercase text-[10px] tracking-wider transition-all cursor-pointer ${
                monitorCategory === c.id 
                  ? 'bg-white shadow-xs text-blue-600' 
                  : 'text-gray-500 hover:text-gray-950'
              }`}
            >
              {c.label} ({c.list.length})
            </button>
          ))}
        </div>

        {/* Main List display */}
        <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-xs">
          <h3 className="font-bold text-gray-900 text-sm mb-3">Status Categories matched: {currentTabDetails.label}</h3>

          {currentTabDetails.list.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-2" />
              <p className="text-gray-400">All rented bots conform perfectly. No anomalies detected.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentTabDetails.list.map((t: Tenant) => (
                <div key={t.tenant_id} className="p-4 bg-gray-50 border border-gray-100 rounded-2xl flex flex-col justify-between hover:border-gray-200 transition-all">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-gray-900 text-sm">{t.name}</h4>
                      <p className="text-[10px] text-gray-400 font-mono mt-0.5">{t.bot_username}</p>
                    </div>
                    {getStatusBadge(t.status)}
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-100 text-[11px] text-gray-500 space-y-1 font-medium">
                    <p>Owner user ID: <span className="text-gray-800 font-black">{t.owner_telegram_id}</span></p>
                    <p>Private URL webhook: <span className="text-gray-800 font-mono font-bold">{t.service_url || 'None Registered'}</span></p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
