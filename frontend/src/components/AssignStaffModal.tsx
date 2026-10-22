import React, { useState, useEffect } from 'react';
import { Order, Profile } from '../types';
import { LaundryService } from '../services/laundryService';
import { useAuth } from '../context/AuthContext';
import { Truck, X, CheckCircle, UserCheck, AlertCircle } from 'lucide-react';

interface AssignStaffModalProps {
  order: Order;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedOrder: Order) => void;
  assignedByName?: string;
  assignmentType?: 'pickup' | 'delivery';
}

export const AssignStaffModal: React.FC<AssignStaffModalProps> = ({
  order,
  isOpen,
  onClose,
  onSuccess,
  assignedByName = 'Owner',
  assignmentType
}) => {
  const { currentUser } = useAuth();
  const isCustomerSession = currentUser?.role === 'customer';

  const isPickup = assignmentType
    ? assignmentType === 'pickup'
    : (order.order_status === 'booked' || order.order_status === 'pickup_assigned');

  const [staffList, setStaffList] = useState<Profile[]>([]);
  const initialSelected = isPickup
    ? (order.assigned_pickup_id || '')
    : (order.assigned_delivery_id || '');
  const [selectedStaffId, setSelectedStaffId] = useState<string>(initialSelected);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      LaundryService.getStaffProfiles().then((profiles) => {
        const deliveryStaff = profiles.filter((p) => p.role === 'delivery' && p.is_active);
        setStaffList(deliveryStaff);
        const currentTargetId = isPickup ? order.assigned_pickup_id : order.assigned_delivery_id;
        if (currentTargetId) {
          setSelectedStaffId(currentTargetId);
        } else if (deliveryStaff.length > 0) {
          setSelectedStaffId(deliveryStaff[0].id);
        }
      });
      setError(null);
    }
  }, [isOpen, order, isPickup]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaffId) {
      setError('Please select a delivery person');
      return;
    }

    const staff = staffList.find((s) => s.id === selectedStaffId);
    if (!staff) {
      setError('Selected staff member not found');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const updated = isPickup
        ? await LaundryService.assignPickupStaff(
            order.id,
            staff.id,
            staff.full_name,
            staff.phone
          )
        : await LaundryService.assignDeliveryStaff(
            order.id,
            staff.id,
            staff.full_name,
            staff.phone
          );

      if (updated) {
        onSuccess(updated);
        onClose();
      } else {
        setError('Failed to assign staff');
      }
    } catch (err: any) {
      setError(err.message || 'Error assigning staff');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-900 p-4 text-white flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="font-bold text-sm">
                {isPickup ? 'Assign Pickup Executive' : 'Assign Delivery Courier'}
              </h3>
              <p className="text-[10px] text-slate-300">
                {isPickup
                  ? 'Assign doorstep pickup executive to collect and weigh laundry'
                  : 'Assign delivery courier for final clean laundry dispatch'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20 text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <div className="flex justify-between items-start">
              <span className="font-bold text-slate-900">
                Order #{order.order_number} • {order.customer_name}
              </span>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                {isPickup ? 'Pickup Stage' : 'Delivery Stage'}
              </span>
            </div>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              📍 {order.pickup_address} ({order.pickup_pincode})
            </p>
            <div className="grid grid-cols-2 gap-1 pt-1 mt-1 border-t border-slate-200 text-[10px] text-slate-500">
              <span>Pickup Executive: <b className="text-slate-700">{order.assigned_pickup_name || 'Unassigned'}</b></span>
              <span>Delivery Courier: <b className="text-slate-700">{order.assigned_delivery_name || 'Unassigned'}</b></span>
            </div>
          </div>

          {isCustomerSession && (
            <div className="p-3 bg-amber-50 text-amber-800 rounded-xl border border-amber-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong>Customer Session:</strong> You are currently signed in as a customer ({currentUser?.email || currentUser?.full_name}). Supabase Row-Level Security requires an authenticated Manager account to assign staff.
              </span>
            </div>
          )}

          {error && (
            <div className="p-2.5 bg-red-50 text-red-700 rounded-lg border border-red-200">
              {error}
            </div>
          )}

          <div>
            <label className="block font-bold text-slate-700 mb-2">
              {isPickup ? 'Select Pickup Executive:' : 'Select Delivery Courier:'}
            </label>
            <div className="space-y-2">
              {staffList.map((staff) => (
                <label
                  key={staff.id}
                  className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                    selectedStaffId === staff.id
                      ? 'border-brand-600 bg-brand-50 text-brand-900 ring-2 ring-brand-500/20'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      name="deliveryStaff"
                      value={staff.id}
                      checked={selectedStaffId === staff.id}
                      onChange={() => setSelectedStaffId(staff.id)}
                      className="text-brand-600 focus:ring-brand-500"
                    />
                    <div>
                      <p className="font-bold text-xs">{staff.full_name}</p>
                      <p className="text-[11px] text-slate-500">{staff.phone}</p>
                    </div>
                  </div>
                  {selectedStaffId === staff.id && (
                    <UserCheck className="w-4 h-4 text-brand-600" />
                  )}
                </label>
              ))}

              {staffList.length === 0 && (
                <p className="text-slate-500 italic p-3 text-center bg-slate-50 rounded-xl">
                  No active delivery staff found. Add staff in Admin Settings.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-3 border border-slate-200 rounded-xl font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !selectedStaffId || isCustomerSession}
              className="flex-1 py-2 px-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl shadow-md transition flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle className="w-4 h-4" />
              {isLoading ? 'Assigning...' : 'Assign Staff'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
