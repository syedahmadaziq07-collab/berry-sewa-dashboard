import React, { useState } from 'react';
import { Credential, Product, ProductVariant } from '../types';
import { KeyRound, PlusCircle, CheckCircle, ShieldAlert, Sparkles, Filter } from 'lucide-react';
import { TableSkeleton } from './Skeleton';
import { EmptyState } from './EmptyState';

interface TenantCredentialsProps {
  credentials: Credential[];
  products: Product[];
  variants: ProductVariant[];
  loading: boolean;
  onAddCredentials: (productId: string, variantId: string | null, text: string) => Promise<number>;
}

export function TenantCredentials({ credentials, products, variants, loading, onAddCredentials }: TenantCredentialsProps) {
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [rawText, setRawText] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);
  const [successCount, setSuccessCount] = useState<number | null>(null);

  // Filters
  const [productFilter, setProductFilter] = useState('all');

  const activeProducts = products.filter(p => p.auto_delivery);
  const selectedProduct = activeProducts.find(p => p.id === selectedProductId);
  const matchingVariants = selectedProduct ? variants.filter(v => v.product_id === selectedProduct.id) : [];

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !rawText.trim()) return;

    setUploadLoading(true);
    setSuccessCount(null);
    try {
      const added = await onAddCredentials(
        selectedProductId,
        selectedVariantId || null,
        rawText
      );
      setSuccessCount(added);
      setRawText('');
      setTimeout(() => setSuccessCount(null), 5000);
    } catch (err) {
      console.error(err);
    } finally {
      setUploadLoading(false);
    }
  };

  // Metrics
  const activeUnused = credentials.filter(c => !c.is_used);
  const totalAllocated = credentials.filter(c => c.is_used);

  const getProductLabel = (c: Credential) => {
    const p = products.find(prod => prod.id === c.product_id);
    const v = c.variant_id ? variants.find(varObj => varObj.id === c.variant_id) : null;
    return `${p ? p.name : 'Unknown Product'} ${v ? `[Option: ${v.name}]` : ''}`;
  };

  const filteredCredentials = productFilter === 'all' 
    ? credentials 
    : credentials.filter(c => c.product_id === productFilter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Credentials Locker</h2>
        <p className="text-sm text-gray-500 mt-1">Upload and manage pre-loaded license codes, Netflix credentials, or digital voucher accounts delivering on checkout.</p>
      </div>

      {/* Counters banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center justify-between shadow-xs">
          <div>
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Unused Vault Stock</h4>
            <p className="text-3xl font-black mt-1 font-mono text-emerald-600">{activeUnused.length}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Ready for instant delivery</p>
          </div>
          <div className="bg-emerald-50 text-emerald-600 p-3.5 rounded-full">
            <KeyRound className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center justify-between shadow-xs">
          <div>
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Delivered Items</h4>
            <p className="text-3xl font-black mt-1 font-mono text-gray-700">{totalAllocated.length}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Purchases checked out by users</p>
          </div>
          <div className="bg-blue-50 text-blue-600 p-3.5 rounded-full">
            <CheckCircle className="w-5 h-5" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload Form Box */}
        <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-xs h-fit space-y-4">
          <div>
            <h3 className="font-bold text-gray-900 leading-snug">Bulk Stock Loader</h3>
            <p className="text-xs text-gray-400 mt-0.5">Upload license strings or accounts.</p>
          </div>

          <form onSubmit={handleUpload} className="space-y-4 text-xs font-semibold">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Select Product</label>
              <select
                required
                value={selectedProductId}
                onChange={(e) => {
                  setSelectedProductId(e.target.value);
                  setSelectedVariantId('');
                }}
                className="w-full px-3 py-2 bg-gray-50 rounded-xl border border-gray-200"
              >
                <option value="">-- Choose Auto-Delivery Product --</option>
                {activeProducts.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {selectedProductId && matchingVariants.length > 0 && (
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Select Variant/Option</label>
                <select
                  value={selectedVariantId}
                  onChange={(e) => setSelectedVariantId(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 rounded-xl border border-gray-200"
                >
                  <option value="">-- Choose Variant (Optional) --</option>
                  {matchingVariants.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Raw Strings block</label>
                <span className="text-[10px] text-gray-400 font-medium">1 Pair per line</span>
              </div>
              <textarea
                required
                rows={6}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="email1@berry.com:password123&#10;email2@berry.com:mypass324&#10;KEY-4920-CODE"
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl resize-none font-mono text-xs focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Success notification flag */}
            {successCount !== null && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                <p className="text-[10px] text-emerald-800 font-medium leading-normal">
                  Successfully locked <strong>{successCount}</strong> digital credentials into secure database store. Recalculated stock count!
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={uploadLoading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center space-x-1.5"
            >
              <PlusCircle className="w-4.5 h-4.5" />
              <span>{uploadLoading ? 'Uploading...' : 'Upload credentials'}</span>
            </button>
          </form>
        </div>

        {/* Credentials table list */}
        <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-xs lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h3 className="font-bold text-gray-900">Loaded Vault Records</h3>
              <p className="text-xs text-gray-400 mt-0.5">View overall status of secure assets</p>
            </div>

            {/* Filter by product */}
            <div className="flex items-center space-x-1.5 self-stretch sm:self-auto bg-gray-50 border border-gray-100 rounded-xl px-2 py-1 shrink-0">
              <Filter className="w-3.5 h-3.5 text-gray-400" />
              <select
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
                className="bg-transparent border-none text-[11px] font-bold text-gray-500 capitalize focus:outline-none"
              >
                <option value="all">All Vault Items</option>
                {activeProducts.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <TableSkeleton />
          ) : filteredCredentials.length === 0 ? (
            <EmptyState 
              title="Locker Empty" 
              description="No loaded digital credentials exist in database matching parameters."
            />
          ) : (
            <div className="max-h-96 overflow-y-auto space-y-2 pr-1.5 text-xs text-gray-700">
              {filteredCredentials.map(c => (
                <div key={c.id} className="flex justify-between items-center p-3 hover:bg-gray-50 rounded-xl border border-gray-100/30 transition-colors">
                  <div className="space-y-1">
                    <p className="font-mono font-bold text-gray-900 truncate max-w-sm">{c.value}</p>
                    <p className="text-[10px] text-gray-400 font-semibold truncate leading-tight">
                      For: {getProductLabel(c)}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase shrink-0 ${
                    c.is_used 
                      ? 'bg-gray-100 text-gray-500 border border-gray-200' 
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                  }`}>
                    {c.is_used ? 'Dispatched' : 'Active'}
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
