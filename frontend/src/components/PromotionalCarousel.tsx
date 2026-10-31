import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, CalendarCheck, Tag, ArrowRight,
  ChevronLeft, ChevronRight, Pause, Play, ShieldCheck, Check
} from 'lucide-react';

export interface PromotionalBanner {
  id: string;
  theme: 'pickup' | 'welcome' | 'repeat' | 'service';
  title: string;
  tagline: string;
  description: string;
  ctaText: string;
  ctaAction: string;
  badge?: string;
  couponCode?: string;
  gradientClass: string;
  accentClass: string;
  features: string[];
}

interface PromotionalCarouselProps {
  onSelectOffer?: (couponCode: string) => void;
  className?: string;
}

export const PromotionalCarousel: React.FC<PromotionalCarouselProps> = ({
  onSelectOffer,
  className = ''
}) => {
  const navigate = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartXRef = useRef<number | null>(null);
  const touchEndXRef = useRef<number | null>(null);
  const carouselRef = useRef<HTMLDivElement | null>(null);

  const banners: PromotionalBanner[] = [
    {
      id: 'banner-pickup',
      theme: 'pickup',
      title: 'Fast Doorstep Pickup & Delivery',
      tagline: 'Simple Per-Kilogram Laundry • Bengaluru',
      description: 'Book a convenient home pickup in 60 seconds. Calibrated digital weighing at your doorstep or facility, zero hidden fees, and clean delivery in 24-48 hours.',
      ctaText: 'Book a Home Pickup',
      ctaAction: '/customer?tab=book',
      gradientClass: 'from-brand-900 via-brand-800 to-cyan-900',
      accentClass: 'bg-cyan-500 hover:bg-cyan-400 text-slate-950',
      features: ['Free Doorstep Collection', 'Certified Digital Scales', 'Hygienic Separate Batches']
    },
    {
      id: 'banner-welcome50',
      theme: 'welcome',
      title: 'Flat ₹50 OFF on Your First Order',
      tagline: 'New Customer Welcome Promotion',
      description: 'Experience professional laundry care. Apply code WELCOME50 at booking for ₹50 instant savings on any laundry pickup over ₹150.',
      ctaText: 'Claim ₹50 Offer',
      ctaAction: '/customer?tab=book&coupon=WELCOME50',
      badge: 'WELCOME50',
      couponCode: 'WELCOME50',
      gradientClass: 'from-indigo-900 via-purple-900 to-slate-900',
      accentClass: 'bg-emerald-400 hover:bg-emerald-300 text-slate-950',
      features: ['₹50 Off Orders ≥ ₹150', 'Valid on Wash & Fold', '1-Tap Application']
    },
    {
      id: 'banner-exprez10',
      theme: 'repeat',
      title: 'Save 10% on Every Laundry Batch',
      tagline: 'Regular Customer Privilege Offer',
      description: 'Keep your wardrobe fresh week after week. Use code EXPREZ10 for 10% off up to ₹100 on every regular laundry schedule.',
      ctaText: 'Apply 10% Off',
      ctaAction: '/customer?tab=book&coupon=EXPREZ10',
      badge: 'EXPREZ10',
      couponCode: 'EXPREZ10',
      gradientClass: 'from-sky-900 via-blue-900 to-slate-950',
      accentClass: 'bg-amber-400 hover:bg-amber-300 text-slate-950',
      features: ['10% Off up to ₹100', 'Multiple Redemptions', 'No Garment Counting']
    },
    {
      id: 'banner-service',
      theme: 'service',
      title: 'Steam Press & Gentle Fabric Care',
      tagline: 'Premium Sanitization & Garment Finish',
      description: 'Skin-friendly eco detergents, antibacterial rinse, and crisp steam press on hangers or precision folding. Pay securely via Cash or UPI after weighing.',
      ctaText: 'Book a Home Pickup',
      ctaAction: '/customer?tab=book',
      gradientClass: 'from-slate-900 via-brand-950 to-cyan-950',
      accentClass: 'bg-cyan-400 hover:bg-cyan-300 text-slate-950',
      features: ['Eco-Certified Detergents', 'Steam Iron Finish', 'Pay on Delivery']
    }
  ];

  const totalSlides = banners.length;

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev + 1) % totalSlides);
  }, [totalSlides]);

  const prevSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev - 1 + totalSlides) % totalSlides);
  }, [totalSlides]);

  // Auto-rotation timer (5 seconds)
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      nextSlide();
    }, 5000);
    return () => clearInterval(interval);
  }, [isPaused, nextSlide]);

  // Touch Swipe Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchEndXRef.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (touchStartXRef.current === null || touchEndXRef.current === null) return;
    const diff = touchStartXRef.current - touchEndXRef.current;
    const threshold = 50; // Min px to trigger swipe
    if (diff > threshold) {
      nextSlide();
    } else if (diff < -threshold) {
      prevSlide();
    }
    touchStartXRef.current = null;
    touchEndXRef.current = null;
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      prevSlide();
    } else if (e.key === 'ArrowRight') {
      nextSlide();
    }
  };

  const handleCtaClick = (banner: PromotionalBanner) => {
    if (banner.couponCode && onSelectOffer) {
      onSelectOffer(banner.couponCode);
    }
    navigate(banner.ctaAction);
  };

  const activeBanner = banners[currentSlide];

  return (
    <div
      ref={carouselRef}
      role="region"
      aria-roledescription="carousel"
      aria-label="Promotional Offers & Highlights"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`relative overflow-hidden rounded-3xl shadow-xl transition-all select-none outline-none focus:ring-2 focus:ring-brand-500 touch-pan-y ${className}`}
    >
      {/* Banner Slides */}
      <div className="relative min-h-[420px] xs:min-h-[390px] sm:min-h-[310px] md:min-h-[290px]">
        {banners.map((banner, index) => {
          const isActive = index === currentSlide;
          return (
            <div
              key={banner.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${totalSlides}: ${banner.title}`}
              aria-hidden={!isActive}
              className={`absolute inset-0 bg-gradient-to-r ${banner.gradientClass} text-white p-5 sm:p-8 md:p-10 pb-12 sm:pb-10 flex flex-col justify-between transition-opacity duration-500 ease-in-out ${
                isActive ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none'
              }`}
            >
              {/* Header / Badges */}
              <div className="space-y-2.5 sm:space-y-3">
                <div className="flex flex-wrap items-center gap-2 max-w-[calc(100%-85px)] sm:max-w-none">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-xs text-[11px] font-bold text-cyan-200 border border-white/15 max-w-full min-w-0">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span className="truncate">{banner.tagline}</span>
                  </div>

                  {banner.badge && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/40 text-[11px] font-mono font-bold tracking-wider">
                      <Tag className="w-3 h-3 shrink-0" />
                      <span>CODE: {banner.badge}</span>
                    </div>
                  )}
                </div>

                <h3 className="text-xl sm:text-3xl md:text-4xl font-black tracking-tight leading-tight max-w-2xl text-white">
                  {banner.title}
                </h3>

                <p className="text-xs sm:text-sm text-slate-200 max-w-2xl leading-relaxed">
                  {banner.description}
                </p>
              </div>

              {/* Bottom Feature Pills & Action Button */}
              <div className="pt-3 sm:pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-t border-white/10">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[11px] text-slate-300 font-medium">
                  {banner.features.map((feature, fIdx) => (
                    <div key={fIdx} className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCtaClick(banner)}
                    className={`w-full sm:w-auto py-2.5 sm:py-3 px-5 sm:px-6 rounded-2xl font-black text-xs sm:text-sm shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2 cursor-pointer ${banner.accentClass}`}
                  >
                    <CalendarCheck className="w-4 h-4 shrink-0" />
                    <span>{banner.ctaText}</span>
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Manual Controls (Prev / Next Buttons & Pause Toggle) */}
      <div className="absolute top-3.5 sm:top-4 right-3.5 sm:right-4 z-20 flex items-center gap-1 sm:gap-1.5">
        <button
          type="button"
          onClick={() => setIsPaused((prev) => !prev)}
          aria-label={isPaused ? 'Resume banner slideshow' : 'Pause banner slideshow'}
          className="p-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white/80 hover:text-white backdrop-blur-xs transition cursor-pointer"
          title={isPaused ? 'Resume rotation' : 'Pause rotation'}
        >
          {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
        </button>

        <button
          type="button"
          onClick={prevSlide}
          aria-label="Previous promotional banner"
          className="p-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white/80 hover:text-white backdrop-blur-xs transition cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={nextSlide}
          aria-label="Next promotional banner"
          className="p-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white/80 hover:text-white backdrop-blur-xs transition cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Slide Indicator Dots */}
      <div className="absolute bottom-2.5 sm:bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
        {banners.map((b, idx) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setCurrentSlide(idx)}
            aria-label={`Go to slide ${idx + 1}`}
            className={`transition-all rounded-full cursor-pointer ${
              idx === currentSlide
                ? 'w-6 h-2 bg-white shadow-sm'
                : 'w-2 h-2 bg-white/40 hover:bg-white/70'
            }`}
          />
        ))}
      </div>
    </div>
  );
};

