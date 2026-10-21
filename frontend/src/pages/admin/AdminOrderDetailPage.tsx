import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, FileText, CheckCircle2, AlertTriangle, CreditCard,
  Shirt, RefreshCw, XCircle, Loader2, Sparkles, User, Truck, ShieldAlert
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { Order, OrderStatus } from '../../types';
import { StatusBadge, PaymentBadge } from '../../components/StatusBadge';
import { OrderTimeline } from '../../components/OrderTimeline';
import { InvoiceModal } from '../../components/InvoiceModal';
import { PaymentModal } from '../../components/PaymentModal';
import { InspectionModal } from '../../components/InspectionModal';

export const AdminOrderDetailPage: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();

  const { data: order, isLoading, refetch } = useQuery<Order>({
    queryKey: ['admin-order', orderId],
    queryFn: async () => {
      if (!orderId) throw new Error('Order ID required');
      return (await apiClient.getOrder(orderId)).data;
    },
  });

  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showInspectionModal, setShowInspectionModal] = useState(false);

  // Status transition state
  const [selectedNextStatus, setSelectedNextStatus] = useState<string>('');
  const [statusNotes, setStatusNotes] = useState<string>('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Refund state
  const [showRefundForm, setShowRefundForm] = useState(false);
  const [refundAmountRs, setRefundAmountRs] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [isRefunding, setIsRefunding] = useState(false);

  // Cancel state
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  if (isLoading) {
    return (
      <div className="py-24 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-8 text-center space-y-4">
        <p className="text-sm text-slate-500">Order not found.</p>
        <Link to="/admin/orders" className="text-xs font-bold text-brand-600 underline">
          Back to Orders
        </Link>
      </div>
    );
  }

  // Determine possible next stages in the state machine
  const getNextPossibleStages = (): { status: string; label: string }[] => {
    switch (order.status) {
      case 'order_placed':
        return [
          { status: 'pickup_scheduled', label: 'Logistics: Schedule Pickup' },
          { status: 'clothes_received', label: 'Counter: Clothes Received at Shop' },
          { status: 'cancelled', label: 'Cancel Order' },
        ];
      case 'pickup_scheduled':
        return [
          { status: 'clothes_received', label: 'Mark Clothes Received at Shop' },
          { status: 'cancelled', label: 'Cancel Order' },
        ];
      case 'clothes_received':
        return [
          { status: 'garment_inspection', label: 'Proceed to Garment Inspection & Tagging' },
          { status: 'cancelled', label: 'Cancel Order' },
        ];
      case 'garment_inspection':
        return [
          { status: 'washing_drycleaning', label: 'Start Washing / Dry Cleaning Cycle' },
          { status: 'cancelled', label: 'Cancel Order' },
        ];
      case 'washing_drycleaning':
        return [
          { status: 'ironing_finishing', label: 'Send to Steam Ironing & Pressing' },
          { status: 'quality_check', label: 'Send Directly to Quality Check' },
        ];
      case 'ironing_finishing':
        return [
          { status: 'quality_check', label: 'Send to Quality Inspection' },
        ];
      case 'quality_check':
        return [
          { status: 'ready_for_delivery', label: 'QC Passed -> Ready for Collection / Delivery' },
          { status: 'washing_drycleaning', label: 'QC Failed -> Send for Rewash' },
        ];
      case 'ready_for_delivery':
        if (order.handover_method === 'home_pickup_delivery') {
          return [
            { status: 'out_for_delivery', label: 'Dispatch Driver: Out for Delivery' },
            { status: 'delivered_collected', label: 'Mark Handed Over at Doorstep' },
          ];
        }
        return [
          { status: 'delivered_collected', label: 'Customer Collected at Counter' },
        ];
      case 'out_for_delivery':
        return [
          { status: 'delivered_collected', label: 'Mark Successfully Delivered' },
          { status: 'ready_for_delivery', label: 'Delivery Attempt Failed (Return to Store)' },
        ];
      default:
        return [];
    }
  };

  const nextStages = getNextPossibleStages();

  const handleUpdateStatus = async (statusToSet: string) => {
    setIsUpdatingStatus(true);
    setStatusError(null);
    try {
      await apiClient.updateOrderStatus(order.id, statusToSet, statusNotes || undefined);
      setStatusNotes('');
      setSelectedNextStatus('');
      await refetch();
    } catch (err: any) {
      setStatusError(err.response?.data?.detail || 'Failed to advance order status.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleRefundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRefunding(true);
    try {
      const amountPaise = Math.round(parseFloat(refundAmountRs) * 100);
      await apiClient.processRefund(order.id, {
        amount_paise: amountPaise,
        reason: refundReason,
      });
      setShowRefundForm(false);
      setRefundAmountRs('');
      setRefundReason('');
      await refetch();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Refund failed.');
    } finally {
      setIsRefunding(false);
    }
  };

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCancelling(true);
    try {
      await apiClient.cancelOrder(order.id, cancelReason);
      setShowCancelForm(false);
      setCancelReason('');
      await refetch();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Cancellation failed.');
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Back button and title */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/admin/orders"
            className="p-2 border border-slate-300 rounded-xl hover:bg-slate-200 transition"
          >
            <ArrowLeft className="w-4 h-4 text-slate-700" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl sm:text-2xl font-black font-mono text-slate-900">
                #{order.order_number}
              </span>
              <StatusBadge status={order.status} />
              <PaymentBadge status={order.payment_status} />
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Channel: <strong className="capitalize">{order.handover_method.replace('_', ' ')}</strong> | Placed on {new Date(order.created_at).toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowInvoiceModal(true)}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 transition flex items-center gap-1.5 shadow-sm"
          >
            <FileText className="w-3.5 h-3.5 text-brand-600" /> Print Tax Invoice
          </button>

          <button
            onClick={() => setShowInspectionModal(true)}
            className="px-3.5 py-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
          >
            <Shirt className="w-3.5 h-3.5" /> Garment Intake & QC
          </button>

          {order.outstanding_paise > 0 && (
            <button
              onClick={() => setShowPaymentModal(true)}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
            >
              <CreditCard className="w-3.5 h-3.5" /> Record Payment (Due ₹{(order.outstanding_paise / 100).toFixed(2)})
            </button>
          )}
        </div>
      </div>

      {statusError && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-2xl flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{statusError}</span>
        </div>
      )}

      {/* Workflow Transition Action Bar */}
      {nextStages.length > 0 && (
        <div className="p-6 rounded-3xl bg-white border border-brand-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-brand-600" /> Advance Workflow Stage
            </h3>
            <span className="text-[11px] text-slate-500 font-medium">Valid transition state machine</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {nextStages.map((stage) => (
              <button
                key={stage.status}
                disabled={isUpdatingStatus}
                onClick={() => handleUpdateStatus(stage.status)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm ${
                  stage.status === 'cancelled'
                    ? 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'
                    : 'bg-brand-600 hover:bg-brand-700 text-white'
                }`}
              >
                {isUpdatingStatus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                {stage.label}
              </button>
            ))}
          </div>

          <div className="pt-2">
            <input
              type="text"
              placeholder="Internal status note (e.g. Completed washing in batch #12, passed visual stain check)"
              value={statusNotes}
              onChange={(e) => setStatusNotes(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>
      )}

      {/* Main Order Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Items & Garment Inspections */}
        <div className="lg:col-span-2 space-y-8">
          {/* Garments Table */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-900 text-sm">Garment Items ({order.items.length})</h3>

            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Item & Service</th>
                    <th className="py-3 px-4 text-center">Qty / Wt</th>
                    <th className="py-3 px-4 text-right">Unit Price</th>
                    <th className="py-3 px-4 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {order.items.map(item => (
                    <tr key={item.id}>
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-900 block">{item.item_name_snapshot}</span>
                        <span className="text-[11px] text-slate-500">{item.service_name_snapshot}</span>
                        {item.special_instruction && (
                          <p className="text-[10px] text-amber-600 italic">Care: {item.special_instruction}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold">
                        {item.pricing_type_snapshot === 'per_kg' && item.weight_kg ? `${item.weight_kg} KG` : item.quantity}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600">
                        ₹{(item.unit_price_paise_snapshot / 100).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        ₹{(item.subtotal_paise / 100).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Garment Intake & Inspection Log */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Shirt className="w-4 h-4 text-purple-600" /> Physical Garment Inspections ({order.inspections?.length || 0})
              </h3>
              <button
                onClick={() => setShowInspectionModal(true)}
                className="text-xs text-brand-600 font-bold hover:underline"
              >
                + Add Inspection
              </button>
            </div>

            {order.inspections && order.inspections.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No garment inspection logged yet. Click "Garment Intake & QC" to record count and pre-existing stains.</p>
            ) : (
              <div className="space-y-3">
                {order.inspections?.map(insp => (
                  <div key={insp.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-900">
                        Count Received: <strong className="font-mono text-brand-700">{insp.actual_count_received}</strong> items
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${insp.quality_check_passed ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                        {insp.quality_check_passed ? 'QC Passed' : 'QC Issue Flagged'}
                      </span>
                    </div>

                    {insp.existing_stains_damage && (
                      <p className="text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200 text-[11px]">
                        <strong>Existing Stains / Damage:</strong> {insp.existing_stains_damage}
                      </p>
                    )}

                    {insp.inspection_notes && (
                      <p className="text-slate-600">
                        <strong>Inspection Notes:</strong> {insp.inspection_notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* History Timeline */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-900 text-sm">Order Status Audit Trail</h3>
            <OrderTimeline order={order} />
          </div>
        </div>

        {/* Right 1 Col: Customer Details & Financials */}
        <div className="space-y-8">
          {/* Customer Card */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4 text-xs">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <User className="w-4 h-4 text-slate-400" /> Customer Information
            </h3>

            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Name</span>
              <span className="font-bold text-slate-900 text-sm">{order.customer_name}</span>
            </div>

            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Phone Number</span>
              <a href={`tel:${order.customer_phone}`} className="font-bold font-mono text-brand-600 hover:underline">
                {order.customer_phone}
              </a>
            </div>

            {order.customer_email && (
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Email</span>
                <span className="text-slate-700">{order.customer_email}</span>
              </div>
            )}

            {order.handover_method === 'home_pickup_delivery' && (
              <div className="pt-2 border-t border-slate-100">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Delivery Address</span>
                <p className="text-slate-700 mt-0.5">{order.delivery_address || order.pickup_address}</p>
                <p className="text-slate-700 font-mono mt-0.5 font-bold">PIN: {order.pincode}</p>
              </div>
            )}
          </div>

          {/* Financial Ledger Card */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4 text-xs">
            <h3 className="font-bold text-slate-900 text-sm">Financial Accounting</h3>

            <div className="space-y-2">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-mono">₹{(order.subtotal_paise / 100).toFixed(2)}</span>
              </div>

              {order.discount_paise > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Discount ({order.coupon_code || 'Promo'}):</span>
                  <span className="font-mono">-₹{(order.discount_paise / 100).toFixed(2)}</span>
                </div>
              )}

              {order.delivery_fee_paise > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Delivery Charges:</span>
                  <span className="font-mono">₹{(order.delivery_fee_paise / 100).toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between text-slate-500 text-[11px]">
                <span>CGST (9%):</span>
                <span className="font-mono">₹{((order.tax_paise / 2) / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-500 text-[11px]">
                <span>SGST (9%):</span>
                <span className="font-mono">₹{((order.tax_paise / 2) / 100).toFixed(2)}</span>
              </div>

              <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-slate-900 text-sm">
                <span>Total Bill:</span>
                <span className="font-mono">₹{(order.total_paise / 100).toFixed(2)}</span>
              </div>

              <div className="flex justify-between text-emerald-700 font-bold">
                <span>Payments Received:</span>
                <span className="font-mono">₹{(order.paid_paise / 100).toFixed(2)}</span>
              </div>

              <div className="pt-2 border-t border-dashed border-slate-200 flex justify-between font-bold text-base">
                <span>Outstanding Due:</span>
                <span className={`font-mono ${order.outstanding_paise > 0 ? 'text-red-600' : 'text-slate-600'}`}>
                  ₹{(order.outstanding_paise / 100).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Payment Receipts List */}
            {order.payments && order.payments.length > 0 && (
              <div className="pt-4 border-t border-slate-100 space-y-2">
                <span className="font-bold text-[10px] text-slate-400 uppercase tracking-wider block">
                  Recorded Receipts
                </span>
                {order.payments.map(p => (
                  <div key={p.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex justify-between items-center text-[11px]">
                    <div>
                      <span className="font-bold text-slate-800">{p.payment_number}</span>
                      <p className="text-slate-400 capitalize">{p.payment_method.replace('_', ' ')} {p.transaction_reference && `(${p.transaction_reference})`}</p>
                    </div>
                    <span className="font-mono font-bold text-emerald-700">₹{(p.amount_paise / 100).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Refund trigger */}
            {order.paid_paise > 0 && (
              <div className="pt-4 border-t border-slate-100">
                {!showRefundForm ? (
                  <button
                    onClick={() => setShowRefundForm(true)}
                    className="text-xs text-red-600 font-semibold hover:underline"
                  >
                    Issue Partial / Full Refund
                  </button>
                ) : (
                  <form onSubmit={handleRefundSubmit} className="space-y-3 p-3 bg-red-50/50 rounded-xl border border-red-200 text-xs">
                    <span className="font-bold text-red-900 block">Issue Refund</span>
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-0.5">Amount (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        max={(order.paid_paise / 100).toFixed(2)}
                        value={refundAmountRs}
                        onChange={(e) => setRefundAmountRs(e.target.value)}
                        placeholder={`Max ₹${(order.paid_paise / 100).toFixed(2)}`}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono text-xs"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-0.5">Reason</label>
                      <input
                        type="text"
                        value={refundReason}
                        onChange={(e) => setRefundReason(e.target.value)}
                        placeholder="Reason for refund"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
                        required
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={isRefunding}
                        className="px-3 py-1 bg-red-600 text-white rounded-lg font-bold text-xs"
                      >
                        {isRefunding ? 'Processing...' : 'Process Refund'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowRefundForm(false)}
                        className="px-3 py-1 border border-slate-300 rounded-lg text-slate-700 font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <InvoiceModal
        order={order}
        isOpen={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
      />

      <PaymentModal
        order={order}
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onPaymentSuccess={refetch}
      />

      <InspectionModal
        order={order}
        isOpen={showInspectionModal}
        onClose={() => setShowInspectionModal(false)}
        onSuccess={refetch}
      />
    </div>
  );
};
