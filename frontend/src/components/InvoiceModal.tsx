import React from 'react';
import { X, Printer, Sparkles, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Order } from '../types';

interface InvoiceModalProps {
  order: Order;
  isOpen: boolean;
  onClose: () => void;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ order, isOpen, onClose }) => {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const formattedDate = new Date(order.created_at).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8">
        {/* Modal Controls (No Print) */}
        <div className="no-print bg-slate-100 px-6 py-3 flex items-center justify-between border-b border-slate-200">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tax Invoice Preview</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-bold hover:bg-brand-700 transition shadow-sm"
            >
              <Printer className="w-3.5 h-3.5" /> Print / Save PDF
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Invoice Printable Document */}
        <div className="p-8 sm:p-12 text-slate-800" id="printable-invoice">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-6 border-b border-slate-200 pb-8">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white">
                  <Sparkles className="w-4 h-4" />
                </div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900">SuperWash</h1>
              </div>
              <p className="text-xs font-medium text-slate-600">SuperWash Express & Dry Cleaners Pvt. Ltd.</p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs">
                Shop #14, Metro Pillar 78, Indiranagar 100ft Road, Bengaluru, Karnataka 560038
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Phone: +91 98765 43210 | Email: care@superwash.in</p>
              <p className="text-xs font-mono text-slate-600 mt-1 font-semibold">GSTIN: 29ABCDE1234F1Z5</p>
            </div>

            <div className="sm:text-right">
              <span className="inline-block px-3 py-1 bg-brand-50 text-brand-700 font-bold text-xs uppercase tracking-widest rounded border border-brand-200 mb-2">
                Tax Invoice
              </span>
              <p className="text-sm font-black font-mono text-slate-900">#{order.order_number}</p>
              <p className="text-xs text-slate-500 mt-1">Date: {formattedDate}</p>
              <p className="text-xs text-slate-500">Channel: {order.handover_method === 'shop_dropoff' ? 'Shop Drop-Off' : 'Home Pickup & Delivery'}</p>
            </div>
          </div>

          {/* Customer Billed To */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 my-6 text-xs">
            <div>
              <h3 className="font-bold uppercase tracking-wider text-slate-400 text-[10px] mb-1">Billed To</h3>
              <p className="font-bold text-slate-900 text-sm">{order.customer_name}</p>
              <p className="text-slate-600">Phone: {order.customer_phone}</p>
              {order.customer_email && <p className="text-slate-600">Email: {order.customer_email}</p>}
            </div>

            {order.handover_method === 'home_pickup_delivery' && (
              <div>
                <h3 className="font-bold uppercase tracking-wider text-slate-400 text-[10px] mb-1">Delivery Address</h3>
                <p className="text-slate-700">{order.delivery_address || order.pickup_address}</p>
                <p className="text-slate-700 font-medium">PIN Code: {order.pincode}</p>
              </div>
            )}
          </div>

          {/* Itemized Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden mb-6">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold text-[11px]">
                <tr>
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-4">Service & Item</th>
                  <th className="py-3 px-4 text-center">Qty / Wt</th>
                  <th className="py-3 px-4 text-right">Rate</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {order.items.map((item, index) => (
                  <tr key={item.id}>
                    <td className="py-3 px-4 font-mono text-slate-400">{index + 1}</td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{item.item_name_snapshot}</p>
                      <p className="text-[11px] text-slate-500">{item.service_name_snapshot}</p>
                      {item.special_instruction && (
                        <p className="text-[10px] text-amber-600 italic">Instruction: {item.special_instruction}</p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center font-mono">
                      {item.pricing_type_snapshot === 'per_kg' && item.weight_kg ? `${item.weight_kg} KG` : item.quantity}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      ₹{(item.unit_price_paise_snapshot / 100).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900">
                      ₹{(item.subtotal_paise / 100).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals and GST breakdown */}
          <div className="flex flex-col sm:flex-row justify-between gap-6 border-t border-slate-200 pt-6">
            <div className="text-xs space-y-2 max-w-xs">
              <h4 className="font-bold uppercase tracking-wider text-slate-400 text-[10px]">Payment Summary</h4>
              <p className="text-slate-600">
                Method: <span className="font-semibold capitalize text-slate-900">{order.payment_method.replace('_', ' ')}</span>
              </p>
              <p className="text-slate-600">
                Status: <span className="font-semibold capitalize text-slate-900">{order.payment_status.replace('_', ' ')}</span>
              </p>
              {order.payments && order.payments.length > 0 && (
                <div className="mt-2 text-[11px] border border-slate-200 rounded p-2 bg-slate-50">
                  <span className="font-semibold block mb-1">Receipts Recorded:</span>
                  {order.payments.map(p => (
                    <div key={p.id} className="flex justify-between text-slate-500 font-mono">
                      <span>{p.payment_number}:</span>
                      <span className="font-semibold text-slate-800">₹{(p.amount_paise / 100).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="w-full sm:w-64 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-mono">₹{(order.subtotal_paise / 100).toFixed(2)}</span>
              </div>

              {order.discount_paise > 0 && (
                <div className="flex justify-between text-emerald-600 font-medium">
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

              <div className="border-t border-slate-200 pt-2 flex justify-between text-sm font-bold text-slate-900">
                <span>Total Amount:</span>
                <span className="font-mono">₹{(order.total_paise / 100).toFixed(2)}</span>
              </div>

              <div className="flex justify-between text-xs text-emerald-700 font-medium">
                <span>Amount Paid:</span>
                <span className="font-mono">₹{(order.paid_paise / 100).toFixed(2)}</span>
              </div>

              <div className={`flex justify-between text-xs font-bold pt-1 border-t border-dashed border-slate-200 ${
                order.outstanding_paise > 0 ? 'text-red-600' : 'text-slate-500'
              }`}>
                <span>Balance Due:</span>
                <span className="font-mono">₹{(order.outstanding_paise / 100).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Footer declaration */}
          <div className="mt-10 pt-6 border-t border-slate-100 text-[11px] text-slate-400 flex flex-col sm:flex-row justify-between items-center gap-2">
            <p>This is a computer generated invoice and requires no physical signature.</p>
            <p className="flex items-center gap-1 text-emerald-600 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" /> Verified Tax Invoice
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
