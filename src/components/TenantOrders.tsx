import React, { useState } from 'react';
import { Order, Product, ProductVariant } from '../types';
import { Search, Filter, ShieldCheck, Eye, EyeOff, AlertTriangle, CheckCircle, Ban, X } from 'lucide-react';
import { TableSkeleton } from './Skeleton';
import { EmptyState } from './EmptyState';

interface TenantOrdersProps {
  orders: Order[];
  products: Product[];
  variants: ProductVariant[];
  loading: boolean;
  onUpdateOrderStatus: (id: string, status: Order['status'], notes?: string) => Promise<void>;
  filterStatus: string;
  setFilterStatus: (val: string) => void;
  searchTerm: string;
  setSearchTerm: (val: string) => void;
}

export function TenantOrders({
  orders, products, variants, loading, onUpdateOrderStatus,
  filterStatus, setFilterStatus, searchTerm, setSearchTerm
}: TenantOrdersProps) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [adminNote, setAdminNote] = useState('');

  const getProductDetails = (order: Order) => {
    const p = products.find(prod => prod.id === order.product_id);
    const v = order.variant_id ? variants.find(vari => vari.id === order.variant_id) : null;
    return {
      productName: p ? p.name : 'Unknown Product',
      variantName: v ? v.name : null
    };
  };

  const getStatusBadge = (status: Order['status']) => {
    switch (status) {
      case 'completed':
        return <span className="bg-emerald-50 border border-emerald-100 text-emerald-700 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase">Completed</span>;
      case 'waiting_approval':
        return <span className="bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase animate-pulse">Needs Review</span>;
      case 'pending':
        return <span className="bg-blue-50 border border-blue-100 text-blue-700 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase">Awaiting Pay</span>;
      case 'rejected':
        return <span className="bg-rose-50 border border-rose-100 text-rose-700 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase">Rejected</span>;
      default:
        return <span className="bg-gray-50 border border-gray-100 text-gray-500 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase">{status}</span>;
    }
  };

  const openOrderAudit = (order: Order) => {
    setSelectedOrder(order);
    setAdminNote('');
  };

  const handleAction = async (status: 'completed' | 'rejected') => {
    if (!selectedOrder) return;
    await onUpdateOrderStatus(selectedOrder.id, status, adminNote);
    setSelectedOrder(null);
  };

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Orders Audit System</h2>
        <p className="text-sm text-gray-500 mt-1">Audit customer proof-of-payments, authorize delivery codes, and manage store checkout flows.</p>
      </div>

      {/* Filter Header and search */}
      <div className="bg-white border border-gray-100 rounded-[24px] p-5 shadow-sm flex flex-col sm:flex-row gap-4 justify-between items-center">
        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by order ID, username..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500"
          />
        </div>

        {/* Filter tags tab */}
        <div className="flex flex-wrap gap-1.5 w-full sm:w-auto items-center">
          {['all', 'pending', 'waiting_approval', 'completed', 'cancelled', 'rejected'].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterStatus(cat)}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-full uppercase tracking-wider transition-all cursor-pointer ${
                filterStatus === cat 
                  ? 'bg-indigo-600 text-white shadow-xs' 
                  : 'bg-gray-50 hover:bg-gray-100 text-gray-500'
              }`}
            >
              {cat === 'waiting_approval' ? 'Needs Review' : cat.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : orders.length === 0 ? (
        <EmptyState 
          title="No Matching Orders Found" 
          description="We couldn't locate any transaction records matching your selected parameters."
        />
      ) : (
        <div className="bg-white border border-gray-100 rounded-[24px] shadow-sm overflow-hidden">
          
          {/* Table list view for desktop, fallback cards for mobile */}
          <div className="hidden md:block">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 font-bold text-xs uppercase tracking-wider border-b border-gray-100">
                  <th className="p-4 pl-6">Order Info</th>
                  <th className="p-4">Customer</th>
                  <th className="p-4">Product Option</th>
                  <th className="p-4">Amount Paid</th>
                  <th className="p-4">Date Stamp</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {orders.map((o) => {
                  const details = getProductDetails(o);
                  return (
                    <tr key={o.id} className="hover:bg-gray-50/50 transition-colors text-xs text-gray-700">
                      <td className="p-4 pl-6 font-semibold text-gray-900 font-mono">#{o.id}</td>
                      <td className="p-4 font-medium text-gray-900">{o.payer_username || '@nonymous'}</td>
                      <td className="p-4">
                        <div className="font-semibold text-gray-900">{details.productName}</div>
                        {details.variantName && (
                          <div className="text-[10px] text-gray-400 mt-0.5">Option: {details.variantName}</div>
                        )}
                      </td>
                      <td className="p-4 font-bold text-gray-900 font-mono">${o.amount.toFixed(2)}</td>
                      <td className="p-4 text-gray-400 font-medium">
                        {new Date(o.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="p-4">{getStatusBadge(o.status)}</td>
                      <td className="p-4 pr-6 text-right">
                        <button
                          onClick={() => openOrderAudit(o)}
                          className="px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-lg font-bold transition-all inline-flex items-center space-x-1 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Audit</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Responsive Mobile Layout (Cards List) */}
          <div className="grid grid-cols-1 gap-4 p-4 md:hidden">
            {orders.map((o) => {
              const details = getProductDetails(o);
              return (
                <div key={o.id} className="bg-gray-50/50 border border-gray-100 rounded-2xl p-4 gap-3 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-900 font-mono text-sm">#{o.id}</span>
                    <span>{getStatusBadge(o.status)}</span>
                  </div>
                  <div className="text-xs space-y-1 my-1">
                    <p className="font-semibold text-gray-700"><span className="text-gray-400">User:</span> {o.payer_username || '@nonymous'}</p>
                    <p className="font-semibold text-gray-700"><span className="text-gray-400">Paid:</span> <span className="font-mono text-gray-900 font-bold">${o.amount.toFixed(2)}</span></p>
                    <p className="font-semibold text-gray-700">
                      <span className="text-gray-400">Item:</span> {details.productName}
                      {details.variantName && <span className="text-blue-600"> [{details.variantName}]</span>}
                    </p>
                    <p className="text-[10px] text-gray-400 font-mono font-medium">
                      {new Date(o.created_at).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => openOrderAudit(o)}
                    className="w-full text-center py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
                  >
                    Authorize/Audit order
                  </button>
                </div>
              );
            })}
          </div>

        </div>
      )}

      {/* Review details / Receipt verification overlay */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-gray-100 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-5 border-b border-gray-50 flex items-center justify-between bg-gray-50/30">
              <div>
                <h3 className="font-bold text-gray-900 text-base">Transaction Verification #{selectedOrder.id}</h3>
                <p className="text-[11px] text-gray-400 mt-0.5">Authorizing client: {selectedOrder.payer_username || '@nonymous'}</p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1 px-2 border border-gray-200 rounded-xl bg-white text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Scrollable content body */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {/* Product and cost summary banner */}
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 text-xs flex justify-between items-center">
                <div>
                  <p className="text-gray-400 font-semibold uppercase tracking-wider">Requested Item</p>
                  <p className="text-gray-900 font-bold text-sm mt-0.5">
                    {getProductDetails(selectedOrder).productName}
                  </p>
                  {getProductDetails(selectedOrder).variantName && (
                    <p className="text-[10px] text-blue-600 mt-0.5 font-bold">Class option: {getProductDetails(selectedOrder).variantName}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-gray-400 font-semibold uppercase tracking-wider">Debit Cost</p>
                  <p className="text-gray-900 font-black text-base font-mono">${selectedOrder.amount.toFixed(2)}</p>
                </div>
              </div>

              {/* Receipt screenshot loader check */}
              {selectedOrder.receipt_url ? (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block">Client Proof Screenshot</label>
                  <div className="w-full max-h-64 rounded-2xl overflow-hidden border border-gray-100 flex items-center justify-center bg-gray-950">
                    <img 
                      src={selectedOrder.receipt_url} 
                      alt="Order receipt"
                      className="max-w-full max-h-64 object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 text-center font-medium leading-normal">
                    💡 Click image to inspect full-sized receipt in a separate tab.
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 flex gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 leading-normal font-medium">
                    No payment receipt file uploaded. This usually means the user is paying via live crypto ledger triggers or manual admin dispatch.
                  </p>
                </div>
              )}

              {/* Order comments logging */}
              {selectedOrder.notes && (
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-1">Audit Thread Logs</label>
                  <div className="p-3 bg-indigo-50/40 rounded-xl border border-indigo-100/50 text-[11px] text-slate-700 leading-relaxed font-semibold">
                    {selectedOrder.notes}
                  </div>
                </div>
              )}

              {/* Admin note block */}
              {selectedOrder.status === 'waiting_approval' && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block">Audit Feed Notes / Voucher Codes</label>
                  <input
                    type="text"
                    placeholder="Provide cancellation reasons or tracking notes here..."
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                  />
                </div>
              )}
            </div>

            {/* Action footer */}
            {selectedOrder.status === 'waiting_approval' ? (
              <div className="p-5 border-t border-gray-100 bg-gray-50/50 flex gap-3">
                <button
                  type="button"
                  onClick={() => handleAction('rejected')}
                  className="flex-1 py-3 border border-red-200 hover:bg-red-50 text-red-600 font-bold text-xs rounded-full transition-all inline-flex items-center justify-center space-x-1 cursor-pointer"
                >
                  <Ban className="w-4 h-4" />
                  <span>Reject Order</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAction('completed')}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-full transition-all inline-flex items-center justify-center space-x-1 cursor-pointer shadow-md shadow-emerald-500/10"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Authorize & Deliver</span>
                </button>
              </div>
            ) : (
              <div className="p-5 border-t border-gray-100 bg-gray-50/30 flex justify-end">
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="px-5 py-2 hover:bg-gray-100 border border-gray-200 text-gray-600 text-xs font-semibold rounded-full cursor-pointer"
                >
                  Done
                </button>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
