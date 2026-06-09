import React from 'react';
import { 
  LayoutDashboard, ShoppingBag, Receipt, BarChart3, Database, 
  KeyRound, Send, Settings, ShieldAlert, Activity, Users, LogOut,
  FolderMinus, FileText, Menu, X, ShieldCheck
} from 'lucide-react';

interface TabItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface NavigationProps {
  role: 'tenant' | 'master';
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
  tenantName?: string;
  botUsername?: string;
}

export function Navigation({ role, activeTab, setActiveTab, onLogout, tenantName, botUsername }: NavigationProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const tenantTabs: TabItem[] = [
    { id: 'overview', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'products', label: 'Products', icon: <ShoppingBag className="w-5 h-5" /> },
    { id: 'orders', label: 'Orders', icon: <Receipt className="w-5 h-5" /> },
    { id: 'sales', label: 'Analytics', icon: <BarChart3 className="w-5 h-5" /> },
    { id: 'stocks', label: 'Stock Manager', icon: <Database className="w-5 h-5" /> },
    { id: 'credentials', label: 'Credentials', icon: <KeyRound className="w-5 h-5" /> },
    { id: 'broadcast', label: 'Broadcast', icon: <Send className="w-5 h-5" /> },
    { id: 'settings', label: 'Bot Settings', icon: <Settings className="w-5 h-5" /> },
    { id: 'rental', label: 'Rental Info', icon: <FileText className="w-5 h-5" /> },
    { id: 'health', label: 'Bot Health', icon: <Activity className="w-5 h-5" /> },
  ];

  const masterTabs: TabItem[] = [
    { id: 'overview', label: 'Master Overview', icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'tenants', label: 'Tenants List', icon: <Users className="w-5 h-5" /> },
    { id: 'create', label: 'Create Tenant', icon: <PlusIcon /> },
    { id: 'monitor', label: 'Rental Monitor', icon: <ShieldAlert className="w-5 h-5" /> },
  ];

  const tabs = role === 'tenant' ? tenantTabs : masterTabs;

  function PlusIcon() {
    return (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
    );
  }

  return (
    <>
      {/* Mobile Top Header (Fixed) */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white/95 backdrop-blur-md border-b border-gray-200 flex items-center justify-between px-4 z-40">
        <div className="flex items-center space-x-2">
          <div className="bg-indigo-600 w-8 h-8 rounded-lg flex items-center justify-center shadow-xs">
            <span className="text-white text-xs font-bold font-sans">B</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-[#1D1D1F] line-clamp-1">{tenantName || 'Berry Store'}</h1>
            <p className="text-[10px] text-gray-400 line-clamp-1">{botUsername || 'Central Router'}</p>
          </div>
        </div>
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-xl hover:bg-gray-50 active:scale-95 transition-all text-gray-500 cursor-pointer"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Desktop Persistent Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-200 h-screen sticky top-0 shrink-0 z-30">
        {/* Brand */}
        <div className="p-6 border-b border-gray-200 flex items-center space-x-3">
          <div className="bg-indigo-600 w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold shadow-xs">
            <span>B</span>
          </div>
          <div>
            <h1 className="font-bold text-[#1D1D1F] tracking-tight leading-tight text-lg">Berry Store</h1>
            <p className="text-xs text-gray-450 font-medium">{role === 'tenant' ? 'Bot Tenant Admin' : 'Master System Owner'}</p>
          </div>
        </div>

        {/* Tenant Details quick card */}
        {role === 'tenant' && (
          <div className="px-4 py-3 mx-4 my-4 bg-gray-50 rounded-2xl border border-gray-100/50">
            <div className="flex items-center space-x-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
              <p className="text-xs font-semibold text-gray-800 line-clamp-1">{tenantName}</p>
            </div>
            <p className="text-[11px] text-gray-400 mt-1 font-mono">{botUsername}</p>
          </div>
        )}

        {role === 'master' && (
          <div className="px-4 py-3 mx-4 my-4 bg-blue-50/50 rounded-2xl border border-blue-100/30 flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <p className="text-xs font-bold text-blue-800">Master Router Secure</p>
          </div>
        )}

        {/* Menu Items */}
        <nav className="flex-1 px-4 py-2 space-y-1 overflow-y-auto">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl font-medium text-sm transition-all duration-200 cursor-pointer ${
                  active 
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/10' 
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-950'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer Logout */}
        <div className="p-4 border-t border-gray-50">
          <button
            onClick={onLogout}
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-gray-500 hover:text-red-600 hover:bg-red-50/50 font-medium text-sm transition-all duration-200 cursor-pointer"
          >
            <LogOut className="w-5 h-5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer (Overlay Drawer) */}
      <div 
        className={`md:hidden fixed inset-0 bg-black/30 backdrop-blur-xs z-40 transition-opacity duration-300 ${
          mobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setMobileMenuOpen(false)}
      >
        <div 
          className={`absolute right-0 top-0 bottom-0 w-72 bg-white flex flex-col h-full shadow-2xl transition-transform duration-300 transform ${
            mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-5 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
            <div>
              <h2 className="font-bold text-gray-900">Berry Store Menu</h2>
              <p className="text-xs text-gray-500">{role === 'tenant' ? 'Bot Tenant Admin' : 'Master System Admin'}</p>
            </div>
            <button 
              onClick={() => setMobileMenuOpen(false)}
              className="p-1 px-2 border border-gray-200 rounded-xl hover:bg-white text-gray-400 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links inside Drawer */}
          <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer ${
                    active 
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/10' 
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-950'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Logout footer */}
          <div className="p-4 border-t border-gray-100">
            <button
              onClick={onLogout}
              className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-red-600 bg-red-50/30 hover:bg-red-50 font-medium text-sm transition-all cursor-pointer"
            >
              <LogOut className="w-5 h-5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Sticky Bottom Nav Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/95 backdrop-blur-md border-t border-gray-100 flex items-center justify-around px-2 z-40 pb-safe shadow-[0_-2px_10px_rgba(0,0,0,0.02)]">
        {tabs.slice(0, 4).map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center w-16 h-12 rounded-xl transition-all cursor-pointer ${
                active ? 'text-blue-600 scale-102 font-semibold' : 'text-gray-400 font-normal hover:text-gray-600'
              }`}
            >
              <div className="mb-0.5">{tab.icon}</div>
              <span className="text-[10px] leading-tight max-w-[62px] truncate">{tab.label.split(' ')[0]}</span>
            </button>
          );
        })}
        {/* Dynamic drawer activation button */}
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center justify-center w-16 h-12 rounded-xl text-gray-400 hover:text-gray-600 cursor-pointer"
        >
          <Menu className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] leading-tight">More</span>
        </button>
      </nav>
    </>
  );
}
