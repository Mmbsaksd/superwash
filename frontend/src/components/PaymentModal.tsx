import React, { useState, useEffect } from 'react';
import { X, Banknote, QrCode, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Order, BusinessSettings } from '../types';
import { LaundryService } from '../services/laundryService';
import { useAuth } from '../context/AuthContext';

interface PaymentModalProps {
  order: Order;
  isOpen: boolean;
  onClose: () => void;
  onPaymentSuccess: (updatedOrder: Order) => void;
  recordedBy?: string;
  recordedByName?: string;
  isStaff?: boolean;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  order,
  isOpen,
  onClose,
  onPaymentSuccess,
  recordedBy,
  recordedByName,
  isStaff = true
}) => {
  const { currentUser } = useAuth();
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [method, setMethod] = useState<'cash' | 'upi_manual'>('upi_manual');
  const [amountInput, setAmountInput] = useState<string>('');
  const [utrReference, setUtrReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const totalPaise = order.total_amount_paise || 0;
  const paidPaise = order.paid_amount_paise || 0;
  const balancePaise = Math.max(0, totalPaise - paidPaise);
  const balanceRs = (balancePaise / 100).toFixed(2);

  useEffect(() => {
    if (isOpen) {
      LaundryService.getSettings().then(setSettings);
      setAmountInput(balanceRs);
      setError(null);
      setSuccessMsg(null);
      setUtrReference('');
      setNotes('');
    }
  }, [isOpen, balanceRs]);

  if (!isOpen) return null;

  const upiId = settings?.upi_id || 'superwash@upi';
  const payAmountNum = parseFloat(amountInput) || 0;
  const upiPayLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=SuperWash%20Exprez&am=${payAmountNum > 0 ? payAmountNum : balanceRs}&cu=INR&tn=Order%20${order.order_number}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiPayLink)}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountVal = parseFloat(amountInput);
    if (isNaN(amountVal) || amountVal <= 0) {
      setError('Please enter a valid payment amount greater than ₹0');
      return;
    }

    const amountPaise = Math.round(amountVal * 100);
    if (amountPaise > balancePaise) {
      setError(`Payment cannot exceed outstanding balance of ₹${balanceRs}`);
      return;
    }

    if (method === 'upi_manual' && !utrReference.trim()) {
      setError('Please enter the UPI 12-digit UTR or Transaction reference number for verification');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const staffUuid = recordedBy || currentUser?.id;
      const staffDisplayName = recordedByName || currentUser?.full_name || 'Staff';
      const idempotencyKey = `pay-${order.id}-${Date.now()}`;

      const updated = await LaundryService.recordPayment(
        order.id,
        amountPaise,
        method,
        utrReference.trim() || undefined,
        notes.trim() || undefined,
        staffUuid,
        staffDisplayName,
        idempotencyKey
      );

      if (updated) {
        setSuccessMsg(`Payment of ₹${amountVal.toFixed(2)} recorded successfully!`);
        setTimeout(() => {
          onPaymentSuccess(updated);
          onClose();
        }, 800);
      } else {
        setError('Failed to record payment. Please try again.');
      }
    } catch (err: any) {
      setError(err.message || 'Error processing payment');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-900 p-4 text-white flex justify-between items-center">
          <div>
            <h3 className="font-bold text-base leading-tight">Record Payment</h3>
            <p className="text-xs text-slate-400">Order #{order.order_number} • {order.customer_name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/20 text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Amount Summary Bar */}
        <div className="bg-brand-50 border-b border-brand-100 p-3.5 flex justify-between items-center text-xs">
          <div>
            <span className="text-slate-500 block text-[11px]">Total Bill: ₹{(totalPaise / 100).toFixed(2)}</span>
            <span className="text-slate-500 block text-[11px]">Paid: ₹{(paidPaise / 100).toFixed(2)}</span>
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Remaining Balance</span>
            <span className="text-xl font-black text-brand-700 block">₹{balanceRs}</span>
          </div>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2 font-semibold">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Payment Method Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Select Payment Method
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMethod('upi_manual')}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition ${
                  method === 'upi_manual'
                    ? 'border-brand-600 bg-brand-50 text-brand-700 ring-2 ring-brand-500/20'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <QrCode className="w-4 h-4 text-brand-600" />
                UPI / QR Code
              </button>

              <button
                type="button"
                onClick={() => setMethod('cash')}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition ${
                  method === 'cash'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Banknote className="w-4 h-4 text-emerald-600" />
                Cash Collected
              </button>
            </div>
          </div>

          {/* UPI QR Display */}
          {method === 'upi_manual' && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col items-center text-center">
              <span className="text-[11px] font-bold text-slate-700 mb-1">Scan to Pay via Any UPI App</span>
              <p className="text-[10px] text-slate-500 mb-2">GPay, PhonePe, Paytm, or BHIM</p>
              
              <div className="p-2 bg-white rounded-xl shadow-sm border border-slate-200 mb-2">
                <img
                  src={qrCodeUrl}
                  alt="UPI QR Code"
                  className="w-36 h-36 object-contain"
                />
              </div>

              <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-xs">
                <span className="text-slate-400 text-[10px] block">UPI ID:</span>
                <span className="font-mono font-bold text-slate-800">{upiId}</span>
              </div>
            </div>
          )}

          {/* Form for recording payment */}
          {isStaff ? (
            <form onSubmit={handleSubmit} className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Amount Received (₹) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 font-bold text-slate-400 text-sm">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    max={balanceRs}
                    placeholder="0.00"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 font-bold text-slate-900 text-base"
                    required
                  />
                </div>
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setAmountInput(balanceRs)}
                    className="text-[10px] font-semibold text-brand-600 hover:underline"
                  >
                    Full Balance (₹{balanceRs})
                  </button>
                </div>
              </div>

              {method === 'upi_manual' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    UPI 12-Digit Reference / UTR Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 428901234567"
                    value={utrReference}
                    onChange={(e) => setUtrReference(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 font-mono"
                    required
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Verify the reference on your UPI app/SMS before recording.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Optional Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Received at doorstep"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isLoading}
                  className="flex-1 py-2.5 px-3 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading || balancePaise <= 0}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  Confirm & Record
                </button>
              </div>
            </form>
          ) : (
            /* Customer View */
            <div className="space-y-3">
              <p className="text-xs text-slate-600 text-center">
                Scan the QR code or send payment to the UPI ID above. Please share your payment screenshot or 12-digit UTR with the delivery agent or store staff.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition"
              >
                Close QR Code
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
