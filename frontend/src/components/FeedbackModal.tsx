import React, { useState, useEffect } from 'react';
import { Order, OrderFeedback } from '../types';
import { LaundryService } from '../services/laundryService';
import { Star, X, CheckCircle2, AlertCircle, MessageSquareHeart, ShieldCheck, Loader2 } from 'lucide-react';

interface FeedbackModalProps {
  order: Order;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (feedback: OrderFeedback) => void;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  order,
  isOpen,
  onClose,
  onSuccess
}) => {
  const [overallRating, setOverallRating] = useState<number>(5);
  const [pickupRating, setPickupRating] = useState<number>(5);
  const [washingRating, setWashingRating] = useState<number>(5);
  const [deliveryRating, setDeliveryRating] = useState<number>(5);
  const [comment, setComment] = useState<string>('');
  const [suggestions, setSuggestions] = useState<string>('');
  const [lowRatingReason, setLowRatingReason] = useState<string>('');
  
  const [existingFeedback, setExistingFeedback] = useState<OrderFeedback | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      LaundryService.getFeedbackForOrder(order.id).then((fb) => {
        if (fb) {
          setExistingFeedback(fb);
          setOverallRating(fb.rating_overall);
          setPickupRating(fb.rating_pickup || 5);
          setWashingRating(fb.rating_washing || 5);
          setDeliveryRating(fb.rating_delivery || 5);
          setComment(fb.comment || '');
          setSuggestions(fb.suggestions || '');
          setLowRatingReason(fb.low_rating_reason || '');
        } else {
          setExistingFeedback(null);
          setOverallRating(5);
          setPickupRating(5);
          setWashingRating(5);
          setDeliveryRating(5);
          setComment('');
          setSuggestions('');
          setLowRatingReason('');
        }
      });
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen, order]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (overallRating < 1 || overallRating > 5) {
      setError('Please select an overall rating from 1 to 5 stars');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const fb = await LaundryService.submitOrderFeedback({
        order_id: order.id,
        customer_id: order.customer_id,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        rating_overall: overallRating,
        rating_pickup: pickupRating,
        rating_washing: washingRating,
        rating_delivery: deliveryRating,
        comment: comment.trim() || undefined,
        suggestions: suggestions.trim() || undefined,
        low_rating_reason: overallRating <= 3 ? (lowRatingReason.trim() || undefined) : undefined
      });

      setSuccessMsg('Thank you! Your private feedback has been recorded.');
      setTimeout(() => {
        onSuccess(fb);
        onClose();
      }, 900);
    } catch (err: any) {
      setError(err.message || 'Error submitting feedback');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStarSelector = (
    label: string,
    currentValue: number,
    onChange: (val: number) => void
  ) => (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            type="button"
            key={star}
            onClick={() => onChange(star)}
            className="p-1 hover:scale-110 transition focus:outline-none"
            title={`${star} Star`}
          >
            <Star
              className={`w-5 h-5 ${
                star <= currentValue
                  ? 'fill-amber-400 text-amber-400'
                  : 'text-slate-200 hover:text-amber-200'
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-brand-600 to-cyan-600 p-4 text-white flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center text-white">
              <MessageSquareHeart className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                {existingFeedback ? 'Edit Service Feedback' : 'How was your Laundry?'}
              </h3>
              <p className="text-xs text-brand-100">Order #{order.order_number}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/20 text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2 font-semibold">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Privacy Notice */}
          <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded-xl flex items-start gap-2 text-[11px] text-blue-900">
            <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <span>
              <strong>Private & Confidential:</strong> Your feedback is viewed exclusively by store management to improve service quality. It is never displayed publicly.
            </span>
          </div>

          {/* Overall Rating */}
          <div className="text-center py-2 bg-slate-50 rounded-2xl border border-slate-200">
            <span className="block text-xs font-bold text-slate-700 mb-1">
              Overall Experience
            </span>
            <div className="flex justify-center items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  type="button"
                  key={star}
                  onClick={() => setOverallRating(star)}
                  className="p-1 hover:scale-125 transition"
                >
                  <Star
                    className={`w-7 h-7 ${
                      star <= overallRating
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-slate-300 hover:text-amber-200'
                    }`}
                  />
                </button>
              ))}
            </div>
            <span className="text-[11px] font-semibold text-brand-700 block mt-1">
              {overallRating === 5 && 'Outstanding! 🌟'}
              {overallRating === 4 && 'Good Service 👍'}
              {overallRating === 3 && 'Average / Needs Improvement 😐'}
              {overallRating === 2 && 'Below Expectations 👎'}
              {overallRating === 1 && 'Poor Experience 😞'}
            </span>
          </div>

          {/* Category Ratings */}
          <div className="p-3 bg-slate-50/70 rounded-2xl border border-slate-200 divide-y divide-slate-100">
            {renderStarSelector('Pickup Experience', pickupRating, setPickupRating)}
            {renderStarSelector('Washing & Folding Quality', washingRating, setWashingRating)}
            {renderStarSelector('Delivery Speed & Courtesy', deliveryRating, setDeliveryRating)}
          </div>

          {/* Low rating prompt */}
          {overallRating <= 3 && (
            <div>
              <label className="block text-xs font-bold text-amber-800 mb-1">
                What went wrong? (Optional reason for low rating)
              </label>
              <input
                type="text"
                placeholder="e.g. Pickup was delayed / stains were not removed"
                value={lowRatingReason}
                onChange={(e) => setLowRatingReason(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-amber-300 focus:ring-2 focus:ring-amber-500 bg-amber-50/30"
              />
            </div>
          )}

          {/* Comments */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Any feedback or compliments? (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="Tell us about the scent, fold, or delivery staff..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Suggestions */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Suggestions for improvement (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Provide eco-friendly packaging / more evening slots"
              value={suggestions}
              onChange={(e) => setSuggestions(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs"
            >
              Skip
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-md shadow-brand-500/20 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              {existingFeedback ? 'Update Feedback' : 'Submit Private Feedback'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
