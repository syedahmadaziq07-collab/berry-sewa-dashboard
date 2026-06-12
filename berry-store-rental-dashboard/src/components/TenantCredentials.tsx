import React, { useState } from 'react';
import { Credential, Product, ProductVariant } from '../types';
import { KeyRound, PlusCircle, CheckCircle, ShieldAlert, Sparkles, Filter, AlertTriangle, PenLine } from 'lucide-react';
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
  const [variantFilter, setVariantFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const activeProducts = products.filter(p => p.auto_delivery);
  const selectedProduct = activeProducts.find(p => p.id === selectedProductId);
  const matchingVariants = selectedProduct ? variants.filter(v => v.product_id === selectedProduct.id) : [];

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !rawText.trim()) return;
    if (matchingVariants.length > 0 && !selectedVariantId) return;

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

  // Helpers
  const isUnassignedLegacy = (c: Credential) => {
    if (!c.variant_id) {
      const product = products.find(p => p.id === c.product_id);
      if (product) {
        const productVariants = variants.filter(v => v.product_id === product.id);
        return productVariants.length > 0;
      }
    }
    return false;
  };

  const getVariantLabel = (v: ProductVariant) =>
    `${v.name} — RM${v.price.toFixed(2)} — ${v.stock} in stock`;

  // Filtered credentials
  const filteredCredentials = credentials.filter(c => {
    if (productFilter !== 'all' && c.product_id !== productFilter) return false;
    if (variantFilter === 'unassigned') {
      if (c.variant_id) return false;
      const product = products.find(p => p.id === c.product_id);
      if (!product) return false;
      const productVariants = variants.filter(v => v.product_id === product.id);
      if (productVariants.length === 0) return false;
    } else if (variantFilter !== 'all' && c.variant_id !== variantFilter) return false;
    if (statusFilter === 'unused' && c.is_used) return false;
    if (statusFilter === 'delivered' && !c.is_used) return false;
    if (statusFilter === 'legacy' && !isUnassignedLegacy(c)) return false;
    return true;
  });

  // Metrics (respect product+variant selection on upload form)
  const selectedProdForMetrics = selectedProductId || productFilter !== 'all' ? (selectedProductId || productFilter) : null;
  const selectedVarForMetrics = selectedVariantId || (variantFilter !== 'all' && variantFilter !== 'unassigned' ? variantFilter : null);

  const metricsCredentials = selectedProdForMetrics
    ? credentials.filter(c => {
        if (c.product_id !== selectedProdForMetrics) return false;
        if (selectedVarForMetrics && c.variant_id !== selectedVarForMetrics) return false;
        return true;
      })
    : credentials;

  const activeUnused = metricsCredentials.filter(c => !c.is_used);
  const totalAllocated = metricsCredentials.filter(c => c.is_used);

  const getProductLabel = (c: Credential) => {
    const p = products.find(prod => prod.id === c.product_id);
    const v = c.variant_id ? variants.find(varObj => varObj.id === c.variant_id) : null;
    return `${p ? p.name : 'Unknown Product'}${v ? ` — ${v.name}` : ''}`;
  };

  const handleAssignVariant = async (credentialId: string, newVariantId: string) => {
    try {
      const res = await fetch(`/api/tenant/credentials/${credentialId}/assign-variant`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ variant_id: newVariantId })
      });
      if (res.ok) {
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
    }
  };

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
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">
                  Select Variant <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={selectedVariantId}
                  onChange={(e) => setSelectedVariantId(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 rounded-xl border border-gray-200"
                >
                  <option value="">-- Choose Variant (Required) --</option>
                  {matchingVariants.map(v => (
                    <option key={v.id} value={v.id}>{getVariantLabel(v)}</option>
                  ))}
                </select>
              </div>
            )}

            {selectedProductId && matchingVariants.length === 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-center">
                <p className="text-[10px] text-gray-500 font-medium">No variants for this product</p>
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
              disabled={uploadLoading || (selectedProductId && matchingVariants.length > 0 && !selectedVariantId)}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold text-xs rounded-xl transition-all cursor-pointer disabled:cursor-not-allowed flex items-center justify-center space-x-1.5"
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

            {/* Filters row */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Filter by product */}
              <div className="flex items-center space-x-1.5 self-stretch sm:self-auto bg-gray-50 border border-gray-100 rounded-xl px-2 py-1 shrink-0">
                <Filter className="w-3.5 h-3.5 text-gray-400" />
                <select
                  value={productFilter}
                  onChange={(e) => { setProductFilter(e.target.value); setVariantFilter('all'); }}
                  className="bg-transparent border-none text-[11px] font-bold text-gray-500 capitalize focus:outline-none"
                >
                  <option value="all">All Products</option>
                  {activeProducts.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Filter by variant (only when a product is selected) */}
              {productFilter !== 'all' && (
                <div className="flex items-center space-x-1.5 self-stretch sm:self-auto bg-gray-50 border border-gray-100 rounded-xl px-2 py-1 shrink-0">
                  <select
                    value={variantFilter}
                    onChange={(e) => setVariantFilter(e.target.value)}
                    className="bg-transparent border-none text-[11px] font-bold text-gray-500 capitalize focus:outline-none"
                  >
                    <option value="all">All Variants</option>
                    {variants.filter(v => v.product_id === productFilter).map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                    {variants.filter(v => v.product_id === productFilter).length > 0 && (
                      <option value="unassigned">Unassigned / Legacy</option>
                    )}
                  </select>
                </div>
              )}

              {/* Status filter */}
              <div className="flex items-center space-x-1.5 self-stretch sm:self-auto bg-gray-50 border border-gray-100 rounded-xl px-2 py-1 shrink-0">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-transparent border-none text-[11px] font-bold text-gray-500 capitalize focus:outline-none"
                >
                  <option value="all">All Vault Items</option>
                  <option value="unused">Unused</option>
                  <option value="delivered">Delivered</option>
                  <option value="legacy">Unassigned / Legacy</option>
                </select>
              </div>
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
              {filteredCredentials.map(c => {
                const p = products.find(prod => prod.id === c.product_id);
                const v = c.variant_id ? variants.find(varObj => varObj.id === c.variant_id) : null;
                const productVariants = p ? variants.filter(vv => vv.product_id === p.id) : [];
                const isLegacy = !c.variant_id && productVariants.length > 0;

                return (
                  <div key={c.id} className="flex justify-between items-center p-3 hover:bg-gray-50 rounded-xl border border-gray-100/30 transition-colors">
                    <div className="space-y-1 min-w-0 flex-1">
                      <p className="font-mono font-bold text-gray-900 truncate max-w-sm">{c.value}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-[10px] text-gray-400 font-semibold truncate leading-tight">
                          Product: <span className="text-gray-600">{p ? p.name : 'Unknown'}</span>
                        </p>
                        {v && (
                          <>
                            <span className="text-gray-300">|</span>
                            <p className="text-[10px] text-gray-400 font-semibold truncate leading-tight">
                              Variant: <span className="text-gray-600">{v.name}</span>
                            </p>
                          </>
                        )}
                        {isLegacy && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-full text-[9px] font-black uppercase">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            Unassigned / Legacy
                          </span>
                        )}
                      </div>
                      <p className="text-[9px] text-gray-300 font-mono">
                        {new Date(c.created_at).toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                        c.is_used 
                          ? 'bg-gray-100 text-gray-500 border border-gray-200' 
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                      }`}>
                        {c.is_used ? 'Delivered' : 'Unused'}
                      </span>

                      {isLegacy && productVariants.length > 0 && (
                        <div className="relative group">
                          <select
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) {
                                handleAssignVariant(c.id, e.target.value);
                              }
                            }}
                            className="text-[9px] bg-amber-50 border border-amber-200 rounded-lg px-1.5 py-1 font-bold text-amber-700 cursor-pointer focus:outline-none"
                          >
                            <option value="">Assign to</option>
                            {productVariants.map(pv => (
                              <option key={pv.id} value={pv.id}>{pv.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}