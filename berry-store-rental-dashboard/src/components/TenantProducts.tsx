import React, { useState } from 'react';
import { Product, ProductVariant } from '../types';
import { Plus, Edit2, Trash2, Layers, X, ShieldAlert, Power, PowerOff, Package, Save } from 'lucide-react';
import { TableSkeleton } from './Skeleton';
import { EmptyState } from './EmptyState';

interface TenantProductsProps {
  products: Product[];
  variants: ProductVariant[];
  loading: boolean;
  onCreateProduct: (product: Omit<Product, 'id' | 'tenant_id'>) => Promise<void>;
  onUpdateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
  onCreateVariant: (variant: Omit<ProductVariant, 'id' | 'tenant_id'>) => Promise<void>;
  onUpdateVariant: (id: string, updates: Partial<ProductVariant>) => Promise<void>;
  onDeleteVariant: (id: string) => Promise<void>;
  onStockUpdate: (id: string, quantity: number, mode: 'add' | 'set') => Promise<void>;
  onActivateProduct: (id: string) => Promise<void>;
  onDeactivateProduct: (id: string) => Promise<void>;
}

export function TenantProducts({ 
  products, variants, loading, 
  onCreateProduct, onUpdateProduct, onDeleteProduct,
  onCreateVariant, onUpdateVariant, onDeleteVariant,
  onStockUpdate, onActivateProduct, onDeactivateProduct
}: TenantProductsProps) {
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [variantFormOpen, setVariantFormOpen] = useState(false);
  const [selectedProductForVariant, setSelectedProductForVariant] = useState<Product | null>(null);
  const [editingVariant, setEditingVariant] = useState<ProductVariant | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [price, setPrice] = useState('5.00');
  const [duration, setDuration] = useState('1 month');
  const [description, setDescription] = useState('');
  const [autoDelivery, setAutoDelivery] = useState(true);
  const [stock, setStock] = useState('10');
  const [deliveryNote, setDeliveryNote] = useState('');

  // Variant form states
  const [varName, setVarName] = useState('');
  const [varPrice, setVarPrice] = useState('5.00');
  const [varStock, setVarStock] = useState('10');
  const [varDescription, setVarDescription] = useState('');
  const [varDeliveryNote, setVarDeliveryNote] = useState('');

  // Stock modals
  const [stockModal, setStockModal] = useState<{ product: Product; mode: 'add' | 'set' } | null>(null);
  const [stockQty, setStockQty] = useState('');

  // Inactive products toggle
  const [showInactive, setShowInactive] = useState(false);

  const nonDeleted = products.filter(p => p.status !== 'deleted');
  const activeProducts = nonDeleted.filter(p => p.active === true && (p.status === 'active' || !p.status));
  const inactiveProducts = nonDeleted.filter(p => p.active === false && p.status === 'inactive');
  const inactiveCount = inactiveProducts.length;
  const visibleProducts = showInactive ? inactiveProducts : activeProducts;

  // Manage Stock modal
  const [manageStockProduct, setManageStockProduct] = useState<Product | null>(null);
  const [manageStockAddQty, setManageStockAddQty] = useState('');
  const [manageStockSetQty, setManageStockSetQty] = useState('');
  const [manageStockLoading, setManageStockLoading] = useState(false);

  const openNewProductForm = () => {
    setEditingProduct(null);
    setName('');
    setPrice('5.00');
    setDuration('1 month');
    setDescription('');
    setDeliveryNote('');
    setAutoDelivery(true);
    setStock('10');
    setProductFormOpen(true);
  };

  const openEditProductForm = (p: Product) => {
    setEditingProduct(p);
    setName(p.name);
    setPrice(String(p.price));
    setDuration(p.duration);
    setDescription(p.description);
    setDeliveryNote(p.delivery_note || '');
    setAutoDelivery(p.auto_delivery);
    setStock(String(p.stock));
    setProductFormOpen(true);
  };

  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const parsedPrice = parseFloat(price) || 0;
    const parsedStock = parseInt(stock) || 0;
    if (editingProduct) {
      await onUpdateProduct(editingProduct.id, {
        name,
        price: parsedPrice,
        duration,
        description,
        delivery_note: deliveryNote,
        auto_delivery: autoDelivery,
        stock: parsedStock,
        active: true,
      });
    } else {
      await onCreateProduct({
        name,
        price: parsedPrice,
        duration,
        description,
        delivery_note: deliveryNote,
        auto_delivery: autoDelivery,
        stock: parsedStock,
        active: true,
      });
    }
    setProductFormOpen(false);
  };

  const handleVariantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductForVariant || !varName.trim()) return;

    if (editingVariant) {
      await onUpdateVariant(editingVariant.id, {
        name: varName,
        price: parseFloat(varPrice) || 0,
        stock: parseInt(varStock) || 0,
        description: varDescription,
        delivery_note: varDeliveryNote,
      });
    } else {
      await onCreateVariant({
        product_id: selectedProductForVariant.id,
        name: varName,
        price: parseFloat(varPrice) || 0,
        stock: parseInt(varStock) || 0,
        description: varDescription,
        delivery_note: varDeliveryNote,
        active: true,
      });
    }

    setVariantFormOpen(false);
    setEditingVariant(null);
    setVarName('');
    setVarDescription('');
    setVarDeliveryNote('');
  };

  const handleStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockModal || !stockQty.trim()) return;
    const qty = parseInt(stockQty);
    if (isNaN(qty) || qty < 0) return;
    await onStockUpdate(stockModal.product.id, qty, stockModal.mode);
    setStockModal(null);
    setStockQty('');
  };

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Products Catalog</h2>
          <p className="text-sm text-gray-500 mt-1">Configure bot store products, variants and automatic credential delivery options.</p>
        </div>
        <div className="flex items-center gap-3">
          {inactiveCount > 0 && (
            <button
              onClick={() => setShowInactive(!showInactive)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold cursor-pointer transition-all ${
                showInactive 
                  ? 'bg-gray-800 text-white border border-gray-700' 
                  : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
              }`}
            >
              {showInactive ? 'Hide Inactive' : `Show Inactive (${inactiveCount})`}
            </button>
          )}
          <button
            onClick={openNewProductForm}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-4 py-2.5 rounded-full transition-all shadow-xs hover:shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Product</span>
          </button>
        </div>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : products.length === 0 ? (
        <EmptyState 
          title="Catalog is empty" 
          description="Create a product first to manage stock. Your customers will see changes in their Telegram bot instantly!"
          actionLabel="Create Product"
          onAction={openNewProductForm}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {visibleProducts.map((p) => {
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
                      <span className="text-[10px] bg-rose-50 border border-rose-200 text-rose-600 px-2.5 py-0.5 rounded-full font-bold">Inactive / Hidden from Shop</span>
                    )}
                  </div>

                  <p className="text-sm text-gray-500 leading-relaxed max-w-2xl">{p.description || 'No descriptive catalog text added.'}</p>

                  <div className="flex items-center space-x-6 text-xs text-gray-500 font-semibold">
                    <div>
                      Base Price: <span className="text-gray-900 font-bold font-mono">RM{p.price.toFixed(2)}</span>
                    </div>
                    <div>
                      Duration: <span className="text-gray-900 font-bold">{p.duration}</span>
                    </div>
                    <div>
                      Stock: <span className={`font-bold font-mono ${p.stock === 0 ? 'text-red-500' : 'text-gray-900'}`}>{p.stock}</span>
                    </div>
                  </div>

                  {/* Stock action buttons */}
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <button
                      onClick={() => { setStockModal({ product: p, mode: 'add' }); setStockQty(''); }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-lg font-bold text-xs cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Stock
                    </button>
                    <button
                      onClick={() => { setStockModal({ product: p, mode: 'set' }); setStockQty(String(p.stock)); }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-lg font-bold text-xs cursor-pointer"
                    >
                      <Package className="w-3.5 h-3.5" /> Set Stock
                    </button>
                    {p.active ? (
                      <button
                        onClick={() => onDeactivateProduct(p.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 rounded-lg font-bold text-xs cursor-pointer"
                      >
                        <PowerOff className="w-3.5 h-3.5" /> Deactivate
                      </button>
                    ) : (
                      <button
                        onClick={() => onActivateProduct(p.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-lg font-bold text-xs cursor-pointer"
                      >
                        <Power className="w-3.5 h-3.5" /> Activate
                      </button>
                    )}
                  </div>

                  {/* Product Variants section */}
                  {productVars.length > 0 && (
                    <div className="pt-4 border-t border-gray-50">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Available Options/Variants</p>
                      <div className="flex flex-wrap gap-2">
                        {productVars.map(v => (
                          <div key={v.id} className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs flex items-center space-x-2" title={v.description || ''}>
                            <span className="font-semibold text-gray-800">{v.name}</span>
                            <span className="text-gray-300 font-medium">|</span>
                            <span className="font-mono font-bold text-gray-900">RM{v.price.toFixed(2)}</span>
                            {v.description && (
                              <>
                                <span className="text-gray-300 font-medium">|</span>
                                <span className="text-gray-400 italic truncate max-w-[120px]">{v.description}</span>
                              </>
                            )}
                            <span className="text-gray-300 font-medium">|</span>
                            <span className={`font-mono font-bold ${v.stock === 0 ? 'text-rose-600' : 'text-gray-600'}`}>
                              {v.stock === 0 ? 'Out of stock' : `${v.stock} in stock`}
                            </span>
                            <button
                              onClick={() => {
                                setEditingVariant(v);
                                setSelectedProductForVariant(products.find(p => String(p.id) === String(v.product_id)) || null);
                                setVarName(v.name);
                                setVarPrice(String(v.price));
                                setVarStock(String(v.stock));
                                setVarDescription(v.description || '');
                                setVarDeliveryNote(v.delivery_note || '');
                                setVariantFormOpen(true);
                              }}
                              className="p-1 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-500 cursor-pointer"
                              title="Edit variant"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Delete variant "${v.name}"?`)) onDeleteVariant(v.id);
                              }}
                              className="p-1 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 cursor-pointer"
                              title="Delete variant"
                            >
                              <Trash2 className="w-3 h-3" />
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
                      setManageStockProduct(p);
                      setManageStockAddQty('');
                      setManageStockSetQty(String(p.stock));
                      setManageStockLoading(false);
                    }}
                    className="flex items-center justify-center space-x-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 px-3.5 py-2 rounded-full font-bold text-xs cursor-pointer"
                  >
                    <Package className="w-3.5 h-3.5" />
                    <span>Manage Stock</span>
                  </button>
                  <button
                    onClick={() => {
                      setSelectedProductForVariant(p);
                      setEditingVariant(null);
                      setVarName('');
                      setVarPrice(String(p.price));
                      setVarStock('10');
                      setVarDescription('');
                      setVarDeliveryNote('');
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Stock Limit</label>
                  <input
                    type="number"
                    required
                    min="0"
                    placeholder="Example: 10"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 font-mono"
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

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Delivery Notes / Rules After Purchase</label>
                <textarea
                  rows={3}
                  placeholder="Rules or notes sent after auto-delivery, e.g. login instructions, warranty rules, do not change email/password..."
                  value={deliveryNote}
                  onChange={(e) => setDeliveryNote(e.target.value)}
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
                  {editingProduct ? 'Save Changes' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Modal (Add/Set) */}
      {stockModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl border border-gray-100 p-6 space-y-4">
            <div>
              <h3 className="font-bold text-gray-950 text-base">
                {stockModal.mode === 'add' ? 'Add Stock Quantity' : 'Set Stock Quantity'}
              </h3>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Product: <span className="font-bold text-gray-700">{stockModal.product.name}</span>
                {stockModal.mode === 'add' && (
                  <span className="block mt-1">Current stock: <span className="font-mono font-bold text-gray-900">{stockModal.product.stock}</span></span>
                )}
              </p>
            </div>

            <form onSubmit={handleStockSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">
                  {stockModal.mode === 'add' ? 'Quantity to Add' : 'New Stock Quantity'}
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  placeholder="Example: 10"
                  value={stockQty}
                  onChange={(e) => setStockQty(e.target.value)}
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-mono"
                  autoFocus
                />
                {stockModal.mode === 'add' && stockQty && !isNaN(parseInt(stockQty)) && parseInt(stockQty) > 0 && (
                  <p className="text-[10px] text-gray-400 mt-1">
                    Result: <span className="font-bold text-gray-700">{stockModal.product.stock + parseInt(stockQty)}</span>
                  </p>
                )}
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setStockModal(null)}
                  className="px-3 py-1.5 border border-gray-200 text-gray-500 text-xs font-semibold rounded-full cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-full cursor-pointer"
                >
                  {stockModal.mode === 'add' ? 'Add Stock' : 'Set Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Stock Modal (unified) */}
      {manageStockProduct && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl border border-gray-100 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-950 text-base">Manage Stock</h3>
                <p className="text-[11px] text-gray-400 mt-0.5">{manageStockProduct.name}</p>
              </div>
              <button
                onClick={() => setManageStockProduct(null)}
                className="p-1 px-2 border border-gray-200 rounded-xl bg-white hover:bg-gray-100 text-gray-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Current Stock display */}
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-center">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Current Stock</p>
              <p className={`text-3xl font-bold font-mono mt-1 ${manageStockProduct.stock === 0 ? 'text-red-500' : 'text-gray-900'}`}>
                {manageStockProduct.stock}
              </p>
            </div>

            {/* Add Stock */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-700">Add Stock</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  placeholder="Quantity to add"
                  value={manageStockAddQty}
                  onChange={(e) => setManageStockAddQty(e.target.value)}
                  className="flex-1 px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-mono"
                />
                <button
                  disabled={manageStockLoading}
                  onClick={async () => {
                    const qty = parseInt(manageStockAddQty);
                    if (isNaN(qty) || qty <= 0) return;
                    setManageStockLoading(true);
                    try {
                      await onStockUpdate(manageStockProduct.id, qty, 'add');
                      setManageStockProduct(null);
                    } catch {
                      setManageStockLoading(false);
                    }
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white text-xs font-bold rounded-full cursor-pointer"
                >
                  {manageStockLoading ? '...' : <><Save className="w-3 h-3 inline mr-1" />Add</>}
                </button>
              </div>
              {manageStockAddQty && !isNaN(parseInt(manageStockAddQty)) && parseInt(manageStockAddQty) > 0 && (
                <p className="text-[10px] text-gray-400">
                  Result: <span className="font-bold text-gray-700">{manageStockProduct.stock + parseInt(manageStockAddQty)}</span>
                </p>
              )}
            </div>

            {/* Set Stock */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-700">Set Stock (overwrite)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  placeholder="New stock quantity"
                  value={manageStockSetQty}
                  onChange={(e) => setManageStockSetQty(e.target.value)}
                  className="flex-1 px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-mono"
                />
                <button
                  disabled={manageStockLoading}
                  onClick={async () => {
                    const qty = parseInt(manageStockSetQty);
                    if (isNaN(qty) || qty < 0) return;
                    setManageStockLoading(true);
                    try {
                      await onStockUpdate(manageStockProduct.id, qty, 'set');
                      setManageStockProduct(null);
                    } catch {
                      setManageStockLoading(false);
                    }
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-xs font-bold rounded-full cursor-pointer"
                >
                  {manageStockLoading ? '...' : <><Save className="w-3 h-3 inline mr-1" />Set</>}
                </button>
              </div>
            </div>

            {/* Activate / Deactivate */}
            <div className="pt-2 border-t border-gray-50">
              {manageStockProduct.active || manageStockProduct.active === undefined || manageStockProduct.active === null ? (
                <button
                  disabled={manageStockLoading}
                  onClick={async () => {
                    setManageStockLoading(true);
                    try {
                      await onDeactivateProduct(manageStockProduct.id);
                      setManageStockProduct(null);
                    } catch {
                      setManageStockLoading(false);
                    }
                  }}
                  className="w-full py-2.5 bg-amber-50 hover:bg-amber-100 disabled:bg-gray-50 border border-amber-200 text-amber-700 rounded-xl font-bold text-xs cursor-pointer"
                >
                  <PowerOff className="w-4 h-4 inline mr-1.5" />Deactivate Product
                </button>
              ) : (
                <button
                  disabled={manageStockLoading}
                  onClick={async () => {
                    setManageStockLoading(true);
                    try {
                      await onActivateProduct(manageStockProduct.id);
                      setManageStockProduct(null);
                    } catch {
                      setManageStockLoading(false);
                    }
                  }}
                  className="w-full py-2.5 bg-emerald-50 hover:bg-emerald-100 disabled:bg-gray-50 border border-emerald-200 text-emerald-700 rounded-xl font-bold text-xs cursor-pointer"
                >
                  <Power className="w-4 h-4 inline mr-1.5" />Activate Product
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Product Variant Dialog */}
      {variantFormOpen && selectedProductForVariant && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl border border-gray-100 p-6 space-y-4">
            <div>
              <h3 className="font-bold text-gray-950 text-base">{editingVariant ? 'Edit Variant' : 'New Variant'}: {selectedProductForVariant.name}</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">{editingVariant ? 'Update variant details.' : 'Attach custom price properties and limits.'}</p>
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

              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">Variant Description</label>
                <textarea
                  placeholder="Description shown before purchase, e.g. 7 days access, 1 device..."
                  value={varDescription}
                  onChange={(e) => setVarDescription(e.target.value)}
                  rows={2}
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-xs resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">Delivery Notes / Rules After Purchase</label>
                <textarea
                  placeholder="Rules sent after this variant is delivered..."
                  value={varDeliveryNote}
                  onChange={(e) => setVarDeliveryNote(e.target.value)}
                  rows={2}
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-xs resize-none"
                />
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
                  onClick={() => { setVariantFormOpen(false); setEditingVariant(null); }}
                  className="px-3 py-1.5 border border-gray-200 text-gray-500 text-xs font-semibold rounded-full cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-full cursor-pointer"
                >
                  {editingVariant ? 'Save Changes' : 'Add Variant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}