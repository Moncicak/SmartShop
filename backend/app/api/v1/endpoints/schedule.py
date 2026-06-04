"""Schedule CRUD endpoints — stub for Phase 1, expanded in Phase 4."""
import uuid
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, HTTPException, status, Query
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


class DeliverySlotSuggestion(BaseModel):
    """A concrete upcoming delivery window derived from a recurring home slot."""
    date: str          # ISO date, e.g. "2026-06-05"
    day_of_week: int   # 0=Monday … 6=Sunday
    start_time: str    # "HH:MM"
    end_time: str      # "HH:MM"
    label: str | None


async def _mcp_delivery_suggestions(user, home_slots) -> Optional[List[DeliverySlotSuggestion]]:
    """Real Rohlík delivery slots (via MCP) intersected with the user's home windows.

    Returns None → caller falls back to the schedule-based heuristic.

    TODO(creds): with a connected account, decrypt the password, call
    `rohlik_mcp.get_delivery_slots(email, password)`, parse the (currently unknown)
    payload shape, and keep only windows overlapping an is_home slot — wrapped in a
    timeout so a slow/failed MCP call never blocks the endpoint. For now we return
    None *without* a round-trip so the cart view stays fast; the MCP plumbing itself
    is verified via /rohlik-mcp/status?probe=true.
    """
    return None


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


@router.get("/delivery-slots", response_model=List[DeliverySlotSuggestion])
async def get_delivery_suggestions(
    current_user: CurrentUser, db: DB, days: int = Query(7, ge=1, le=21)
):
    """Upcoming concrete delivery windows derived from the user's home slots.

    Each recurring "I'm home" slot is projected onto the next `days` calendar
    days. Windows that have already ended today are skipped. Ordered by date,
    then start time. (Phase 4: intersect these with real Rohlík slots.)
    """
    result = await db.execute(
        select(ScheduleSlot).where(
            ScheduleSlot.user_id == current_user.id,
            ScheduleSlot.is_home == True,
        ).order_by(ScheduleSlot.start_time)
    )
    home_slots = result.scalars().all()
    if not home_slots:
        return []

    # Opt-in: real Rohlík slots via MCP, intersected with home windows.
    # Falls through to the heuristic on any failure or when not connected.
    if current_user.rohlik_connected:
        mcp_result = await _mcp_delivery_suggestions(current_user, home_slots)
        if mcp_result is not None:
            return mcp_result

    by_day: dict[int, list] = {}
    for s in home_slots:
        by_day.setdefault(int(s.day_of_week), []).append(s)

    now = datetime.now()
    today = now.date()
    suggestions: List[DeliverySlotSuggestion] = []
    for offset in range(days):
        d = today + timedelta(days=offset)
        weekday = d.weekday()  # 0=Monday
        for s in by_day.get(weekday, []):
            if offset == 0 and s.end_time <= now.time():
                continue  # window already over today
            suggestions.append(DeliverySlotSuggestion(
                date=d.isoformat(),
                day_of_week=weekday,
                start_time=s.start_time.strftime("%H:%M"),
                end_time=s.end_time.strftime("%H:%M"),
                label=s.label,
            ))
    return suggestions


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
