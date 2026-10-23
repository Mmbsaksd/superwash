


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."check_profile_role_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    -- Allow direct administrative/migration operations (auth.uid() is NULL)
    IF auth.uid() IS NULL THEN
        NEW.updated_at := timezone('utc', now());
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        -- Prevent non-owners from creating accounts with privileged roles
        IF NEW.role IS NOT NULL AND NEW.role != 'customer' THEN
            IF COALESCE(public.current_user_role(), '') != 'owner' THEN
                RAISE EXCEPTION 'New profiles must have the customer role. Only business owners can assign staff roles.';
            END IF;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        -- If role is being changed and user is not an owner, reject
        IF OLD.role IS DISTINCT FROM NEW.role THEN
            IF COALESCE(public.current_user_role(), '') != 'owner' THEN
                RAISE EXCEPTION 'Only business owners are authorized to change user roles.';
            END IF;
        END IF;
    END IF;
    NEW.updated_at := timezone('utc', now());
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_profile_role_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_role"() RETURNS character varying
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."current_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_email TEXT;
    v_full_name TEXT;
    v_avatar TEXT;
    v_role TEXT := 'customer'; -- Strict security: default role is always 'customer'
BEGIN
    v_email := LOWER(TRIM(NEW.email));
    v_full_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        split_part(NEW.email, '@', 1),
        'Customer'
    );
    v_avatar := NEW.raw_user_meta_data->>'avatar_url';

    -- Insert new customer profile or safely update OAuth metadata without altering existing privileged role
    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        avatar_url,
        role,
        is_active,
        created_at,
        updated_at
    )
    VALUES (
        NEW.id,
        v_email,
        v_full_name,
        v_avatar,
        v_role,
        true,
        timezone('utc', now()),
        timezone('utc', now())
    )
    ON CONFLICT (id) DO UPDATE SET
        email = COALESCE(EXCLUDED.email, profiles.email),
        avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
        updated_at = timezone('utc', now());

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_staff_google_account"("p_staff_phone" character varying, "p_verified_email" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    -- Authorization check: only owners can link staff accounts
    IF public.current_user_role() != 'owner' THEN
        RAISE EXCEPTION 'Only business owners are authorized to link staff accounts.';
    END IF;

    UPDATE public.profiles
    SET email = LOWER(TRIM(p_verified_email)),
        updated_at = timezone('utc', now())
    WHERE phone = p_staff_phone
      AND role IN ('owner', 'manager', 'delivery');

    RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."link_staff_google_account"("p_staff_phone" character varying, "p_verified_email" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_order_number"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
        NEW.order_number := 'SW-' || nextval('public.order_number_seq');
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_order_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_order_payment_summary"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_total_paid INTEGER;
    v_order_total INTEGER;
    v_new_status VARCHAR(30);
BEGIN
    -- Calculate total paid from all payment entries for this order
    SELECT COALESCE(SUM(amount_paise), 0)
    INTO v_total_paid
    FROM public.payments
    WHERE order_id = NEW.order_id;

    -- Fetch total order bill
    SELECT total_amount_paise
    INTO v_order_total
    FROM public.orders
    WHERE id = NEW.order_id;

    -- Determine payment status
    IF v_total_paid = 0 THEN
        v_new_status := 'pending';
    ELSIF v_order_total IS NOT NULL AND v_total_paid >= v_order_total THEN
        v_new_status := 'paid';
    ELSE
        v_new_status := 'partially_paid';
    END IF;

    -- Update order summary columns
    UPDATE public.orders
    SET 
        paid_amount_paise = v_total_paid,
        payment_status = v_new_status,
        payment_method = NEW.payment_method,
        updated_at = timezone('utc', now())
    WHERE id = NEW.order_id;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_order_payment_summary"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."business_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_name" character varying(255) DEFAULT 'SuperWash Express'::character varying NOT NULL,
    "business_phone" character varying(20) DEFAULT '+91 98765 43210'::character varying NOT NULL,
    "business_address" "text" DEFAULT 'Shop #14, Metro Pillar 78, Indiranagar, Bengaluru 560038'::"text" NOT NULL,
    "price_per_kg_paise" integer DEFAULT 8000 NOT NULL,
    "min_weight_kg" numeric(4,2) DEFAULT 3.00 NOT NULL,
    "delivery_charge_paise" integer DEFAULT 0 NOT NULL,
    "min_order_free_delivery_paise" integer DEFAULT 0 NOT NULL,
    "upi_id" character varying(100) DEFAULT 'superwash@upi'::character varying NOT NULL,
    "upi_qr_url" "text",
    "payment_collection_stage" character varying(30) DEFAULT 'delivery'::character varying NOT NULL,
    "allow_delivery_payment_recording" boolean DEFAULT true NOT NULL,
    "whatsapp_enabled" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "serviceable_pincodes" "text"[] DEFAULT ARRAY['560038'::"text", '560008'::"text", '560103'::"text", '560075'::"text", '560001'::"text"],
    CONSTRAINT "business_settings_payment_collection_stage_check" CHECK ((("payment_collection_stage")::"text" = ANY ((ARRAY['pickup'::character varying, 'delivery'::character varying, 'both'::character varying])::"text"[])))
);


