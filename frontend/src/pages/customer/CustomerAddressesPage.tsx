import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../api/client';
import { MapPin, Plus, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export const CustomerAddressesPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [showAddForm, setShowAddForm] = useState(false);
  const [label, setLabel] = useState('Home');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [landmark, setLandmark] = useState('');
  const [city, setCity] = useState('Bengaluru');
  const [pincode, setPincode] = useState('560038');
  const [isDefault, setIsDefault] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    try {
      await apiClient.addAddress({
        label,
        address_line1: addressLine1.trim(),
        address_line2: addressLine2.trim() || undefined,
        landmark: landmark.trim() || undefined,
        city,
        state: 'Karnataka',
        pincode: pincode.trim(),
        is_default: isDefault,
      });

      await refreshUser();
      setShowAddForm(false);
      setAddressLine1('');
      setAddressLine2('');
      setLandmark('');
      setMessage('New delivery address saved successfully!');
    } catch {
      setMessage('Failed to save address. Please verify details.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Saved Addresses</h1>
          <p className="text-xs text-slate-500 mt-0.5">Manage your home and work pickup & delivery locations.</p>
        </div>

        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
        >
          <Plus className="w-4 h-4" /> Add Address
        </button>
      </div>

      {message && (
        <div className="p-3.5 bg-brand-50 border border-brand-200 text-brand-800 text-xs rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-brand-600" />
          <span>{message}</span>
        </div>
      )}

      {showAddForm && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 text-sm">Add New Delivery Address</h3>

          <form onSubmit={handleAddAddress} className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Address Label</label>
              <select
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
              >
                <option value="Home">Home</option>
                <option value="Work">Work / Office</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">PIN Code *</label>
              <input
                type="text"
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-bold text-slate-700 mb-1">Flat / Building / House *</label>
              <input
                type="text"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                placeholder="e.g. Flat 302, Prestige Palms"
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-bold text-slate-700 mb-1">Street / Area / Landmark</label>
              <input
                type="text"
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
                placeholder="e.g. 12th Main, HAL 2nd Stage, near Sony World"
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
              />
            </div>

            <div className="sm:col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="def-check"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <label htmlFor="def-check" className="font-semibold text-slate-700">Set as default pickup address</label>
            </div>

            <div className="sm:col-span-2 flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-5 py-2 bg-brand-600 text-white rounded-xl font-bold hover:bg-brand-700 transition"
              >
                {isLoading ? 'Saving...' : 'Save Address'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Address cards list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {user?.addresses?.map((addr) => (
          <div
            key={addr.id}
            className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm relative flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800">
                  <MapPin className="w-3 h-3 text-brand-600" /> {addr.label}
                </span>

                {addr.is_default && (
                  <span className="text-[10px] font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full border border-brand-200">
                    Default
                  </span>
                )}
              </div>

              <p className="text-xs font-semibold text-slate-900 mt-2">{addr.address_line1}</p>
              {addr.address_line2 && <p className="text-xs text-slate-600 mt-0.5">{addr.address_line2}</p>}
              <p className="text-xs text-slate-500 mt-1">
                {addr.city}, Karnataka - <strong className="font-mono text-slate-800">{addr.pincode}</strong>
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const CustomerProfilePage: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Profile & Settings</h1>
        <p className="text-xs text-slate-500 mt-0.5">Your personal customer account details and lifetime statistics.</p>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
          <div>
            <span className="text-slate-400 font-bold block text-[10px] uppercase tracking-wider mb-1">Full Name</span>
            <span className="text-base font-bold text-slate-900">{user?.full_name}</span>
          </div>

          <div>
            <span className="text-slate-400 font-bold block text-[10px] uppercase tracking-wider mb-1">Phone Number</span>
            <span className="text-base font-bold font-mono text-slate-900">{user?.phone}</span>
          </div>

          <div>
            <span className="text-slate-400 font-bold block text-[10px] uppercase tracking-wider mb-1">Email Address</span>
            <span className="text-sm text-slate-700">{user?.email || 'Not provided'}</span>
          </div>

          <div>
            <span className="text-slate-400 font-bold block text-[10px] uppercase tracking-wider mb-1">Member Since</span>
            <span className="text-sm text-slate-700">
              {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-IN', {
                month: 'short', year: 'numeric'
              }) : '2026'}
            </span>
          </div>
        </div>

        {/* Customer Stats */}
        <div className="pt-6 border-t border-slate-100 grid grid-cols-3 gap-4 text-center">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Orders</span>
            <span className="text-xl font-black text-slate-900 font-mono mt-1 block">
              {user?.customer_profile?.total_orders || 0}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Spent</span>
            <span className="text-xl font-black text-emerald-700 font-mono mt-1 block">
              ₹{((user?.customer_profile?.total_spent_paise || 0) / 100).toFixed(0)}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Outstanding Due</span>
            <span className="text-xl font-black text-red-600 font-mono mt-1 block">
              ₹{((user?.customer_profile?.outstanding_balance_paise || 0) / 100).toFixed(0)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
