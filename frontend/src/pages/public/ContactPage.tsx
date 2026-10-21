import React from 'react';
import { MapPin, Phone, Mail, Clock, ShieldCheck, Sparkles } from 'lucide-react';

export const ContactPage: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
      <div className="text-center max-w-2xl mx-auto space-y-2">
        <span className="text-xs font-bold uppercase tracking-widest text-brand-600">Store Counter & Support</span>
        <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">Visit Or Contact Us</h1>
        <p className="text-slate-600 text-sm">
          Have a query about your laundry, special stains, or commercial contracts? Reach our store associates directly.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        {/* Contact Info Card */}
        <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm space-y-6">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand-600" /> SuperWash Main Store
          </h2>

          <div className="space-y-4 text-xs text-slate-700">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl shrink-0 mt-0.5">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <strong className="block text-slate-900 text-sm">Physical Shop Address</strong>
                <p className="text-slate-600 mt-0.5">Shop #14, Metro Pillar 78, Indiranagar 100ft Road, Bengaluru, Karnataka 560038</p>
                <span className="inline-block mt-1 text-[11px] text-emerald-700 font-semibold">
                  ✓ Ample 2-wheeler & 4-wheeler customer parking available
                </span>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl shrink-0 mt-0.5">
                <Phone className="w-5 h-5" />
              </div>
              <div>
                <strong className="block text-slate-900 text-sm">Phone Helpline</strong>
                <a href="tel:+919876543210" className="text-brand-600 font-bold hover:underline font-mono text-sm">
                  +91 98765 43210
                </a>
                <p className="text-slate-500 text-[11px] mt-0.5">Available 8:00 AM - 9:00 PM (Call or WhatsApp)</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-purple-50 text-purple-600 rounded-xl shrink-0 mt-0.5">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <strong className="block text-slate-900 text-sm">Email Support</strong>
                <a href="mailto:care@superwash.in" className="text-slate-700 hover:underline">
                  care@superwash.in
                </a>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-50 text-amber-600 rounded-xl shrink-0 mt-0.5">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <strong className="block text-slate-900 text-sm">Business Working Hours</strong>
                <p className="text-slate-600 mt-0.5">Monday to Sunday: 8:00 AM to 9:00 PM</p>
                <p className="text-slate-500 text-[11px]">Store open on public holidays.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Serviceable Areas Card */}
        <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm space-y-4">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" /> Serviceable Doorstep Areas
          </h2>
          <p className="text-xs text-slate-600">
            Our delivery logistics fleet actively covers the following Bengaluru neighborhoods for home pickup and drop:
          </p>

          <div className="grid grid-cols-2 gap-2 text-xs font-medium text-slate-700 pt-2">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="font-bold block">Indiranagar</span>
              <span className="text-[10px] text-slate-400 font-mono">560038</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="font-bold block">Ulsoor & Halasuru</span>
              <span className="text-[10px] text-slate-400 font-mono">560008</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="font-bold block">Domlur & EGL</span>
              <span className="text-[10px] text-slate-400 font-mono">560071 / 560075</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="font-bold block">Koramangala</span>
              <span className="text-[10px] text-slate-400 font-mono">560034</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="font-bold block">Bellandur & ORR</span>
              <span className="text-[10px] text-slate-400 font-mono">560103</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="font-bold block">MG Road & Brigade</span>
              <span className="text-[10px] text-slate-400 font-mono">560001</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
