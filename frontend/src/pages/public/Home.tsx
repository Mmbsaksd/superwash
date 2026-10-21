import React from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles, Clock, Truck, ShieldCheck, CheckCircle2,
  CalendarCheck, ArrowRight, Star, Shirt, Layers, Crown, MapPin, Zap
} from 'lucide-react';

export const Home: React.FC = () => {
  return (
    <div className="space-y-16 sm:space-y-24 pb-16">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50/80 via-white to-slate-50 pt-12 pb-16 lg:pt-20 lg:pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-100 text-brand-800 text-xs font-bold border border-brand-200 shadow-sm">
                <Sparkles className="w-4 h-4 text-brand-600" />
                Bengaluru's Most Trusted Laundry & Dry Cleaning
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-[1.15]">
                Crisp Clothes, <br className="hidden sm:inline" />
                <span className="bg-gradient-to-r from-brand-600 to-cyan-500 bg-clip-text text-transparent">
                  Zero Hassle.
                </span>
              </h1>

              <p className="text-base sm:text-lg text-slate-600 max-w-2xl leading-relaxed">
                Enjoy immaculate fabric care with premium eco-friendly detergents and vacuum steam press. Choose <strong>doorstep pickup & delivery</strong> or <strong>counter drop-off</strong> at our Indiranagar store.
              </p>

              {/* 3 Channels Pill Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-left">
                <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-blue-50 text-blue-600 shrink-0">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">1. Shop Drop-Off</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">Visit our counter for rapid handover</p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
                    <Truck className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">2. Home Pickup</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">Select a 3-hour pickup window</p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">3. Doorstep Delivery</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">Freshly packed & delivered to door</p>
                  </div>
                </div>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-4">
                <Link
                  to="/book"
                  className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-brand-600 to-cyan-600 hover:from-brand-700 hover:to-cyan-700 text-white font-bold text-base shadow-lg shadow-brand-500/25 transition flex items-center justify-center gap-2 transform hover:-translate-y-0.5"
                >
                  <CalendarCheck className="w-5 h-5" /> Book Service Now
                </Link>

                <Link
                  to="/services"
                  className="w-full sm:w-auto px-6 py-4 rounded-xl bg-white hover:bg-slate-50 text-slate-800 font-bold text-base border border-slate-300 transition flex items-center justify-center gap-2"
                >
                  View Price Menu <ArrowRight className="w-4 h-4 text-slate-500" />
                </Link>
              </div>

              {/* Trust badges */}
              <div className="flex items-center justify-center lg:justify-start gap-6 pt-4 text-xs font-semibold text-slate-500">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" /> 100% Color Protection
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-brand-600" /> 24-48h Express Delivery
                </span>
                <span className="flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-amber-500" /> Vacuum Steam Iron
                </span>
              </div>
            </div>

            {/* Hero Right Teaser Card */}
            <div className="lg:col-span-5">
              <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-200 relative">
                <div className="absolute -top-3 -right-3 px-3 py-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[11px] font-bold rounded-full shadow-md uppercase tracking-wider">
                  20% Off 1st Order
                </div>

                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-brand-600" /> Quick Price Calculator
                </h3>

                <div className="space-y-3 text-xs mb-6 divide-y divide-slate-100">
                  <div className="flex justify-between items-center pt-2">
                    <span className="font-medium text-slate-700">Shirt / Kurta (Wash & Fold)</span>
                    <span className="font-mono font-bold text-slate-900">₹30 / piece</span>
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <span className="font-medium text-slate-700">Trouser / Jeans Washing</span>
                    <span className="font-mono font-bold text-slate-900">₹40 / piece</span>
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <span className="font-medium text-slate-700">Suit (2-Piece) Dry Cleaning</span>
                    <span className="font-mono font-bold text-brand-600">₹300 / piece</span>
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <span className="font-medium text-slate-700">Silk Saree Dry Cleaning</span>
                    <span className="font-mono font-bold text-brand-600">₹200 / piece</span>
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <span className="font-medium text-slate-700">Double Blanket Cleaning</span>
                    <span className="font-mono font-bold text-slate-900">₹250 / item</span>
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <span className="font-medium text-slate-700">Steam Ironing (Wrinkle-Free)</span>
                    <span className="font-mono font-bold text-emerald-600">₹15 / piece</span>
                  </div>
                </div>

                <div className="p-3.5 bg-brand-50 rounded-xl border border-brand-100 text-xs text-brand-800 space-y-1 mb-6">
                  <div className="font-bold flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" /> Promo Code: WELCOME20
                  </div>
                  <p className="text-[11px] text-brand-700">Use promo code at checkout for 20% instant discount on your laundry.</p>
                </div>

                <Link
                  to="/book"
                  className="block w-full py-3 text-center bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-sm"
                >
                  Start Booking Online
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold uppercase tracking-wider text-brand-600">Complete Garment Care</span>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight mt-1">Our Core Laundry Services</h2>
          <p className="text-slate-600 text-sm mt-2">
            Every garment receives personalized inspection, sorting by fabric type, and tailored wash-dry-press treatment.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-brand-600 flex items-center justify-center mb-4">
              <Shirt className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Wash & Fold</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4 leading-relaxed">
              Everyday t-shirts, shorts, track pants, and undergarments. Washed with skin-friendly detergent, tumble dried, and folded neatly.
            </p>
            <div className="text-xs font-bold text-slate-900 font-mono">From ₹25 / piece or ₹79 / KG</div>
          </div>

          {/* Card 2 */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Wash & Steam Iron</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4 leading-relaxed">
              Formal shirts, cotton trousers, kurtas, and dresses. Deep washed with stain pre-treatment, followed by crisp vacuum steam pressing.
            </p>
            <div className="text-xs font-bold text-slate-900 font-mono">From ₹45 / piece</div>
          </div>

          {/* Card 3 */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition">
            <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-4">
              <Crown className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Expert Dry Cleaning</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4 leading-relaxed">
              Solvent care for designer suits, blazers, silk sarees, lehengas, and heavy jackets. Preserves delicate textures and embellishments.
            </p>
            <div className="text-xs font-bold text-slate-900 font-mono">Suits from ₹300 | Sarees ₹200</div>
          </div>

          {/* Card 4 */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-4">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Steam Pressing Only</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4 leading-relaxed">
              Wrinkle-free vacuum steam pressing on imported Italian press tables. Ensures razor-sharp creases without burning fabric.
            </p>
            <div className="text-xs font-bold text-slate-900 font-mono">From ₹15 / piece</div>
          </div>

          {/* Card 5 */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition">
            <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center mb-4">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Blankets & Duvets</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4 leading-relaxed">
              High-capacity commercial drum sanitization for heavy winter quilts, comforters, and woollen blankets. Dust-mite free.
            </p>
            <div className="text-xs font-bold text-slate-900 font-mono">From ₹150 / item</div>
          </div>

          {/* Card 6 */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Bedsheets & Curtains</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4 leading-relaxed">
              Home linen renewal with allergen extraction and crisp folding. Window and door curtains processed with care.
            </p>
            <div className="text-xs font-bold text-slate-900 font-mono">Bedsheets from ₹50 / item</div>
          </div>
        </div>
      </section>

      {/* Process Workflow Steps */}
      <section className="bg-slate-900 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-xs font-bold uppercase tracking-widest text-brand-400">Step-by-Step Transparency</span>
            <h2 className="text-3xl font-black tracking-tight mt-1">How SuperWash Operates</h2>
            <p className="text-slate-400 text-sm mt-2">
              Follow every stage of your order in real-time from clothes collection to final delivery.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="p-6 rounded-2xl bg-slate-800/80 border border-slate-700/60 relative">
              <span className="text-3xl font-black text-brand-500/30 absolute top-4 right-4">01</span>
              <h4 className="font-bold text-base text-white">Book or Drop-Off</h4>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Schedule a 3-hour doorstep pickup or drop off clothes directly at our Indiranagar store counter.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-800/80 border border-slate-700/60 relative">
              <span className="text-3xl font-black text-brand-500/30 absolute top-4 right-4">02</span>
              <h4 className="font-bold text-base text-white">Inspection & Tagging</h4>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Garments are counted, inspected for stains or damage, tagged with barcode stickers, and verified against customer instructions.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-800/80 border border-slate-700/60 relative">
              <span className="text-3xl font-black text-brand-500/30 absolute top-4 right-4">03</span>
              <h4 className="font-bold text-base text-white">Custom Washing & Press</h4>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Separate washes by fabric weight and color, gentle tumbling, and high-pressure steam ironing on vacuum tables.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-800/80 border border-slate-700/60 relative">
              <span className="text-3xl font-black text-brand-500/30 absolute top-4 right-4">04</span>
              <h4 className="font-bold text-base text-white">Delivered or Ready</h4>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Double quality-checked, neatly packaged in protective garment bags, and delivered to your doorstep or ready for shop pickup.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Bottom Banner */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl bg-gradient-to-r from-brand-600 via-brand-700 to-cyan-700 p-8 sm:p-12 text-white flex flex-col md:flex-row items-center justify-between gap-8 shadow-xl">
          <div className="space-y-2 text-center md:text-left">
            <h3 className="text-2xl sm:text-3xl font-black tracking-tight">Ready for fresh, pristine clothes?</h3>
            <p className="text-brand-100 text-sm max-w-xl">
              Book online in under 2 minutes. Free home pickup & delivery available across Bengaluru.
            </p>
          </div>
          <Link
            to="/book"
            className="px-8 py-3.5 bg-white text-brand-700 hover:bg-brand-50 rounded-xl font-bold text-sm shadow-md transition whitespace-nowrap transform hover:scale-105"
          >
            Book Your Laundry Now
          </Link>
        </div>
      </section>
    </div>
  );
};
