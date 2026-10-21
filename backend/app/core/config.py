from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
from decimal import Decimal

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    PROJECT_NAME: str = "SuperWash - Laundry & Dry Cleaning Management"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = "superwash_super_secure_jwt_secret_key_change_in_production_2026_xyz"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Database
    DATABASE_URL: str = "sqlite:///./superwash.db"

    # Business Information (India localized)
    BUSINESS_NAME: str = "SuperWash Express & Dry Cleaners"
    BUSINESS_PHONE: str = "+91 98765 43210"
    BUSINESS_EMAIL: str = "care@superwash.in"
    BUSINESS_ADDRESS: str = "Shop #14, Metro Pillar 78, Indiranagar 100ft Road, Bengaluru, Karnataka 560038"
    GSTIN: str = "29ABCDE1234F1Z5"
    GST_PERCENT: float = 18.0  # 18% GST (9% CGST + 9% SGST)
    DEFAULT_DELIVERY_FEE_PAISE: int = 5000  # Rs 50
    MIN_ORDER_FOR_FREE_DELIVERY_PAISE: int = 50000  # Rs 500
    TIMEZONE: str = "Asia/Kolkata"

    # Payment Gateway (Razorpay India)
    RAZORPAY_KEY_ID: str = "rzp_test_SuperWashMockKeyId123"
    RAZORPAY_KEY_SECRET: str = "SuperWashMockSecretKey456"
    RAZORPAY_WEBHOOK_SECRET: str = "SuperWashWebhookSecret789"
    RAZORPAY_SANDBOX_MODE: bool = True

    # Notification settings
    SMS_PROVIDER_CONFIGURED: bool = False
    WHATSAPP_PROVIDER_CONFIGURED: bool = False
    SMTP_CONFIGURED: bool = False

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "*"
    ]

settings = Settings()
