import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BusinessSettings } from '../../types';
import { LaundryService, DEFAULT_SETTINGS } from '../../services/laundryService';
import { useAuth } from '../../context/AuthContext';
import { PwaInstallPrompt } from '../../components/PwaInstallPrompt';
import {
  Sparkles, Clock, Truck, ShieldCheck, CheckCircle2,
  CalendarCheck, ArrowRight, Scale, Phone, MapPin,
  ChevronDown, HelpCircle, Check, Search, Lock
} from 'lucide-react';

export const LandingPage: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [pincodeInput, setPincodeInput] = useState<string>('');
  const [pincodeResult, setPincodeResult] = useState<{ checked: boolean; serviceable: boolean; message: string } | null>(null);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState<boolean>(false);
  const [isTermsOpen, setIsTermsOpen] = useState<boolean>(false);

  useEffect(() => {
    LaundryService.getSettings().then(setSettings);
  }, []);

  const handleCheckPincode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pincodeInput.trim()) return;
    const clean = pincodeInput.trim();
    const serviceable = await LaundryService.isPincodeServiceable(clean);
    if (serviceable) {
      setPincodeResult({
        checked: true,
        serviceable: true,
        message: `Great news! PIN code ${clean} is in our daily free pickup & delivery zone.`
      });
    } else {
      setPincodeResult({
        checked: true,
        serviceable: false,
        message: `PIN code ${clean} is outside our current scheduled zone. You can still drop off at our Indiranagar store!`
      });
    }
  };

  const pricePerKg = settings ? (settings.price_per_kg_paise / 100).toFixed(0) : '80';
  const minWeight = settings ? settings.min_weight_kg.toFixed(0) : '3';
  const minBill = settings ? ((settings.price_per_kg_paise * settings.min_weight_kg) / 100).toFixed(0) : '240';
  const phone = settings?.business_phone || DEFAULT_SETTINGS.business_phone;
  const address = settings?.business_address || DEFAULT_SETTINGS.business_address;

  const faqList = [
    {
      q: 'How does per-kilogram laundry pricing work?',
      a: `We weigh your entire laundry batch on calibrated digital scales at our facility. The rate is ₹${pricePerKg}/kg. If your laundry weighs less than the minimum billable weight of ${minWeight} kg, it is billed at the minimum charge of ₹${minBill}.`
    },
    {
      q: 'Do I need to count or list individual garments?',
      a: 'No! You do not need to list or count individual shirts, t-shirts, or trousers. Simply put all your clothes into a bag or basket. Our staff will weigh them and wash them together.'
    },
    {
      q: 'How and when do I pay?',
      a: 'No advance payment is needed to book. Once weighed at the facility, your verified bill is generated automatically. You can pay via UPI (GPay, PhonePe, Paytm, BHIM) or Cash either during delivery or pickup.'
    },
    {
      q: 'What is the turnaround time for delivery?',
      a: 'Standard delivery is within 24 to 48 hours. Your clothes are washed, dried, steam-ironed, and neatly packed before being delivered to your doorstep.'
    },
    {
      q: 'What areas and PIN codes do you cover?',
      a: 'We cover major neighborhoods across East and Central Bengaluru including Indiranagar (560038), Ulsoor (560008), Bellandur (560103), Domlur (560071), CV Raman Nagar (560075), and Whitefield (560066).'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* PWA Installation Banner */}
      <PwaInstallPrompt variant="customer-banner" />

      {/* Top Navigation */}
      <header className="bg-white/95 backdrop-blur-md border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-brand-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-brand-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <span className="font-black text-xl text-slate-900 tracking-tight flex items-center">
                Super<span className="text-brand-600">Wash</span>
              </span>
              <span className="block text-[10px] uppercase font-bold tracking-widest text-slate-500 -mt-1">
                Exprez • Bengaluru
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <a
              href={`tel:${phone.replace(/[^0-9+]/g, '')}`}
              className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-brand-600 transition mr-2"
            >
              <Phone className="w-3.5 h-3.5 text-brand-600" />
              <span>{phone}</span>
            </a>

            {currentUser ? (
              <button
                onClick={() => {
                  if (currentUser.role === 'owner') navigate('/admin');
                  else if (currentUser.role === 'manager') navigate('/manager');
                  else if (currentUser.role === 'delivery') navigate('/delivery');
                  else navigate('/customer');
                }}
                className="py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5"
              >
                <span>{currentUser.role === 'customer' ? 'My Orders & Booking' : 'Go to Dashboard'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <Link
                to="/login"
                className="py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5"
              >
                <span>Sign In / Book</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Landing Page Content */}
      <main className="flex-1 space-y-16 sm:space-y-24 pb-16">
        {/* ================= 1. HERO SECTION ================= */}
        <section className="relative overflow-hidden bg-gradient-to-b from-brand-50/70 via-white to-slate-50 pt-12 pb-16 sm:pt-20 sm:pb-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
              <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-100 text-brand-800 text-xs font-bold border border-brand-200 shadow-sm">
                  <Sparkles className="w-4 h-4 text-brand-600" />
                  <span>Simple Per-Kilogram Washing • No Garment Counting</span>
                </div>

                <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-[1.15]">
                  Fresh Clothes, <br className="hidden sm:inline" />
                  <span className="bg-gradient-to-r from-brand-600 to-cyan-500 bg-clip-text text-transparent">
                    Zero Effort.
                  </span>
                </h1>

                <p className="text-base sm:text-lg text-slate-600 max-w-2xl leading-relaxed">
                  Home laundry pickup and delivery at just <strong>₹{pricePerKg} per kilogram</strong>. We pick up from your doorstep, weigh on certified scales, wash with premium skin-friendly detergents, and return crisp and clean.
                </p>

                {/* Pricing & CTA Card */}
                <div className="pt-2 flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
                  <Link
                    to={currentUser ? '/customer' : '/login'}
                    className="w-full sm:w-auto py-3.5 px-8 bg-brand-600 hover:bg-brand-700 active:scale-[0.99] text-white font-black text-base rounded-2xl shadow-lg shadow-brand-500/25 transition flex items-center justify-center gap-2"
                  >
                    <CalendarCheck className="w-5 h-5" />
                    <span>Book a Home Pickup</span>
                  </Link>

                  <div className="text-left bg-white px-4 py-2.5 rounded-2xl border border-slate-200 shadow-sm">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                      Transparent Rate
                    </span>
                    <span className="text-base font-black text-slate-900">
                      ₹{pricePerKg} / kg <span className="text-xs font-normal text-slate-500">(Min. {minWeight} kg = ₹{minBill})</span>
                    </span>
                  </div>
                </div>

                {/* Key feature pills */}
                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 pt-3 text-xs text-slate-600 font-semibold">
                  <div className="flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Free Home Pickup</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Cash or UPI on Delivery</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Live Order Tracking</span>
                  </div>
                </div>
              </div>

              {/* Hero Visual Card */}
              <div className="lg:col-span-5">
                <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xl space-y-5">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <Scale className="w-6 h-6 text-brand-600" />
                      <div>
                        <h2 className="font-bold text-slate-900 text-sm">How Billing Works</h2>
                        <span className="text-xs text-slate-500">Simple, fair, by weight</span>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                      No Hidden Fees
                    </span>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                      <span className="text-slate-600">Rate per Kilogram:</span>
                      <span className="font-bold text-slate-900 text-sm">₹{pricePerKg} / kg</span>
                    </div>

                    <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                      <span className="text-slate-600">Minimum Billable Weight:</span>
                      <span className="font-bold text-slate-900">{minWeight} kg (₹{minBill})</span>
                    </div>

                    <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                      <span className="text-slate-600">Pickup & Delivery Fee:</span>
                      <span className="font-bold text-emerald-600">FREE</span>
                    </div>

                    <div className="p-3 bg-brand-50 border border-brand-200 rounded-xl text-brand-900 space-y-1">
                      <span className="font-bold block">Example:</span>
                      <p className="text-[11px] text-brand-800">
                        If your clothes weigh 4.5 kg, you pay 4.5 × ₹{pricePerKg} = <strong>₹{(4.5 * parseFloat(pricePerKg)).toFixed(0)}</strong>. If they weigh 2.0 kg, minimum {minWeight} kg applies = <strong>₹{minBill}</strong>.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= 2. 4-STEP WORKFLOW ================= */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-600">
              Effortless Process
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              How SuperWash Works
            </h2>
            <p className="text-xs sm:text-sm text-slate-600">
              From doorstep collection to clean delivery in 4 easy steps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                step: '01',
                title: 'Book a Pickup',
                desc: 'Enter your phone number, choose your address, and select a 3-hour pickup window.',
                icon: CalendarCheck,
                color: 'bg-blue-50 text-blue-600'
              },
              {
                step: '02',
                title: 'Clothes Collected',
                desc: 'Our delivery executive arrives at your doorstep to collect your clothes in laundry bags.',
                icon: Truck,
                color: 'bg-indigo-50 text-indigo-600'
              },
              {
                step: '03',
                title: 'Weighed & Washed',
                desc: 'Clothes are weighed at our facility. Your bill is calculated automatically and washing starts.',
                icon: Scale,
                color: 'bg-purple-50 text-purple-600'
              },
              {
                step: '04',
                title: 'Returned & Paid',
                desc: 'Clean, folded clothes are delivered back. Pay via Cash or UPI at your doorstep.',
                icon: CheckCircle2,
                color: 'bg-emerald-50 text-emerald-600'
              }
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.step}
                  className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm relative space-y-3"
                >
                  <span className="text-4xl font-black text-slate-100 absolute top-4 right-4 select-none">
                    {s.step}
                  </span>
                  <div className={`w-12 h-12 rounded-2xl ${s.color} flex items-center justify-center`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-base">{s.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{s.desc}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ================= 3. SERVICE AREA CHECKER ================= */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-r from-slate-900 to-brand-900 text-white rounded-3xl p-6 sm:p-10 shadow-xl space-y-6">
            <div className="max-w-xl space-y-2">
              <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-widest">
                Service Area Checker
              </span>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
                Check if We Cover Your PIN Code
              </h2>
              <p className="text-xs sm:text-sm text-slate-300">
                We currently service major neighborhoods across Bengaluru. Enter your 6-digit PIN code to check instant availability.
              </p>
            </div>

            <form onSubmit={handleCheckPincode} className="flex flex-col sm:flex-row gap-2 max-w-md">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  maxLength={6}
                  placeholder="e.g. 560038"
                  value={pincodeInput}
                  onChange={(e) => setPincodeInput(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-white text-slate-900 font-mono font-bold text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />
              </div>
              <button
                type="submit"
                className="py-2.5 px-5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs rounded-xl shadow-md transition"
              >
                Check Coverage
              </button>
            </form>

            {pincodeResult && (
              <div
                className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                  pincodeResult.serviceable
                    ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                }`}
              >
                {pincodeResult.serviceable ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
                )}
                <span>{pincodeResult.message}</span>
              </div>
            )}

            <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex flex-wrap gap-2 items-center">
              <span className="font-semibold text-slate-300">Popular covered hubs:</span>
              <span>Indiranagar (560038)</span> •
              <span>Ulsoor (560008)</span> •
              <span>Bellandur (560103)</span> •
              <span>Domlur (560071)</span> •
              <span>Whitefield (560066)</span>
            </div>
          </div>
        </section>

        {/* ================= 4. FREQUENTLY ASKED QUESTIONS ================= */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="text-center space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-600">Got Questions?</span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-3">
            {faqList.map((item, idx) => {
              const isOpen = activeFaq === idx;
              return (
                <div
                  key={idx}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm transition"
                >
                  <button
                    onClick={() => setActiveFaq(isOpen ? null : idx)}
                    className="w-full p-4 text-left flex justify-between items-center gap-4 hover:bg-slate-50 transition"
                  >
                    <span className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <HelpCircle className="w-4 h-4 text-brand-600 shrink-0" />
                      {item.q}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 transition-transform ${
                        isOpen ? 'rotate-180 text-brand-600' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 text-xs text-slate-600 leading-relaxed border-t border-slate-100">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ================= 5. CONTACT & STORE LOCATION ================= */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="space-y-3 text-xs">
              <span className="text-[10px] uppercase font-bold text-brand-600 tracking-wider">
                Visit or Contact
              </span>
              <h2 className="text-2xl font-black text-slate-900 leading-tight">
                SuperWash Exprez Shop
              </h2>
              <p className="text-slate-600">
                You are welcome to drop off clothes directly at our facility counter or call us for any queries.
              </p>

              <div className="space-y-2 pt-2">
                <div className="flex items-start gap-2.5 text-slate-700">
                  <MapPin className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
                  <span>{address}</span>
                </div>
                <div className="flex items-center gap-2.5 text-slate-700">
                  <Clock className="w-4 h-4 text-brand-600 shrink-0" />
                  <span>Monday to Sunday: 8:00 AM – 9:00 PM</span>
                </div>
                <div className="flex items-center gap-2.5 text-slate-700">
                  <Phone className="w-4 h-4 text-brand-600 shrink-0" />
                  <span>{phone}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <a
                href={`tel:${phone.replace(/[^0-9+]/g, '')}`}
                className="w-full py-3 px-4 bg-brand-50 hover:bg-brand-100 text-brand-800 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition"
              >
                <Phone className="w-4 h-4 text-brand-600" />
                <span>Call Store: {phone}</span>
              </a>

              <Link
                to={currentUser ? '/customer' : '/login'}
                className="w-full py-3.5 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-md transition"
              >
                <CalendarCheck className="w-4 h-4" />
                <span>Book Home Pickup Online</span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 text-xs border-t border-slate-800 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold">
                <Sparkles className="w-4 h-4" />
              </div>
              <span className="font-black text-white text-base">SuperWash Exprez</span>
            </div>

            <div className="flex items-center gap-5 text-slate-400">
              <button onClick={() => setIsPrivacyOpen(true)} className="hover:text-white transition">
                Privacy Policy
              </button>
              <button onClick={() => setIsTermsOpen(true)} className="hover:text-white transition">
                Terms of Service
              </button>
              <Link to="/login" className="hover:text-white transition">
                Staff Portal
              </Link>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center text-[11px] text-slate-500 gap-2">
            <span>© {new Date().getFullYear()} SuperWash Exprez India. All rights reserved.</span>
            <span>Simple Per-Kilogram Laundry Pickup & Delivery.</span>
          </div>
        </div>
      </footer>

      {/* Privacy Policy Modal */}
      {isPrivacyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4 text-xs max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-2 border-b">
              <h3 className="font-bold text-base text-slate-900">Privacy Policy</h3>
              <button onClick={() => setIsPrivacyOpen(false)} className="p-1 hover:bg-slate-100 rounded-full">
                ✕
              </button>
            </div>
            <p className="text-slate-600 leading-relaxed">
              SuperWash Exprez respects your privacy. We collect only the mobile number, address, and pickup preferences needed to deliver laundry services. Your data is protected using database-level Row Level Security and is never sold to third parties. Customer feedback is private to store management and is not published on public directories.
            </p>
            <button
              onClick={() => setIsPrivacyOpen(false)}
              className="w-full py-2 bg-slate-900 text-white rounded-xl font-bold"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Terms Modal */}
      {isTermsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4 text-xs max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-2 border-b">
              <h3 className="font-bold text-base text-slate-900">Terms of Service</h3>
              <button onClick={() => setIsTermsOpen(false)} className="p-1 hover:bg-slate-100 rounded-full">
                ✕
              </button>
            </div>
            <p className="text-slate-600 leading-relaxed">
              Clothes are charged on a price-per-kilogram basis (currently ₹{pricePerKg}/kg) with a minimum billable weight of {minWeight} kg per pickup. Final billing is determined by measured weight upon intake at our facility. Payment is due upon delivery via Cash or manual UPI. Please check pockets before handover.
            </p>
            <button
              onClick={() => setIsTermsOpen(false)}
              className="w-full py-2 bg-slate-900 text-white rounded-xl font-bold"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
