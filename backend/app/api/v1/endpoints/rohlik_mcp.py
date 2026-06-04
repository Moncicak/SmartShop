"""Rohlík account connection endpoints — connect/verify/disconnect the MCP login."""
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.api.v1.deps import DB, CurrentUser
from app.core import crypto
from app.services import rohlik_mcp

router = APIRouter()


class ConnectBody(BaseModel):
    email: str
    password: str


class RohlikStatus(BaseModel):
    connected: bool
    email: Optional[str] = None
    tools_count: Optional[int] = None  # populated on connect / probe
    error: Optional[str] = None


@router.get("/status", response_model=RohlikStatus)
async def status(current_user: CurrentUser, probe: bool = Query(False)):
    """Connection state for the current user. With ?probe=true, re-verifies live
    using the stored credentials (slower — spawns the MCP server)."""
    if not current_user.rohlik_connected:
        return RohlikStatus(connected=False)
    if not probe:
        return RohlikStatus(connected=True, email=current_user.rohlik_email)
    try:
        password = crypto.decrypt(current_user.rohlik_password_enc)
    except Exception:
        return RohlikStatus(connected=True, email=current_user.rohlik_email,
                            error="Uložené heslo nelze rozšifrovat — připoj účet znovu.")
    res = await rohlik_mcp.verify_credentials(current_user.rohlik_email, password)
    return RohlikStatus(
        connected=True,
        email=current_user.rohlik_email,
        tools_count=len(res["tools"]) if res["ok"] else None,
        error=None if res["ok"] else res["error"],
    )


@router.post("/connect", response_model=RohlikStatus)
async def connect(body: ConnectBody, current_user: CurrentUser, db: DB):
    """Verify Rohlík credentials via MCP and, if they authenticate, store them
    (password encrypted) on the user."""
    email = body.email.strip()
    if not email or not body.password:
        raise HTTPException(status_code=400, detail="Zadej email i heslo.")

    res = await rohlik_mcp.verify_credentials(email, body.password)
    if not res["ok"]:
        raise HTTPException(status_code=400, detail=res["error"] or "Připojení k Rohlíku selhalo.")

    current_user.rohlik_email = email
    current_user.rohlik_password_enc = crypto.encrypt(body.password)
    current_user.rohlik_connected = True
    await db.flush()
    return RohlikStatus(connected=True, email=email, tools_count=len(res["tools"]))


@router.post("/disconnect", response_model=RohlikStatus)
async def disconnect(current_user: CurrentUser, db: DB):
    current_user.rohlik_email = None
    current_user.rohlik_password_enc = None
    current_user.rohlik_connected = False
    await db.flush()
    return RohlikStatus(connected=False)
