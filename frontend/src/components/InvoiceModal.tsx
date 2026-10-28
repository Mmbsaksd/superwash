import React, { useRef } from 'react';
import { Order, BusinessSettings, Profile } from '../types';
import { X, Printer, CheckCircle2, AlertCircle, Tag, Scale, Building2, User, Phone, MapPin } from 'lucide-react';
import { PaymentBadge } from './StatusBadge';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  linkedOrders?: Order[];
  settings?: BusinessSettings | null;
  currentUser?: Profile | null;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({
  isOpen,
  onClose,
  order,
  linkedOrders = [],
  settings,
  currentUser
}) => {
  const invoiceRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !order) return null;

  // Authorization check: Customer can only view their own invoice; staff (manager, owner, delivery) can view for store operations
  const isOwnerOrManager = currentUser?.role === 'owner' || currentUser?.role === 'manager';
  const isDeliveryStaff = currentUser?.role === 'delivery' && (order.assigned_pickup_id === currentUser.id || order.assigned_delivery_id === currentUser.id);
  const isAuthorizedCustomer = !currentUser || currentUser.role === 'customer'
    ? (currentUser?.id === order.customer_id ||
       (currentUser?.phone && order.customer_phone && currentUser.phone.slice(-10) === order.customer_phone.slice(-10)))
    : false;

  if (!isOwnerOrManager && !isDeliveryStaff && !isAuthorizedCustomer && currentUser) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
        <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 text-center">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="font-black text-lg text-slate-900">Access Restricted</h3>
          <p className="text-xs text-slate-600">
            You do not have permission to access invoices for this order. Invoices are strictly restricted to the ordering customer and store management.
          </p>
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // Determine if this is a multi-service linked batch
  const batchMatch = order.notes?.match(/\[Linked Batch ([^:\]]+)/);
  const batchId = batchMatch ? batchMatch[1] : null;
  const isMultiService = Boolean(batchId && linkedOrders.length > 1);

  // Group items for display
  const displayItems = isMultiService && linkedOrders.length > 0
    ? linkedOrders
    : [order];

  // Bill maturity status: An invoice is final once scale weight is established; otherwise it is a pre-weighing estimate
  const isFullyWeighed = displayItems.every(
    (item) => item.order_status === 'cancelled' || (item.measured_weight !== null && item.measured_weight !== undefined)
  );

  // Calculate batch financials
  let totalSubtotalPaise = 0;
  let totalDiscountPaise = 0;
  let totalDeliveryChargePaise = 0;
  let totalPayablePaise = 0;
  let totalPaidPaise = 0;

  displayItems.forEach((item) => {
    if (item.order_status === 'cancelled') return;

    const rate = item.price_per_kg_paise || 7900;
    const minWeight = item.min_weight_kg || 1.0;
    const measuredWeight = item.measured_weight;

    let itemCharge = 0;
    if (item.total_amount_paise !== null && item.total_amount_paise !== undefined) {
      itemCharge = item.total_amount_paise + (item.discount_paise || 0) - (item.delivery_charge_paise || 0);
    } else {
      const billableWt = measuredWeight !== null && measuredWeight !== undefined
        ? Math.max(measuredWeight, minWeight)
        : minWeight;
      itemCharge = Math.round(rate * billableWt);
    }

    totalSubtotalPaise += Math.max(0, itemCharge);
    totalDiscountPaise += item.discount_paise || 0;
    totalDeliveryChargePaise += item.delivery_charge_paise || 0;
    totalPayablePaise += item.total_amount_paise !== null && item.total_amount_paise !== undefined
      ? item.total_amount_paise
      : Math.max(0, itemCharge - (item.discount_paise || 0) + (item.delivery_charge_paise || 0));
    totalPaidPaise += item.paid_amount_paise || 0;
  });

  const remainingBalancePaise = Math.max(0, totalPayablePaise - totalPaidPaise);
  const couponAppliedCode = displayItems.find((i) => i.coupon_code)?.coupon_code;

  // Handle native browser print
  const handlePrint = () => {
    window.print();
  };

  const invoiceNumber = isMultiService && batchId
    ? `BILL-${batchId}`
    : `INV-${order.order_number}`;

  const issueDate = order.weighed_at
    ? new Date(order.weighed_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
    : new Date(order.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white print:static print:z-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[95vh] print:max-h-none print:shadow-none print:border-none print:rounded-none">
        
        {/* Modal Toolbar (Hidden during print) */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
              {isFullyWeighed ? 'Official Bill & Tax Invoice' : 'Pro-Forma Booking Estimate'}
            </span>
            <span className="font-mono text-xs font-bold text-slate-500">#{invoiceNumber}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              data-testid="print-invoice-btn"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              aria-label="Close invoice"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Invoice Sheet */}
        <div ref={invoiceRef} className="p-6 sm:p-8 space-y-6 overflow-y-auto print:p-0 print:overflow-visible">
          
          {/* Header Banner */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b border-slate-200 gap-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-brand-600 text-white flex items-center justify-center font-black text-base shadow-sm">
                  SW
                </div>
                <div>
                  <h1 className="font-black text-xl text-slate-900 tracking-tight leading-none">
                    {settings?.business_name || 'SuperWash Exprez'}
                  </h1>
                  <span className="text-[10px] text-brand-700 font-bold tracking-wider uppercase">
                    Laundry Pickup & Delivery Platform
                  </span>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-slate-500 space-y-0.5">
                <p className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                  <span>{settings?.business_address || 'Bengaluru, Karnataka - 560103'}</span>
                </p>
                <p className="flex items-center gap-1">
                  <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                  <span>Helpdesk / WhatsApp: {settings?.business_phone || '+91 98765 43210'}</span>
                </p>
              </div>
            </div>

            <div className="text-left sm:text-right space-y-1">
              <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                isFullyWeighed
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-amber-100 text-amber-900 border border-amber-300'
              }`}>
                {isFullyWeighed ? '✓ Official Tax & Retail Bill' : '⏳ Pre-Weighing Estimate'}
              </span>
              <p className="font-mono text-sm font-black text-slate-900">{invoiceNumber}</p>
              <p className="text-[11px] text-slate-500">Date Issued: {issueDate}</p>
              <p className="text-[11px] text-slate-500">Scheduled Slot: {order.pickup_date} ({order.pickup_slot.split('(')[0].trim()})</p>
            </div>
          </div>

          {/* Customer & Bill Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl text-xs border border-slate-100">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                Billed To (Customer)
              </span>
              <p className="font-bold text-slate-900 text-sm">{order.customer_name}</p>
              <p className="text-slate-600 font-mono mt-0.5">{order.customer_phone}</p>
              <p className="text-slate-600 mt-1 leading-relaxed">
                {order.pickup_address}
                {order.pickup_landmark ? `, ${order.pickup_landmark}` : ''} - {order.pickup_pincode}
              </p>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                Booking Information
              </span>
              <p className="text-slate-700">
                <span className="font-bold">Primary Order:</span> #{order.order_number}
              </p>
              {isMultiService && batchId && (
                <p className="text-slate-700">
                  <span className="font-bold">Linked Appointment:</span> Batch {batchId} ({displayItems.length} Services)
                </p>
              )}
              <div className="mt-2 flex items-center gap-2">
                <span className="text-slate-500">Payment Status:</span>
                <PaymentBadge status={order.payment_status} />
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">Service Description</th>
                  <th className="py-2.5 px-3 text-right">Billable Qty / Weight</th>
                  <th className="py-2.5 px-3 text-right">Rate</th>
                  <th className="py-2.5 px-3 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayItems.map((item, idx) => {
                  const isCancelled = item.order_status === 'cancelled';
                  const rate = item.price_per_kg_paise || 7900;
                  const unitLabel = item.pricing_unit === 'per_piece' ? 'piece' : 'kg';
                  const minWeight = item.min_weight_kg || 1.0;
                  const measured = item.measured_weight;

                  let qtyStr = '';
                  let lineTotalPaise = 0;

                  if (isCancelled) {
                    qtyStr = 'Cancelled';
                    lineTotalPaise = 0;
                  } else if (measured !== null && measured !== undefined) {
                    const billable = Math.max(measured, minWeight);
                    qtyStr = `${measured.toFixed(2)} ${unitLabel} (Billable: ${billable.toFixed(2)} ${unitLabel})`;
                    lineTotalPaise = item.total_amount_paise !== null && item.total_amount_paise !== undefined
                      ? (item.total_amount_paise + (item.discount_paise || 0) - (item.delivery_charge_paise || 0))
                      : Math.round(rate * billable);
                  } else {
                    qtyStr = `Est. ${minWeight.toFixed(2)} ${unitLabel} (Min.)`;
                    lineTotalPaise = Math.round(rate * minWeight);
                  }

                  return (
                    <tr key={item.id} className={isCancelled ? 'opacity-50 bg-rose-50/30' : ''}>
                      <td className="py-3 px-3 font-mono text-slate-400">{idx + 1}</td>
                      <td className="py-3 px-3">
                        <span className="font-bold text-slate-900 block">
                          {item.service_name || 'Laundry Service'}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">#{item.order_number}</span>
                        {isCancelled && (
                          <span className="ml-2 text-[10px] font-bold text-rose-600 bg-rose-100 px-1.5 py-0.2 rounded">
                            Cancelled: {item.cancellation_reason || 'Service cancelled'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-slate-700">{qtyStr}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600">
                        ₹{(rate / 100).toFixed(0)}/{unitLabel === 'kg' ? 'kg' : 'pc'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                        {isCancelled ? '₹0.00' : `₹${(lineTotalPaise / 100).toFixed(2)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Financial Calculation Breakdown */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pt-4 border-t border-slate-200 text-xs">
            <div className="max-w-xs space-y-1.5 text-slate-500">
              <span className="font-bold text-slate-700 block">Payment & Billing Notes:</span>
              <p className="text-[11px] leading-relaxed">
                • Payments accepted via UPI QR code or Cash on Delivery upon return delivery.
              </p>
              <p className="text-[11px] leading-relaxed">
                • Official weights established on calibrated digital scales at our licensed wash facility.
              </p>
              {!isFullyWeighed && (
                <p className="text-[10px] text-amber-700 font-semibold bg-amber-50 p-2 rounded-xl border border-amber-200">
                  ⚠️ Note: Estimated figures will be replaced with authoritative weights and final invoice upon store intake.
                </p>
              )}
            </div>

            <div className="w-full sm:w-72 space-y-2 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div className="flex justify-between text-slate-600">
                <span>Laundry Subtotal:</span>
                <span className="font-mono font-bold text-slate-900">
                  ₹{(totalSubtotalPaise / 100).toFixed(2)}
                </span>
              </div>

              {totalDiscountPaise > 0 && (
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span className="flex items-center gap-1">
                    <Tag className="w-3 h-3 text-emerald-600" />
                    <span>Coupon ({couponAppliedCode || 'Promo'}):</span>
                  </span>
                  <span className="font-mono font-bold">
                    -₹{(totalDiscountPaise / 100).toFixed(2)}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-slate-600">
                <span>Delivery & Handling:</span>
                {totalDeliveryChargePaise > 0 ? (
                  <span className="font-mono font-bold text-slate-900">
                    ₹{(totalDeliveryChargePaise / 100).toFixed(2)}
                  </span>
                ) : (
                  <span className="font-bold text-emerald-700">FREE</span>
                )}
              </div>

              <div className="pt-2 border-t border-slate-200 flex justify-between items-baseline">
                <span className="font-black text-slate-900 text-sm">Total Payable:</span>
                <span className="font-black text-brand-700 text-base font-mono">
                  ₹{(totalPayablePaise / 100).toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between text-slate-600 text-[11px] pt-1 border-t border-slate-100">
                <span>Amount Paid:</span>
                <span className="font-mono font-semibold text-emerald-700">
                  ₹{(totalPaidPaise / 100).toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between text-slate-900 font-bold text-xs">
                <span>Balance Due:</span>
                <span className={`font-mono font-black ${remainingBalancePaise > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                  ₹{(remainingBalancePaise / 100).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Footer & Compliance Notice */}
          <div className="pt-4 border-t border-slate-100 text-[10px] text-slate-400 flex flex-col sm:flex-row justify-between items-center gap-2 text-center sm:text-left">
            <span>Thank you for choosing {settings?.business_name || 'SuperWash Exprez'}. Clean Clothes, Guaranteed.</span>
            <span>Support: {settings?.business_phone || '+91 98765 43210'} • superwash.in</span>
          </div>

        </div>
      </div>
    </div>
  );
};
