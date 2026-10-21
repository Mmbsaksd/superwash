import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Truck, Clock, MapPin, Users, Loader2 } from 'lucide-react';
import { apiClient } from '../../api/client';
import { DeliveryTimeSlot, ServiceableArea, User } from '../../types';

export const AdminLogisticsPage: React.FC = () => {
  const { data: slots, isLoading: slotsLoading } = useQuery<DeliveryTimeSlot[]>({
    queryKey: ['admin-slots'],
    queryFn: async () => (await apiClient.getSlots()).data,
  });

  const { data: areas, isLoading: areasLoading } = useQuery<ServiceableArea[]>({
    queryKey: ['admin-areas'],
    queryFn: async () => (await apiClient.getAreas()).data,
  });

  const { data: staff, isLoading: staffLoading } = useQuery<User[]>({
    queryKey: ['admin-staff'],
    queryFn: async () => (await apiClient.getStaff()).data,
  });

  if (slotsLoading || areasLoading || staffLoading) {
    return (
      <div className="py-20 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Logistics, Slots & Areas</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Manage serviceable Bengaluru PIN codes, 3-hour pickup windows, and fleet capacity limits.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Time Slots Card */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand-600" /> Delivery & Pickup Time Slots
          </h3>

          <div className="space-y-3 text-xs">
            {slots?.map(slot => (
              <div
                key={slot.id}
                className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex justify-between items-center"
              >
                <div>
                  <h4 className="font-bold text-slate-900">{slot.name}</h4>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {slot.start_time} - {slot.end_time} ({slot.slot_type} windows)
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Max Capacity</span>
                  <span className="font-mono font-bold text-brand-700">{slot.max_capacity} orders/day</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Serviceable PIN Codes */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-600" /> Serviceable Bengaluru Areas
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {areas?.map(area => (
              <div key={area.id} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-900 block">{area.area_name}</span>
                <span className="text-[11px] font-mono font-bold text-brand-600">{area.pincode}</span>
                <div className="mt-2 text-[10px] text-slate-500 flex justify-between">
                  <span>Fee: ₹{area.delivery_fee_paise / 100}</span>
                  <span>Min: ₹{area.min_order_paise / 100}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Staff Accounts Card */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
          <Users className="w-4 h-4 text-indigo-600" /> Store Staff & Delivery Associates ({staff?.length || 0})
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          {staff?.map(member => (
            <div key={member.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="font-bold text-slate-900 text-sm block">{member.full_name}</span>
              <span className="text-[11px] font-mono text-slate-500 block">{member.phone}</span>
              <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-50 text-brand-700 border border-brand-200 capitalize">
                {member.role.replace('_', ' ')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
