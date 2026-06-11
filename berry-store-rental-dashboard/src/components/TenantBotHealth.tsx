import React, { useState } from 'react';
import { Activity, RefreshCw, Copy, Settings, ShoppingBag, Database, AlertCircle, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

interface TenantBotHealthProps {
  onNavigate?: (tab: string) => void;
}

export function TenantBotHealth({ onNavigate }: TenantBotHealthProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tenant/bot-health', { credentials: 'include' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch health');
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { fetchHealth(); }, []);

  const copyTenantId = () => {
    if (data?.tenant?.tenant_id) {
      navigator.clipboard.writeText(data.tenant.tenant_id);
    }
  };

  const StatusBadge = ({ status }: { status: string }) => {
    if (status === 'OK') {
      return <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold"><CheckCircle2 className="w-4 h-4" /> OK</span>;
    }
    if (status === 'NEED_SETUP') {
      return <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-bold"><AlertTriangle className="w-4 h-4" /> NEED SETUP</span>;
    }
    return <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-full text-xs font-bold"><XCircle className="w-4 h-4" /> ERROR</span>;
  };

  if (loading && !data) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Bot Health Check</h2>
          <p className="text-sm text-gray-500 mt-1">Running diagnostic checks...</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-3xl p-8 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Bot Health Check</h2>
          <p className="text-sm text-gray-500 mt-1">Failed to check bot health</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-3xl p-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-red-800">Error</p>
            <p className="text-red-600 text-xs mt-1">{error}</p>
          </div>
        </div>
        <button onClick={fetchHealth} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all cursor-pointer">Retry</button>
      </div>
    );
  }

  if (!data) return null;

  const { tenant, bot_settings, products, product_variants, credentials, compatibility, warnings: warns, errors: errs } = data;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Bot Health Check</h2>
          <p className="text-sm text-gray-500 mt-1">Verify tenant data integrity and bot compatibility</p>
        </div>
        <StatusBadge status={compatibility} />
      </div>

      {warns.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-1.5">
          <p className="text-xs font-bold text-amber-800 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Warnings</p>
          {warns.map((w: string, i: number) => <p key={i} className="text-xs text-amber-700 ml-1">• {w}</p>)}
        </div>
      )}
      {errs.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-1.5">
          <p className="text-xs font-bold text-red-800 flex items-center gap-1.5"><XCircle className="w-4 h-4" /> Errors</p>
          {errs.map((e: string, i: number) => <p key={i} className="text-xs text-red-700 ml-1">• {e}</p>)}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-3">
          <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider flex items-center gap-2"><Activity className="w-4 h-4 text-indigo-600" /> Tenant</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-gray-500">exists</span><span className={`font-bold ${tenant.exists ? 'text-emerald-600' : 'text-red-600'}`}>{tenant.exists ? 'true' : 'false'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">status</span><span className="font-bold">{tenant.status}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">rent_end</span><span className="font-bold">{tenant.rent_end || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">active</span><span className={`font-bold ${tenant.active ? 'text-emerald-600' : 'text-red-600'}`}>{tenant.active ? 'true' : 'false'}</span></div>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-3">
          <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider flex items-center gap-2"><Settings className="w-4 h-4 text-indigo-600" /> Bot Settings</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-gray-500">total settings</span><span className="font-bold">{bot_settings.total_count}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">QR URL configured</span><span className={`font-bold ${bot_settings.payment_qr_url_configured ? 'text-emerald-600' : 'text-amber-600'}`}>{bot_settings.payment_qr_url_configured ? 'true' : 'false'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Banner URL configured</span><span className={`font-bold ${bot_settings.banner_url_configured ? 'text-emerald-600' : 'text-amber-600'}`}>{bot_settings.banner_url_configured ? 'true' : 'false'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">QR file_id</span><span className="font-mono text-[10px] max-w-[160px] truncate">{bot_settings.payment_qr_file_id || '""'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Banner file_id</span><span className="font-mono text-[10px] max-w-[160px] truncate">{bot_settings.banner_file_id || '""'}</span></div>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-3">
          <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider flex items-center gap-2"><ShoppingBag className="w-4 h-4 text-indigo-600" /> Products</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-gray-500">total products</span><span className="font-bold">{products.total_count}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">active products</span><span className="font-bold">{products.active_count}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">null tenant_id</span><span className={`font-bold ${products.null_tenant_id_count > 0 ? 'text-red-600' : 'text-gray-900'}`}>{products.null_tenant_id_count}</span></div>
            {products.latest.length > 0 && (
              <div className="pt-2 border-t border-gray-50">
                <p className="text-[10px] text-gray-400 font-semibold mb-1">Latest products</p>
                <div className="space-y-1">
                  {products.latest.map((p: any) => (
                    <div key={p.id} className="flex justify-between items-center text-[10px]">
                      <span className="truncate max-w-[140px] font-medium">{p.name}</span>
                      <span className={`${p.active ? 'text-emerald-600' : 'text-gray-400'}`}>{p.active ? 'active' : 'inactive'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-3">
          <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider flex items-center gap-2"><Database className="w-4 h-4 text-indigo-600" /> Product Variants</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-gray-500">total variants</span><span className="font-bold">{product_variants.total_count}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">with stock &gt; 0</span><span className={`font-bold ${product_variants.with_stock_count > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{product_variants.with_stock_count}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">zero stock</span><span className="font-bold text-gray-900">{product_variants.zero_stock_count}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">tenant_id mismatch</span><span className={`font-bold ${product_variants.tenant_id_mismatch_count > 0 ? 'text-red-600' : 'text-gray-900'}`}>{product_variants.tenant_id_mismatch_count}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">orphan variants</span><span className={`font-bold ${product_variants.orphan_count > 0 ? 'text-red-600' : 'text-gray-900'}`}>{product_variants.orphan_count}</span></div>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-3">
          <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider flex items-center gap-2"><Database className="w-4 h-4 text-indigo-600" /> Credentials</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-gray-500">total credentials</span><span className="font-bold">{credentials.total_count}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">available</span><span className={`font-bold ${credentials.available_count > 0 ? 'text-emerald-600' : 'text-amber-600'}`}>{credentials.available_count}</span></div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button onClick={fetchHealth} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Audit
        </button>
        <button onClick={copyTenantId} className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-xs font-bold rounded-xl transition-all cursor-pointer">
          <Copy className="w-4 h-4" />
          Copy Tenant ID
        </button>
        <button onClick={() => onNavigate?.('settings')} className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-xs font-bold rounded-xl transition-all cursor-pointer">
          <Settings className="w-4 h-4" />
          Open Bot Settings
        </button>
        <button onClick={() => onNavigate?.('products')} className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-xs font-bold rounded-xl transition-all cursor-pointer">
          <ShoppingBag className="w-4 h-4" />
          Open Products
        </button>
        <button onClick={() => onNavigate?.('stocks')} className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-xs font-bold rounded-xl transition-all cursor-pointer">
          <Database className="w-4 h-4" />
          Open Stock Manager
        </button>
      </div>
    </div>
  );
}