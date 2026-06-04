"""Schedule CRUD endpoints — stub for Phase 1, expanded in Phase 4."""
import uuid
from typing import List
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.api.v1.deps import DB, CurrentUser
from app.models.schedule import ScheduleSlot, DayOfWeek, ActivityType

router = APIRouter()


class ScheduleSlotUpdate(BaseModel):
    day_of_week: int | None = None
    start_time: str | None = None
    end_time: str | None = None
    activity_type: ActivityType | None = None
    label: str | None = None
    is_home: bool | None = None


class ScheduleSlotCreate(BaseModel):
    day_of_week: int  # 0=Monday ... 6=Sunday
    start_time: str   # "HH:MM"
    end_time: str     # "HH:MM"
    activity_type: ActivityType
    label: str | None = None
    is_home: bool = False


class ScheduleSlotResponse(BaseModel):
    id: str
    day_of_week: int
    start_time: str
    end_time: str
    activity_type: str
    label: str | None
    is_home: bool


@router.get("/", response_model=List[ScheduleSlotResponse])
async def get_schedule(current_user: CurrentUser, db: DB):
    result = await db.execute(
        select(ScheduleSlot)
        .where(ScheduleSlot.user_id == current_user.id)
        .order_by(ScheduleSlot.day_of_week, ScheduleSlot.start_time)
    )
    slots = result.scalars().all()
    return [ScheduleSlotResponse(
        id=str(s.id),
        day_of_week=s.day_of_week,
        start_time=s.start_time.strftime("%H:%M"),
        end_time=s.end_time.strftime("%H:%M"),
        activity_type=s.activity_type.value,
        label=s.label,
        is_home=s.is_home,
    ) for s in slots]


@router.post("/", response_model=ScheduleSlotResponse, status_code=status.HTTP_201_CREATED)
async def create_slot(body: ScheduleSlotCreate, current_user: CurrentUser, db: DB):
    from datetime import time
    start = time(*map(int, body.start_time.split(":")))
    end = time(*map(int, body.end_time.split(":")))

    slot = ScheduleSlot(
        user_id=current_user.id,
        day_of_week=body.day_of_week,
        start_time=start,
        end_time=end,
        activity_type=body.activity_type,
        label=body.label,
        is_home=body.is_home,
    )
    db.add(slot)
    await db.flush()
    return ScheduleSlotResponse(
        id=str(slot.id),
        day_of_week=slot.day_of_week,
        start_time=slot.start_time.strftime("%H:%M"),
        end_time=slot.end_time.strftime("%H:%M"),
        activity_type=slot.activity_type.value,
        label=slot.label,
        is_home=slot.is_home,
    )


@router.patch("/{slot_id}", response_model=ScheduleSlotResponse)
async def update_slot(slot_id: uuid.UUID, body: ScheduleSlotUpdate, current_user: CurrentUser, db: DB):
    from datetime import time
    result = await db.execute(
        select(ScheduleSlot).where(
            ScheduleSlot.id == slot_id, ScheduleSlot.user_id == current_user.id
        )
    )
    slot = result.scalar_one_or_none()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    if body.day_of_week is not None:
        slot.day_of_week = body.day_of_week
    if body.start_time is not None:
        slot.start_time = time(*map(int, body.start_time.split(":")))
    if body.end_time is not None:
        slot.end_time = time(*map(int, body.end_time.split(":")))
    if body.activity_type is not None:
        slot.activity_type = body.activity_type
    if body.label is not None:
        slot.label = body.label
    if body.is_home is not None:
        slot.is_home = body.is_home
    await db.flush()
    return ScheduleSlotResponse(
        id=str(slot.id),
        day_of_week=slot.day_of_week,
        start_time=slot.start_time.strftime("%H:%M"),
        end_time=slot.end_time.strftime("%H:%M"),
        activity_type=slot.activity_type.value,
        label=slot.label,
        is_home=slot.is_home,
    )


@router.delete("/{slot_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_slot(slot_id: uuid.UUID, current_user: CurrentUser, db: DB):
    result = await db.execute(
        select(ScheduleSlot).where(
            ScheduleSlot.id == slot_id, ScheduleSlot.user_id == current_user.id
        )
    )
    slot = result.scalar_one_or_none()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    await db.delete(slot)
