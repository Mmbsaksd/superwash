import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BusinessSettings, LaundryServiceItem, Order, PublicPromotion, ServiceArea } from '../../types';
import { LaundryService, DEFAULT_SETTINGS } from '../../services/laundryService';
import { useAuth } from '../../context/AuthContext';
import { PwaInstallPrompt } from '../../components/PwaInstallPrompt';
import { CustomerOrderTracker } from '../../components/CustomerOrderTracker';
import {
  Sparkles, Clock, Truck, ShieldCheck, CheckCircle2,
  CalendarCheck, ArrowRight, Scale, Phone, MapPin,
  ChevronDown, HelpCircle, Check, Search, User, Tag,
  ShoppingBag, Menu, X, ArrowUpRight, Zap
} from 'lucide-react';

export const LandingPage: React.FC = () => {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [services, setServices] = useState<LaundryServiceItem[]>([]);
  const [coupons, setCoupons] = useState<PublicPromotion[]>([]);
  const [serviceAreas, setServiceAreas] = useState<ServiceArea[]>([]);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [pincodeInput, setPincodeInput] = useState<string>('');
  const [pincodeResult, setPincodeResult] = useState<{ checked: boolean; serviceable: boolean; message: string } | null>(null);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  useEffect(() => {
    Promise.all([
      LaundryService.getSettings(),
      LaundryService.getServices(false),
      LaundryService.getPublicPromotions(),
      LaundryService.getServiceAreas()
    ]).then(([s, srvList, promoList, areasList]) => {
      setSettings(s);
      setServices(srvList || []);
      setCoupons(promoList || []);
      setServiceAreas(areasList || []);
    });
  }, []);

  // Fetch customer's active order if signed in
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
      const matchedArea = serviceAreas.find((a) => a.pincode === clean && a.is_active);
      const areaLabel = matchedArea ? ` (${matchedArea.area_name})` : '';
      setPincodeResult({
        checked: true,
        serviceable: true,
        message: `Great news! PIN code ${clean}${areaLabel} is in our daily free pickup & delivery zone.`
      });
    } else {
      setPincodeResult({
        checked: true,
        serviceable: false,
        message: `PIN code ${clean} is outside our current scheduled pickup zone. You can contact us or drop off at our facility.`
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
    : (settings && settings.min_weight_kg > 0 ? settings.min_weight_kg.toFixed(0) : '1');
  const minBill = (parseFloat(pricePerKg) * parseFloat(minWeight)).toFixed(0);
  const phone = settings?.business_phone || DEFAULT_SETTINGS.business_phone;
  const address = settings?.business_address || DEFAULT_SETTINGS.business_address;
  const cleanTel = phone.replace(/[^0-9+]/g, '');

  const faqList = [
    {
      q: 'How does per-kilogram laundry pricing work?',
      a: `We weigh your entire laundry batch on calibrated digital scales at our facility. The rate is ₹${pricePerKg}/kg with a minimum billable weight of ${minWeight} kg (minimum charge ₹${minBill}). Pay strictly for what your laundry weighs.`
    },
    {
      q: 'Do I need to count or list individual garments?',
      a: 'No! You do not need to count or list individual garments. Simply put all your clothes into a bag or basket. Our staff will weigh them and wash them in hygienic individual machine drums.'
    },
    {
      q: 'How and when do I pay?',
      a: 'No advance payment is needed to book. We follow a strict Cash on Delivery (COD) policy: Pay at your doorstep after your laundry is weighed on calibrated digital scales.'
    },
    {
      q: 'What is the turnaround time for delivery?',
      a: 'Standard delivery is within 24 to 48 hours. Your clothes are washed, dried, steam-ironed, and neatly packed before being delivered back to your doorstep.'
    },
    {
      q: 'What areas and PIN codes do you cover in Bengaluru?',
      a: 'We cover neighborhoods across Bengaluru. You can use our real-time Service Area Checker above to verify coverage for your specific 6-digit PIN code.'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* PWA Installation Banner */}
      <PwaInstallPrompt variant="customer-banner" />

      {/* ================= A. PUBLIC HEADER ================= */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 sm:h-20">
            {/* Brand Logo */}
            <Link
              to="/"
              className="flex items-center gap-2.5 group cursor-pointer"
              title="SuperWash Exprez"
            >
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-brand-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-brand-500/20 group-hover:scale-105 transition-transform shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="font-black text-xl text-slate-900 tracking-tight flex items-center leading-tight">
                  Super<span className="text-brand-600">Wash</span>
                </span>
                <span className="block text-[10px] uppercase font-bold tracking-widest text-slate-500 -mt-0.5 truncate">
                  Exprez • Bengaluru
                </span>
              </div>
            </Link>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-7 text-sm font-semibold text-slate-700">
              <Link to="/" className="text-brand-600 font-bold transition">Home</Link>
              <a href="#services" className="hover:text-brand-600 transition">Our Services</a>
              <a href="#how-it-works" className="hover:text-brand-600 transition">How It Works</a>
              <a href="#pricing" className="hover:text-brand-600 transition">Pricing</a>
              <a href="#coverage" className="hover:text-brand-600 transition">Coverage</a>
              <a href="#contact" className="hover:text-brand-600 transition">Contact</a>
            </nav>

            {/* Desktop Action & Auth State */}
            <div className="hidden md:flex items-center gap-4">
              {currentUser ? (
                <div className="flex items-center gap-3">
                  <Link
                    to="/customer?tab=current"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-50 text-brand-700 text-xs font-bold hover:bg-brand-100 transition border border-brand-200"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>{currentUser.full_name?.split(' ')[0] || 'My Orders'}</span>
                  </Link>
                  <button
                    onClick={() => logout()}
                    className="text-xs text-slate-500 hover:text-red-600 font-semibold transition cursor-pointer"
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <Link
                  to="/login?redirect=/customer"
                  className="text-sm font-bold text-slate-700 hover:text-brand-600 transition"
                >
                  Sign In
                </Link>
              )}

              <Link
                to="/customer?tab=book"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-cyan-600 text-white text-sm font-bold shadow-md shadow-brand-500/25 hover:from-brand-700 hover:to-cyan-700 active:scale-[0.98] transition"
              >
                <CalendarCheck className="w-4 h-4" />
                <span>Book a Pickup</span>
              </Link>
            </div>

            {/* Mobile Header Trigger & CTA */}
            <div className="flex md:hidden items-center gap-2">
              <Link
                to="/customer?tab=book"
                className="px-3.5 py-1.5 rounded-xl bg-brand-600 text-white text-xs font-bold shadow-sm"
              >
                Book
              </Link>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 text-slate-600 hover:text-slate-900 focus:outline-none cursor-pointer"
                aria-label="Toggle Navigation Menu"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white px-4 pt-3 pb-6 space-y-3 shadow-lg">
            <Link
              to="/"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-slate-800 font-bold"
            >
              Home
            </Link>
            <a
              href="#services"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-slate-700 font-medium"
            >
              Our Services
            </a>
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-slate-700 font-medium"
            >
              How It Works
            </a>
            <a
              href="#pricing"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-slate-700 font-medium"
            >
              Pricing
            </a>
            <a
              href="#coverage"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-slate-700 font-medium"
            >
              Service Coverage
            </a>
            <a
              href="#contact"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-slate-700 font-medium"
            >
              Contact & Store
            </a>

            <div className="pt-3 border-t border-slate-100 space-y-2">
              {currentUser ? (
                <>
                  <Link
                    to="/customer?tab=current"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block w-full py-2.5 text-center bg-brand-50 text-brand-700 font-bold text-sm rounded-xl border border-brand-200"
                  >
                    My Account ({currentUser.full_name?.split(' ')[0] || 'Customer'})
                  </Link>
                  <button
                    onClick={() => { logout(); setMobileMenuOpen(false); }}
                    className="block w-full py-2 text-center text-red-600 font-semibold text-xs"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <Link
                  to="/login?redirect=/customer"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block w-full py-2.5 text-center bg-slate-100 text-slate-800 font-bold text-sm rounded-xl"
                >
                  Sign In / Register
                </Link>
              )}

              <Link
                to="/customer?tab=book"
                onClick={() => setMobileMenuOpen(false)}
                className="block w-full py-3 text-center bg-brand-600 text-white font-bold text-sm rounded-xl shadow-md"
              >
                Book a Home Pickup
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* ================= MAIN CONTENT ================= */}
      <main className="flex-1 space-y-16 sm:space-y-24 pb-16">
        {/* ================= B. HERO SECTION ================= */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-10">
          {/* Active Order Tracker Banner (when customer is logged in with active wash) */}
          {activeOrder && (
            <div className="mb-8 animate-fade-in">
              <CustomerOrderTracker
                order={activeOrder}
                variant="compact"
                onViewDetails={() => navigate('/customer?tab=current')}
              />
            </div>
          )}

          <div className="bg-gradient-to-b from-brand-50/80 via-white to-slate-50 border border-slate-200/90 rounded-3xl p-6 sm:p-12 shadow-sm">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
              <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-100 text-brand-800 text-xs font-bold border border-brand-200">
                  <Sparkles className="w-4 h-4 text-brand-600" />
                  <span>Professional Laundry Pickup & Delivery in Bengaluru</span>
                </div>

                <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-[1.12]">
                  Fresh Clothes.{' '}
                  <span className="bg-gradient-to-r from-brand-600 to-cyan-500 bg-clip-text text-transparent">
                    Professional Care.
                  </span><br />
                  Delivered to Your Doorstep.
                </h1>

                <p className="text-sm sm:text-base text-slate-600 max-w-xl leading-relaxed">
                  Book your laundry pickup from home. We collect, clean, care for and deliver your clothes conveniently across Bengaluru at transparent per-kilogram rates.
                </p>

                {/* Primary & Secondary CTAs */}
                <div className="pt-2 flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
                  <Link
                    to="/customer?tab=book"
                    className="w-full sm:w-auto py-3.5 px-8 bg-brand-600 hover:bg-brand-700 active:scale-[0.99] text-white font-black text-base rounded-2xl shadow-lg shadow-brand-500/25 transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <CalendarCheck className="w-5 h-5" />
                    <span>Book a Pickup</span>
                  </Link>

                  <a
                    href="#services"
                    className="w-full sm:w-auto py-3.5 px-6 bg-white hover:bg-slate-100 text-slate-700 font-bold text-sm rounded-2xl border border-slate-200 shadow-xs transition flex items-center justify-center gap-1.5"
                  >
                    <span>Explore Services</span>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                  </a>
                </div>

                {/* Reassurance Value Badges */}
                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 pt-3 text-xs text-slate-600 font-semibold">
                  <div className="flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Free Doorstep Pickup</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Calibrated Digital Scales</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Cash on Delivery</span>
                  </div>
                </div>
              </div>

              {/* Hero Showcase Card */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-md space-y-5">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Standard Laundry Rate
                    </span>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      Calibrated Scale Pricing
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black text-slate-900">₹{pricePerKg}</span>
                      <span className="text-sm font-semibold text-slate-500">/ kilogram</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Minimum billable weight: <strong>{minWeight} kg</strong> (₹{minBill} minimum charge). Final bill based on actual measured weight.
                    </p>
                  </div>

                  <div className="p-4 bg-brand-50/70 rounded-2xl border border-brand-100 space-y-2 text-xs text-brand-950">
                    <div className="flex items-center gap-2 font-bold">
                      <Scale className="w-4 h-4 text-brand-600 shrink-0" />
                      <span>Transparent Doorstep Payment</span>
                    </div>
                    <p className="text-[11px] text-brand-800 leading-relaxed">
                      Pay at your doorstep after your laundry is weighed. No upfront estimation guesswork or premature online payments.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-left">
                      <Truck className="w-4 h-4 text-brand-600 mb-1" />
                      <span className="font-bold text-slate-900 text-xs block">24-48h Delivery</span>
                      <span className="text-[10px] text-slate-500">Cleaned & folded</span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-left">
                      <ShieldCheck className="w-4 h-4 text-brand-600 mb-1" />
                      <span className="font-bold text-slate-900 text-xs block">Private Batches</span>
                      <span className="text-[10px] text-slate-500">Hygienic individual wash</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= C. SUPPORTED SERVICES ================= */}
        <section id="services" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 scroll-mt-24">
          <div className="text-center max-w-2xl mx-auto mb-10 space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-600">
              Supported Laundry Services
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Our Professional Laundry Services
            </h2>
            <p className="text-xs sm:text-sm text-slate-600">
              Authentic fabric care handled with skin-friendly detergents and professional equipment in Bengaluru.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {services.map((srv) => {
              const priceNum = ((srv.unit_price_paise || srv.price_paise || 7900) / 100).toFixed(0);
              const unitLabel = srv.pricing_unit === 'per_kg' ? 'kg' : srv.pricing_unit.replace('per_', '');

              return (
                <div
                  key={srv.id}
                  className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between space-y-4 hover:border-brand-400 hover:shadow-md transition"
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
                      to={`/customer?tab=book&service=${srv.id}`}
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

        {/* ================= D. HOW IT WORKS ================= */}
        <section id="how-it-works" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 scroll-mt-24">
          <div className="text-center max-w-2xl mx-auto mb-10 space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-600">
              Three Simple Steps
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              How SuperWash Works
            </h2>
            <p className="text-xs sm:text-sm text-slate-600">
              Convenient doorstep laundry in three easy, transparent stages.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs relative space-y-4 hover:shadow-md transition">
              <span className="text-4xl font-black text-slate-100 absolute top-4 right-5 select-none">
                01
              </span>
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-brand-600 flex items-center justify-center">
                <CalendarCheck className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-900 text-lg">1. Book your pickup</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Choose your preferred pickup date, 3-hour time slot, and enter your Bengaluru address online. No advance payment required.
              </p>
            </div>

            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs relative space-y-4 hover:shadow-md transition">
              <span className="text-4xl font-black text-slate-100 absolute top-4 right-5 select-none">
                02
              </span>
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Truck className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-900 text-lg">2. We collect and process your laundry</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Our delivery associate collects your laundry. At our facility, clothes are weighed on calibrated digital scales and cleaned in hygienic individual drums.
              </p>
            </div>

            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs relative space-y-4 hover:shadow-md transition">
              <span className="text-4xl font-black text-slate-100 absolute top-4 right-5 select-none">
                03
              </span>
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-900 text-lg">3. Receive your cleaned clothes at your doorstep</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Fresh, neatly folded and crisp garments returned to your home. Pay at your doorstep after your laundry is weighed.
              </p>
            </div>
          </div>
        </section>

        {/* ================= E. PRICING ================= */}
        <section id="pricing" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 scroll-mt-24">
          <div className="bg-white rounded-3xl p-6 sm:p-10 border border-slate-200 shadow-md space-y-8">
            <div className="text-center max-w-xl mx-auto space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-600">
                Transparent Per-Kg Pricing
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Simple, Honest Rates
              </h2>
              <p className="text-xs sm:text-sm text-slate-600">
                Pay strictly by actual measured weight. No hidden fees, no individual garment counting.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  Authoritative Rate
                </span>
                <span className="text-3xl font-black text-slate-900 block">₹{pricePerKg} <span className="text-sm font-normal text-slate-500">/ kg</span></span>
                <p className="text-[11px] text-slate-500">Standard Wash & Fold</p>
              </div>

              <div className="p-5 rounded-2xl bg-brand-50/80 border border-brand-200 text-center space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-brand-700 block">
                  Minimum Billable Weight
                </span>
                <span className="text-3xl font-black text-brand-900 block">{minWeight} kg</span>
                <p className="text-[11px] text-brand-700 font-semibold">Minimum charge: ₹{minBill}</p>
              </div>

              <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 block">
                  Payment Mode
                </span>
                <span className="text-xl font-black text-emerald-900 block mt-1">Cash on Delivery</span>
                <p className="text-[11px] text-emerald-700 font-medium">Pay at your doorstep after weighing</p>
              </div>
            </div>

            {/* Illustrative Weight Examples */}
            <div className="border-t border-slate-100 pt-6">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-4 text-center sm:text-left">
                Common Weight Estimates
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center">
                  <div>
                    <span className="font-bold text-slate-800 block">1 kg (Minimum)</span>
                    <span className="text-[10px] text-slate-500">~4 to 5 casual t-shirts</span>
                  </div>
                  <span className="font-black text-slate-900 text-sm">₹{minBill}</span>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center">
                  <div>
                    <span className="font-bold text-slate-800 block">3 kg (Individual)</span>
                    <span className="text-[10px] text-slate-500">Weekly casual wardrobe</span>
                  </div>
                  <span className="font-black text-slate-900 text-sm">₹{(parseFloat(pricePerKg) * 3).toFixed(0)}</span>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center">
                  <div>
                    <span className="font-bold text-slate-800 block">5 kg (Family Batch)</span>
                    <span className="text-[10px] text-slate-500">Multi-person laundry</span>
                  </div>
                  <span className="font-black text-slate-900 text-sm">₹{(parseFloat(pricePerKg) * 5).toFixed(0)}</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 text-center sm:text-left mt-3">
                * Final bill is determined strictly from calibrated digital scales when your clothes arrive at our facility.
              </p>
            </div>
          </div>
        </section>

        {/* ================= F. PROMOTIONS & OFFERS ================= */}
        {coupons.length > 0 && (
          <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-gradient-to-r from-slate-900 via-brand-950 to-indigo-950 text-white rounded-3xl p-6 sm:p-10 shadow-xl space-y-6">
              <div className="max-w-xl space-y-2">
                <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" />
                  Eligible Promotional Coupons
                </span>
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
                  Discounts on Your Next Laundry Pickup
                </h2>
                <p className="text-xs sm:text-sm text-slate-300">
                  Select and apply an approved coupon when booking your pickup. Discount is automatically calculated on your verified measured bill!
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {coupons.map((coupon) => (
                  <div
                    key={coupon.code}
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
                        {coupon.min_order_paise ? `Min. bill ₹${(coupon.min_order_paise / 100).toFixed(0)}` : 'No minimum bill'}
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

        {/* ================= G. SERVICE AVAILABILITY CHECKER ================= */}
        <section id="coverage" className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 scroll-mt-24">
          <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-10 shadow-xl space-y-6">
            <div className="max-w-xl space-y-2">
              <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-widest">
                Service Area Coverage
              </span>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
                Check Service Availability in Bengaluru
              </h2>
              <p className="text-xs sm:text-sm text-slate-300">
                We provide scheduled doorstep pickup and delivery across Bengaluru. Enter your 6-digit PIN code to check instant coverage.
              </p>
            </div>

            <form onSubmit={handleCheckPincode} className="flex flex-col sm:flex-row gap-2 max-w-md">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  maxLength={6}
                  placeholder="Enter 6-digit PIN code (e.g. 560034)"
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

            {/* Dynamic Active Service Areas Display */}
            {serviceAreas.length > 0 && (
              <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex flex-wrap gap-2 items-center">
                <span className="font-semibold text-slate-300">Active Service Zones:</span>
                {serviceAreas.filter((a) => a.is_active).map((area, idx, arr) => (
                  <React.Fragment key={area.pincode}>
                    <span className="text-slate-300">{area.area_name} ({area.pincode})</span>
                    {idx < arr.length - 1 && <span>•</span>}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ================= H. FREQUENTLY ASKED QUESTIONS ================= */}
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

        {/* ================= I. TRUST & CONTACT ================= */}
        <section id="contact" className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 scroll-mt-24">
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="space-y-3 text-xs">
              <span className="text-[10px] uppercase font-bold text-brand-600 tracking-wider">
                Visit or Contact
              </span>
              <h2 className="text-2xl font-black text-slate-900 leading-tight">
                SuperWash Exprez
              </h2>
              <p className="text-slate-600">
                You are welcome to drop off clothes directly at our facility counter or call us for any questions.
              </p>

              <div className="space-y-2.5 pt-2">
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
                    href={`tel:${cleanTel}`}
                    className="hover:text-brand-600 transition font-medium text-slate-900"
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
                Schedule your doorstep home pickup now in under 60 seconds.
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

      {/* ================= J. FOOTER ================= */}
      <footer className="border-t border-slate-200 bg-white py-10 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <Link
              to="/"
              className="flex items-center gap-2 group cursor-pointer"
              title="SuperWash Exprez Home"
            >
              <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-brand-600 to-cyan-500 flex items-center justify-center text-white shadow-xs">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <span className="font-black text-base text-slate-900 tracking-tight">
                Super<span className="text-brand-600">Wash</span> Exprez
              </span>
            </Link>

            <div className="flex flex-wrap justify-center gap-6 text-xs text-slate-600 font-semibold">
              <a href="#services" className="hover:text-brand-600">Services</a>
              <a href="#how-it-works" className="hover:text-brand-600">How It Works</a>
              <a href="#pricing" className="hover:text-brand-600">Pricing</a>
              <a href="#coverage" className="hover:text-brand-600">Coverage</a>
              <a href="#contact" className="hover:text-brand-600">Contact</a>
              <Link to="/privacy" className="hover:text-brand-600">Privacy Policy</Link>
              <Link to="/terms" className="hover:text-brand-600">Terms of Service</Link>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-6 flex flex-col sm:flex-row justify-between items-center text-[11px] text-slate-400 gap-2">
            <p>© 2026 SuperWash Exprez. All rights reserved. • Bengaluru, Karnataka</p>
            <p>Pay at your doorstep after your laundry is weighed (Cash on Delivery).</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
