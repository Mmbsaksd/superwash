from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional
import os

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    PROJECT_NAME: str = "SuperWash Exprez - Operations & Management API"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "superwash_dev_secret_change_in_production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./superwash.db")

    # Business Information (India localized - real business defaults)
    BUSINESS_NAME: str = "SuperWash Exprez"
    BUSINESS_PHONE: str = "+91 98765 43210"
    BUSINESS_EMAIL: str = "care@superwash.in"
    BUSINESS_ADDRESS: str = "Shop #14, Metro Pillar 78, Indiranagar, Bengaluru, Karnataka 560038"
    GSTIN: Optional[str] = None  # No fabricated GST claimed
    GST_PERCENT: float = 0.0     # 0% tax until verified business registration
    DEFAULT_DELIVERY_FEE_PAISE: int = 0  # Free home pickup & delivery standard
    MIN_ORDER_FOR_FREE_DELIVERY_PAISE: int = 0
    TIMEZONE: str = "Asia/Kolkata"

    # Optional Payment Gateway
    RAZORPAY_KEY_ID: Optional[str] = None
    RAZORPAY_KEY_SECRET: Optional[str] = None
    RAZORPAY_WEBHOOK_SECRET: Optional[str] = None
    RAZORPAY_SANDBOX_MODE: bool = True

    # Notification settings
    SMS_PROVIDER_CONFIGURED: bool = False
    WHATSAPP_PROVIDER_CONFIGURED: bool = False
    SMTP_CONFIGURED: bool = False

    # CORS - Restricted strictly to verified frontend origins (no wildcard '*')
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "https://superwash.in"
    ]

settings = Settings()
