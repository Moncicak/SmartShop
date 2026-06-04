"""Order endpoints — persist a placed shopping run and list order history."""
from datetime import datetime, date, time, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import DB, CurrentUser
from app.models.order import Order, OrderItem, OrderStatus
from app.api.v1.endpoints.shopping_lists import compute_cart, close_due_cycle

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class OrderCreate(BaseModel):
    # Chosen delivery window (from the schedule suggestions). All optional —
    # an order can be placed without a slot.
    delivery_date: Optional[str] = None   # "YYYY-MM-DD"
    delivery_start: Optional[str] = None  # "HH:MM"
    delivery_end: Optional[str] = None    # "HH:MM"


class OrderItemResponse(BaseModel):
    id: str
    rohlik_product_id: str
    product_name: str
    quantity: float
    unit_price: float
    total_price: float
    is_on_sale: bool
    model_config = {"from_attributes": True}


class OrderResponse(BaseModel):
    id: str
    status: str
    total_amount: Optional[float]
    currency: str
    discount_saved: float
    delivery_window_start: Optional[datetime]
    delivery_window_end: Optional[datetime]
    created_at: datetime
    item_count: int
    items: List[OrderItemResponse] = []


def _combine(d: Optional[str], t: Optional[str]) -> Optional[datetime]:
    """Combine "YYYY-MM-DD" + "HH:MM" into a tz-aware datetime."""
    if not d or not t:
        return None
    try:
        day = date.fromisoformat(d)
        hh, mm = map(int, t.split(":"))
        return datetime.combine(day, time(hh, mm), tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None


def _to_response(o: Order) -> OrderResponse:
    return OrderResponse(
        id=str(o.id),
        status=o.status.value,
        total_amount=o.total_amount,
        currency=o.currency,
        discount_saved=o.discount_saved,
        delivery_window_start=o.delivery_window_start,
        delivery_window_end=o.delivery_window_end,
        created_at=o.created_at,
        item_count=len(o.items),
        items=[OrderItemResponse(
            id=str(i.id),
            rohlik_product_id=i.rohlik_product_id,
            product_name=i.product_name,
            quantity=i.quantity,
            unit_price=i.unit_price,
            total_price=i.total_price,
            is_on_sale=i.is_on_sale,
        ) for i in o.items],
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def place_order(body: OrderCreate, current_user: CurrentUser, db: DB):
    """Place an order from the current cart, then close the shopping cycle.

    The cart is rebuilt server-side (prices are authoritative), matched lines
    are snapshotted into order_items, and the due lists are stamped/cleared so
    they disappear until due again — same effect the old mark-ordered had.
    """
    cart = await compute_cart(db, current_user)
    matched_lines = [ln for ln in cart.lines if ln.matched and ln.line_total is not None]
    if not matched_lines:
        raise HTTPException(status_code=400, detail="Nothing to order — cart is empty or no products matched.")

    discount_saved = 0.0
    for ln in matched_lines:
        p = ln.matched
        if p.sale_price and p.sale_price < p.price:
            discount_saved += round((p.price - p.sale_price) * (ln.packages or 1), 2)

    order = Order(
        user_id=current_user.id,
        status=OrderStatus.PLACED,
        total_amount=cart.total,
        currency="CZK",
        discount_saved=round(discount_saved, 2),
        delivery_window_start=_combine(body.delivery_date, body.delivery_start),
        delivery_window_end=_combine(body.delivery_date, body.delivery_end),
        approved_at=datetime.now(timezone.utc),
    )
    items = []
    for ln in matched_lines:
        p = ln.matched
        on_sale = bool(p.sale_price and p.sale_price < p.price)
        unit_price = p.sale_price if on_sale else p.price
        items.append(OrderItem(
            rohlik_product_id=p.id,
            product_name=p.name,
            quantity=ln.packages or 1,
            unit_price=unit_price,
            total_price=ln.line_total,
            discount_applied=round((p.price - unit_price) * (ln.packages or 1), 2) if on_sale else 0.0,
            is_on_sale=on_sale,
        ))
    order.items = items  # relationship populates FK + keeps items in memory
    db.add(order)

    await close_due_cycle(db, current_user)
    await db.flush()
    return _to_response(order)


@router.get("", response_model=List[OrderResponse])
async def list_orders(current_user: CurrentUser, db: DB):
    result = await db.execute(
        select(Order)
        .where(Order.user_id == current_user.id)
        .options(selectinload(Order.items))
        .order_by(Order.created_at.desc())
    )
    return [_to_response(o) for o in result.scalars().all()]
