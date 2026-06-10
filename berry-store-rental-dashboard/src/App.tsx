/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { 
  KeyRound, ShieldCheck, Mail, LogOut, CheckCircle, 
  HelpCircle, Sparkles, Send, Globe, ChevronRight, AlertCircle, RefreshCw
} from 'lucide-react';
import { Navigation } from './components/Navigation';
import { TenantOverview } from './components/TenantOverview';
import { TenantProducts } from './components/TenantProducts';
import { TenantOrders } from './components/TenantOrders';
import { TenantSettings } from './components/TenantSettings';
import { TenantCredentials } from './components/TenantCredentials';
import { MasterViews } from './components/MasterViews';

export default function App() {
  // Session details mapping state
  const [auth, setAuth] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // Active view router state
  const [activeTab, setActiveTab] = useState('overview');

  // Login forms state
  const [loginMode, setLoginMode] = useState<'tenant' | 'master'>('tenant');
  const [tenantIdInput, setTenantIdInput] = useState('');
  const [tenantPasswordInput, setTenantPasswordInput] = useState('');
  const [masterSecretInput, setMasterSecretInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Global Tenant state loaders
  const [overviewData, setOverviewData] = useState<any | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [settings, setSettings] = useState<any[]>([]);
  const [credentials, setCredentials] = useState<any[]>([]);
  const [tenantOverviewLoading, setTenantOverviewLoading] = useState(false);

  // Orders searching / filtering states
  const [orderFilter, setOrderFilter] = useState('all');
  const [orderSearch, setOrderSearch] = useState('');

  // Master Owner overall states
  const [masterOverview, setMasterOverview] = useState<any | null>(null);
  const [masterTenants, setMasterTenants] = useState<any[]>([]);
  const [masterMonitor, setMasterMonitor] = useState<any | null>(null);

  // Check user session state on page load
  useEffect(() => {
    fetchSession();
  }, []);

  const fetchSession = async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      const data = await res.json();
      if (data.isAuthenticated) {
        setAuth({ role: data.role, tenant_id: data.tenant_id, name: data.name, bot_username: data.bot_username });
        if (data.role === 'tenant') {
          loadTenantData();
        } else {
          loadMasterData();
        }
      } else {
        setAuth(false);
      }
    } catch (e) {
      setAuth(false);
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------------
  // DATA FETCHER ACTIONS
  // -------------------------------------------------------------------

  const loadTenantData = async () => {
    setTenantOverviewLoading(true);
    try {
      const [overviewRes, prodRes, varRes, setRes, credRes] = await Promise.all([
        fetch('/api/tenant/overview', { credentials: 'include' }),
        fetch('/api/tenant/products', { credentials: 'include' }),
        fetch('/api/tenant/variants', { credentials: 'include' }),
        fetch('/api/tenant/settings', { credentials: 'include' }),
        fetch('/api/tenant/credentials', { credentials: 'include' })
      ]);

      const [overview, prodList, varList, setList, credList] = await Promise.all([
        overviewRes.json(),
        prodRes.json(),
        varRes.json(),
        setRes.json(),
        credRes.json()
      ]);

      setOverviewData(overview);
      setProducts(prodList || []);
      setVariants(varList || []);
      setSettings(setList || []);
      setCredentials(credList || []);
      
      // Load orders based on filters
      await refreshOrders('all', '');

    } catch (err) {
      console.error("Failed loading tenant statistics", err);
    } finally {
      setTenantOverviewLoading(false);
    }
  };

  const refreshOrders = async (status: string, search: string) => {
    try {
      const query = new URLSearchParams();
      if (status) query.set('status', status);
      if (search) query.set('search', search);
      const res = await fetch(`/api/tenant/orders?${query.toString()}`, { credentials: 'include' });
      const list = await res.json();
      setOrders(list || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadMasterData = async () => {
    setTenantOverviewLoading(true);
    try {
      const [overviewRes, tenantsRes, monitorRes] = await Promise.all([
        fetch('/api/master/overview', { credentials: 'include' }),
        fetch('/api/master/tenants', { credentials: 'include' }),
        fetch('/api/master/rental-monitor', { credentials: 'include' })
      ]);

      const [overview, tenantsList, monitorList] = await Promise.all([
        overviewRes.json(),
        tenantsRes.json(),
        monitorRes.json()
      ]);

      setMasterOverview(overview);
      setMasterTenants(tenantsList || []);
      setMasterMonitor(monitorList);
    } catch (err) {
      console.error("Failed loading system master views", err);
    } finally {
      setTenantOverviewLoading(false);
    }
  };

  // -------------------------------------------------------------------
  // SECURE AUTH LOGINS / LOGOUTS
  // -------------------------------------------------------------------

  const handleTenantLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);

    try {
      const res = await fetch('/api/auth/tenant-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tenant_id: tenantIdInput.trim(), password: tenantPasswordInput })
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setAuth({ role: 'tenant', tenant_id: data.tenant_id, name: data.name });
        setActiveTab('overview');
        loadTenantData();
      } else {
        setLoginError(data.error || 'Authenication check failed. Try again.');
      }
    } catch (err) {
      setLoginError('Server rejected network connection.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleMasterLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);

    try {
      const res = await fetch('/api/auth/master-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ master_secret: masterSecretInput })
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setAuth({ role: 'master' });
        setActiveTab('overview');
        loadMasterData();
      } else {
        setLoginError(data.error || 'Authenication check failed. Try again.');
      }
    } catch (err) {
      setLoginError('Server rejected network connection.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setAuth(false);
    setTenantIdInput('');
    setTenantPasswordInput('');
    setMasterSecretInput('');
  };

  // -------------------------------------------------------------------
  // MUTATION API TRIGGERS (Tenant scope)
  // -------------------------------------------------------------------

  const handleCreateProduct = async (form: any) => {
    const res = await fetch('/api/tenant/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(form)
    });
    if (res.ok) {
      loadTenantData();
    } else {
      const err = await res.json().catch(() => ({ error: `Server error (${res.status})` }));
      alert('Failed to create product: ' + (err.error || 'Unknown error'));
    }
  };

  const handleUpdateProduct = async (id: string, updates: any) => {
    const res = await fetch(`/api/tenant/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(updates)
    });
    if (res.ok) {
      loadTenantData();
    } else {
      const err = await res.json().catch(() => ({ error: `Server error (${res.status})` }));
      alert('Failed to update product: ' + (err.error || 'Unknown error'));
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm("Are you sure you want to delete this listing product? This can't be undone.")) return;
    const res = await fetch(`/api/tenant/products/${id}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) {
      loadTenantData();
    } else {
      const err = await res.json().catch(() => ({ error: `Server error (${res.status})` }));
      alert('Failed to delete product: ' + (err.error || 'Unknown error'));
    }
  };

  const handleStockUpdate = async (id: string, quantity: number, mode: 'add' | 'set') => {
    const res = await fetch(`/api/tenant/products/${id}/stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ quantity, mode })
    });
    if (res.ok) {
      loadTenantData();
    } else {
      const err = await res.json().catch(() => ({ error: `Server error (${res.status})` }));
      alert(`Stock update failed: ${err.error || 'Unknown error'}`);
    }
  };

  const handleActivateProduct = async (id: string) => {
    const res = await fetch(`/api/tenant/products/${id}/activate`, {
      method: 'POST',
      credentials: 'include'
    });
    if (res.ok) {
      loadTenantData();
    } else {
      const err = await res.json().catch(() => ({ error: `Server error (${res.status})` }));
      alert(`Activation failed: ${err.error || 'Unknown error'}`);
    }
  };

  const handleDeactivateProduct = async (id: string) => {
    const res = await fetch(`/api/tenant/products/${id}/deactivate`, {
      method: 'POST',
      credentials: 'include'
    });
    if (res.ok) {
      loadTenantData();
    } else {
      const err = await res.json().catch(() => ({ error: `Server error (${res.status})` }));
      alert(`Deactivation failed: ${err.error || 'Unknown error'}`);
    }
  };

  const handleCreateVariant = async (form: any) => {
    const res = await fetch('/api/tenant/variants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(form)
    });
    if (res.ok) {
      loadTenantData();
    } else {
      const err = await res.json().catch(() => ({ error: `Server error (${res.status})` }));
      alert('Failed to create variant: ' + (err.error || 'Unknown error'));
    }
  };

  const handleUpdateVariant = async (id: string, updates: any) => {
    const res = await fetch(`/api/tenant/variants/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(updates)
    });
    if (res.ok) {
      loadTenantData();
    } else {
      const err = await res.json().catch(() => ({ error: `Server error (${res.status})` }));
      alert('Failed to update variant: ' + (err.error || 'Unknown error'));
    }
  };

  const handleUpdateOrderStatus = async (id: string, status: any, notes?: string) => {
    const res = await fetch(`/api/tenant/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status, notes })
    });
    if (res.ok) {
      loadTenantData();
    }
  };

  const handleAddCredentials = async (productId: string, variantId: string | null, text: string) => {
    const res = await fetch('/api/tenant/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ product_id: productId, variant_id: variantId, raw_text: text })
    });
    const parsed = await res.json();
    loadTenantData();
    return parsed.count_added || 0;
  };

  const handleUpdateSetting = async (key: string, value: string) => {
    const res = await fetch(`/api/tenant/settings/${key}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ value })
    });
    if (res.ok) {
      const updated = await res.json();
      setSettings(prev => prev.map(s => s.key === key ? updated : s));
    }
  };

  const handleBroadcastSimulate = async (text: string) => {
    const res = await fetch('/api/tenant/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ message: text })
    });
    const data = await res.json();
    if (res.ok) {
      alert(`Telegram message dispatched to ${data.recipients_count} active followers!`);
    } else {
      alert(`Failed broadcast: ${data.error}`);
    }
  };

  // -------------------------------------------------------------------
  // MUTATION API TRIGGERS (Master scope)
  // -------------------------------------------------------------------

  const handleCreateTenant = async (form: any): Promise<any> => {
    const res = await fetch('/api/master/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(form)
    });
    const data = await res.json();
    loadMasterData();
    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  };

  const handleExtendRent = async (id: string, months: number) => {
    const res = await fetch(`/api/master/tenants/${id}/extend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ months })
    });
    if (res.ok) loadMasterData();
  };

  const handleSuspendTenant = async (id: string) => {
    const res = await fetch(`/api/master/tenants/${id}/suspend`, { method: 'POST', credentials: 'include' });
    if (res.ok) loadMasterData();
  };

  const handleActivateTenant = async (id: string) => {
    const res = await fetch(`/api/master/tenants/${id}/activate`, { method: 'POST', credentials: 'include' });
    if (res.ok) loadMasterData();
  };

  const handleResetPassword = async (id: string) => {
    await fetch(`/api/master/tenants/${id}/reset-password`, { method: 'POST', credentials: 'include' });
    loadMasterData();
  };

  const handleToggleDashboard = async (id: string, enable: boolean) => {
    const route = enable ? 'enable-dashboard' : 'disable-dashboard';
    await fetch(`/api/master/tenants/${id}/${route}`, { method: 'POST', credentials: 'include' });
    loadMasterData();
  };

  const handleInitDefaultSettings = async (tenantId: string): Promise<any> => {
    const res = await fetch(`/api/master/tenant-audit/init-default-settings/${tenantId}`, {
      method: 'POST',
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to initialize settings');
    return data;
  };

  // -------------------------------------------------------------------
  // SCREEN STRUCTURING
  // -------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600"></div>
          <p className="text-gray-500 font-bold text-xs tracking-widest uppercase">Berry Store Rental Gateway booting...</p>
        </div>
      </div>
    );
  }

  // Login Gate visual container
  if (auth === false) {
    return (
      <div className="min-h-screen bg-slate-50/70 py-12 px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center font-sans tracking-tight">
        
        {/* Brand visual header */}
        <div className="flex flex-col items-center text-center space-y-2.5 mb-8 select-none">
          <div className="p-3 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-3xl w-14 h-14 flex items-center justify-center shadow-lg shadow-blue-500/10">
            <span className="text-white font-black text-2xl">B</span>
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-950 tracking-tight">Berry Store Rental System</h1>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Dynamic telegram shop bot central supervisor</p>
          </div>
        </div>

        {/* Core Auth Panel Card */}
        <div className="max-w-md w-full bg-white border border-gray-100 rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col gap-6 animate-fade-in relative overflow-hidden">
          
          <div className="flex bg-gray-50 p-1 border border-gray-250/50 rounded-2xl">
            <button
              onClick={() => { setLoginMode('tenant'); setLoginError(''); }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl tracking-wider transition-all cursor-pointer ${
                loginMode === 'tenant' 
                  ? 'bg-white text-blue-600 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              TENANT LOGIN / SETUP
            </button>
            <button
              onClick={() => { setLoginMode('master'); setLoginError(''); }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl tracking-wider transition-all cursor-pointer ${
                loginMode === 'master' 
                  ? 'bg-white text-blue-600 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              SYSTEM OWNER MODE
            </button>
          </div>

          <div className="text-xs">
            <h3 className="font-bold text-gray-900 text-sm">
              {loginMode === 'tenant' ? 'Access your Shop Bot credentials' : 'Administrative master override'}
            </h3>
            <p className="text-gray-400 font-medium mt-0.5">
              {loginMode === 'tenant' 
                ? '🔑 First-time user? Enter your tenant ID and the new password you wish to use.'
                : '🔒 Provide Master secret key authentication passcode to view all gateways.'
              }
            </p>
          </div>

          {loginError && (
            <div className="bg-rose-50 border border-rose-200 p-3.5 rounded-2xl flex gap-2.5 text-xs">
              <AlertCircle className="w-4.5 h-4.5 text-rose-600 shrink-0 mt-0.5" />
              <p className="text-rose-800 font-semibold leading-normal">{loginError}</p>
            </div>
          )}

          {loginMode === 'tenant' ? (
            <form onSubmit={handleTenantLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Tenant ID</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 92c1e5ca-8498-438f-b777-3dc1c3195c1b"
                  value={tenantIdInput}
                  onChange={(e) => setTenantIdInput(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Dashboard Password</label>
                <input
                  type="password"
                  required
                  placeholder="Insert custom passcode..."
                  value={tenantPasswordInput}
                  onChange={(e) => setTenantPasswordInput(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-full transition-all cursor-pointer font-mono tracking-wider shadow-sm hover:shadow-md"
              >
                {loginLoading ? 'CONNECTING...' : 'AUTHORIZE / SET PASSWORD'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleMasterLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">MASTER OWNER ENCRYPTION SECRET</label>
                <input
                  type="password"
                  required
                  placeholder="Insert secure master password..."
                  value={masterSecretInput}
                  onChange={(e) => setMasterSecretInput(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-full transition-all cursor-pointer font-mono tracking-wider shadow-sm"
              >
                {loginLoading ? 'VALIDATING SECURITY...' : 'OVERRIDE SYSTEM ACCESS &rarr;'}
              </button>
            </form>
          )}

        </div>

        <p className="text-[11px] text-gray-400 mt-6 font-semibold select-none leading-relaxed text-center">
          🍓 Berry Store Portal System v1.2.6 Security Compliant.<br/>
          Secure cookies isolate tenant data.
        </p>

      </div>
    );
  }

  // Authenticated Screen Assembly
  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col md:flex-row font-sans text-xs">
      
      {/* Navigation layouts sidebar/bottom sticky */}
      <Navigation 
        role={auth.role} 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        onLogout={handleLogout}
        tenantName={auth.name}
        botUsername={auth.bot_username}
      />

      {/* Main viewport canvas container */}
      <main className="flex-1 p-4 sm:p-6 md:p-8 pt-20 md:pt-8 pb-24 md:pb-8 overflow-y-auto max-w-7xl mx-auto w-full">
        {auth.role === 'tenant' ? (
          /* TENANT VIEWS */
          <>
            {activeTab === 'overview' && (
              <TenantOverview 
                data={overviewData} 
                loading={tenantOverviewLoading} 
                onNavigate={setActiveTab} 
              />
            )}

            {activeTab === 'products' && (
              <TenantProducts 
                products={products}
                variants={variants}
                loading={tenantOverviewLoading}
                onCreateProduct={handleCreateProduct}
                onUpdateProduct={handleUpdateProduct}
                onDeleteProduct={handleDeleteProduct}
                onCreateVariant={handleCreateVariant}
                onUpdateVariant={handleUpdateVariant}
                onStockUpdate={handleStockUpdate}
                onActivateProduct={handleActivateProduct}
                onDeactivateProduct={handleDeactivateProduct}
              />
            )}

            {activeTab === 'orders' && (
              <TenantOrders 
                orders={orders}
                products={products}
                variants={variants}
                loading={tenantOverviewLoading}
                onUpdateOrderStatus={handleUpdateOrderStatus}
                filterStatus={orderFilter}
                setFilterStatus={(val) => {
                  setOrderFilter(val);
                  refreshOrders(val, orderSearch);
                }}
                searchTerm={orderSearch}
                setSearchTerm={(val) => {
                  setOrderSearch(val);
                  refreshOrders(orderFilter, val);
                }}
              />
            )}

            {activeTab === 'sales' && (
              /* SALES ANALYTICS PAGE (uses beautiful trends charts) */
              <div className="space-y-6 animate-fade-in">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Full Sales & Revenue Analytics</h2>
                  <p className="text-sm text-gray-500 mt-1">Audit complete daily checkout logs, identify your absolute top performers, and optimize bot transactions.</p>
                </div>
                {/* Embedded products list widget */}
                <TenantOrders 
                  orders={orders}
                  products={products}
                  variants={variants}
                  loading={tenantOverviewLoading}
                  onUpdateOrderStatus={handleUpdateOrderStatus}
                  filterStatus={orderFilter}
                  setFilterStatus={(val) => {
                    setOrderFilter(val);
                    refreshOrders(val, orderSearch);
                  }}
                  searchTerm={orderSearch}
                  setSearchTerm={(val) => {
                    setOrderSearch(val);
                    refreshOrders(orderFilter, val);
                  }}
                />
              </div>
            )}

            {activeTab === 'stocks' && (
              /* STOCK MANAGEMENT SCREEN */
              <div className="space-y-6 animate-fade-in">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Stock Levels & Deactivations</h2>
                  <p className="text-sm text-gray-500 mt-1">Audit dynamic variant stock and credentials availability directly.</p>
                </div>
                <TenantProducts 
                  products={products}
                  variants={variants}
                  loading={tenantOverviewLoading}
                  onCreateProduct={handleCreateProduct}
                  onUpdateProduct={handleUpdateProduct}
                  onDeleteProduct={handleDeleteProduct}
                  onCreateVariant={handleCreateVariant}
                  onUpdateVariant={handleUpdateVariant}
                  onStockUpdate={handleStockUpdate}
                  onActivateProduct={handleActivateProduct}
                  onDeactivateProduct={handleDeactivateProduct}
                />
              </div>
            )}

            {activeTab === 'credentials' && (
              <TenantCredentials 
                credentials={credentials}
                products={products}
                variants={variants}
                loading={tenantOverviewLoading}
                onAddCredentials={handleAddCredentials}
              />
            )}

            {activeTab === 'broadcast' && (
              /* BROADCAST MESSAGE SCREEN */
              <div className="space-y-6 animate-fade-in text-xs font-semibold text-gray-700">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Telegram Broadcast Notifications</h2>
                  <p className="text-sm text-gray-500 mt-1">Dispatch localized alerts or announcement banners to Telegram users registered under your bot gateway space.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Form */}
                  <div className="bg-white border border-gray-150/40 rounded-3xl p-6 shadow-xs space-y-4">
                    <div>
                      <h3 className="font-bold text-gray-950 text-base">Write Telegram Alert</h3>
                      <p className="text-[11px] text-gray-400 mt-0.5">Will deliver instantly in target chat queues.</p>
                    </div>

                    <form onSubmit={(e) => {
                      e.preventDefault();
                      const msg = (e.target as any).broadcast_msg.value;
                      if (msg) {
                        handleBroadcastSimulate(msg);
                        (e.target as any).broadcast_msg.value = '';
                      }
                    }} className="space-y-4">
                      <textarea
                        name="broadcast_msg"
                        required
                        rows={6}
                        placeholder="Welcome to our annual voucher clearance sale... 🚀"
                        className="w-full p-4 border border-gray-200 rounded-2xl resize-none"
                      />
                      <button
                        type="submit"
                        className="py-2.5 px-5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all inline-flex items-center space-x-1.5 cursor-pointer"
                      >
                        <Send className="w-4 h-4" />
                        <span>Dispatch Telegram Broadcast</span>
                      </button>
                    </form>
                  </div>

                  {/* Visual mockup of Telegram bubble */}
                  <div className="bg-slate-100 rounded-3xl p-5 border border-gray-200 h-fit space-y-3">
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Telegram Client Preview</p>
                    <div className="flex space-x-2">
                      <div className="w-8 h-8 rounded-full bg-blue-500 text-white font-bold flex items-center justify-center font-mono">B</div>
                      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 max-w-sm flex flex-col gap-1 gap-y-1 text-[11px]">
                        <p className="font-bold text-blue-600">@{auth.bot_username.replace('@','')}</p>
                        <p className="text-gray-800 leading-normal">
                          [Draft broadcast message template will appear here inside Telegram bubble after click...]
                        </p>
                        <p className="text-[9px] text-gray-400 self-end mt-1 font-mono">12:00 PM</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <TenantSettings 
                settings={settings}
                loading={tenantOverviewLoading}
                onUpdateSetting={handleUpdateSetting}
                onRefresh={loadTenantData}
              />
            )}

            {activeTab === 'rental' && (
              /* RENTAL SUMMARY SHEET */
              <div className="space-y-6 animate-fade-in text-xs font-semibold text-gray-700">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 tracking-tight">SaaS Rental Subscription properties</h2>
                  <p className="text-sm text-gray-500 mt-1">Review licensed tenant parameters and registered lease limits.</p>
                </div>

                <div className="bg-white border border-gray-105-80 rounded-3xl p-6 shadow-xs max-w-xl space-y-4">
                  <h3 className="font-bold text-gray-950 text-base">Store License summary</h3>
                  <div className="space-y-3 pt-3 border-t border-gray-50">
                    <div className="flex justify-between py-1 border-b border-gray-50/50">
                      <span className="text-gray-400">Tenant Bot Username</span>
                      <span className="text-gray-950 font-bold">{auth.bot_username}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-gray-50/50">
                      <span className="text-gray-400">Lease Status parameter</span>
                      <span className="bg-emerald-50 border border-emerald-100 text-emerald-700 px-3 py-0.5 rounded-full font-bold uppercase text-[9px]">Active</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-gray-50/50">
                      <span className="text-gray-400">Days license limit remaining</span>
                      <span className="text-blue-600 font-bold">Expires in {overviewData ? overviewData.tenant.days_left : '...'} days</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'health' && (
              /* HEARTBEAT DIAGNOSTIC CENTER */
              <div className="space-y-6 animate-fade-in text-xs font-semibold text-gray-700">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Daemon Loop heartbeat diagnostics</h2>
                  <p className="text-sm text-gray-500 mt-1">Audit active webhook nodes and health checklists representing your automated shop bot.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Webhook diagnostics */}
                  <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-xs space-y-4">
                    <h3 className="font-bold text-gray-900 text-base">Daemon Hook checks</h3>
                    <div className="flex items-center space-x-3.5 bg-gray-50 p-4 border border-gray-100 rounded-2xl">
                      <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></div>
                      <div>
                        <p className="text-gray-900 font-bold">Node status: ONLINE</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Last heartbeat parsed 3 minutes ago.</p>
                      </div>
                    </div>
                  </div>

                  {/* Checklist status */}
                  <div className="bg-white border border-gray-105-80 rounded-3xl p-6 shadow-xs space-y-4">
                    <h3 className="font-bold text-gray-950 text-base">Store Setup progress checks</h3>
                    <div className="space-y-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span>• Catalog has active products</span>
                        <span className="text-emerald-600 font-bold">Passed</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>• Custom payments QR loaded</span>
                        <span className="text-emerald-600 font-bold">Passed</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>• Deliverables credentials stock available</span>
                        <span className="text-emerald-500 font-bold">Passed</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          /* MASTER OWNER VIEWS */
          <MasterViews 
            overview={masterOverview}
            tenants={masterTenants}
            rentalMonitor={masterMonitor}
            loading={tenantOverviewLoading}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onCreateTenant={handleCreateTenant}
            onExtendRent={handleExtendRent}
            onSuspendTenant={handleSuspendTenant}
            onActivateTenant={handleActivateTenant}
            onResetPassword={handleResetPassword}
            onToggleDashboard={handleToggleDashboard}
            onInitDefaultSettings={handleInitDefaultSettings}
          />
        )}
      </main>

    </div>
  );
}
