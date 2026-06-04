"""Shopping list CRUD endpoints."""
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy import select, func, update

from app.api.v1.deps import DB, CurrentUser
from app.models.shopping_list import ShoppingList, ListItem, ListFrequency

router = APIRouter()

# How often each frequency is "due" again, in days. Drives the merged
# shopping view: a list reappears only once its interval has elapsed since
# it was last ordered.
INTERVAL_DAYS = {
    ListFrequency.DAILY: 1,
    ListFrequency.WEEKLY: 7,
    ListFrequency.BIWEEKLY: 14,
    ListFrequency.MONTHLY: 30,
    ListFrequency.CUSTOM: 7,
}


def _is_due(sl: ShoppingList, now: datetime) -> bool:
    """True if the list should be included in the next shopping run."""
    if sl.last_ordered_at is None:
        return True
    last = sl.last_ordered_at
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    interval = INTERVAL_DAYS.get(sl.frequency, 7)
    return (now - last).days >= interval


# ── Schemas ───────────────────────────────────────────────────────────────────

class ShoppingListCreate(BaseModel):
    name: str
    description: str | None = None
    frequency: ListFrequency = ListFrequency.WEEKLY


class ShoppingListUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    frequency: Optional[ListFrequency] = None


class ListItemCreate(BaseModel):
    generic_name: Optional[str] = None
    rohlik_product_id: Optional[str] = None
    rohlik_product_name: Optional[str] = None
    rohlik_image_url: Optional[str] = None
    quantity: float = 1.0
    unit: Optional[str] = None
    notes: Optional[str] = None


class ListItemUpdate(BaseModel):
    quantity: Optional[float] = None
    unit: Optional[str] = None
    notes: Optional[str] = None
    is_checked: Optional[bool] = None


class ListItemResponse(BaseModel):
    id: str
    list_id: str
    generic_name: Optional[str]
    rohlik_product_id: Optional[str]
    rohlik_product_name: Optional[str]
    rohlik_image_url: Optional[str]
    quantity: float
    unit: Optional[str]
    notes: Optional[str]
    is_checked: bool
    model_config = {"from_attributes": True}


class ShoppingListResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    frequency: str
    is_active: bool
    last_ordered_at: Optional[datetime] = None
    item_count: int = 0
    model_config = {"from_attributes": True}


class ShoppingListDetailResponse(ShoppingListResponse):
    items: List[ListItemResponse] = []


class ShoppingItem(ListItemResponse):
    """A merged shopping item, annotated with its source list."""
    source_list_id: str
    source_list_name: str
    source_frequency: str


class ShoppingView(BaseModel):
    """Merged set of items from all lists currently due to be ordered."""
    items: List[ShoppingItem] = []
    list_ids: List[str] = []  # the due lists this view was built from


class RohlikProduct(BaseModel):
    id: str
    name: str
    price: float
    unit: str
    image_url: Optional[str] = None
    in_stock: bool = True
    sale_price: Optional[float] = None
    discount_percentage: Optional[int] = None
    sale_ends_at: Optional[str] = None


# ── Shopping Lists ─────────────────────────────────────────────────────────────

def _list_to_response(sl: ShoppingList, item_count: int = 0) -> ShoppingListResponse:
    return ShoppingListResponse(
        id=str(sl.id), name=sl.name, description=sl.description,
        frequency=sl.frequency.value, is_active=sl.is_active,
        last_ordered_at=sl.last_ordered_at, item_count=item_count,
    )


@router.get("/", response_model=List[ShoppingListResponse])
async def list_shopping_lists(current_user: CurrentUser, db: DB):
    result = await db.execute(
        select(ShoppingList, func.count(ListItem.id))
        .outerjoin(ListItem, ListItem.list_id == ShoppingList.id)
        .where(ShoppingList.user_id == current_user.id, ShoppingList.is_active == True)
        .group_by(ShoppingList.id)
        .order_by(ShoppingList.created_at.desc())
    )
    return [_list_to_response(sl, count) for sl, count in result.all()]


@router.post("/", response_model=ShoppingListResponse, status_code=status.HTTP_201_CREATED)
async def create_shopping_list(body: ShoppingListCreate, current_user: CurrentUser, db: DB):
    sl = ShoppingList(
        user_id=current_user.id,
        name=body.name,
        description=body.description,
        frequency=body.frequency,
    )
    db.add(sl)
    await db.flush()
    return _list_to_response(sl, 0)


