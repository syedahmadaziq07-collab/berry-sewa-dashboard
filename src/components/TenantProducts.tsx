import React, { useState } from 'react';
import { Product, ProductVariant } from '../types';
import { Plus, Edit2, Trash2, Layers, Check, X, ShieldAlert } from 'lucide-react';
import { TableSkeleton } from './Skeleton';
import { EmptyState } from './EmptyState';

interface TenantProductsProps {
  products: Product[];
  variants: ProductVariant[];
  loading: boolean;
  onCreateProduct: (product: Omit<Product, 'id' | 'tenant_id' | 'stock'>) => Promise<void>;
  onUpdateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
  onCreateVariant: (variant: Omit<ProductVariant, 'id' | 'tenant_id'>) => Promise<void>;
  onUpdateVariant: (id: string, updates: Partial<ProductVariant>) => Promise<void>;
}

export function TenantProducts({ 
  products, variants, loading, 
  onCreateProduct, onUpdateProduct, onDeleteProduct,
  onCreateVariant, onUpdateVariant
}: TenantProductsProps) {
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [variantFormOpen, setVariantFormOpen] = useState(false);
  const [selectedProductForVariant, setSelectedProductForVariant] = useState<Product | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [price, setPrice] = useState('5.00');
  const [duration, setDuration] = useState('1 month');
  const [description, setDescription] = useState('');
  const [autoDelivery, setAutoDelivery] = useState(true);
  const [active, setActive] = useState(true);

  // Variant form states
  const [varName, setVarName] = useState('');
  const [varPrice, setVarPrice] = useState('5.00');
  const [varStock, setVarStock] = useState('10');

  const openNewProductForm = () => {
    setEditingProduct(null);
    setName('');
    setPrice('5.00');
    setDuration('1 month');
    setDescription('');
    setAutoDelivery(true);
    setActive(true);
    setProductFormOpen(true);
  };

  const openEditProductForm = (p: Product) => {
    setEditingProduct(p);
    setName(p.name);
    setPrice(String(p.price));
    setDuration(p.duration);
    setDescription(p.description);
    setAutoDelivery(p.auto_delivery);
    setActive(p.active);
    setProductFormOpen(true);
  };

  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const parsedPrice = parseFloat(price) || 0;
    if (editingProduct) {
      await onUpdateProduct(editingProduct.id, {
        name,
        price: parsedPrice,
        duration,
        description,
        auto_delivery: autoDelivery,
        active
      });
    } else {
      await onCreateProduct({
        name,
        price: parsedPrice,
        duration,
        description,
        auto_delivery: autoDelivery,
        active
      });
    }
    setProductFormOpen(false);
  };

  const handleVariantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductForVariant || !varName.trim()) return;

    await onCreateVariant({
      product_id: selectedProductForVariant.id,
      name: varName,
      price: parseFloat(varPrice) || 0,
      stock: parseInt(varStock) || 0,
      active: true
    });

    setVariantFormOpen(false);
    setVarName('');
  };

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Products Catalog</h2>
          <p className="text-sm text-gray-500 mt-1">Configure bot store products, variants and automatic credential delivery options.</p>
        </div>
        <button
          onClick={openNewProductForm}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-4 py-2.5 rounded-full transition-all shadow-xs hover:shadow-md cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Product</span>
        </button>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : products.length === 0 ? (
        <EmptyState 
          title="Catalog is empty" 
          description="Create your first digital item. Your customers will see changes in their Telegram bot instantly!"
          actionLabel="Create Product"
          onAction={openNewProductForm}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {products.map((p) => {
            const productVars = variants.filter(v => v.product_id === p.id);
            return (
              <div key={p.id} className="bg-white border border-gray-100 rounded-[24px] p-6 shadow-sm relative overflow-hidden flex flex-col md:flex-row justify-between gap-6 hover:shadow-md transition-all">
                
                {/* Active/Inactive highlight bar */}
                <div className={`absolute top-0 bottom-0 left-0 w-1.5 ${p.active ? 'bg-indigo-600' : 'bg-gray-300'}`}></div>

                <div className="space-y-4 flex-1 pl-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-bold text-[#1D1D1F]">{p.name}</h3>
                    {p.auto_delivery ? (
                      <span className="text-[10px] bg-indigo-50 border border-indigo-100 text-indigo-700 px-2.5 py-0.5 rounded-full font-bold">Auto Delivery</span>
                    ) : (
                      <span className="text-[10px] bg-amber-50 border border-amber-100 text-amber-700 px-2.5 py-0.5 rounded-full font-bold">Manual Delivery</span>
                    )}
                    {p.active ? (
                      <span className="text-[10px] bg-emerald-50 border border-emerald-100 text-emerald-700 px-2.5 py-0.5 rounded-full font-bold">Active</span>
                    ) : (
                      <span className="text-[10px] bg-gray-55 bg-gray-100 border border-gray-200 text-gray-500 px-2.5 py-0.5 rounded-full font-bold">Deactivated</span>
                    )}
                  </div>

                  <p className="text-sm text-gray-500 leading-relaxed max-w-2xl">{p.description || 'No descriptive catalog text added.'}</p>

                  <div className="flex items-center space-x-6 text-xs text-gray-500 font-semibold">
                    <div>
                      Base Price: <span className="text-gray-900 font-bold font-mono">${p.price.toFixed(2)}</span>
                    </div>
                    <div>
                      Duration: <span className="text-gray-900 font-bold">{p.duration}</span>
                    </div>
                    <div>
                      Total Available Stock: <span className={`font-bold font-mono ${p.stock === 0 ? 'text-red-500' : 'text-gray-900'}`}>{p.stock} units</span>
                    </div>
                  </div>

                  {/* Product Variants section */}
                  {productVars.length > 0 && (
                    <div className="pt-4 border-t border-gray-50">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Available Options/Variants</p>
                      <div className="flex flex-wrap gap-2">
                        {productVars.map(v => (
                          <div key={v.id} className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs flex items-center space-x-2.5">
                            <span className="font-semibold text-gray-800">{v.name}</span>
                            <span className="text-gray-400 font-medium">|</span>
                            <span className="font-mono font-bold text-gray-900">${v.price.toFixed(2)}</span>
                            <span className="text-gray-400 font-medium">|</span>
                            <span className={`font-mono font-bold ${v.stock === 0 ? 'text-rose-600' : 'text-gray-600'}`}>{v.stock} in stock</span>
                            <button
                              onClick={() => onUpdateVariant(v.id, { active: !v.active })}
                              className={`p-0.5 rounded-md ${v.active ? 'text-emerald-600 bg-emerald-50' : 'text-gray-400 hover:text-gray-600'}`}
                              title={v.active ? 'Deactivate Variant' : 'Activate Variant'}
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Catalog Controls */}
                <div className="flex flex-row md:flex-col justify-end gap-2.5 shrink-0 pt-4 md:pt-0 border-t border-gray-50 md:border-none">
                  <button
                    onClick={() => {
                      setSelectedProductForVariant(p);
                      setVarName('');
                      setVarPrice(String(p.price));
                      setVarStock('10');
                      setVariantFormOpen(true);
                    }}
                    className="flex items-center justify-center space-x-1 border border-gray-200/90 hover:bg-gray-50 text-gray-600 px-3.5 py-2 rounded-full font-semibold text-xs cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Variant</span>
                  </button>
                  <button
                    onClick={() => openEditProductForm(p)}
                    className="flex items-center justify-center space-x-1 border border-gray-200/90 hover:bg-gray-50 text-gray-600 px-3.5 py-2 rounded-full font-semibold text-xs cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => onDeleteProduct(p.id)}
                    className="flex items-center justify-center space-x-1 border border-red-200 hover:bg-red-50 text-red-600 px-3.5 py-2 rounded-full font-semibold text-xs cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Slide-in Product Modal Form */}
      {productFormOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-gray-100 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
              <h3 className="font-bold text-gray-900 text-lg">
                {editingProduct ? 'Modify Listing Product' : 'Create Store Product'}
              </h3>
              <button
                onClick={() => setProductFormOpen(false)}
                className="p-1 px-2 border border-gray-200 rounded-xl bg-white hover:bg-gray-100 text-gray-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleProductSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Product Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Premium VPN Account"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Base Price (RM)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">License Duration</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 1 month, permanent"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Service Description</label>
                <textarea
                  rows={3}
                  placeholder="Provide parameters and specs describing the service option..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 resize-none"
                />
              </div>

              {/* Toggle switch for Auto Delivery / Credentials */}
              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-gray-900 uppercase">Auto-Delivered Product</h4>
                  <p className="text-[11px] text-gray-400 mt-0.5">Loads credentials on checkout</p>
                </div>
                <input
                  type="checkbox"
                  checked={autoDelivery}
                  onChange={(e) => setAutoDelivery(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </div>

              {/* Status active/inactive checkbox */}
              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-gray-900 uppercase">Available for Rent/Purchase</h4>
                  <p className="text-[11px] text-gray-400 mt-0.5">Toggle visibility in customer shop front</p>
                </div>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </div>

              {/* Action buttons */}
              <div className="pt-4 flex items-center justify-end space-x-3 border-t border-gray-50">
                <button
                  type="button"
                  onClick={() => setProductFormOpen(false)}
                  className="px-4 py-2 border border-gray-200 hover:bg-gray-50 text-gray-600 font-semibold text-xs rounded-full cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-full cursor-pointer transition-all shadow-xs"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Product Variant Dialog */}
      {variantFormOpen && selectedProductForVariant && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl border border-gray-100 p-6 space-y-4">
            <div>
              <h3 className="font-bold text-gray-950 text-base">New Variant: {selectedProductForVariant.name}</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">Attach custom price properties and limits.</p>
            </div>

            <form onSubmit={handleVariantSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">Variant Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. US Region, Shared Profile"
                  value={varName}
                  onChange={(e) => setVarName(e.target.value)}
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 block mb-1">Price (RM)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={varPrice}
                    onChange={(e) => setVarPrice(e.target.value)}
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 block mb-1">Stock Limit</label>
                  <input
                    type="number"
                    required
                    value={varStock}
                    onChange={(e) => setVarStock(e.target.value)}
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-xs font-mono"
                    disabled={selectedProductForVariant.auto_delivery}
                  />
                </div>
              </div>

              {selectedProductForVariant.auto_delivery && (
                <div className="flex gap-2 p-2.5 bg-blue-50/50 rounded-xl border border-blue-100/50">
                  <ShieldAlert className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-blue-800 leading-normal font-medium">
                    This is an auto-delivery product. Variant stock counts automatically sync onto loaded credentials.
                  </p>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setVariantFormOpen(false)}
                  className="px-3 py-1.5 border border-gray-200 text-gray-500 text-xs font-semibold rounded-full cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-full cursor-pointer"
                >
                  Add Variant
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
