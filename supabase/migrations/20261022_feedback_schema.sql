-- ==============================================================================
-- SuperWash Express: Private Customer Feedback & Service Improvement Schema
-- Migration: 20261022_feedback_schema.sql
-- ==============================================================================

-- 1. Create order_feedback Table
CREATE TABLE IF NOT EXISTS public.order_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE UNIQUE,
    customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    
    -- Ratings (1 to 5)
    rating_overall INTEGER NOT NULL CHECK (rating_overall >= 1 AND rating_overall <= 5),
    rating_pickup INTEGER CHECK (rating_pickup >= 1 AND rating_pickup <= 5),
    rating_washing INTEGER CHECK (rating_washing >= 1 AND rating_washing <= 5),
    rating_delivery INTEGER CHECK (rating_delivery >= 1 AND rating_delivery <= 5),
    
    -- Qualitative Feedback
    comment TEXT,
    suggestions TEXT,
    low_rating_reason TEXT,
    
    -- Internal Resolution Workflow (Private to Business)
    status VARCHAR(30) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'resolved')),
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_by_name VARCHAR(255),
    reviewed_at TIMESTAMPTZ,
    resolution_note TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Index for fast order and customer lookups
CREATE INDEX IF NOT EXISTS idx_order_feedback_order_id ON public.order_feedback(order_id);
CREATE INDEX IF NOT EXISTS idx_order_feedback_customer_id ON public.order_feedback(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_feedback_status ON public.order_feedback(status);
CREATE INDEX IF NOT EXISTS idx_order_feedback_created_at ON public.order_feedback(created_at DESC);

-- 2. Add serviceable_pincodes to business_settings if not present
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'business_settings' AND column_name = 'serviceable_pincodes'
    ) THEN
        ALTER TABLE public.business_settings ADD COLUMN serviceable_pincodes TEXT[] DEFAULT ARRAY['560038', '560008', '560103', '560075', '560001'];
    END IF;
END $$;

-- 3. Row Level Security (RLS) for Private Feedback
ALTER TABLE public.order_feedback ENABLE ROW LEVEL SECURITY;

-- Customers can submit feedback only for their own delivered orders
CREATE POLICY "Customers can insert feedback for own delivered orders"
    ON public.order_feedback FOR INSERT
    WITH CHECK (
        auth.uid() = customer_id
        AND EXISTS (
            SELECT 1 FROM public.orders
            WHERE public.orders.id = order_feedback.order_id
              AND public.orders.customer_id = auth.uid()
              AND public.orders.order_status = 'delivered'
        )
    );

-- Customers can view their own submitted feedback
CREATE POLICY "Customers can view their own feedback"
    ON public.order_feedback FOR SELECT
    USING (auth.uid() = customer_id);

-- Owners and Store Managers can view all feedback for service improvement
CREATE POLICY "Staff can view all private feedback"
    ON public.order_feedback FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE public.profiles.id = auth.uid()
              AND public.profiles.role IN ('owner', 'manager')
        )
    );

-- Only Owners and Store Managers can update feedback status and resolution notes
CREATE POLICY "Staff can review and resolve feedback"
    ON public.order_feedback FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE public.profiles.id = auth.uid()
              AND public.profiles.role IN ('owner', 'manager')
        )
    );
