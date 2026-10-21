from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import verify_password, get_password_hash, create_access_token
from app.models.entities import User, CustomerProfile, UserRole, CustomerAddress
from app.schemas import UserCreate, UserLogin, UserOut, Token, CustomerAddressCreate, CustomerAddressOut
from app.api.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register", response_model=Token)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    # Check if phone already registered
    existing_phone = db.query(User).filter(User.phone == user_in.phone.strip()).first()
    if existing_phone:
        raise HTTPException(
            status_code=400,
            detail="A user with this phone number already exists."
        )

    if user_in.email:
        existing_email = db.query(User).filter(User.email == user_in.email.strip().lower()).first()
        if existing_email:
            raise HTTPException(
                status_code=400,
                detail="A user with this email address already exists."
            )

    new_user = User(
        phone=user_in.phone.strip(),
        email=user_in.email.strip().lower() if user_in.email else None,
        full_name=user_in.full_name.strip(),
        hashed_password=get_password_hash(user_in.password),
        role=UserRole.CUSTOMER.value,
        is_active=True,
        is_phone_verified=True # Auto-verify in dev/local mode
    )
    db.add(new_user)
    db.flush()

    # Create associated customer profile
    profile = CustomerProfile(user_id=new_user.id)
    db.add(profile)
    db.commit()
    db.refresh(new_user)

    token = create_access_token(subject=new_user.id)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": new_user
    }

@router.post("/login", response_model=Token)
def login(login_in: UserLogin, db: Session = Depends(get_db)):
    identifier = login_in.phone_or_email.strip()
    user = db.query(User).filter(
        (User.phone == identifier) | (User.email == identifier.lower())
    ).first()

    if not user or not verify_password(login_in.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect phone/email or password."
        )

    if not user.is_active:
        raise HTTPException(status_code=400, detail="Account is disabled.")

    token = create_access_token(subject=user.id)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user
    }

@router.get("/me", response_model=UserOut)
def get_current_user_profile(current_user: User = Depends(get_current_user)):
    return current_user

@router.post("/addresses", response_model=CustomerAddressOut)
def add_customer_address(
    addr_in: CustomerAddressCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # If set to default, remove previous default
    if addr_in.is_default:
        db.query(CustomerAddress).filter(CustomerAddress.user_id == current_user.id).update({"is_default": False})

    new_addr = CustomerAddress(
        user_id=current_user.id,
        label=addr_in.label,
        address_line1=addr_in.address_line1,
        address_line2=addr_in.address_line2,
        landmark=addr_in.landmark,
        city=addr_in.city,
        state=addr_in.state,
        pincode=addr_in.pincode,
        is_default=addr_in.is_default,
        is_serviceable=True
    )
    db.add(new_addr)
    db.commit()
    db.refresh(new_addr)
    return new_addr
