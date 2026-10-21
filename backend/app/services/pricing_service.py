from typing import List, Tuple
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.models.entities import ServicePrice, Coupon, ServiceableArea
from app.schemas import OrderItemCreate
from app.core.config import settings

class PricingService:
    @staticmethod
    def calculate_order_financials(
        db: Session,
        items_data: List[OrderItemCreate],
        handover_method: str,
        pincode: str = None,
        coupon_code: str = None
    ) -> dict:
        """
        Calculates itemized subtotal, discounts, delivery fee, taxes, and total in integer paise.
        """
        subtotal_paise = 0
        resolved_items = []

        for item_in in items_data:
            sp = db.query(ServicePrice).filter(ServicePrice.id == item_in.service_price_id).first()
            if not sp:
                raise ValueError(f"Service price ID {item_in.service_price_id} not found")
            
            # Subtotal calculation
            if sp.pricing_type == "per_kg" and item_in.weight_kg:
                item_subtotal = int(sp.price_paise * item_in.weight_kg)
            else:
                item_subtotal = sp.price_paise * item_in.quantity

            subtotal_paise += item_subtotal
            resolved_items.append({
                "service_id": sp.service_id,
                "service_price_id": sp.id,
                "service_name_snapshot": sp.service.name if sp.service else "Custom Service",
                "item_name_snapshot": sp.item_name,
                "pricing_type_snapshot": sp.pricing_type,
                "unit_price_paise_snapshot": sp.price_paise,
                "quantity": item_in.quantity,
                "weight_kg": item_in.weight_kg,
                "subtotal_paise": item_subtotal,
                "special_instruction": item_in.special_instruction
            })

        # Calculate discount
        discount_paise = 0
        applied_coupon = None
        if coupon_code:
            coupon = db.query(Coupon).filter(
                Coupon.code == coupon_code.strip().upper(),
                Coupon.is_active == True
            ).first()
            if coupon:
                now = datetime.now(timezone.utc)
                if not coupon.valid_until or coupon.valid_until >= now:
                    if subtotal_paise >= coupon.min_order_paise:
                        if coupon.discount_type == "percentage":
                            discount_calc = int((subtotal_paise * coupon.discount_value) / 100)
                            if coupon.max_discount_paise and discount_calc > coupon.max_discount_paise:
                                discount_calc = coupon.max_discount_paise
                            discount_paise = discount_calc
                        else: # fixed paise
                            discount_paise = min(coupon.discount_value, subtotal_paise)
                        applied_coupon = coupon.code

        # Calculate delivery fee
        delivery_fee_paise = 0
        if handover_method == "home_pickup_delivery":
            if subtotal_paise >= settings.MIN_ORDER_FOR_FREE_DELIVERY_PAISE:
                delivery_fee_paise = 0
            elif pincode:
                area = db.query(ServiceableArea).filter(
                    ServiceableArea.pincode == pincode.strip(),
                    ServiceableArea.is_active == True
                ).first()
                if area:
                    delivery_fee_paise = area.delivery_fee_paise
                else:
                    delivery_fee_paise = settings.DEFAULT_DELIVERY_FEE_PAISE
            else:
                delivery_fee_paise = settings.DEFAULT_DELIVERY_FEE_PAISE

        # Tax Calculation (18% GST on taxable value = subtotal - discount + delivery fee)
        taxable_value = max(0, subtotal_paise - discount_paise + delivery_fee_paise)
        tax_paise = int(taxable_value * (settings.GST_PERCENT / 100.0))

        total_paise = taxable_value + tax_paise

        return {
            "subtotal_paise": subtotal_paise,
            "discount_paise": discount_paise,
            "delivery_fee_paise": delivery_fee_paise,
            "tax_paise": tax_paise,
            "total_paise": total_paise,
            "coupon_code": applied_coupon,
            "resolved_items": resolved_items
        }

    @staticmethod
    def validate_coupon(db: Session, code: str, subtotal_paise: int) -> dict:
        coupon = db.query(Coupon).filter(
            Coupon.code == code.strip().upper(),
            Coupon.is_active == True
        ).first()

        if not coupon:
            return {"valid": False, "code": code, "discount_paise": 0, "message": "Invalid or expired promo code"}

        now = datetime.now(timezone.utc)
        if coupon.valid_until and coupon.valid_until < now:
            return {"valid": False, "code": code, "discount_paise": 0, "message": "Promo code has expired"}

        if subtotal_paise < coupon.min_order_paise:
            min_rs = coupon.min_order_paise // 100
            return {"valid": False, "code": code, "discount_paise": 0, "message": f"Minimum order of ₹{min_rs} required for this coupon"}

        if coupon.discount_type == "percentage":
            discount_calc = int((subtotal_paise * coupon.discount_value) / 100)
            if coupon.max_discount_paise and discount_calc > coupon.max_discount_paise:
                discount_calc = coupon.max_discount_paise
            discount_paise = discount_calc
        else:
            discount_paise = min(coupon.discount_value, subtotal_paise)

        return {
            "valid": True,
            "code": coupon.code,
            "discount_paise": discount_paise,
            "message": f"Applied successfully! ₹{discount_paise // 100} saved."
        }
