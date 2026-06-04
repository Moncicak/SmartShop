"""Symmetric encryption for credentials we must store reversibly.

Used for the Rohlík password (the MCP server needs the plaintext to log in, so it
can't be hashed). Key is derived from SECRET_KEY — rotating SECRET_KEY invalidates
stored secrets (users would need to reconnect).
"""
import base64
import hashlib

from cryptography.fernet import Fernet

from app.core.config import settings


def _fernet() -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
    return Fernet(key)


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    return _fernet().decrypt(token.encode()).decode()
