import pytest
from app.models.entities import Order, OrderStatus, HandoverMethod, ServicePrice

def test_health_check(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"

def test_customer_registration_and_login(client):
    reg_payload = {
        "full_name": "Vikram Singh",
        "phone": "9988776655",
        "email": "vikram@example.com",
        "password": "Password@123"
    }
    reg_res = client.post("/api/v1/auth/register", json=reg_payload)
    assert reg_res.status_code == 200
    reg_data = reg_res.json()
    assert "access_token" in reg_data
    assert reg_data["user"]["phone"] == "9988776655"

    # Login
    login_res = client.post("/api/v1/auth/login", json={
        "phone_or_email": "9988776655",
        "password": "Password@123"
    })
    assert login_res.status_code == 200
    assert "access_token" in login_res.json()

def test_role_based_authorization(client):
    # Customer tries to access admin metrics
    login_res = client.post("/api/v1/auth/login", json={
        "phone_or_email": "9876543212", # seeded customer
        "password": "Customer@123"
    })
    customer_token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {customer_token}"}

    metrics_res = client.get("/api/v1/admin/metrics", headers=headers)
    assert metrics_res.status_code == 403

    # Admin access
    admin_login = client.post("/api/v1/auth/login", json={
        "phone_or_email": "9876543210", # seeded owner
        "password": "Admin@123"
    })
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    admin_metrics = client.get("/api/v1/admin/metrics", headers=admin_headers)
    assert admin_metrics.status_code == 200
    assert "orders_received_today" in admin_metrics.json()

def test_create_shop_dropoff_booking(client, db_session):
    # Get a service price id
    price_item = db_session.query(ServicePrice).filter(ServicePrice.item_name == "Shirt / Kurta").first()
    assert price_item is not None

    booking_payload = {
        "customer_name": "Rahul Verma",
        "customer_phone": "9123456789",
        "customer_email": "rahul@example.com",
        "handover_method": "shop_dropoff",
        "items": [
            {
                "service_price_id": price_item.id,
                "quantity": 3,
                "special_instruction": "No starch"
            }
        ],
        "payment_method": "cash"
    }

    res = client.post("/api/v1/orders/book", json=booking_payload)
    assert res.status_code == 200
    order_data = res.json()
    assert order_data["order_number"].startswith("SW-")
    assert order_data["handover_method"] == "shop_dropoff"
    assert order_data["status"] == "order_placed"
    # Unit price = 3000 paise (Rs 30) * 3 = 9000 paise. Tax 18% = 1620 paise. Total = 10620 paise (Rs 106.20)
    assert order_data["subtotal_paise"] == 9000
    assert order_data["tax_paise"] == 1620
    assert order_data["total_paise"] == 10620
    assert order_data["outstanding_paise"] == 10620

def test_home_pickup_booking_and_delivery_charge(client, db_session):
    price_item = db_session.query(ServicePrice).filter(ServicePrice.item_name == "Shirt Dry Cleaning").first()
    assert price_item is not None

    booking_payload = {
        "customer_name": "Sunita Rao",
        "customer_phone": "9845012345",
        "handover_method": "home_pickup_delivery",
        "pickup_address": "123, 100ft Road, Indiranagar",
        "pincode": "560038",
        "items": [
            {
                "service_price_id": price_item.id,
                "quantity": 1 # Rs 100 (below min free delivery Rs 500)
            }
        ],
        "coupon_code": "WELCOME20"
    }

    res = client.post("/api/v1/orders/book", json=booking_payload)
    assert res.status_code == 200
    data = res.json()
    assert data["handover_method"] == "home_pickup_delivery"
    assert data["status"] == "pickup_scheduled"
    assert data["delivery_fee_paise"] == 4000 # Indiranagar fee Rs 40

def test_coupon_validation(client):
    # Valid coupon
    res = client.post("/api/v1/coupons/validate", json={
        "code": "WELCOME20",
        "subtotal_paise": 30000 # Rs 300
    })
    assert res.status_code == 200
    data = res.json()
    assert data["valid"] is True
    assert data["discount_paise"] == 6000 # 20% of 300 = Rs 60

    # Invalid coupon
    res_invalid = client.post("/api/v1/coupons/validate", json={
        "code": "FAKECODE99",
        "subtotal_paise": 30000
    })
    assert res_invalid.status_code == 200
    assert res_invalid.json()["valid"] is False

def test_order_status_workflow_and_inspection(client, db_session):
    # Admin login
    admin_login = client.post("/api/v1/auth/login", json={
        "phone_or_email": "9876543210",
        "password": "Admin@123"
    })
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

    # Create walk-in order
    price_item = db_session.query(ServicePrice).filter(ServicePrice.item_name == "Shirt / Kurta").first()
    walkin_res = client.post("/api/v1/admin/orders/walk-in", json={
        "customer_name": "Gaurav Roy",
        "customer_phone": "9899112233",
        "items": [{"service_price_id": price_item.id, "quantity": 2}],
        "initial_payment_paise": 0
    }, headers=admin_headers)
    assert walkin_res.status_code == 200
    order_id = walkin_res.json()["id"]
    assert walkin_res.json()["status"] == "clothes_received"

    # Record garment inspection
    insp_res = client.post(f"/api/v1/admin/orders/{order_id}/inspection", json={
        "actual_count_received": 2,
        "existing_stains_damage": "Faint coffee stain on collar",
        "inspection_notes": "Tag placed on collar",
        "quality_check_passed": True
    }, headers=admin_headers)
    assert insp_res.status_code == 200
    assert insp_res.json()["actual_count_received"] == 2

    # Status auto-advanced to garment_inspection
    check_order = client.get(f"/api/v1/orders/{order_id}", headers=admin_headers)
    assert check_order.json()["status"] == "garment_inspection"

    # Advance to washing_drycleaning
    step1 = client.post(f"/api/v1/admin/orders/{order_id}/status", json={
        "status": "washing_drycleaning",
        "notes": "Sent to washing drum #3"
    }, headers=admin_headers)
    assert step1.status_code == 200
    assert step1.json()["status"] == "washing_drycleaning"

    # Advance to ironing_finishing
    step2 = client.post(f"/api/v1/admin/orders/{order_id}/status", json={
        "status": "ironing_finishing",
        "notes": "Steam press applied"
    }, headers=admin_headers)
    assert step2.status_code == 200
    assert step2.json()["status"] == "ironing_finishing"

    # Advance to quality_check
    step3 = client.post(f"/api/v1/admin/orders/{order_id}/status", json={
        "status": "quality_check",
        "notes": "Passed QC check"
    }, headers=admin_headers)
    assert step3.status_code == 200
    assert step3.json()["status"] == "quality_check"

    # Advance to ready_for_delivery
    step4 = client.post(f"/api/v1/admin/orders/{order_id}/status", json={
        "status": "ready_for_delivery",
        "notes": "Bagged and ready for customer collection"
    }, headers=admin_headers)
    assert step4.status_code == 200
    assert step4.json()["status"] == "ready_for_delivery"

def test_partial_payment_and_outstanding_balance(client, db_session):
    admin_login = client.post("/api/v1/auth/login", json={
        "phone_or_email": "9876543210",
        "password": "Admin@123"
    })
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

    price_item = db_session.query(ServicePrice).filter(ServicePrice.item_name == "Suit (2-Piece)").first()
    # Suit is Rs 300 (30000 paise). With 18% GST (5400 paise) = 35400 paise.
    order_res = client.post("/api/v1/orders/book", json={
        "customer_name": "Meera Sen",
        "customer_phone": "9876500000",
        "handover_method": "shop_dropoff",
        "items": [{"service_price_id": price_item.id, "quantity": 1}],
        "payment_method": "cash"
    })
    order_data = order_res.json()
    order_id = order_data["id"]
    total_paise = order_data["total_paise"]
    assert total_paise == 35400

    # Record partial payment of Rs 200 (20000 paise)
    pay_res = client.post(f"/api/v1/payments/record-manual?order_id={order_id}", json={
        "amount_paise": 20000,
        "payment_method": "cash",
        "notes": "Advance deposit at shop counter"
    }, headers=admin_headers)
    assert pay_res.status_code == 200

    # Verify updated order balances
    updated_order = client.get(f"/api/v1/orders/{order_id}", headers=admin_headers).json()
    assert updated_order["paid_paise"] == 20000
    assert updated_order["outstanding_paise"] == 15400 # 35400 - 20000
    assert updated_order["payment_status"] == "partially_paid"

    # Pay remaining balance via UPI
    pay_res_2 = client.post(f"/api/v1/payments/record-manual?order_id={order_id}", json={
        "amount_paise": 15400,
        "payment_method": "upi_manual",
        "transaction_reference": "UPI/2026/8947192",
        "notes": "Paid remainder via GooglePay QR"
    }, headers=admin_headers)
    assert pay_res_2.status_code == 200

    final_order = client.get(f"/api/v1/orders/{order_id}", headers=admin_headers).json()
    assert final_order["paid_paise"] == 35400
    assert final_order["outstanding_paise"] == 0
    assert final_order["payment_status"] == "paid"

def test_razorpay_verification_and_security(client, db_session):
    price_item = db_session.query(ServicePrice).filter(ServicePrice.item_name == "Trouser / Jeans").first()
    order_res = client.post("/api/v1/orders/book", json={
        "customer_name": "Dev User",
        "customer_phone": "9999988888",
        "handover_method": "shop_dropoff",
        "items": [{"service_price_id": price_item.id, "quantity": 1}],
        "payment_method": "razorpay"
    })
    order_id = order_res.json()["id"]

    # 1. Create Razorpay order
    rp_res = client.post("/api/v1/payments/razorpay/create-order", json={"order_id": order_id})
    assert rp_res.status_code == 200
    rp_order_id = rp_res.json()["razorpay_order_id"]
    assert rp_order_id is not None

    # 2. Verify with valid sandbox signature
    verify_res = client.post("/api/v1/payments/razorpay/verify", json={
        "order_id": order_id,
        "razorpay_order_id": rp_order_id,
        "razorpay_payment_id": "pay_mock_test_12345",
        "razorpay_signature": "sandbox_sig_valid_123"
    })
    assert verify_res.status_code == 200
    assert verify_res.json()["payment_status"] == "paid"

    # 3. Test invalid signature rejection
    fake_order = client.post("/api/v1/orders/book", json={
        "customer_name": "Attacker",
        "customer_phone": "9999900000",
        "handover_method": "shop_dropoff",
        "items": [{"service_price_id": price_item.id, "quantity": 1}]
    }).json()

    fraud_res = client.post("/api/v1/payments/razorpay/verify", json={
        "order_id": fake_order["id"],
        "razorpay_order_id": "order_invalid",
        "razorpay_payment_id": "pay_fraud_99",
        "razorpay_signature": "invalid_signature_hash"
    })
    assert fraud_res.status_code == 400

def test_customer_order_isolation_and_secure_tracking(client, db_session):
    price_item = db_session.query(ServicePrice).first()
    order_res = client.post("/api/v1/orders/book", json={
        "customer_name": "Deepak Joshi",
        "customer_phone": "9112233445",
        "handover_method": "shop_dropoff",
        "items": [{"service_price_id": price_item.id, "quantity": 1}]
    }).json()
    order_num = order_res["order_number"]

    # Tracking without phone or credentials must be denied (403)
    unauthorized_res = client.get(f"/api/v1/orders/track/{order_num}")
    assert unauthorized_res.status_code == 403

    # Tracking with wrong phone must be denied (403)
    wrong_phone_res = client.get(f"/api/v1/orders/track/{order_num}?phone=9000000000")
    assert wrong_phone_res.status_code == 403

    # Tracking with correct customer phone succeeds (200)
    correct_res = client.get(f"/api/v1/orders/track/{order_num}?phone=9112233445")
    assert correct_res.status_code == 200
    assert correct_res.json()["order_number"] == order_num
