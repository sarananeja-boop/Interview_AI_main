"""
Security utilities for Database Encryption and PII Masking.
"""

import json
import re
from typing import Any
from cryptography.fernet import Fernet
from sqlalchemy.types import TypeDecorator, String, Text

from config import settings

# Initialize Fernet with the secure key from .env
if not settings.DB_ENCRYPTION_KEY:
    raise ValueError("DB_ENCRYPTION_KEY must be set in production")
    
# Fernet keys must be 32 URL-safe base64-encoded bytes. 
# We ensure the key meets this by padding or slicing if necessary, 
# though secrets.token_urlsafe(32) provides 43 chars.
key_bytes = settings.DB_ENCRYPTION_KEY.encode('utf-8')
if len(key_bytes) != 44:
    import base64
    import hashlib
    # Derive a valid 32-byte fernet key from the env variable
    key_bytes = base64.urlsafe_b64encode(hashlib.sha256(key_bytes).digest())

cipher = Fernet(key_bytes)


class EncryptedText(TypeDecorator):
    """
    SQLAlchemy TypeDecorator that encrypts text on the way into the DB
    and decrypts it on the way out.
    Used for storing PII (like resumes) securely at rest.
    """
    impl = Text
    cache_ok = True

    def process_bind_param(self, value: str | None, dialect: Any) -> str | None:
        if value is None:
            return None
        return cipher.encrypt(value.encode('utf-8')).decode('utf-8')

    def process_result_value(self, value: str | None, dialect: Any) -> str | None:
        if value is None:
            return None
        try:
            return cipher.decrypt(value.encode('utf-8')).decode('utf-8')
        except Exception:
            # Fallback if the data was already in the DB unencrypted
            # (e.g. before we added encryption)
            return value


class EncryptedJSON(TypeDecorator):
    """
    SQLAlchemy TypeDecorator that encrypts JSON on the way into the DB.
    """
    impl = Text
    cache_ok = True

    def process_bind_param(self, value: dict | list | None, dialect: Any) -> str | None:
        if value is None:
            return None
        json_str = json.dumps(value)
        return cipher.encrypt(json_str.encode('utf-8')).decode('utf-8')

    def process_result_value(self, value: str | None, dialect: Any) -> dict | list | None:
        if value is None:
            return None
        try:
            decrypted = cipher.decrypt(value.encode('utf-8')).decode('utf-8')
            return json.loads(decrypted)
        except Exception:
            # Fallback for old unencrypted data
            try:
                return json.loads(value)
            except Exception:
                return None


def mask_pii_enhanced(text: str) -> str:
    """
    Advanced PII masking function for resumes before sending to LLM.
    Masks emails, phone numbers, Aadhaar numbers, PAN cards.
    """
    if not text:
        return text

    # Mask Emails
    text = re.sub(r'[\w\.-]+@[\w\.-]+\.\w+', '[EMAIL_REDACTED]', text)
    
    # Mask Indian Phone Numbers (e.g. +91 9876543210, 98765-43210)
    text = re.sub(r'(?:(?:\+|0{0,2})91(\s*[\-]\s*)?|[0]?)?[6789]\d{9}', '[PHONE_REDACTED]', text)
    
    # Mask Aadhaar (12 digits, space separated optionally)
    text = re.sub(r'\b\d{4}\s?\d{4}\s?\d{4}\b', '[AADHAAR_REDACTED]', text)
    
    # Mask PAN Card (5 chars, 4 digits, 1 char)
    text = re.sub(r'\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b', '[PAN_REDACTED]', text)

    return text
