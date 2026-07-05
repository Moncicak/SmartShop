"""Rohlík account connection endpoints — connect/verify/disconnect the MCP login."""
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.api.v1.deps import DB, CurrentUser
from app.core import crypto
from app.services import rohlik_mcp, rohlik_account

router = APIRouter()


class ConnectBody(BaseModel):
    email: str
    password: str


class RohlikAddress(BaseModel):
    id: int
    display: str
    city: Optional[str] = None


class AddressesResponse(BaseModel):
    addresses: List[RohlikAddress]
    selected_id: Optional[int] = None   # user's choice in SmartCart
    cart_address_id: Optional[int] = None  # what Rohlík's cart currently uses


class SelectAddressBody(BaseModel):
    address_id: int


class PushCartResponse(BaseModel):
    pushed: int
    failed: List[str]           # labels of items that could not be added
    skipped: int                # unmatched lines (no Rohlík product)
    cart_total: Optional[float] = None   # real Rohlík cart total after push
    cart_items: Optional[int] = None
    cart_url: str = "https://www.rohlik.cz/objednavka"


def _decrypt_password(user) -> str:
    if not user.rohlik_connected:
        raise HTTPException(status_code=400, detail="Rohlík účet není připojen.")
    try:
        return crypto.decrypt(user.rohlik_password_enc)
    except Exception:
        raise HTTPException(status_code=400, detail="Uložené heslo nelze rozšifrovat — připoj účet znovu.")


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
    current_user.rohlik_address_id = None
    await db.flush()
    return RohlikStatus(connected=False)


@router.get("/addresses", response_model=AddressesResponse)
async def list_addresses(current_user: CurrentUser):
    """Saved delivery addresses from the user's Rohlík profile."""
    password = _decrypt_password(current_user)
    try:
        data = await rohlik_account.get_addresses(current_user.rohlik_email, password)
    except rohlik_account.RohlikAuthError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=502, detail="Nepodařilo se načíst adresy z Rohlíku.")

    return AddressesResponse(
        addresses=[RohlikAddress(id=a["id"], display=a["display"], city=a.get("city"))
                   for a in data["addresses"]],
        selected_id=current_user.rohlik_address_id or data.get("cart_address_id"),
        cart_address_id=data.get("cart_address_id"),
    )


@router.post("/cart", response_model=PushCartResponse)
async def push_cart(current_user: CurrentUser, db: DB):
    """Fill the user's real Rohlík cart from the currently-due shopping items.

    Only lines matched to a concrete Rohlík product are pushed (whole packages).
    The order itself is confirmed by the user in Rohlík — we never place it.
    """
    import math

    from app.api.v1.endpoints.shopping_lists import compute_cart

    password = _decrypt_password(current_user)
    cart = await compute_cart(db, current_user)

    items = []
    skipped = 0
    for line in cart.lines:
        if not line.matched:
            skipped += 1
            continue
        qty = max(1, math.ceil(line.packages or line.quantity or 1))
        items.append({
            "product_id": int(line.matched.id),
            "quantity": qty,
            "label": line.matched.name,
        })

    if not items:
        raise HTTPException(status_code=400, detail="V košíku nejsou žádné spárované položky.")

    import logging
    logging.getLogger(__name__).info(
        "Pushing %d items to Rohlik cart: %s",
        len(items), [(i["product_id"], i["quantity"]) for i in items],
    )

    try:
        res = await rohlik_account.add_to_cart(current_user.rohlik_email, password, items)
    except rohlik_account.RohlikAuthError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=502, detail="Nepodařilo se naplnit košík na Rohlíku.")

    return PushCartResponse(
        pushed=len(res["pushed"]),
        failed=res["failed"],
        skipped=skipped,
        cart_total=res["cart_total"],
        cart_items=res["cart_items"],
    )


@router.put("/address", response_model=AddressesResponse)
async def select_address(body: SelectAddressBody, current_user: CurrentUser, db: DB):
    """Pick which saved address deliveries should go to (validated against the profile)."""
    password = _decrypt_password(current_user)
    try:
        data = await rohlik_account.get_addresses(current_user.rohlik_email, password)
    except rohlik_account.RohlikAuthError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=502, detail="Nepodařilo se ověřit adresu u Rohlíku.")

    if body.address_id not in {a["id"] for a in data["addresses"]}:
        raise HTTPException(status_code=400, detail="Tahle adresa v profilu Rohlíku není.")

    current_user.rohlik_address_id = body.address_id
    await db.flush()
    return AddressesResponse(
        addresses=[RohlikAddress(id=a["id"], display=a["display"], city=a.get("city"))
                   for a in data["addresses"]],
        selected_id=body.address_id,
        cart_address_id=data.get("cart_address_id"),
    )
