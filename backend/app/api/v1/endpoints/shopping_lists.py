"""Shopping list CRUD endpoints — stub for Phase 1, expanded in Phase 3."""
import uuid
from typing import List
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.api.v1.deps import DB, CurrentUser
from app.models.shopping_list import ShoppingList, ListItem, ListFrequency

router = APIRouter()


class ShoppingListCreate(BaseModel):
    name: str
    description: str | None = None
    frequency: ListFrequency = ListFrequency.WEEKLY


class ShoppingListResponse(BaseModel):
    id: str
    name: str
    description: str | None
    frequency: str
    is_active: bool
    model_config = {"from_attributes": True}


@router.get("/", response_model=List[ShoppingListResponse])
async def list_shopping_lists(current_user: CurrentUser, db: DB):
    result = await db.execute(
        select(ShoppingList)
        .where(ShoppingList.user_id == current_user.id, ShoppingList.is_active == True)
        .order_by(ShoppingList.created_at.desc())
    )
    lists = result.scalars().all()
    return [ShoppingListResponse(
        id=str(sl.id), name=sl.name, description=sl.description,
        frequency=sl.frequency.value, is_active=sl.is_active
    ) for sl in lists]


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
    return ShoppingListResponse(
        id=str(sl.id), name=sl.name, description=sl.description,
        frequency=sl.frequency.value, is_active=sl.is_active
    )


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
