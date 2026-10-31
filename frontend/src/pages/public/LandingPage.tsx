import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BusinessSettings, LaundryServiceItem, Order, Coupon } from '../../types';
import { LaundryService, DEFAULT_SETTINGS } from '../../services/laundryService';
import { useAuth } from '../../context/AuthContext';
import { PwaInstallPrompt } from '../../components/PwaInstallPrompt';
import { PromotionalCarousel } from '../../components/PromotionalCarousel';
import { CustomerOrderTracker } from '../../components/CustomerOrderTracker';
import { CustomerBottomNav } from '../../components/CustomerBottomNav';
import { CustomerTopNav } from '../../components/CustomerTopNav';
import {
  Sparkles, Clock, Truck, ShieldCheck, CheckCircle2,
  CalendarCheck, ArrowRight, Scale, Phone, MapPin,
  ChevronDown, HelpCircle, Check, Search, Lock,
  ShoppingBag, User, Tag, Sparkle, Package, Shield
} from 'lucide-react';

export const LandingPage: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [services, setServices] = useState<LaundryServiceItem[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [pincodeInput, setPincodeInput] = useState<string>('');
  const [pincodeResult, setPincodeResult] = useState<{ checked: boolean; serviceable: boolean; message: string } | null>(null);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      LaundryService.getSettings(),
      LaundryService.getServices(false),
      LaundryService.getCoupons(false)
    ]).then(([s, srvList, couponList]) => {
      setSettings(s);
      setServices(srvList || []);
      setCoupons(couponList || []);
    });
  }, []);

  // Fetch customer's current order if signed in
  useEffect(() => {
    if (!currentUser) {
      setActiveOrder(null);
      return;
    }
    LaundryService.getCustomerOrders(currentUser.id, currentUser.phone).then((orders) => {
      const active = orders.find((o) => o.order_status !== 'delivered' && o.order_status !== 'cancelled') || null;
      setActiveOrder(active);
    }).catch(() => {
      setActiveOrder(null);
    });
  }, [currentUser]);

  const handleCheckPincode = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = pincodeInput.trim();
    if (!clean || clean.length < 6) {
      setPincodeResult({
        checked: true,
        serviceable: false,
        message: 'Please enter a valid 6-digit Indian PIN code to check coverage.'
      });
      return;
    }
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

  // Authoritative price derivation: read primary per-kg service from catalogue, fallback to settings
  const primaryPerKgService = services.find((s) => s.pricing_unit === 'per_kg' && s.is_active) || services[0];
  const pricePerKg = primaryPerKgService
    ? (((primaryPerKgService.unit_price_paise || primaryPerKgService.price_paise || 7900) / 100)).toFixed(0)
    : (settings ? (settings.price_per_kg_paise / 100).toFixed(0) : '79');
  const minWeight = primaryPerKgService && primaryPerKgService.min_weight_kg > 0
    ? primaryPerKgService.min_weight_kg.toFixed(0)
    : (settings ? settings.min_weight_kg.toFixed(0) : '3');
  const minBill = ((parseFloat(pricePerKg) * parseFloat(minWeight))).toFixed(0);
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
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-28 sm:pb-24 md:pb-12">
      {/* PWA Installation Banner */}
      <PwaInstallPrompt variant="customer-banner" />

      {/* Customer Top Navigation (Desktop & Mobile Header) */}
      <CustomerTopNav
        settings={settings}
        hasActiveOrder={Boolean(activeOrder)}
      />

      {/* Main Landing Content */}
      <main className="flex-1 space-y-12 sm:space-y-16 pb-12">
        {/* ================= 1. PROMOTIONAL CAROUSEL & HERO ================= */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8">
          <PromotionalCarousel
            onSelectOffer={(code) => navigate(`/customer?tab=book&coupon=${code}`)}
            className="mb-8"
          />

          {/* Customer's Live Order Tracker Banner (when an active order exists) */}
          {activeOrder && (
            <div className="mb-8 animate-fade-in">
              <CustomerOrderTracker
                order={activeOrder}
                variant="compact"
                onViewDetails={() => navigate('/customer?tab=current')}
              />
            </div>
          )}

          {/* Primary Call-to-Action Hero Box */}
          <div className="bg-gradient-to-b from-brand-50/70 via-white to-slate-50 border border-slate-200/80 rounded-3xl p-6 sm:p-10 shadow-sm">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-5 text-center lg:text-left">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-100 text-brand-800 text-xs font-bold border border-brand-200 shadow-xs">
                  <Sparkles className="w-4 h-4 text-brand-600" />
                  <span>Simple Per-Kilogram Laundry • No Garment Counting</span>
                </div>

                <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-[1.12]">
                  Fresh Clothes, <br className="hidden sm:inline" />
                  <span className="bg-gradient-to-r from-brand-600 to-cyan-500 bg-clip-text text-transparent">
                    Zero Effort.
                  </span>
                </h1>

                <p className="text-sm sm:text-base text-slate-600 max-w-xl leading-relaxed">
                  Home laundry pickup and delivery at just <strong>₹{pricePerKg} per kilogram</strong>. We pick up from your doorstep, weigh on certified digital scales, wash with skin-friendly detergents, and return clean & crisp.
                </p>

                {/* Prominent Primary CTA Button */}
                <div className="pt-2 flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
                  <Link
                    to="/customer?tab=book"
                    className="w-full sm:w-auto py-3.5 px-8 bg-brand-600 hover:bg-brand-700 active:scale-[0.99] text-white font-black text-base rounded-2xl shadow-lg shadow-brand-500/25 transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <CalendarCheck className="w-5 h-5" />
                    <span>Book a Home Pickup</span>
                  </Link>

                  <div className="text-left bg-white px-4 py-2.5 rounded-2xl border border-slate-200 shadow-xs">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                      Authoritative Rate
                    </span>
                    <span className="text-base font-black text-slate-900">
                      ₹{pricePerKg} / kg <span className="text-xs font-normal text-slate-500">(Min. {minWeight} kg = ₹{minBill})</span>
                    </span>
                  </div>
                </div>

                {/* Key feature pills */}
                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 pt-2 text-xs text-slate-600 font-semibold">
                  <div className="flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Free Home Pickup</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Pay Cash or UPI on Delivery</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Live 6-Stage Tracking</span>
                  </div>
                </div>
              </div>

              {/* Quick Hub Access Card */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-md space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Customer Quick Access
                    </span>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      Indiranagar Hub
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Link
                      to={currentUser ? '/customer?tab=current' : '/login?redirect=/customer?tab=current'}
                      className="p-3.5 rounded-2xl bg-slate-50 hover:bg-brand-50 border border-slate-200 hover:border-brand-300 transition group text-left"
                    >
                      <ShoppingBag className="w-5 h-5 text-brand-600 mb-2 group-hover:scale-110 transition-transform" />
                      <span className="font-bold text-slate-900 text-xs block">My Orders</span>
                      <span className="text-[11px] text-slate-500">Track current & past washes</span>
                    </Link>

                    <Link
                      to={currentUser ? '/customer?tab=addresses' : '/login?redirect=/customer?tab=addresses'}
                      className="p-3.5 rounded-2xl bg-slate-50 hover:bg-brand-50 border border-slate-200 hover:border-brand-300 transition group text-left"
                    >
                      <User className="w-5 h-5 text-brand-600 mb-2 group-hover:scale-110 transition-transform" />
                      <span className="font-bold text-slate-900 text-xs block">My Profile</span>
                      <span className="text-[11px] text-slate-500">Addresses & mobile info</span>
                    </Link>
                  </div>

                  <div className="p-3.5 bg-brand-50/80 rounded-2xl border border-brand-100 text-xs text-brand-900 space-y-1">
                    <span className="font-bold block flex items-center gap-1.5">
                      <Scale className="w-4 h-4 text-brand-600" />
                      Honest Scale Weighing
                    </span>
                    <p className="text-[11px] text-brand-800 leading-snug">
                      No upfront estimation errors. Your clothes are weighed on calibrated scales at our Indiranagar facility; pay only for actual kilograms!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= 2. VISUAL HOW IT WORKS SECTION ================= */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10 space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-600">
              Effortless Doorstep Process
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              How SuperWash Works
            </h2>
            <p className="text-xs sm:text-sm text-slate-600">
              From doorstep collection to clean delivery in 4 transparent stages.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                step: '01',
                title: 'Book Home Pickup',
                desc: 'Select your preferred 3-hour pickup window and provide your doorstep address.',
                icon: CalendarCheck,
                color: 'bg-blue-50 text-blue-600'
              },
              {
                step: '02',
                title: 'Clothes Collected',
                desc: 'Our delivery associate arrives at your doorstep to safely collect your laundry batch.',
                icon: Truck,
                color: 'bg-indigo-50 text-indigo-600'
              },
              {
                step: '03',
                title: 'Weighed & Washed',
                desc: 'Clothes are digitally weighed and washed in private machine batches with gentle detergent.',
                icon: Scale,
                color: 'bg-purple-50 text-purple-600'
              },
              {
                step: '04',
                title: 'Returned & Paid',
                desc: 'Neatly steam-ironed and packaged clothes returned to your door. Pay Cash or UPI on delivery.',
                icon: CheckCircle2,
                color: 'bg-emerald-50 text-emerald-600'
              }
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.step}
                  className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs relative space-y-3 hover:shadow-md transition-shadow"
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

        {/* ================= 3. REAL SERVICE CATALOGUE & PRICING ================= */}
        <section id="services" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10 space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-600">
              Verified Service Catalogue
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Laundry Services & Transparent Pricing
            </h2>
            <p className="text-xs sm:text-sm text-slate-600">
              Configured rates from our official Bangalore facility. No surprise fees.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {services.map((srv) => {
              const priceNum = ((srv.unit_price_paise || srv.price_paise || 7900) / 100).toFixed(0);
              const unitLabel = srv.pricing_unit === 'per_kg' ? 'kg' : srv.pricing_unit.replace('per_', '');

              return (
                <div
                  key={srv.id}
                  className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between space-y-4 hover:border-brand-400 transition"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-brand-50 text-brand-700 border border-brand-200">
                        {srv.pricing_unit.replace('_', ' ')}
                      </span>
                      {srv.pricing_unit === 'per_kg' && (
                        <span className="text-[10px] font-bold text-slate-500">
                          Min. {srv.min_weight_kg || 1} kg
                        </span>
                      )}
                    </div>

                    <h3 className="font-black text-slate-900 text-lg leading-tight">
                      {srv.name}
                    </h3>

                    <p className="text-xs text-slate-600 leading-relaxed">
                      {srv.description}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Rate</span>
                      <span className="text-xl font-black text-slate-900">
                        ₹{priceNum} <span className="text-xs font-medium text-slate-500">/ {unitLabel}</span>
                      </span>
                    </div>

                    <Link
                      to="/customer?tab=book"
                      className="py-2 px-3.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1"
                    >
                      <span>Book</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ================= 4. PROMOTIONS & OFFERS SECTION ================= */}
        {coupons.length > 0 && (
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-gradient-to-r from-brand-900 to-indigo-950 text-white rounded-3xl p-6 sm:p-10 shadow-xl space-y-6">
              <div className="max-w-xl space-y-2">
                <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" />
                  Eligible Promotional Coupons
                </span>
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
                  Save on Your Next Laundry Schedule
                </h2>
                <p className="text-xs sm:text-sm text-slate-300">
                  Apply approved discount coupons during pickup booking. Discounts apply automatically on bill calculation!
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {coupons.map((coupon) => (
                  <div
                    key={coupon.id}
                    className="p-5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 flex flex-col justify-between space-y-3"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-400 text-slate-950 font-mono font-black text-xs tracking-wider">
                          {coupon.code}
                        </span>
                        <span className="text-[11px] text-cyan-200 font-semibold">
                          {coupon.discount_type === 'percentage'
                            ? `${coupon.discount_value}% OFF (Up to ₹${((coupon.max_discount_paise || 10000) / 100).toFixed(0)})`
                            : `Flat ₹${(coupon.discount_value / 100).toFixed(0)} OFF`}
                        </span>
                      </div>
                      <p className="text-xs text-slate-200 mt-2">
                        {coupon.description}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">
                        {coupon.min_order_paise ? `Min. spend ₹${(coupon.min_order_paise / 100).toFixed(0)}` : 'No minimum spend'}
                      </span>
                      <button
                        type="button"
                        onClick={() => navigate(`/customer?tab=book&coupon=${coupon.code}`)}
                        className="py-1.5 px-3 bg-white text-brand-900 font-bold rounded-xl hover:bg-slate-100 transition cursor-pointer"
                      >
                        Book with this Offer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ================= 5. SERVICE AREA CHECKER ================= */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-10 shadow-xl space-y-6">
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
                className="py-2.5 px-5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs rounded-xl shadow-md transition cursor-pointer"
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

        {/* ================= 6. FREQUENTLY ASKED QUESTIONS ================= */}
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
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs transition"
                >
                  <button
                    onClick={() => setActiveFaq(isOpen ? null : idx)}
                    className="w-full p-4 text-left flex justify-between items-center gap-4 hover:bg-slate-50 transition cursor-pointer"
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

        {/* ================= 7. CONTACT & STORE LOCATION ================= */}
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
                  <a
                    href={`tel:${phone.replace(/[^0-9+]/g, '')}`}
                    className="hover:text-brand-600 transition font-medium"
                  >
                    {phone}
                  </a>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 text-center space-y-3">
              <CalendarCheck className="w-8 h-8 text-brand-600 mx-auto" />
              <h3 className="font-bold text-slate-900 text-base">Ready for Fresh Clothes?</h3>
              <p className="text-xs text-slate-500">
                Schedule your home pickup now in under 60 seconds.
              </p>
              <Link
                to="/customer?tab=book"
                className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-1.5"
              >
                <span>Book a Home Pickup</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-8 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 space-y-2">
          <p>© 2026 SuperWash Exprez. All rights reserved. • Bengaluru, Karnataka</p>
          <div className="flex justify-center gap-4 text-[11px] text-slate-400">
            <Link to="/privacy" className="hover:text-slate-600">Privacy Policy</Link>
            <span>•</span>
            <Link to="/terms" className="hover:text-slate-600">Terms of Service</Link>
            <span>•</span>
            <Link to="/contact" className="hover:text-slate-600">Contact Support</Link>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Navigation */}
      <CustomerBottomNav
        activeTab="home"
        hasActiveOrder={Boolean(activeOrder)}
      />
    </div>
  );
};

export default LandingPage;
