import React from 'react';
import { CustomerAddress } from '../../types';
import {
  MapPin, Phone, User, ChevronLeft, ChevronRight,
  Edit2, Navigation, AlertCircle, CheckCircle2, Plus
} from 'lucide-react';

export interface AddressFields {
  line: string;
  landmark: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
}

interface BookingStep2WhereAndWhoProps {
  customerName: string;
  onCustomerNameChange: (val: string) => void;
  customerPhone: string;
  onCustomerPhoneChange: (val: string) => void;
  addresses: CustomerAddress[];
  selectedAddressId: string;
  onSelectSavedAddress: (addr: CustomerAddress) => void;
  isEnteringNewAddress: boolean;
  onToggleNewAddress: (val: boolean) => void;
  newAddress: AddressFields;
  onUpdateNewAddress: (patch: Partial<AddressFields>) => void;
  isRefiningAddress: boolean;
  onToggleRefineAddress: () => void;
  refinedAddress: AddressFields;
  onUpdateRefinedAddress: (patch: Partial<AddressFields>) => void;
  updateSavedAddressBook: boolean;
  onToggleUpdateSavedAddressBook: (val: boolean) => void;
  onGetCurrentLocation: () => void;
  isLocating: boolean;
  locationFeedback: { type: string; message: string } | null;
  onOpenMapPicker: (target: 'booking_new' | 'booking_refine') => void;
  onClearLocation: () => void;
  onPrev: () => void;
  onNext: () => void;
  bookingStepError: string | null;
}

