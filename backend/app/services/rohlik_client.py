"""Rohlik.cz API client — product search works without authentication."""
import asyncio
import time
from typing import Optional
from dataclasses import dataclass

import httpx

from app.core.config import settings

BASE_URL = settings.ROHLIK_BASE_URL
CDN_URL = "https://cdn.rohlik.cz"
_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": BASE_URL,
    "Origin": BASE_URL,
}


@dataclass
class RohlikProduct:
    id: str
    name: str
    price: float
    currency: str
    unit: str
    in_stock: bool
    image_url: Optional[str] = None
    sale_price: Optional[float] = None
    discount_percentage: Optional[int] = None
    sale_ends_at: Optional[str] = None
    brand: Optional[str] = None


def _image_url(img_path: Optional[str], size: int = 100) -> Optional[str]:
    if not img_path:
        return None
    full = img_path if img_path.startswith("http") else f"{CDN_URL}{img_path}"
    # Cloudflare image resizing — returns WebP thumbnail, much smaller
    return f"https://www.rohlik.cz/cdn-cgi/image/f=auto,w={size},h={size}/{full}"


def _parse_sale(sales) -> tuple[Optional[float], Optional[int], Optional[str]]:
    """Returns (sale_price, discount_pct, ends_at) from a sales object."""
    if not sales:
        return None, None, None
    # sales can be a dict or a list — API returns a single object
    if isinstance(sales, list):
        sales = sales[0] if sales else None
    if not sales:
        return None, None, None
    sale_price = (sales.get("price") or {}).get("full")
    discount_pct = sales.get("discountPercentage")
    ends_at = sales.get("endsAt")
    return (
        float(sale_price) if sale_price else None,
        int(discount_pct) if discount_pct else None,
        ends_at,
    )


class RohlikClient:
    def __init__(self) -> None:
        self._last_request: float = 0.0

    async def _throttle(self) -> None:
        elapsed = time.monotonic() - self._last_request
        if elapsed < 0.1:
            await asyncio.sleep(0.1 - elapsed)
        self._last_request = time.monotonic()

    async def _get(self, path: str, params: dict) -> dict:
        await self._throttle()
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{BASE_URL}{path}",
                headers=_HEADERS,
                params=params,
            )
        if resp.status_code != 200:
            return {}
        return resp.json()

    def _parse_product(self, p: dict) -> Optional[RohlikProduct]:
        badges = p.get("badge") or []
        if any(b.get("slug") == "promoted" for b in badges):
            return None

        price_obj = p.get("price") or {}
        full_price = float(price_obj.get("full", 0.0))
        sale_price, discount_pct, ends_at = _parse_sale(p.get("sales"))

        return RohlikProduct(
            id=str(p.get("productId", p.get("id", ""))),
            name=p.get("productName", p.get("name", "")),
            price=full_price,
            currency=price_obj.get("currency", "Kč"),
            unit=p.get("textualAmount", "ks"),
            in_stock=not p.get("unavailable", False),
            image_url=_image_url(p.get("imgPath")),
            sale_price=sale_price,
            discount_percentage=discount_pct,
            sale_ends_at=ends_at,
            brand=p.get("brand"),
        )

    async def search(self, query: str, limit: int = 20) -> list[RohlikProduct]:
        data = await self._get(
            "/services/frontend-service/search-metadata",
            {"search": query, "offset": 0, "limit": limit, "companyId": 1, "canCorrect": "true"},
        )
        products = []
        for p in data.get("data", {}).get("productList", []):
            product = self._parse_product(p)
            if product:
                products.append(product)

        # Sort: on-sale items first
        products.sort(key=lambda p: (p.sale_price is None, p.price))
        return products

    async def get_discounted(self, limit: int = 30) -> list[RohlikProduct]:
        """Fetch currently discounted products (shown on Rohlík tab by default)."""
        data = await self._get(
            "/api/v1/categories/sales/subcategories",
            {"companyId": 1},
        )
        products = []
        for category in (data.get("data") or [])[:3]:
            cat_id = category.get("id") or category.get("slug")
            if not cat_id:
                continue
            cat_data = await self._get(
                f"/services/frontend-service/v2/categories/{cat_id}/products",
                {"offset": 0, "limit": 10, "companyId": 1},
            )
            for p in cat_data.get("data", {}).get("productList", []):
                product = self._parse_product(p)
                if product and product.sale_price:
                    products.append(product)
            if len(products) >= limit:
                break
        return products[:limit]


rohlik = RohlikClient()
