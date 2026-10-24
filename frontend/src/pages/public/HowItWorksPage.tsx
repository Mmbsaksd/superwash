import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Truck, CheckCircle2, Clock, CalendarCheck, HelpCircle } from 'lucide-react';
import { BusinessSettings } from '../../types';
import { LaundryService, DEFAULT_SETTINGS } from '../../services/laundryService';

export const HowItWorksPage: React.FC = () => {
  const [settings, setSettings] = useState<BusinessSettings | null>(null);

  useEffect(() => {
    LaundryService.getSettings().then(setSettings);
  }, []);

  const address = settings?.business_address || DEFAULT_SETTINGS.business_address;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-16">
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <span className="text-xs font-bold uppercase tracking-widest text-brand-600">3 Flexible Channels</span>
        <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">How SuperWash Works</h1>
        <p className="text-slate-600 text-sm">
          Whether you prefer dropping off your clothes on your daily commute or having our drivers pick up and deliver directly to your door, we've got you covered.
        </p>
      </div>

      {/* Side-by-side Channel Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Channel 1: Shop Drop-Off */}
        <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <MapPin className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">Option A</span>
              <h3 className="text-2xl font-black text-slate-900 mt-1">Shop Drop-Off Counter</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Ideal for customers living or working nearby. Drop off clothes on your way to work and collect crisp garments on your way home.
            </p>

            <ul className="space-y-3 pt-2 text-xs text-slate-700">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>Visit our store at {address} (Open 8 AM - 9 PM daily).</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>Immediate count and physical inspection by our counter staff.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>No minimum order requirement and no delivery charges.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>Receive instant SMS notification when your order is bagged and ready for collection.</span>
              </li>
            </ul>
          </div>

          <Link
            to="/book"
            className="w-full py-3.5 text-center bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold transition border border-blue-200 block"
          >
            Create Drop-Off Booking
          </Link>
        </div>

        {/* Channel 2: Home Pickup & Delivery */}
        <div className="bg-white rounded-3xl border border-brand-200 p-8 shadow-md flex flex-col justify-between space-y-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 px-4 py-1.5 bg-gradient-to-l from-brand-600 to-cyan-600 text-white font-bold text-[10px] uppercase tracking-wider rounded-bl-xl">
            Most Popular
          </div>

          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-600">Option B</span>
              <h3 className="text-2xl font-black text-slate-900 mt-1">Doorstep Pickup & Delivery</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Zero travel required. We pick up your unwashed clothes from your apartment or office and deliver pristine garments back.
            </p>

            <ul className="space-y-3 pt-2 text-xs text-slate-700">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>Pick your preferred 3-hour time slot (Morning, Noon, Afternoon, Evening).</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>Our verified delivery associate arrives with laundry bags at your doorstep.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>Real-time tracking of clothes processing via your order tracking ID.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>Free delivery on orders over ₹500 across supported Bengaluru PIN codes.</span>
              </li>
            </ul>
          </div>

          <Link
            to="/book"
            className="w-full py-3.5 text-center bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-brand-500/25 block"
          >
            Schedule Home Pickup
          </Link>
        </div>
      </div>

      {/* FAQs Section */}
      <div className="max-w-4xl mx-auto space-y-6 pt-8">
        <div className="text-center">
          <h3 className="text-2xl font-bold text-slate-900 flex items-center justify-center gap-2">
            <HelpCircle className="w-6 h-6 text-brand-600" /> Frequently Asked Questions
          </h3>
        </div>

        <div className="space-y-4 text-xs">
          <div className="p-4 bg-white rounded-xl border border-slate-200">
            <h4 className="font-bold text-slate-900 text-sm">How long does processing take?</h4>
            <p className="text-slate-600 mt-1">Standard turnaround time is 24 to 48 hours for daily wash & steam press. Premium dry cleaning for heavy sarees or suits takes 48 to 72 hours.</p>
          </div>

          <div className="p-4 bg-white rounded-xl border border-slate-200">
            <h4 className="font-bold text-slate-900 text-sm">Do you mix my clothes with other customers' clothes?</h4>
            <p className="text-slate-600 mt-1">Never! Every customer's clothes are washed separately in dedicated drums to guarantee maximum hygiene and prevent cross-contamination.</p>
          </div>

          <div className="p-4 bg-white rounded-xl border border-slate-200">
            <h4 className="font-bold text-slate-900 text-sm">What payment options do you support?</h4>
            <p className="text-slate-600 mt-1">We accept online UPI (GPay, PhonePe, Paytm), Debit/Credit Cards via Razorpay, Cash at the counter, or Cash/UPI upon delivery.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
