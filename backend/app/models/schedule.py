import uuid
from typing import Optional
from enum import Enum as PyEnum
from datetime import time

from sqlalchemy import String, Integer, Time, ForeignKey, Enum, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base
from app.models.base import TimestampMixin


class DayOfWeek(int, PyEnum):
    MONDAY = 0
    TUESDAY = 1
    WEDNESDAY = 2
    THURSDAY = 3
    FRIDAY = 4
    SATURDAY = 5
    SUNDAY = 6


class ActivityType(str, PyEnum):
    WORK = "work"
    GYM = "gym"
    SCHOOL = "school"
    SLEEP = "sleep"
    OTHER = "other"
    # "home" = free slot, good for delivery


class ScheduleSlot(Base, TimestampMixin):
    __tablename__ = "schedule_slots"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    day_of_week: Mapped[DayOfWeek] = mapped_column(Integer, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    activity_type: Mapped[ActivityType] = mapped_column(
        Enum(ActivityType), nullable=False
    )
    label: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Is user home during this slot? (available for delivery)
    is_home: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_recurring: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    user: Mapped["User"] = relationship(back_populates="schedule_slots")

    def __repr__(self) -> str:
        return f"<ScheduleSlot day={self.day_of_week} {self.start_time}-{self.end_time} {self.activity_type}>"
