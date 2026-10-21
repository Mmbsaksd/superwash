import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient } from '../../api/client';
import { Sparkles, Loader2, ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Service } from '../../types';

export const ServicesPage: React.FC = () => {
  const { data: services, isLoading } = useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: async () => {
      const res = await apiClient.getServices();
      return res.data;
    },
  });

  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = [
    { id: 'all', label: 'All Services' },
    { id: 'wash_fold', label: 'Wash & Fold' },
    { id: 'wash_iron', label: 'Wash & Iron' },
    { id: 'dry_clean', label: 'Dry Cleaning' },
    { id: 'ironing', label: 'Steam Press' },
    { id: 'blankets', label: 'Blankets & Quilts' },
    { id: 'curtains', label: 'Bedsheets & Curtains' },
  ];

  const filteredServices = services?.filter(
    (s) => selectedCategory === 'all' || s.category === selectedCategory
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <span className="text-xs font-bold uppercase tracking-widest text-brand-600">Transparent Indian Pricing</span>
        <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">Services & Pricing Catalogue</h1>
        <p className="text-slate-600 text-sm">
          No hidden fees. Every garment is priced per piece, per KG, or per item. 18% GST itemized transparently.
        </p>
      </div>

      {/* Category Filter Pills */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              selectedCategory === cat.id
                ? 'bg-brand-600 text-white shadow-md shadow-brand-500/20'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
        </div>
      ) : (
        <div className="space-y-10">
          {filteredServices?.map((service) => (
            <div
              key={service.id}
              className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-brand-600" /> {service.name}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1 max-w-xl">{service.description}</p>
                </div>
                <Link
                  to="/book"
                  className="px-4 py-2 bg-brand-50 text-brand-700 hover:bg-brand-100 font-bold text-xs rounded-xl border border-brand-200 transition flex items-center gap-1.5 shrink-0"
                >
                  Book This Service <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {/* Price Table / Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {service.prices?.map((price) => (
                  <div
                    key={price.id}
                    className="p-4 rounded-xl bg-slate-50 border border-slate-200 hover:border-brand-300 transition flex flex-col justify-between"
                  >
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">{price.item_name}</h4>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                        {price.pricing_type.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-baseline justify-between">
                      <span className="text-xs text-slate-500">Price:</span>
                      <span className="text-lg font-black text-brand-700 font-mono">
                        ₹{(price.price_paise / 100).toFixed(0)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Assurance banner */}
      <div className="p-6 rounded-2xl bg-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />
          <div>
            <h4 className="font-bold text-white text-sm">Need a bulk laundry quote or custom fabric care?</h4>
            <p className="text-slate-400">Call our manager directly at +91 98765 43210 for commercial laundry quotes.</p>
          </div>
        </div>
        <Link
          to="/book"
          className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-xs shadow-sm transition whitespace-nowrap"
        >
          Book An Order
        </Link>
      </div>
    </div>
  );
};