ALTER TABLE "public"."business_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_addresses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "label" character varying(50) DEFAULT 'Home'::character varying NOT NULL,
    "address_line" "text" NOT NULL,
    "landmark" "text",
    "pincode" character varying(10) NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "latitude" numeric(10,7),
    "longitude" numeric(10,7)
);


ALTER TABLE "public"."customer_addresses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid",
    "channel" character varying(30) DEFAULT 'whatsapp'::character varying NOT NULL,
    "recipient_phone" character varying(20) NOT NULL,
    "event_type" character varying(50) NOT NULL,
    "message" "text" NOT NULL,
    "status" character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."notification_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "customer_id" "uuid",
    "customer_name" character varying(255) NOT NULL,
    "customer_phone" character varying(20) NOT NULL,
    "rating_overall" integer NOT NULL,
    "rating_pickup" integer,
    "rating_washing" integer,
    "rating_delivery" integer,
    "comment" "text",
    "suggestions" "text",
    "low_rating_reason" "text",
    "status" character varying(30) DEFAULT 'new'::character varying NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_by_name" character varying(255),
    "reviewed_at" timestamp with time zone,
    "resolution_note" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "order_feedback_rating_delivery_check" CHECK ((("rating_delivery" >= 1) AND ("rating_delivery" <= 5))),
    CONSTRAINT "order_feedback_rating_overall_check" CHECK ((("rating_overall" >= 1) AND ("rating_overall" <= 5))),
    CONSTRAINT "order_feedback_rating_pickup_check" CHECK ((("rating_pickup" >= 1) AND ("rating_pickup" <= 5))),
    CONSTRAINT "order_feedback_rating_washing_check" CHECK ((("rating_washing" >= 1) AND ("rating_washing" <= 5))),
    CONSTRAINT "order_feedback_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['new'::character varying, 'reviewed'::character varying, 'resolved'::character varying])::"text"[])))
);


