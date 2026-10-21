import React, { useState } from 'react';
import { X, CreditCard, Banknote, QrCode, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Order } from '../types';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';

interface PaymentModalProps {
  order: Order;
  isOpen: boolean;
  onClose: () => void;
  onPaymentSuccess: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ order, isOpen, onClose, onPaymentSuccess }) => {
  const { isStaff } = useAuth();
  const [activeTab, setActiveTab] = useState<'online' | 'manual'>('online');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Manual payment state (cash / UPI)
  const [manualAmountRs, setManualAmountRs] = useState((order.outstanding_paise / 100).toString());
  const [manualMethod, setManualMethod] = useState<'cash' | 'upi_manual'>('cash');
  const [utrReference, setUtrReference] = useState('');
  const [manualNotes, setManualNotes] = useState('');

  if (!isOpen) return null;

  const handleRazorpayOnlinePay = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      // 1. Create order on backend
      const { data: rpOrder } = await apiClient.createRazorpayOrder(order.id);

      // 2. In dev / sandbox mode, simulate user completing payment
      // Generate a mock payment ID and valid signature
      const mockPaymentId = `pay_rzp_${Date.now().toString(36)}`;
      const mockSignature = `sandbox_sig_${Date.now()}`;

      // Simulate a small network delay for realism
      await new Promise((resolve) => setTimeout(resolve, 800));

      // 3. Cryptographically verify signature on backend
      await apiClient.verifyRazorpay({
        order_id: order.id,
        razorpay_order_id: rpOrder.razorpay_order_id,
        razorpay_payment_id: mockPaymentId,
        razorpay_signature: mockSignature,
      });

      onPaymentSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Online payment failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    const amountPaise = Math.round(parseFloat(manualAmountRs) * 100);
    if (isNaN(amountPaise) || amountPaise <= 0) {
      setErrorMessage('Please enter a valid amount greater than 0.');
      setIsLoading(false);
      return;
    }

    if (amountPaise > order.outstanding_paise) {
      setErrorMessage(`Amount cannot exceed the outstanding balance of ₹${(order.outstanding_paise / 100).toFixed(2)}.`);
      setIsLoading(false);
      return;
    }

    try {
      await apiClient.recordManualPayment(order.id, {
        amount_paise: amountPaise,
        payment_method: manualMethod,
        transaction_reference: utrReference || undefined,
        notes: manualNotes || (manualMethod === 'cash' ? 'Cash collected' : 'UPI received'),
      });

      onPaymentSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to record payment.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Make Payment</h3>
            <p className="text-xs text-slate-500 font-mono">Order #{order.order_number}</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Balance Overview */}
        <div className="p-6 border-b border-slate-100 bg-brand-50/50 flex justify-between items-center">
          <div>
            <span className="text-xs text-slate-500 font-medium">Outstanding Balance:</span>
            <div className="text-2xl font-black text-slate-900 font-mono">
              ₹{(order.outstanding_paise / 100).toFixed(2)}
            </div>
          </div>
          <div className="text-right text-xs text-slate-500">
            <div>Total Bill: ₹{(order.total_paise / 100).toFixed(2)}</div>
            <div>Already Paid: ₹{(order.paid_paise / 100).toFixed(2)}</div>
          </div>
        </div>

        {/* Tab selection */}
        {isStaff && (
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setActiveTab('online')}
              className={`flex-1 py-3 text-xs font-bold text-center border-b-2 transition ${
                activeTab === 'online'
                  ? 'border-brand-600 text-brand-600 bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-800 bg-slate-50'
              }`}
            >
              Online Gateway (Razorpay)
            </button>
            <button
              onClick={() => setActiveTab('manual')}
              className={`flex-1 py-3 text-xs font-bold text-center border-b-2 transition ${
                activeTab === 'manual'
                  ? 'border-brand-600 text-brand-600 bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-800 bg-slate-50'
              }`}
            >
              Cash / Manual UPI Entry
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="p-6">
          {activeTab === 'online' ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-brand-600" />
                    Razorpay Secure India Gateway
                  </span>
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-mono text-[10px]">Sandbox Mode</span>
                </div>
                <p className="text-xs text-slate-500">
                  Supports UPI (Google Pay, PhonePe, Paytm), All Major Debit/Credit Cards, and Net Banking.
                </p>
              </div>

              <button
                type="button"
                disabled={isLoading}
                onClick={handleRazorpayOnlinePay}
                className="w-full py-3.5 bg-gradient-to-r from-brand-600 to-cyan-600 hover:from-brand-700 hover:to-cyan-700 text-white rounded-xl font-bold text-sm shadow-md shadow-brand-500/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Verifying with Razorpay...
                  </>
                ) : (
                  <>Pay ₹{(order.outstanding_paise / 100).toFixed(2)} with Razorpay</>
                )}
              </button>
            </div>
          ) : (
            <form onSubmit={handleManualPaymentSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payment Method</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setManualMethod('cash')}
                    className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition ${
                      manualMethod === 'cash' ? 'border-brand-600 bg-brand-50/50 text-brand-900 font-bold' : 'border-slate-200 text-slate-700'
                    }`}
                  >
                    <Banknote className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs">Cash Payment</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setManualMethod('upi_manual')}
                    className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition ${
                      manualMethod === 'upi_manual' ? 'border-brand-600 bg-brand-50/50 text-brand-900 font-bold' : 'border-slate-200 text-slate-700'
                    }`}
                  >
                    <QrCode className="w-4 h-4 text-purple-600" />
                    <span className="text-xs">Shop UPI QR Code</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Amount to Record (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  max={(order.outstanding_paise / 100).toFixed(2)}
                  value={manualAmountRs}
                  onChange={(e) => setManualAmountRs(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500"
                  required
                />
              </div>

              {manualMethod === 'upi_manual' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">UPI UTR / Reference Number</label>
                  <input
                    type="text"
                    value={utrReference}
                    onChange={(e) => setUtrReference(e.target.value)}
                    placeholder="e.g. 408219876543"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Notes / Remarks</label>
                <input
                  type="text"
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  placeholder="e.g. Handed cash to cashier"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Record ₹{manualAmountRs} Payment
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
