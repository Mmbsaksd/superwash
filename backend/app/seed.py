from sqlalchemy.orm import Session
from app.models.entities import (
    User, CustomerProfile, StaffProfile, CustomerAddress,
    Service, ServicePrice, DeliveryTimeSlot, ServiceableArea, Coupon,
    UserRole
)
from app.core.security import get_password_hash

def seed_database(db: Session):
    # 1. Seed Users (Owner, Staff, Customer)
    owner = db.query(User).filter(User.phone == "9876543210").first()
    if not owner:
        owner = User(
            full_name="Rajesh Sharma (Owner)",
            email="admin@superwash.in",
            phone="9876543210",
            hashed_password=get_password_hash("Admin@123"),
            role=UserRole.OWNER.value,
            is_active=True,
            is_phone_verified=True
        )
        db.add(owner)
        db.flush()
        db.add(StaffProfile(user_id=owner.id, designation="Business Owner & Administrator"))

    manager = db.query(User).filter(User.phone == "9876543211").first()
    if not manager:
        manager = User(
            full_name="Ananya Verma (Manager)",
            email="staff@superwash.in",
            phone="9876543211",
            hashed_password=get_password_hash("Staff@123"),
            role=UserRole.MANAGER.value,
            is_active=True,
            is_phone_verified=True
        )
        db.add(manager)
        db.flush()
        db.add(StaffProfile(user_id=manager.id, designation="Store Manager"))

    driver = db.query(User).filter(User.phone == "9876543215").first()
    if not driver:
        driver = User(
            full_name="Ramesh Kumar (Delivery Agent)",
            email="driver@superwash.in",
            phone="9876543215",
            hashed_password=get_password_hash("Driver@123"),
            role=UserRole.DELIVERY_STAFF.value,
            is_active=True,
            is_phone_verified=True
        )
        db.add(driver)
        db.flush()
        db.add(StaffProfile(user_id=driver.id, designation="Pickup & Delivery Driver"))

    customer = db.query(User).filter(User.phone == "9876543212").first()
    if not customer:
        customer = User(
            full_name="Priya Patel",
            email="customer@superwash.in",
            phone="9876543212",
            hashed_password=get_password_hash("Customer@123"),
            role=UserRole.CUSTOMER.value,
            is_active=True,
            is_phone_verified=True
        )
        db.add(customer)
        db.flush()
        db.add(CustomerProfile(user_id=customer.id))
        db.add(CustomerAddress(
            user_id=customer.id,
            label="Home",
            address_line1="Flat 402, Green Glen Layout, Bellandur",
            city="Bengaluru",
            state="Karnataka",
            pincode="560038",
            is_default=True,
            is_serviceable=True
        ))

    # 2. Seed Services and Pricing
    existing_services = db.query(Service).count()
    if existing_services == 0:
        services_data = [
            {
                "name": "Wash & Fold",
                "code": "wash_fold",
                "description": "Daily casual wear washed, dried, and neatly folded. Hygienic wash with eco-detergents.",
                "category": "wash_fold",
                "icon": "Shirt",
                "sort_order": 1,
                "prices": [
                    {"item_name": "Per KG Load", "pricing_type": "per_kg", "price_paise": 7900, "sort_order": 1},
                    {"item_name": "T-Shirt / Top", "pricing_type": "per_piece", "price_paise": 2500, "sort_order": 2},
                    {"item_name": "Shirt / Kurta", "pricing_type": "per_piece", "price_paise": 3000, "sort_order": 3},
                    {"item_name": "Trouser / Jeans", "pricing_type": "per_piece", "price_paise": 4000, "sort_order": 4},
                ]
            },
            {
                "name": "Wash & Iron",
                "code": "wash_iron",
                "description": "Deep cleansed with stain treatment and crisp steam-ironed finish.",
                "category": "wash_iron",
                "icon": "Sparkles",
                "sort_order": 2,
                "prices": [
                    {"item_name": "Shirt (Wash & Steam Iron)", "pricing_type": "per_piece", "price_paise": 4500, "sort_order": 1},
                    {"item_name": "Trouser (Wash & Steam Iron)", "pricing_type": "per_piece", "price_paise": 5500, "sort_order": 2},
                    {"item_name": "Kurta Pyjama Set", "pricing_type": "per_piece", "price_paise": 8500, "sort_order": 3},
                    {"item_name": "Daily Wear Bundle (per KG)", "pricing_type": "per_kg", "price_paise": 11900, "sort_order": 4},
                ]
            },
            {
                "name": "Dry Cleaning",
                "code": "dry_cleaning",
                "description": "Expert solvent care for suits, silks, sarees, and delicate formal wear.",
                "category": "dry_clean",
                "icon": "Crown",
                "sort_order": 3,
                "prices": [
                    {"item_name": "Shirt Dry Cleaning", "pricing_type": "per_piece", "price_paise": 10000, "sort_order": 1},
                    {"item_name": "Suit (2-Piece)", "pricing_type": "per_piece", "price_paise": 30000, "sort_order": 2},
                    {"item_name": "Saree (Silk / Heavy)", "pricing_type": "per_piece", "price_paise": 20000, "sort_order": 3},
                    {"item_name": "Blazer / Jacket", "pricing_type": "per_piece", "price_paise": 22000, "sort_order": 4},
                    {"item_name": "Lehenga / Sherwani", "pricing_type": "per_piece", "price_paise": 45000, "sort_order": 5},
                ]
            },
            {
                "name": "Steam Ironing & Pressing",
                "code": "steam_ironing",
                "description": "High-pressure wrinkle removal on vacuum ironing tables.",
                "category": "ironing",
                "icon": "Zap",
                "sort_order": 4,
                "prices": [
                    {"item_name": "Shirt / T-Shirt Ironing", "pricing_type": "per_piece", "price_paise": 1500, "sort_order": 1},
                    {"item_name": "Trouser / Jeans Ironing", "pricing_type": "per_piece", "price_paise": 2000, "sort_order": 2},
                    {"item_name": "Saree Ironing", "pricing_type": "per_piece", "price_paise": 5000, "sort_order": 3},
                ]
            },
            {
                "name": "Blanket & Quilt Cleaning",
                "code": "blanket_cleaning",
                "description": "Deep sanitized cleansing for heavy winter blankets, comforters, and duvets.",
                "category": "blankets",
                "icon": "Layers",
                "sort_order": 5,
                "prices": [
                    {"item_name": "Single Blanket Cleaning", "pricing_type": "per_item", "price_paise": 15000, "sort_order": 1},
                    {"item_name": "Double / King Blanket Cleaning", "pricing_type": "per_item", "price_paise": 25000, "sort_order": 2},
                    {"item_name": "Quilt / Duvet Cleaning", "pricing_type": "per_item", "price_paise": 28000, "sort_order": 3},
                ]
            },
            {
                "name": "Bedsheets & Curtains",
                "code": "home_linen",
                "description": "Freshen up bedsheets, pillow covers, and heavy curtain drapes.",
                "category": "curtains",
                "icon": "Home",
                "sort_order": 6,
                "prices": [
                    {"item_name": "Bedsheet Cleaning (Single)", "pricing_type": "per_item", "price_paise": 5000, "sort_order": 1},
                    {"item_name": "Bedsheet Cleaning (Double)", "pricing_type": "per_item", "price_paise": 8000, "sort_order": 2},
                    {"item_name": "Window Curtain (per panel)", "pricing_type": "per_item", "price_paise": 9000, "sort_order": 3},
                    {"item_name": "Door Curtain (per panel)", "pricing_type": "per_item", "price_paise": 14000, "sort_order": 4},
                ]
            }
        ]

        for s_data in services_data:
            prices = s_data.pop("prices")
            srv = Service(**s_data)
            db.add(srv)
            db.flush()
            for p in prices:
                sp = ServicePrice(service_id=srv.id, **p)
                db.add(sp)

    # 3. Seed Delivery Time Slots
    if db.query(DeliveryTimeSlot).count() == 0:
        slots = [
            {"name": "Morning (08:00 AM - 11:00 AM)", "start_time": "08:00", "end_time": "11:00", "slot_type": "both", "max_capacity": 20},
            {"name": "Noon (11:00 AM - 02:00 PM)", "start_time": "11:00", "end_time": "14:00", "slot_type": "both", "max_capacity": 20},
            {"name": "Afternoon (02:00 PM - 05:00 PM)", "start_time": "14:00", "end_time": "17:00", "slot_type": "both", "max_capacity": 20},
            {"name": "Evening (05:00 PM - 08:00 PM)", "start_time": "17:00", "end_time": "20:00", "slot_type": "both", "max_capacity": 20},
        ]
        for s in slots:
            db.add(DeliveryTimeSlot(**s))

    # 4. Seed Serviceable PIN Codes (Bengaluru sample)
    if db.query(ServiceableArea).count() == 0:
        areas = [
            {"pincode": "560038", "area_name": "Indiranagar", "city": "Bengaluru", "delivery_fee_paise": 4000, "min_order_paise": 20000},
            {"pincode": "560008", "area_name": "Ulsoor / Halasuru", "city": "Bengaluru", "delivery_fee_paise": 4000, "min_order_paise": 20000},
            {"pincode": "560001", "area_name": "MG Road / Brigade", "city": "Bengaluru", "delivery_fee_paise": 5000, "min_order_paise": 25000},
            {"pincode": "560025", "area_name": "Richmond Town", "city": "Bengaluru", "delivery_fee_paise": 5000, "min_order_paise": 25000},
            {"pincode": "560075", "area_name": "Domlur / Old Airport Rd", "city": "Bengaluru", "delivery_fee_paise": 4000, "min_order_paise": 20000},
            {"pincode": "560103", "area_name": "Bellandur / Outer Ring Rd", "city": "Bengaluru", "delivery_fee_paise": 5000, "min_order_paise": 25000},
            {"pincode": "560034", "area_name": "Koramangala", "city": "Bengaluru", "delivery_fee_paise": 5000, "min_order_paise": 20000},
        ]
        for a in areas:
            db.add(ServiceableArea(**a))

    # 5. Seed Coupons
    if db.query(Coupon).count() == 0:
        coupons = [
            {"code": "WELCOME20", "description": "20% off for first order (up to ₹100)", "discount_type": "percentage", "discount_value": 20, "min_order_paise": 20000, "max_discount_paise": 10000},
            {"code": "SUPER50", "description": "Flat ₹50 off on orders above ₹300", "discount_type": "fixed", "discount_value": 5000, "min_order_paise": 30000, "max_discount_paise": 5000},
            {"code": "FESTIVE15", "description": "15% off festive dry cleaning", "discount_type": "percentage", "discount_value": 15, "min_order_paise": 40000, "max_discount_paise": 15000},
        ]
        for c in coupons:
            db.add(Coupon(**c))

    db.commit()