ALTER TABLE "public"."order_feedback" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."order_number_seq"
    START WITH 1005
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."order_number_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_status_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "previous_status" character varying(30),
    "new_status" character varying(30) NOT NULL,
    "notes" "text",
    "changed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."order_status_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_number" character varying(30) NOT NULL,
    "customer_id" "uuid",
    "customer_name" character varying(255) NOT NULL,
    "customer_phone" character varying(20) NOT NULL,
    "pickup_address" "text" NOT NULL,
    "pickup_landmark" "text",
    "pickup_pincode" character varying(10) NOT NULL,
    "pickup_date" "date" NOT NULL,
    "pickup_slot" character varying(100) NOT NULL,
    "assigned_delivery_id" "uuid",
    "measured_weight" numeric(5,2),
    "billable_weight" numeric(5,2),
    "price_per_kg_paise" integer NOT NULL,
    "min_weight_kg" numeric(4,2) NOT NULL,
    "delivery_charge_paise" integer DEFAULT 0 NOT NULL,
    "total_amount_paise" integer,
    "paid_amount_paise" integer DEFAULT 0 NOT NULL,
    "payment_status" character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    "payment_method" character varying(30) DEFAULT 'cash'::character varying,
    "order_status" character varying(30) DEFAULT 'booked'::character varying NOT NULL,
    "delivery_notes" "text",
    "cancellation_reason" "text",
    "notes" "text",
    "collected_at" timestamp with time zone,
    "weighed_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "pickup_latitude" numeric(10,7),
    "pickup_longitude" numeric(10,7),
    "service_id" "uuid",
    "service_name" character varying(150) DEFAULT 'Wash & Fold (Normal)'::character varying,
    "pricing_unit" character varying(50) DEFAULT 'per_kg'::character varying,
    "assigned_pickup_id" "uuid",
    "assigned_pickup_name" character varying(255),
    "assigned_pickup_phone" character varying(20),
    "assigned_delivery_name" character varying(255),
    "assigned_delivery_phone" character varying(20),
    CONSTRAINT "orders_order_status_check" CHECK ((("order_status")::"text" = ANY ((ARRAY['booked'::character varying, 'pickup_assigned'::character varying, 'collected'::character varying, 'washing'::character varying, 'ready_for_delivery'::character varying, 'out_for_delivery'::character varying, 'delivered'::character varying, 'cancelled'::character varying])::"text"[]))),
    CONSTRAINT "orders_payment_method_check" CHECK ((("payment_method")::"text" = ANY ((ARRAY['cash'::character varying, 'upi_manual'::character varying])::"text"[]))),
    CONSTRAINT "orders_payment_status_check" CHECK ((("payment_status")::"text" = ANY ((ARRAY['pending'::character varying, 'partially_paid'::character varying, 'paid'::character varying])::"text"[])))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "amount_paise" integer NOT NULL,
    "payment_method" character varying(30) NOT NULL,
    "transaction_reference" character varying(100),
    "notes" "text",
    "recorded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "payments_amount_paise_check" CHECK (("amount_paise" > 0)),
    CONSTRAINT "payments_payment_method_check" CHECK ((("payment_method")::"text" = ANY ((ARRAY['cash'::character varying, 'upi_manual'::character varying])::"text"[])))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pickup_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(100) NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "max_capacity" integer DEFAULT 15 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."pickup_slots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "phone" character varying(20),
    "full_name" character varying(255) NOT NULL,
    "role" character varying(50) DEFAULT 'customer'::character varying NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "email" character varying(255),
    "avatar_url" "text",
    CONSTRAINT "profiles_role_check" CHECK ((("role")::"text" = ANY ((ARRAY['customer'::character varying, 'delivery'::character varying, 'manager'::character varying, 'owner'::character varying])::"text"[])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_areas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pincode" character varying(6) NOT NULL,
    "area_name" character varying(150) NOT NULL,
    "city" character varying(100) DEFAULT 'Bengaluru'::character varying NOT NULL,
    "state" character varying(100) DEFAULT 'Karnataka'::character varying NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."service_areas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(150) NOT NULL,
    "description" "text",
    "pricing_unit" character varying(50) DEFAULT 'per_kg'::character varying NOT NULL,
    "unit_price_paise" integer DEFAULT 8000 NOT NULL,
    "min_weight_kg" numeric(4,2) DEFAULT 3.00 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "display_order" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weight_change_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "old_weight" numeric(5,2),
    "new_weight" numeric(5,2) NOT NULL,
    "old_amount_paise" integer,
    "new_amount_paise" integer NOT NULL,
    "reason" "text",
    "changed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."weight_change_history" OWNER TO "postgres";


ALTER TABLE ONLY "public"."business_settings"
    ADD CONSTRAINT "business_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_addresses"
    ADD CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_logs"
    ADD CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_feedback"
    ADD CONSTRAINT "order_feedback_order_id_key" UNIQUE ("order_id");



ALTER TABLE ONLY "public"."order_feedback"
    ADD CONSTRAINT "order_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_order_number_key" UNIQUE ("order_number");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pickup_slots"
    ADD CONSTRAINT "pickup_slots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_phone_key" UNIQUE ("phone");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_areas"
    ADD CONSTRAINT "service_areas_pincode_key" UNIQUE ("pincode");



ALTER TABLE ONLY "public"."service_areas"
    ADD CONSTRAINT "service_areas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weight_change_history"
    ADD CONSTRAINT "weight_change_history_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_order_feedback_created_at" ON "public"."order_feedback" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_order_feedback_customer_id" ON "public"."order_feedback" USING "btree" ("customer_id");



CREATE INDEX "idx_order_feedback_order_id" ON "public"."order_feedback" USING "btree" ("order_id");



CREATE INDEX "idx_order_feedback_status" ON "public"."order_feedback" USING "btree" ("status");



CREATE INDEX "idx_orders_assigned_delivery" ON "public"."orders" USING "btree" ("assigned_delivery_id");



CREATE INDEX "idx_orders_assigned_pickup" ON "public"."orders" USING "btree" ("assigned_pickup_id");



CREATE INDEX "idx_orders_customer_id" ON "public"."orders" USING "btree" ("customer_id");



CREATE INDEX "idx_orders_pickup_date" ON "public"."orders" USING "btree" ("pickup_date");



CREATE INDEX "idx_orders_status" ON "public"."orders" USING "btree" ("order_status");



CREATE INDEX "idx_payments_order_id" ON "public"."payments" USING "btree" ("order_id");



CREATE UNIQUE INDEX "idx_profiles_email" ON "public"."profiles" USING "btree" ("lower"(("email")::"text")) WHERE ("email" IS NOT NULL);



CREATE INDEX "idx_profiles_phone" ON "public"."profiles" USING "btree" ("phone") WHERE ("phone" IS NOT NULL);



CREATE INDEX "idx_service_areas_is_active" ON "public"."service_areas" USING "btree" ("is_active");



CREATE INDEX "idx_service_areas_pincode" ON "public"."service_areas" USING "btree" ("pincode");



CREATE OR REPLACE TRIGGER "trigger_check_profile_role" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."check_profile_role_update"();



CREATE OR REPLACE TRIGGER "trigger_set_order_number" BEFORE INSERT ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."set_order_number"();



CREATE OR REPLACE TRIGGER "trigger_sync_payment_summary" AFTER INSERT OR UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."sync_order_payment_summary"();



ALTER TABLE ONLY "public"."customer_addresses"
    ADD CONSTRAINT "customer_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_logs"
    ADD CONSTRAINT "notification_logs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_feedback"
    ADD CONSTRAINT "order_feedback_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_feedback"
    ADD CONSTRAINT "order_feedback_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_feedback"
    ADD CONSTRAINT "order_feedback_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_assigned_delivery_id_fkey" FOREIGN KEY ("assigned_delivery_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_assigned_pickup_id_fkey" FOREIGN KEY ("assigned_pickup_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weight_change_history"
    ADD CONSTRAINT "weight_change_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."weight_change_history"
    ADD CONSTRAINT "weight_change_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



CREATE POLICY "Authorized roles can update orders" ON "public"."orders" FOR UPDATE USING ((((("public"."current_user_role"())::"text" = 'delivery'::"text") AND (("assigned_delivery_id" = "auth"."uid"()) OR ("assigned_pickup_id" = "auth"."uid"()))) OR (("public"."current_user_role"())::"text" = ANY ((ARRAY['manager'::character varying, 'owner'::character varying])::"text"[]))));



CREATE POLICY "Authorized users can view profiles" ON "public"."profiles" FOR SELECT USING ((("auth"."uid"() = "id") OR (("public"."current_user_role"())::"text" = 'owner'::"text") OR ((("public"."current_user_role"())::"text" = 'manager'::"text") AND ((("role")::"text" = 'customer'::"text") OR (("role")::"text" = 'delivery'::"text") OR (("role")::"text" = 'manager'::"text"))) OR ((("public"."current_user_role"())::"text" = 'delivery'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."customer_id" = "profiles"."id") AND (("orders"."assigned_delivery_id" = "auth"."uid"()) OR ("orders"."assigned_pickup_id" = "auth"."uid"()))))))));



CREATE POLICY "Customer can create booking" ON "public"."orders" FOR INSERT WITH CHECK ((("auth"."uid"() = "customer_id") OR (("public"."current_user_role"())::"text" = ANY ((ARRAY['manager'::character varying, 'owner'::character varying])::"text"[]))));



CREATE POLICY "Customer can read own orders" ON "public"."orders" FOR SELECT USING ((("auth"."uid"() = "customer_id") OR ((("public"."current_user_role"())::"text" = 'delivery'::"text") AND (("assigned_delivery_id" = "auth"."uid"()) OR ("assigned_pickup_id" = "auth"."uid"()))) OR (("public"."current_user_role"())::"text" = ANY ((ARRAY['manager'::character varying, 'owner'::character varying])::"text"[]))));



CREATE POLICY "Customers and staff can view relevant payments" ON "public"."payments" FOR SELECT USING (((("public"."current_user_role"())::"text" = ANY ((ARRAY['owner'::character varying, 'manager'::character varying])::"text"[])) OR ((("public"."current_user_role"())::"text" = 'delivery'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "payments"."order_id") AND (("orders"."assigned_delivery_id" = "auth"."uid"()) OR ("orders"."assigned_pickup_id" = "auth"."uid"())))))) OR (EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "payments"."order_id") AND ("orders"."customer_id" = "auth"."uid"()))))));