# ── Merged shopping view ───────────────────────────────────────────────────────
# NOTE: must be declared before "/{list_id}" so the literal path wins routing.

@router.get("/shopping", response_model=ShoppingView)
async def get_shopping_view(current_user: CurrentUser, db: DB):
    """All items from lists that are currently due, merged into one view."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(ShoppingList)
        .where(ShoppingList.user_id == current_user.id, ShoppingList.is_active == True)
        .order_by(ShoppingList.created_at)
    )
    due_lists = [sl for sl in result.scalars().all() if _is_due(sl, now)]
    if not due_lists:
        return ShoppingView(items=[], list_ids=[])

    items_result = await db.execute(
        select(ListItem)
        .where(ListItem.list_id.in_([sl.id for sl in due_lists]))
        .order_by(ListItem.created_at)
    )
    by_list = {sl.id: sl for sl in due_lists}
    items = [
        ShoppingItem(
            id=str(i.id), list_id=str(i.list_id),
            generic_name=i.generic_name, rohlik_product_id=i.rohlik_product_id,
            rohlik_product_name=i.rohlik_product_name, rohlik_image_url=i.rohlik_image_url,
            quantity=i.quantity, unit=i.unit, notes=i.notes, is_checked=i.is_checked,
            source_list_id=str(i.list_id),
            source_list_name=by_list[i.list_id].name,
            source_frequency=by_list[i.list_id].frequency.value,
        )
        for i in items_result.scalars().all()
    ]
    return ShoppingView(items=items, list_ids=[str(sl.id) for sl in due_lists])


@router.post("/shopping/mark-ordered", response_model=ShoppingView)
async def mark_shopping_ordered(current_user: CurrentUser, db: DB):
    """Close the current shopping cycle for every due list.

    Stamps last_ordered_at (resets the interval so the list disappears until
    due again) and clears is_checked on its items, so the next cycle starts
    from a clean slate.
    """
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(ShoppingList)
        .where(ShoppingList.user_id == current_user.id, ShoppingList.is_active == True)
    )
    due_ids = []
    for sl in result.scalars().all():
        if _is_due(sl, now):
            sl.last_ordered_at = now
            due_ids.append(sl.id)

    if due_ids:
        await db.execute(
            update(ListItem).where(ListItem.list_id.in_(due_ids)).values(is_checked=False)
        )
    await db.flush()
    return ShoppingView(items=[], list_ids=[])


@router.get("/{list_id}", response_model=ShoppingListDetailResponse)
async def get_shopping_list(list_id: uuid.UUID, current_user: CurrentUser, db: DB):
    result = await db.execute(
        select(ShoppingList).where(
            ShoppingList.id == list_id, ShoppingList.user_id == current_user.id
        )
    )
    sl = result.scalar_one_or_none()
    if not sl:
        raise HTTPException(status_code=404, detail="List not found")

    items_result = await db.execute(
        select(ListItem).where(ListItem.list_id == list_id).order_by(ListItem.created_at)
    )
    items = items_result.scalars().all()

    return ShoppingListDetailResponse(
        id=str(sl.id), name=sl.name, description=sl.description,
        frequency=sl.frequency.value, is_active=sl.is_active,
        last_ordered_at=sl.last_ordered_at, item_count=len(items),
        items=[ListItemResponse(
            id=str(i.id), list_id=str(i.list_id),
            generic_name=i.generic_name, rohlik_product_id=i.rohlik_product_id,
            rohlik_product_name=i.rohlik_product_name, rohlik_image_url=i.rohlik_image_url,
            quantity=i.quantity, unit=i.unit, notes=i.notes, is_checked=i.is_checked
        ) for i in items]
    )


@router.patch("/{list_id}", response_model=ShoppingListResponse)
async def update_shopping_list(
    list_id: uuid.UUID, body: ShoppingListUpdate, current_user: CurrentUser, db: DB
):
    result = await db.execute(
        select(ShoppingList).where(
            ShoppingList.id == list_id, ShoppingList.user_id == current_user.id
        )
    )
    sl = result.scalar_one_or_none()
    if not sl:
        raise HTTPException(status_code=404, detail="List not found")

    if body.name is not None:
        sl.name = body.name
    if body.description is not None:
        sl.description = body.description
    if body.frequency is not None:
        sl.frequency = body.frequency
    await db.flush()

    count_result = await db.execute(
        select(func.count(ListItem.id)).where(ListItem.list_id == list_id)
    )
    return _list_to_response(sl, count_result.scalar_one())


@router.delete("/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_shopping_list(list_id: uuid.UUID, current_user: CurrentUser, db: DB):
    result = await db.execute(
        select(ShoppingList).where(
            ShoppingList.id == list_id, ShoppingList.user_id == current_user.id
        )
    )
    sl = result.scalar_one_or_none()
    if not sl:
        raise HTTPException(status_code=404, detail="List not found")
    sl.is_active = False


# ── List Items ─────────────────────────────────────────────────────────────────

@router.post("/{list_id}/items", response_model=ListItemResponse, status_code=status.HTTP_201_CREATED)
async def add_item(list_id: uuid.UUID, body: ListItemCreate, current_user: CurrentUser, db: DB):
    result = await db.execute(
        select(ShoppingList).where(
            ShoppingList.id == list_id, ShoppingList.user_id == current_user.id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="List not found")

    if not body.generic_name and not body.rohlik_product_id:
        raise HTTPException(status_code=400, detail="Provide generic_name or rohlik_product_id")

    item = ListItem(
        list_id=list_id,
        generic_name=body.generic_name,
        rohlik_product_id=body.rohlik_product_id,
        rohlik_product_name=body.rohlik_product_name,
        rohlik_image_url=body.rohlik_image_url,
        quantity=body.quantity,
        unit=body.unit,
        notes=body.notes,
    )
    db.add(item)
    await db.flush()
    return ListItemResponse(
        id=str(item.id), list_id=str(item.list_id),
        generic_name=item.generic_name, rohlik_product_id=item.rohlik_product_id,
        rohlik_product_name=item.rohlik_product_name, rohlik_image_url=item.rohlik_image_url,
        quantity=item.quantity, unit=item.unit, notes=item.notes, is_checked=item.is_checked
    )


@router.patch("/{list_id}/items/{item_id}", response_model=ListItemResponse)
async def update_item(
    list_id: uuid.UUID, item_id: uuid.UUID,
    body: ListItemUpdate, current_user: CurrentUser, db: DB
):
    list_result = await db.execute(
        select(ShoppingList).where(
            ShoppingList.id == list_id, ShoppingList.user_id == current_user.id
        )
    )
    if not list_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="List not found")

    item_result = await db.execute(
        select(ListItem).where(ListItem.id == item_id, ListItem.list_id == list_id)
    )
    item = item_result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if body.quantity is not None:
        item.quantity = body.quantity
    if body.unit is not None:
        item.unit = body.unit
    if body.notes is not None:
        item.notes = body.notes
    if body.is_checked is not None:
        item.is_checked = body.is_checked

    await db.flush()
    return ListItemResponse(
        id=str(item.id), list_id=str(item.list_id),
        generic_name=item.generic_name, rohlik_product_id=item.rohlik_product_id,
        rohlik_product_name=item.rohlik_product_name, rohlik_image_url=item.rohlik_image_url,
        quantity=item.quantity, unit=item.unit, notes=item.notes, is_checked=item.is_checked
    )


@router.delete("/{list_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(
    list_id: uuid.UUID, item_id: uuid.UUID,
    current_user: CurrentUser, db: DB
):
    list_result = await db.execute(
        select(ShoppingList).where(
            ShoppingList.id == list_id, ShoppingList.user_id == current_user.id
        )
    )
    if not list_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="List not found")

    item_result = await db.execute(
        select(ListItem).where(ListItem.id == item_id, ListItem.list_id == list_id)
    )
    item = item_result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    await db.delete(item)


# ── Rohlik Search (stub → MCP) ─────────────────────────────────────────────────

def _to_schema(p) -> RohlikProduct:
    return RohlikProduct(
        id=p.id,
        name=p.name,
        price=p.price,
        unit=p.unit,
        image_url=p.image_url,
        in_stock=p.in_stock,
        sale_price=p.sale_price,
        discount_percentage=p.discount_percentage,
        sale_ends_at=p.sale_ends_at,
    )


@router.get("/rohlik/search", response_model=List[RohlikProduct])
async def search_rohlik(
    q: str = Query(..., min_length=2),
    current_user: CurrentUser = None,
):
    from app.services.rohlik_client import rohlik
    return [_to_schema(p) for p in await rohlik.search(q)]


@router.get("/rohlik/discounted", response_model=List[RohlikProduct])
async def get_discounted(current_user: CurrentUser = None):
    from app.services.rohlik_client import rohlik
    return [_to_schema(p) for p in await rohlik.get_discounted()]
