from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.models.entities import Service, ServicePrice, DeliveryTimeSlot, ServiceableArea, Coupon, UserRole
from app.schemas import (
    ServiceOut, ServiceCreate, ServiceUpdate,
    ServicePriceOut, ServicePriceCreate, ServicePriceUpdate,
    DeliveryTimeSlotOut, ServiceableAreaOut,
    CouponValidateRequest, CouponValidateResponse
)
from app.services.pricing_service import PricingService
from app.api.deps import require_roles

router = APIRouter(tags=["Services & Pricing"])

@router.get("/services", response_model=List[ServiceOut])
def get_services(db: Session = Depends(get_db)):
    services = db.query(Service).filter(Service.is_active == True).order_by(Service.sort_order).all()
    return services

@router.get("/services/{service_id}", response_model=ServiceOut)
def get_service_by_id(service_id: str, db: Session = Depends(get_db)):
    service = db.query(Service).filter(Service.id == service_id).first()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    return service

@router.post("/admin/services", response_model=ServiceOut)
def create_service(
    service_in: ServiceCreate,
    db: Session = Depends(get_db),
    admin_user = Depends(require_roles(UserRole.OWNER.value, UserRole.MANAGER.value))
):
    existing = db.query(Service).filter(Service.code == service_in.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="A service with this code already exists")

    new_service = Service(
        name=service_in.name,
        code=service_in.code,
        description=service_in.description,
        category=service_in.category,
        is_active=service_in.is_active,
        icon=service_in.icon,
        sort_order=service_in.sort_order
    )
    db.add(new_service)
    db.flush()

    for p in service_in.prices or []:
        price_row = ServicePrice(
            service_id=new_service.id,
            item_name=p.item_name,
            pricing_type=p.pricing_type,
            price_paise=p.price_paise,
            min_quantity=p.min_quantity,
            is_active=p.is_active,
            sort_order=p.sort_order
        )
        db.add(price_row)

    db.commit()
    db.refresh(new_service)
    return new_service

@router.put("/admin/services/{service_id}", response_model=ServiceOut)
def update_service(
    service_id: str,
    update_in: ServiceUpdate,
    db: Session = Depends(get_db),
    admin_user = Depends(require_roles(UserRole.OWNER.value, UserRole.MANAGER.value))
):
    service = db.query(Service).filter(Service.id == service_id).first()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    for field, value in update_in.model_dump(exclude_unset=True).items():
        setattr(service, field, value)

    db.commit()
    db.refresh(service)
    return service

@router.post("/admin/services/{service_id}/prices", response_model=ServicePriceOut)
def add_service_price(
    service_id: str,
    price_in: ServicePriceCreate,
    db: Session = Depends(get_db),
    admin_user = Depends(require_roles(UserRole.OWNER.value, UserRole.MANAGER.value))
):
    service = db.query(Service).filter(Service.id == service_id).first()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    new_price = ServicePrice(
        service_id=service_id,
        item_name=price_in.item_name,
        pricing_type=price_in.pricing_type,
        price_paise=price_in.price_paise,
        min_quantity=price_in.min_quantity,
        is_active=price_in.is_active,
        sort_order=price_in.sort_order
    )
    db.add(new_price)
    db.commit()
    db.refresh(new_price)
    return new_price

@router.put("/admin/prices/{price_id}", response_model=ServicePriceOut)
def update_service_price(
    price_id: str,
    price_in: ServicePriceUpdate,
    db: Session = Depends(get_db),
    admin_user = Depends(require_roles(UserRole.OWNER.value, UserRole.MANAGER.value))
):
    price_row = db.query(ServicePrice).filter(ServicePrice.id == price_id).first()
    if not price_row:
        raise HTTPException(status_code=404, detail="Service price item not found")

    for field, value in price_in.model_dump(exclude_unset=True).items():
        setattr(price_row, field, value)

    db.commit()
    db.refresh(price_row)
    return price_row

@router.get("/slots", response_model=List[DeliveryTimeSlotOut])
def get_time_slots(db: Session = Depends(get_db)):
    return db.query(DeliveryTimeSlot).filter(DeliveryTimeSlot.is_active == True).all()

@router.get("/areas", response_model=List[ServiceableAreaOut])
def get_serviceable_areas(db: Session = Depends(get_db)):
    return db.query(ServiceableArea).filter(ServiceableArea.is_active == True).all()

@router.post("/coupons/validate", response_model=CouponValidateResponse)
def validate_coupon_code(req: CouponValidateRequest, db: Session = Depends(get_db)):
    res = PricingService.validate_coupon(db, req.code, req.subtotal_paise)
    return res