CREATE POLICY "Customers can insert feedback for own delivered orders" ON "public"."order_feedback" FOR INSERT WITH CHECK ((("auth"."uid"() = "customer_id") AND (EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_feedback"."order_id") AND ("orders"."customer_id" = "auth"."uid"()) AND (("orders"."order_status")::"text" = 'delivered'::"text"))))));



CREATE POLICY "Customers can manage own addresses" ON "public"."customer_addresses" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Customers can view their own feedback" ON "public"."order_feedback" FOR SELECT USING (("auth"."uid"() = "customer_id"));



CREATE POLICY "Owner and manager can view notification logs" ON "public"."notification_logs" FOR SELECT USING ((("public"."current_user_role"())::"text" = ANY ((ARRAY['owner'::character varying, 'manager'::character varying])::"text"[])));



CREATE POLICY "Owner can manage pickup slots" ON "public"."pickup_slots" USING ((("public"."current_user_role"())::"text" = 'owner'::"text"));



CREATE POLICY "Owner can manage profiles" ON "public"."profiles" USING ((("public"."current_user_role"())::"text" = 'owner'::"text"));



CREATE POLICY "Owner can manage service areas" ON "public"."service_areas" USING ((("public"."current_user_role"())::"text" = 'owner'::"text"));



CREATE POLICY "Owner can manage services" ON "public"."services" USING ((("public"."current_user_role"())::"text" = 'owner'::"text"));



CREATE POLICY "Owner can update business settings" ON "public"."business_settings" USING ((("public"."current_user_role"())::"text" = 'owner'::"text"));



CREATE POLICY "Public can view active service areas" ON "public"."service_areas" FOR SELECT USING ((("is_active" = true) OR (("public"."current_user_role"())::"text" = 'owner'::"text")));



CREATE POLICY "Public can view active services" ON "public"."services" FOR SELECT USING ((("is_active" = true) OR (("public"."current_user_role"())::"text" = 'owner'::"text")));



CREATE POLICY "Public can view active slots" ON "public"."pickup_slots" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Public can view business settings" ON "public"."business_settings" FOR SELECT USING (true);



CREATE POLICY "Staff can add status history entries" ON "public"."order_status_history" FOR INSERT WITH CHECK ((("public"."current_user_role"())::"text" = ANY ((ARRAY['owner'::character varying, 'manager'::character varying, 'delivery'::character varying])::"text"[])));



CREATE POLICY "Staff can insert notification logs" ON "public"."notification_logs" FOR INSERT WITH CHECK ((("public"."current_user_role"())::"text" = ANY ((ARRAY['owner'::character varying, 'manager'::character varying, 'delivery'::character varying])::"text"[])));



CREATE POLICY "Staff can record payments" ON "public"."payments" FOR INSERT WITH CHECK (((("public"."current_user_role"())::"text" = ANY ((ARRAY['owner'::character varying, 'manager'::character varying])::"text"[])) OR ((("public"."current_user_role"())::"text" = 'delivery'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "payments"."order_id") AND (("orders"."assigned_delivery_id" = "auth"."uid"()) OR ("orders"."assigned_pickup_id" = "auth"."uid"()))))))));



