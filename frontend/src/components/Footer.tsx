import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Phone, Mail, MapPin, Clock, ShieldCheck } from 'lucide-react';
import { BusinessSettings } from '../types';
import { LaundryService, DEFAULT_SETTINGS } from '../services/laundryService';

export const Footer: React.FC = () => {
  const [settings, setSettings] = useState<BusinessSettings | null>(null);

  useEffect(() => {
    LaundryService.getSettings().then(setSettings);
  }, []);

  const phone = settings?.business_phone || DEFAULT_SETTINGS.business_phone;
  const address = settings?.business_address || DEFAULT_SETTINGS.business_address;
  const cleanTel = phone.replace(/[^0-9+]/g, '');

  return (
    <footer className="bg-slate-900 text-slate-400 border-t border-slate-800 text-sm no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand info */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center text-white">
                <Sparkles className="w-4 h-4" />
              </div>
              <span className="text-xl font-bold text-white tracking-tight">SuperWash Exprez</span>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">
              Professional laundry, dry cleaning, steam pressing, and premium fabric care. Serving homes and businesses across Bengaluru with contactless doorstep pickup and walk-in counter drop-off.
            </p>
            <div className="text-xs text-slate-500">
              GSTIN: <span className="font-mono text-slate-300">29ABCDE1234F1Z5</span>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-white font-semibold mb-4 text-xs tracking-wider uppercase">Quick Links</h4>
            <ul className="space-y-2 text-xs">
              <li><Link to="/book" className="hover:text-white transition">Book a Pickup / Drop-off</Link></li>
              <li><Link to="/services" className="hover:text-white transition">Services & Pricing Menu</Link></li>
              <li><Link to="/how-it-works" className="hover:text-white transition">How It Works</Link></li>
              <li><Link to="/track" className="hover:text-white transition">Track Your Order</Link></li>
              <li><Link to="/contact" className="hover:text-white transition">Contact & Shop Location</Link></li>
              <li><Link to="/login" className="hover:text-white transition">Customer / Staff Login</Link></li>
            </ul>
          </div>

          {/* Services */}
          <div>
            <h4 className="text-white font-semibold mb-4 text-xs tracking-wider uppercase">Our Services</h4>
            <ul className="space-y-2 text-xs">
              <li><Link to="/services" className="hover:text-white transition">Wash & Fold (Daily Casuals)</Link></li>
              <li><Link to="/services" className="hover:text-white transition">Wash & Steam Iron</Link></li>
              <li><Link to="/services" className="hover:text-white transition">Organic Dry Cleaning (Suits & Silks)</Link></li>
              <li><Link to="/services" className="hover:text-white transition">Steam Ironing & Pressing</Link></li>
              <li><Link to="/services" className="hover:text-white transition">Heavy Blankets & Duvets</Link></li>
              <li><Link to="/services" className="hover:text-white transition">Curtains & Home Linen</Link></li>
            </ul>
          </div>

          {/* Contact Details */}
          <div>
            <h4 className="text-white font-semibold mb-4 text-xs tracking-wider uppercase">Visit or Call Us</h4>
            <ul className="space-y-3 text-xs">
              <li className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
                <span>{address}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-brand-400 shrink-0" />
                <a href={`tel:${cleanTel}`} className="hover:text-white transition font-medium">{phone}</a>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-brand-400 shrink-0" />
                <a href="mailto:care@superwash.in" className="hover:text-white transition">care@superwash.in</a>
              </li>
              <li className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-brand-400 shrink-0" />
                <span>Open All 7 Days: 8:00 AM - 9:00 PM</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center text-xs text-slate-500 gap-4">
          <p>© {new Date().getFullYear()} SuperWash Exprez & Dry Cleaners. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link to="/privacy" className="hover:text-slate-300 transition">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-slate-300 transition">Terms of Service</Link>
            <span className="flex items-center gap-1 text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> 100% Secure Payments
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
