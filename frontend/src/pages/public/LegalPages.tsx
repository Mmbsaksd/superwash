import React from 'react';
import { ShieldCheck, FileText } from 'lucide-react';

export const PrivacyPage: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-6 text-slate-800">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
          <ShieldCheck className="w-8 h-8 text-brand-600" /> Privacy Policy
        </h1>
        <p className="text-xs text-slate-500 mt-1">SuperWash Express & Dry Cleaners | Last updated: October 2026</p>
      </div>

      <div className="space-y-4 text-xs leading-relaxed text-slate-600">
        <h3 className="text-sm font-bold text-slate-900">1. Information We Collect</h3>
        <p>
          We collect your name, phone number, delivery address, and garment preferences when you schedule a pickup or register on our platform. This data is exclusively used for order fulfillment, logistics scheduling, and SMS/WhatsApp delivery updates.
        </p>

        <h3 className="text-sm font-bold text-slate-900">2. Payment Security</h3>
        <p>
          All online payments are securely processed through Razorpay India with 256-bit encryption. SuperWash does not store card numbers, UPI PINs, or sensitive banking credentials on its servers.
        </p>

        <h3 className="text-sm font-bold text-slate-900">3. Non-Disclosure</h3>
        <p>
          We do not sell, rent, or trade your contact information with any third-party marketing agencies.
        </p>
      </div>
    </div>
  );
};

export const TermsPage: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-6 text-slate-800">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
          <FileText className="w-8 h-8 text-brand-600" /> Terms of Service
        </h1>
        <p className="text-xs text-slate-500 mt-1">SuperWash Express & Dry Cleaners | Last updated: October 2026</p>
      </div>

      <div className="space-y-4 text-xs leading-relaxed text-slate-600">
        <h3 className="text-sm font-bold text-slate-900">1. Garment Care & Inspection</h3>
        <p>
          All clothes undergo intake inspection. We request customers to check all pockets for valuables prior to handover. While utmost care is exercised with specialized solvent chemistry, manufacturer defects and preexisting tears will be documented.
        </p>

        <h3 className="text-sm font-bold text-slate-900">2. Turnaround & Delivery</h3>
        <p>
          Standard turnaround is 24 to 48 hours for casual wear. Customers are requested to ensure someone is available at the delivery address during the confirmed delivery window.
        </p>

        <h3 className="text-sm font-bold text-slate-900">3. Claims & Discrepancies</h3>
        <p>
          Any discrepancy in count or finish must be reported within 48 hours of delivery or shop collection.
        </p>
      </div>
    </div>
  );
};