CREATE POLICY "Staff can record weight changes" ON "public"."weight_change_history" FOR INSERT WITH CHECK ((("public"."current_user_role"())::"text" = ANY ((ARRAY['owner'::character varying, 'manager'::character varying])::"text"[])));



CREATE POLICY "Staff can review and resolve feedback" ON "public"."order_feedback" FOR UPDATE USING ((("public"."current_user_role"())::"text" = ANY ((ARRAY['owner'::character varying, 'manager'::character varying])::"text"[])));



CREATE POLICY "Staff can view all private feedback" ON "public"."order_feedback" FOR SELECT USING ((("public"."current_user_role"())::"text" = ANY ((ARRAY['owner'::character varying, 'manager'::character varying])::"text"[])));



CREATE POLICY "Staff can view weight changes" ON "public"."weight_change_history" FOR SELECT USING ((("public"."current_user_role"())::"text" = ANY ((ARRAY['owner'::character varying, 'manager'::character varying])::"text"[])));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK ((("auth"."uid"() = "id") AND (("role")::"text" = 'customer'::"text")));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can view status history for their orders" ON "public"."order_status_history" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_status_history"."order_id") AND (("orders"."customer_id" = "auth"."uid"()) OR ((("public"."current_user_role"())::"text" = 'delivery'::"text") AND (("orders"."assigned_delivery_id" = "auth"."uid"()) OR ("orders"."assigned_pickup_id" = "auth"."uid"()))) OR (("public"."current_user_role"())::"text" = ANY ((ARRAY['owner'::character varying, 'manager'::character varying])::"text"[])))))));



ALTER TABLE "public"."business_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_addresses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_status_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pickup_slots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."service_areas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weight_change_history" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."orders";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."check_profile_role_update"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."current_user_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "anon";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."link_staff_google_account"("p_staff_phone" character varying, "p_verified_email" character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."link_staff_google_account"("p_staff_phone" character varying, "p_verified_email" character varying) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_order_number"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."sync_order_payment_summary"() FROM PUBLIC;


















GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."business_settings" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."business_settings" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."business_settings" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."customer_addresses" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."customer_addresses" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."customer_addresses" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notification_logs" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notification_logs" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notification_logs" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."order_feedback" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."order_feedback" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."order_feedback" TO "service_role";



GRANT SELECT,USAGE ON SEQUENCE "public"."order_number_seq" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."order_status_history" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."order_status_history" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."order_status_history" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."orders" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."orders" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."orders" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."payments" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."payments" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."payments" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."pickup_slots" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."pickup_slots" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."pickup_slots" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."profiles" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."service_areas" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."service_areas" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."service_areas" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."services" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."services" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."services" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."weight_change_history" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."weight_change_history" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."weight_change_history" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";



