export const BookingStep2WhereAndWho: React.FC<BookingStep2WhereAndWhoProps> = ({
  customerName,
  onCustomerNameChange,
  customerPhone,
  onCustomerPhoneChange,
  addresses,
  selectedAddressId,
  onSelectSavedAddress,
  isEnteringNewAddress,
  onToggleNewAddress,
  newAddress,
  onUpdateNewAddress,
  isRefiningAddress,
  onToggleRefineAddress,
  refinedAddress,
  onUpdateRefinedAddress,
  updateSavedAddressBook,
  onToggleUpdateSavedAddressBook,
  onGetCurrentLocation,
  isLocating,
  locationFeedback,
  onOpenMapPicker,
  onClearLocation,
  onPrev,
  onNext,
  bookingStepError
}) => {
  return (
    <div className="space-y-6 animate-fade-in" data-step="2">
      {/* 1. Contact Information Section */}
      <div className="space-y-3">
        <div className="space-y-0.5">
          <label className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <User className="w-4 h-4 text-brand-600" />
            <span>Contact Information</span>
          </label>
          <p className="text-xs text-slate-500">
            Our delivery associate will call this number when arriving at your doorstep.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Full Name
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => onCustomerNameChange(e.target.value)}
              placeholder="e.g. Priya Patel"
              className="w-full px-4 py-3 rounded-2xl border border-slate-300 focus:ring-2 focus:ring-brand-500 text-sm font-medium bg-white min-h-[48px]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              10-Digit Mobile Number
            </label>
            <div className="relative">
              <span className="absolute left-4 top-3 text-slate-400 font-bold font-mono text-sm select-none">
                +91
              </span>
              <input
                type="tel"
                maxLength={10}
                value={customerPhone}
                onChange={(e) => onCustomerPhoneChange(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="9876543210"
                className="w-full pl-14 pr-4 py-3 rounded-2xl border border-slate-300 focus:ring-2 focus:ring-brand-500 font-mono text-sm bg-white font-medium min-h-[48px]"
                required
              />
            </div>
          </div>
        </div>

        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Real-time WhatsApp & SMS updates will be sent to this number.</span>
        </div>
      </div>

      {/* 2. Pickup Location Section */}
      <div className="space-y-3 pt-2 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <label className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-brand-600" />
            <span>Pickup Address & Map Location</span>
          </label>

          {addresses.length > 0 && (
            <button
              type="button"
              onClick={() => onToggleNewAddress(!isEnteringNewAddress)}
              className="text-xs font-bold text-brand-600 hover:text-brand-800 transition cursor-pointer flex items-center gap-1"
            >
              {isEnteringNewAddress ? 'Choose Saved Address' : '+ Add New Address'}
            </button>
          )}
        </div>

        {/* Saved Addresses List (if user has saved addresses and not toggled to new) */}
        {!isEnteringNewAddress && addresses.length > 0 ? (
          <div className="space-y-2.5">
            {addresses.map((addr) => {
              const isSelected = selectedAddressId === addr.id;
              return (
                <div
                  key={addr.id}
                  className={`p-4 rounded-2xl border-2 transition ${
                    isSelected
                      ? 'border-brand-600 bg-brand-50/70 text-slate-900 ring-4 ring-brand-500/10'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="selectedAddress"
                      value={addr.id}
                      checked={isSelected}
                      onChange={() => onSelectSavedAddress(addr)}
                      className="mt-1 h-4 w-4 text-brand-600 focus:ring-brand-500 cursor-pointer"
                    />
                    <div className="text-xs flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900 text-sm">{addr.label}</span>
                        {isSelected && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onToggleRefineAddress();
                            }}
                            className="text-[11px] font-bold text-brand-700 bg-white hover:bg-brand-100 border border-brand-300 px-2.5 py-1 rounded-xl transition flex items-center gap-1 cursor-pointer"
                            data-testid={`refine-address-${addr.id}`}
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>{isRefiningAddress ? 'Done Refining' : 'Refine / Edit Address'}</span>
                          </button>
                        )}
                      </div>

                      <p className="text-slate-600 text-xs mt-1 leading-relaxed">{addr.address_line}</p>
                      {addr.landmark && (
                        <p className="text-slate-500 text-[11px] mt-0.5">Landmark: {addr.landmark}</p>
                      )}

                      <div className="flex items-center gap-3 mt-2 text-[11px] font-mono text-slate-400">
                        <span>PIN: {addr.pincode}</span>
                        {addr.latitude && addr.longitude ? (
                          <span className="text-emerald-700 font-sans font-bold flex items-center gap-1">
                            📍 Doorstep GPS Pin Attached
                          </span>
                        ) : (
                          <span className="text-amber-600 font-sans font-medium">
                            No map pin
                          </span>
                        )}
                      </div>
                    </div>
                  </label>

                  {/* Refinement Sub-panel */}
                  {isSelected && isRefiningAddress && (
                    <div
                      className="mt-3.5 pt-3.5 border-t border-brand-200/80 space-y-3 text-xs animate-fade-in"
                      data-testid="address-refinement-panel"
                    >
                      <span className="font-bold text-brand-900 block text-xs uppercase tracking-wider">
                        Refine Address for this Pickup
                      </span>

                      <div className="space-y-2.5">
                        <div>
                          <label className="block text-slate-700 font-bold mb-1">
                            Door / Flat No., Building, Street
                          </label>
                          <input
                            type="text"
                            value={refinedAddress.line}
                            onChange={(e) => onUpdateRefinedAddress({ line: e.target.value })}
                            placeholder="e.g. Flat 301, Tower B, 12th Main Rd"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 bg-white"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-slate-700 font-bold mb-1">Landmark</label>
                            <input
                              type="text"
                              value={refinedAddress.landmark}
                              onChange={(e) => onUpdateRefinedAddress({ landmark: e.target.value })}
                              placeholder="e.g. Opposite Park"
                              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-700 font-bold mb-1">PIN Code</label>
                            <input
                              type="text"
                              maxLength={6}
                              value={refinedAddress.pincode}
                              onChange={(e) => onUpdateRefinedAddress({ pincode: e.target.value.replace(/\D/g, '') })}
                              placeholder="560038"
                              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 bg-white font-mono"
                            />
                          </div>
                        </div>

                        {/* Map Pin Trigger for Refinement */}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => onOpenMapPicker('booking_refine')}
                            className="py-2 px-3 bg-white hover:bg-brand-50 text-brand-700 border border-brand-200 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                          >
                            <Navigation className="w-3.5 h-3.5 text-brand-600" />
                            <span>Adjust Pin on Map</span>
                          </button>
                          {refinedAddress.latitude && refinedAddress.longitude && (
                            <span className="text-emerald-700 font-bold text-[11px]">
                              ✓ Pin attached ({refinedAddress.latitude.toFixed(4)}, {refinedAddress.longitude.toFixed(4)})
                            </span>
                          )}
                        </div>

                        <label className="flex items-center gap-2 pt-1 text-xs font-semibold text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={updateSavedAddressBook}
                            onChange={(e) => onToggleUpdateSavedAddressBook(e.target.checked)}
                            className="rounded text-brand-600 focus:ring-brand-500"
                          />
                          <span>Update my saved address book with these details</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* New Address Entry Form */
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                House / Flat No., Apartment, Street name
              </label>
              <input
                type="text"
                value={newAddress.line}
                onChange={(e) => onUpdateNewAddress({ line: e.target.value })}
                placeholder="e.g. Flat 204, Green Glen Layout, Bellandur"
                className="w-full px-4 py-3 rounded-2xl border border-slate-300 focus:ring-2 focus:ring-brand-500 text-sm font-medium bg-white min-h-[48px]"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Landmark
                </label>
                <input
                  type="text"
                  value={newAddress.landmark}
                  onChange={(e) => onUpdateNewAddress({ landmark: e.target.value })}
                  placeholder="e.g. Near Sobha Iris / Behind Metro"
                  className="w-full px-4 py-3 rounded-2xl border border-slate-300 focus:ring-2 focus:ring-brand-500 text-sm bg-white min-h-[48px]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  6-Digit PIN Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={newAddress.pincode}
                  onChange={(e) => onUpdateNewAddress({ pincode: e.target.value.replace(/\D/g, '') })}
                  placeholder="560103"
                  className="w-full px-4 py-3 rounded-2xl border border-slate-300 focus:ring-2 focus:ring-brand-500 text-sm font-mono bg-white min-h-[48px]"
                  required
                />
              </div>
            </div>

            {/* Doorstep GPS Map Pin Controls */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onGetCurrentLocation}
                    disabled={isLocating}
                    className="py-2 px-3 bg-white hover:bg-slate-100 disabled:opacity-50 text-brand-700 border border-slate-200 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs min-h-[40px]"
                  >
                    <MapPin className="w-3.5 h-3.5 text-brand-600" />
                    <span>{isLocating ? 'Acquiring GPS...' : '📍 Use Current GPS'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenMapPicker('booking_new')}
                    className="py-2 px-3 bg-white hover:bg-slate-100 text-brand-700 border border-slate-200 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs min-h-[40px]"
                  >
                    <Navigation className="w-3.5 h-3.5 text-brand-600" />
                    <span>Adjust Pin on Map</span>
                  </button>
                </div>

                {newAddress.latitude && newAddress.longitude && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-emerald-700 font-bold flex items-center gap-1">
                      ✓ GPS Pin Attached ({newAddress.latitude.toFixed(4)}, {newAddress.longitude.toFixed(4)})
                    </span>
                    <button
                      type="button"
                      onClick={onClearLocation}
                      className="text-[11px] text-slate-400 hover:text-slate-600 underline cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>

              {locationFeedback && (
                <p
                  className={`text-xs ${
                    locationFeedback.type === 'success'
                      ? 'text-emerald-700 font-semibold'
                      : locationFeedback.type === 'loading'
                      ? 'text-brand-600 animate-pulse'
                      : 'text-amber-700 font-medium'
                  }`}
                >
                  {locationFeedback.message}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {bookingStepError && (
        <p className="text-xs text-rose-600 font-bold bg-rose-50 p-3 rounded-xl border border-rose-200">
          {bookingStepError}
        </p>
      )}

      {/* Step 2 Navigation Actions */}
      <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-3">
        <button
          type="button"
          onClick={onPrev}
          className="w-full sm:w-auto py-3 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl transition flex items-center justify-center gap-1.5 cursor-pointer min-h-[48px]"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back to Services</span>
        </button>

        <button
          type="button"
          onClick={onNext}
          className="w-full sm:w-auto py-3.5 px-8 bg-brand-600 hover:bg-brand-700 active:scale-[0.99] text-white font-bold text-xs rounded-2xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer min-h-[48px]"
        >
          <span>Continue to Review & Confirm</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
