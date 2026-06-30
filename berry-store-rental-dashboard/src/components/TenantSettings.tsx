import React, { useState } from 'react';
import { BotSetting } from '../types';
import { Save, AlertCircle, Sparkles, CheckCircle2, Upload, Trash2, Loader2, Image, FileImage } from 'lucide-react';
import { SettingsSkeleton } from './Skeleton';

interface TenantSettingsProps {
  settings: BotSetting[];
  loading: boolean;
  onUpdateSetting: (key: string, value: string) => Promise<void>;
  onRefresh?: () => Promise<void>;
}

export function TenantSettings({ settings, loading, onUpdateSetting, onRefresh }: TenantSettingsProps) {
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [successKey, setSuccessKey] = useState<string | null>(null);
  const [formState, setFormState] = useState<Record<string, string>>({});

  // Media state managers
  const [dragActiveQR, setDragActiveQR] = useState(false);
  const [dragActiveBanner, setDragActiveBanner] = useState(false);
  const [uploadingQR, setUploadingQR] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [errorQR, setErrorQR] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successQR, setSuccessQR] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  React.useEffect(() => {
    if (settings) {
      const records: Record<string, string> = {};
      for (const s of settings) {
        records[s.key] = s.value;
      }
      setFormState(records);
    }
  }, [settings]);

  // Extract settings
  const paymentQrUrl = settings.find(s => s.key === 'payment_qr_url')?.value || '';
  const paymentQrFileId = settings.find(s => s.key === 'payment_qr_file_id')?.value || '';
  const bannerUrl = settings.find(s => s.key === 'banner_url')?.value || '';
  const bannerFileId = settings.find(s => s.key === 'banner_file_id')?.value || '';

  const handleSave = async (key: string) => {
    setSavingKey(key);
    try {
      await onUpdateSetting(key, formState[key] || '');
      setSuccessKey(key);
      setTimeout(() => setSuccessKey(null), 2500);
    } catch (e) {
      console.error(e);
    } finally {
      setSavingKey(null);
    }
  };

  const getFriendlyGroup = (key: string) => {
    if (key.includes('payment_')) return 'Payment & Transactions';
    if (key.includes('order_') || key.includes('delivery_')) return 'Checkout & Fulfilment';
    if (key.includes('welcome_') || key.includes('shop_') || key.includes('banner')) return 'Store Interface & Banner';
    return 'General & Support';
  };

  const validateFile = (file: File) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowed.includes(file.type)) {
      return 'Invalid file type. Only PNG, JPG, JPEG, and WEBP are supported.';
    }
    if (file.size > 5 * 1024 * 1024) {
      return 'File size exceeds 5MB limit.';
    }
    return null;
  };

  // UPLOAD WORKFLOWS
  const handleUploadQR = async (file: File) => {
    const errorMsg = validateFile(file);
    if (errorMsg) {
      setErrorQR(errorMsg);
      return;
    }
    setErrorQR(null);
    setUploadingQR(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('assetType', 'payment_qr');

    try {
      const res = await fetch('/api/tenant/assets/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to upload QR image');
      }
      setSuccessQR('Payment QR code updated!');
      if (onRefresh) await onRefresh();
      setTimeout(() => setSuccessQR(null), 3000);
    } catch (err: any) {
      setErrorQR(err.message || 'Error uploading file.');
    } finally {
      setUploadingQR(false);
    }
  };

  const handleUploadBanner = async (file: File) => {
    const errorMsg = validateFile(file);
    if (errorMsg) {
      setErrorBanner(errorMsg);
      return;
    }
    setErrorBanner(null);
    setUploadingBanner(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('assetType', 'banner');

    try {
      const res = await fetch('/api/tenant/assets/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to upload banner image');
      }
      setSuccessBanner('Shop banner updated!');
      if (onRefresh) await onRefresh();
      setTimeout(() => setSuccessBanner(null), 3000);
    } catch (err: any) {
      setErrorBanner(err.message || 'Error uploading file.');
    } finally {
      setUploadingBanner(false);
    }
  };

  // REMOVE WORKFLOWS
  const handleDeleteQR = async () => {
    if (!window.confirm('Are you sure you want to remove the Payment QR image?')) return;
    setErrorQR(null);
    setUploadingQR(true);
    try {
      const res = await fetch('/api/tenant/media/payment-qr', {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete QR image');
      }
      setSuccessQR('Payment QR code removed.');
      if (onRefresh) await onRefresh();
      setTimeout(() => setSuccessQR(null), 3000);
    } catch (err: any) {
      setErrorQR(err.message || 'Error deleting file.');
    } finally {
      setUploadingQR(false);
    }
  };

  const handleDeleteBanner = async () => {
    if (!window.confirm('Are you sure you want to remove the Shop Banner image?')) return;
    setErrorBanner(null);
    setUploadingBanner(true);
    try {
      const res = await fetch('/api/tenant/media/banner', {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete banner image');
      }
      setSuccessBanner('Shop banner removed.');
      if (onRefresh) await onRefresh();
      setTimeout(() => setSuccessBanner(null), 3000);
    } catch (err: any) {
      setErrorBanner(err.message || 'Error deleting file.');
    } finally {
      setUploadingBanner(false);
    }
  };

  // DRAG & DROP UTILITIES
  const handleDragQR = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActiveQR(true);
    } else if (e.type === "dragleave") {
      setDragActiveQR(false);
    }
  };

  const handleDropQR = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActiveQR(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUploadQR(e.dataTransfer.files[0]);
    }
  };

  const handleDragBanner = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActiveBanner(true);
    } else if (e.type === "dragleave") {
      setDragActiveBanner(false);
    }
  };

  const handleDropBanner = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActiveBanner(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUploadBanner(e.dataTransfer.files[0]);
    }
  };

  if (loading) {
    return <SettingsSkeleton />;
  }

  // Filter out the raw URL variables since they are elegantly managed by the Upload UI
  const filteredSettings = settings.filter(s => s.key !== 'payment_qr_url' && s.key !== 'banner_url');

  // Group settings for nice visual hierarchy
  const groupedKeys = filteredSettings.reduce((acc, current) => {
    const gr = getFriendlyGroup(current.key);
    if (!acc[gr]) acc[gr] = [];
    acc[gr].push(current);
    return acc;
  }, {} as Record<string, BotSetting[]>);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Bot settings Customize</h2>
        <p className="text-sm text-gray-500 mt-1">Directly edit the custom text templates, support handlers, and file assets seen by Telegram shop users.</p>
      </div>

      <div className="flex gap-2.5 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/50">
        <Sparkles className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
        <p className="text-xs text-indigo-800 leading-normal font-semibold">
          💡 <strong>Advanced Formatting:</strong> You can embed standard Markdown bold elements (**text**) or template codes like <code>{"{email}"}</code> or <code>{"{password}"}</code> inside Fulfillment alerts to personalize deliveries automatically.
        </p>
      </div>

      {/* NEW Store Media Setup Section */}
      <div className="space-y-4">
        <h3 className="text-xs font-extrabold text-indigo-600 uppercase tracking-widest border-b border-gray-100 pb-1.5">
          Store Media Setup
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* 1. Payment QR Upload Card */}
          <div className="bg-white border border-gray-100 rounded-[28px] p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-bold text-gray-400 font-mono tracking-wider">PAYMENT_QR_URL</span>
                {paymentQrUrl ? (
                  <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-100 flex items-center">
                    <CheckCircle2 className="w-3 h-3 mr-1 shrink-0" /> Configured
                  </span>
                ) : paymentQrFileId ? (
                  <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-100 flex items-center">
                    <FileImage className="w-3 h-3 mr-1 shrink-0" /> Telegram file_id configured
                  </span>
                ) : (
                  <span className="bg-amber-50 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-100 flex items-center">
                     Unconfigured
                  </span>
                )}
              </div>
              <h4 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">Payment QR Code Asset</h4>
              <p className="text-xs text-gray-400 mt-1 mb-4 leading-relaxed">Required for Telegram customers to scan and confirm order transactions.</p>
              
              <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-stretch mb-4">
                {/* QR Preview Wrapper */}
                <div className="w-28 h-28 h-auto max-h-[140px] border border-gray-100 bg-slate-50 rounded-2xl flex flex-col items-center justify-center p-1.5 overflow-hidden shadow-sm shrink-0">
                  {paymentQrUrl ? (
                    <img 
                      src={paymentQrUrl} 
                      alt="Payment QR" 
                      className="w-full h-full object-contain rounded-xl"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center p-3 text-slate-300">
                      <Image className="w-8 h-8 mb-1" />
                      <span className="text-[9px] font-bold leading-normal text-amber-600">Payment QR is not configured yet.</span>
                    </div>
                  )}
                </div>

                {/* Dropzone Container */}
                <div 
                  onDragEnter={handleDragQR}
                  onDragOver={handleDragQR}
                  onDragLeave={handleDragQR}
                  onDrop={handleDropQR}
                  onClick={() => document.getElementById('qr-file-input')?.click()}
                  className={`flex-1 border-2 border-dashed rounded-2xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                    dragActiveQR 
                      ? 'bg-indigo-50/70 border-indigo-500' 
                      : 'bg-gray-50/30 border-gray-100 hover:border-gray-200 hover:bg-gray-50/50'
                  }`}
                >
                  <input 
                    type="file"
                    id="qr-file-input"
                    accept="image/png, image/jpeg, image/jpg, image/webp"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleUploadQR(e.target.files[0]);
                      }
                    }}
                  />
                  {uploadingQR ? (
                    <div className="flex flex-col items-center text-indigo-600 animate-pulse">
                      <Loader2 className="w-6 h-6 mb-1.5 animate-spin" />
                      <span className="text-[10px] font-extrabold tracking-wider uppercase">Uploading...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-slate-400">
                      <Upload className="w-5 h-5 mb-1.5 text-slate-400" />
                      <span className="text-[11px] font-bold text-gray-700 leading-tight">Drag & drop here or click</span>
                      <span className="text-[9px] mt-0.5 font-medium">PNG, JPG, JPEG, WEBP (Max 5MB)</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Status outputs */}
              {errorQR && (
                <div className="flex gap-2 p-3 bg-red-50 text-red-700 rounded-xl border border-red-100 mt-2 mb-3 items-center">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <p className="text-[10px] font-bold leading-tight">{errorQR}</p>
                </div>
              )}
              {successQR && (
                <div className="flex gap-2 p-3 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100 mt-2 mb-3 items-center">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                  <p className="text-[10px] font-bold leading-tight">{successQR}</p>
                </div>
              )}
            </div>

            {/* Actions Footer */}
            <div className="flex gap-2 mt-4 pt-3 border-t border-gray-50">
              <button
                type="button"
                disabled={uploadingQR}
                onClick={() => document.getElementById('qr-file-input')?.click()}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold rounded-xl transition-all inline-flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                <span>{paymentQrUrl ? 'Replace QR Code' : 'Upload QR Code'}</span>
              </button>
              {paymentQrUrl && (
                <button
                  type="button"
                  disabled={uploadingQR}
                  onClick={handleDeleteQR}
                  className="px-3.5 py-2 border border-rose-200 hover:bg-rose-50 text-rose-600 text-[11px] font-bold rounded-xl transition-all inline-flex items-center justify-center cursor-pointer disabled:opacity-50"
                  title="Remove Asset"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* 2. Shop Banner Upload Card */}
          <div className="bg-white border border-gray-100 rounded-[28px] p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-bold text-gray-400 font-mono tracking-wider">BANNER_URL</span>
                {bannerUrl ? (
                  <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-100 flex items-center">
                    <CheckCircle2 className="w-3 h-3 mr-1 shrink-0" /> Configured
                  </span>
                ) : bannerFileId ? (
                  <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-100 flex items-center">
                    <FileImage className="w-3 h-3 mr-1 shrink-0" /> Telegram file_id configured
                  </span>
                ) : (
                  <span className="bg-amber-50 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-100 flex items-center">
                     Unconfigured
                  </span>
                )}
              </div>
              <h4 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">Shop Header Banner</h4>
              <p className="text-xs text-gray-400 mt-1 mb-4 leading-relaxed">Landscape layout welcome graphic at the header top of the Telegram interface.</p>
              
              <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-stretch mb-4">
                {/* Banner Preview Wrapper */}
                <div className="w-28 h-28 h-auto max-h-[140px] border border-gray-100 bg-slate-50 rounded-2xl flex flex-col items-center justify-center p-1.5 overflow-hidden shadow-sm shrink-0">
                  {bannerUrl ? (
                    <img 
                      src={bannerUrl} 
                      alt="Shop Banner" 
                      className="w-full h-full object-cover rounded-xl"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center p-3 text-slate-300">
                      <Image className="w-8 h-8 mb-1" />
                      <span className="text-[9px] font-bold leading-normal text-amber-600">Shop banner is not configured yet.</span>
                    </div>
                  )}
                </div>

                {/* Dropzone Container */}
                <div 
                  onDragEnter={handleDragBanner}
                  onDragOver={handleDragBanner}
                  onDragLeave={handleDragBanner}
                  onDrop={handleDropBanner}
                  onClick={() => document.getElementById('banner-file-input')?.click()}
                  className={`flex-1 border-2 border-dashed rounded-2xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                    dragActiveBanner 
                      ? 'bg-indigo-50/70 border-indigo-500' 
                      : 'bg-gray-50/30 border-gray-100 hover:border-gray-200 hover:bg-gray-50/50'
                  }`}
                >
                  <input 
                    type="file"
                    id="banner-file-input"
                    accept="image/png, image/jpeg, image/jpg, image/webp"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleUploadBanner(e.target.files[0]);
                      }
                    }}
                  />
                  {uploadingBanner ? (
                    <div className="flex flex-col items-center text-indigo-600 animate-pulse">
                      <Loader2 className="w-6 h-6 mb-1.5 animate-spin" />
                      <span className="text-[10px] font-extrabold tracking-wider uppercase">Uploading...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-slate-400">
                      <Upload className="w-5 h-5 mb-1.5 text-slate-400" />
                      <span className="text-[11px] font-bold text-gray-700 leading-tight">Drag & drop here or click</span>
                      <span className="text-[9px] mt-0.5 font-medium">PNG, JPG, JPEG, WEBP (Max 5MB)</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Status outputs */}
              {errorBanner && (
                <div className="flex gap-2 p-3 bg-red-50 text-red-700 rounded-xl border border-red-100 mt-2 mb-3 items-center">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <p className="text-[10px] font-bold leading-tight">{errorBanner}</p>
                </div>
              )}
              {successBanner && (
                <div className="flex gap-2 p-3 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100 mt-2 mb-3 items-center">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                  <p className="text-[10px] font-bold leading-tight">{successBanner}</p>
                </div>
              )}
            </div>

            {/* Actions Footer */}
            <div className="flex gap-2 mt-4 pt-3 border-t border-gray-50">
              <button
                type="button"
                disabled={uploadingBanner}
                onClick={() => document.getElementById('banner-file-input')?.click()}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold rounded-xl transition-all inline-flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                <span>{bannerUrl ? 'Replace Banner' : 'Upload Banner'}</span>
              </button>
              {bannerUrl && (
                <button
                  type="button"
                  disabled={uploadingBanner}
                  onClick={handleDeleteBanner}
                  className="px-3.5 py-2 border border-rose-200 hover:bg-rose-50 text-rose-600 text-[11px] font-bold rounded-xl transition-all inline-flex items-center justify-center cursor-pointer disabled:opacity-50"
                  title="Remove Asset"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Main Text Configuration Panels */}
      <div className="space-y-8">
        {Object.keys(groupedKeys).map((groupTitle) => (
          <div key={groupTitle} className="space-y-4">
            <h3 className="text-xs font-extrabold text-indigo-600 uppercase tracking-widest border-b border-gray-100 pb-1.5">{groupTitle}</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {groupedKeys[groupTitle].map((setting) => {
                const val = formState[setting.key] !== undefined ? formState[setting.key] : setting.value;
                const isSaving = savingKey === setting.key;
                const isSuccess = successKey === setting.key;

                return (
                  <div key={setting.key} className="bg-white border border-gray-100 rounded-[24px] p-6 shadow-sm flex flex-col justify-between hover:shadow-md hover:border-gray-200 transition-all">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-400 font-mono tracking-wider">{setting.key.toUpperCase()}</span>
                        {isSuccess && (
                          <span className="text-[10px] text-emerald-600 font-semibold flex items-center bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Saved
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-gray-800 mt-1">{setting.description}</p>
                    </div>

                    <div className="mt-3.5 space-y-2.5">
                      {setting.key.includes('message') || setting.key.includes('note') || setting.key.includes('instruction') || setting.key.includes('template') ? (
                        <textarea
                          rows={3}
                          value={val}
                          onChange={(e) => setFormState({ ...formState, [setting.key]: e.target.value })}
                          className="w-full px-3.5 py-2 border border-gray-200 text-xs rounded-xl focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                        />
                      ) : (
                        <input
                          type="text"
                          value={val}
                          onChange={(e) => setFormState({ ...formState, [setting.key]: e.target.value })}
                          className="w-full px-3.5 py-2 border border-gray-200 text-xs rounded-xl focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 font-medium"
                        />
                      )}

                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => handleSave(setting.key)}
                          className="px-3.5 py-1.5 bg-gray-900 hover:bg-gray-800 text-white text-[10px] font-bold rounded-lg transition-all inline-flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>{isSaving ? 'Saving...' : 'Update Settings'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
