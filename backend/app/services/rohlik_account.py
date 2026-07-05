"""Authenticated Rohlik.cz HTTP client — per-user account operations.

Unlike `rohlik_client.py` (anonymous search), these calls need a logged-in
session. Credentials come per call from the user's encrypted DB record.
Unlike the MCP tools (human-readable text), these endpoints return clean JSON.
"""
import logging
from typing import Any, Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

BASE_URL = settings.ROHLIK_BASE_URL
_HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/plain, */*",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": BASE_URL,
    "Origin": BASE_URL,
}


class RohlikAuthError(RuntimeError):
    """Login to Rohlík failed (bad credentials or pending e-mail verification)."""


async def _login(client: httpx.AsyncClient, email: str, password: str) -> dict:
    """Log in; session cookies persist on the client. Returns login `data`."""
    resp = await client.post(
        "/services/frontend-service/login",
        json={"email": email, "password": password, "name": ""},
    )
    if resp.status_code != 200:
        raise RohlikAuthError(f"Login failed (HTTP {resp.status_code})")
    data = (resp.json() or {}).get("data") or {}
    if not data.get("isAuthenticated"):
        raise RohlikAuthError("Login rejected — check credentials / e-mail verification")
    return data


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(base_url=BASE_URL, headers=_HEADERS, timeout=25)


async def get_addresses(email: str, password: str) -> dict:
    """Saved delivery addresses + which one the cart currently uses.

    Returns {"addresses": [...], "cart_address_id": int|None, "user_id": int}.
    """
    async with _client() as client:
        login = await _login(client, email, password)
        resp = await client.get("/api/v1/address")
        resp.raise_for_status()
        payload = resp.json() or {}
        addresses = [
            {
                "id": a["id"],
                "display": a.get("display") or f'{a.get("street", "")} {a.get("houseNumber", "")}, {a.get("city", "")}'.strip(),
                "city": a.get("city"),
                "street": a.get("street"),
                "house_number": a.get("houseNumber"),
                "postal_code": a.get("postalCode"),
            }
            for a in payload.get("addresses", [])
        ]
        cart_addr = (payload.get("cartAddress") or {}).get("addressId")
        return {
            "addresses": addresses,
            "cart_address_id": cart_addr,
            "user_id": (login.get("user") or {}).get("id"),
        }


async def add_to_cart(email: str, password: str, items: list[dict]) -> dict:
    """Push items into the user's real Rohlík cart (one login session for all).

    `items`: [{"product_id": int, "quantity": int, "label": str}]
    Returns {"pushed": [labels], "failed": [labels], "cart_total": float|None,
             "cart_items": int|None}.
    """
    pushed: list[str] = []
    failed: list[str] = []
    async with _client() as client:
        await _login(client, email, password)

        for item in items:
            label = item.get("label") or str(item["product_id"])
            try:
                resp = await client.post(
                    "/services/frontend-service/v2/cart",
                    json={
                        "actionId": None,
                        "productId": int(item["product_id"]),
                        "quantity": int(item["quantity"]),
                        "recipeId": None,
                        "source": "true:Shopping Lists",
                    },
                )
                if resp.status_code == 200:
                    pushed.append(label)
                else:
                    logger.warning(
                        "Rohlik cart add failed: product=%s qty=%s -> HTTP %s: %s",
                        item["product_id"], item["quantity"],
                        resp.status_code, resp.text[:300],
                    )
                    failed.append(label)
            except Exception as e:  # noqa: BLE001 — keep pushing the rest
                logger.warning("Rohlik cart add error: product=%s: %s", item["product_id"], e)
                failed.append(label)

        cart_total = cart_items = None
        try:
            resp = await client.get("/services/frontend-service/v2/cart")
            if resp.status_code == 200:
                data = (resp.json() or {}).get("data") or {}
                cart_total = data.get("totalPrice")
                cart_items = len(data.get("items") or {})
        except Exception:  # noqa: BLE001 — summary is best-effort
            pass

    return {"pushed": pushed, "failed": failed,
            "cart_total": cart_total, "cart_items": cart_items}


def _collect_slots(node: Any, out: dict) -> None:
    """Recursively collect slot dicts (slotId + since + till) from the payload."""
    if isinstance(node, dict):
        if node.get("slotId") and node.get("since") and node.get("till"):
            out[node["slotId"]] = node
        for v in node.values():
            _collect_slots(v, out)
    elif isinstance(node, list):
        for v in node:
            _collect_slots(v, out)


async def get_timeslots(email: str, password: str, address_id: Optional[int] = None) -> list[dict]:
    """Real delivery slots for the given (or active) address.

    Returns a flat, deduped list: [{slot_id, since, till, price, capacity,
    capacity_percent, time_window}], sorted by start time.
    """
    async with _client() as client:
        login = await _login(client, email, password)
        user_id = (login.get("user") or {}).get("id")
        addr_id = address_id or (login.get("address") or {}).get("id")
        if not (user_id and addr_id):
            return []

        resp = await client.get(
            "/services/frontend-service/timeslots-api/0",
            params={"userId": user_id, "addressId": addr_id, "reasonableDeliveryTime": "true"},
        )
        resp.raise_for_status()
        raw: dict = {}
        _collect_slots((resp.json() or {}).get("data"), raw)

        slots = []
        for s in raw.values():
            cap = s.get("timeSlotCapacityDTO") or {}
            slots.append({
                "slot_id": s["slotId"],
                "since": s["since"],          # "2026-07-06 06:00"
                "till": s["till"],
                "price": s.get("price", 0),
                "capacity": s.get("capacity"),  # GREEN / ORANGE / RED
                "capacity_percent": cap.get("totalFreeCapacityPercent"),
                "time_window": s.get("timeWindow"),
            })
        slots.sort(key=lambda x: x["since"])
        return slots
