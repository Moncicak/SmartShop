import uuid
from typing import Optional, List
from enum import Enum as PyEnum
from datetime import datetime

from sqlalchemy import String, Boolean, Integer, Float, ForeignKey, Text, Enum, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base
from app.models.base import TimestampMixin


class ListFrequency(str, PyEnum):
    DAILY = "daily"
    WEEKLY = "weekly"
    BIWEEKLY = "biweekly"
    MONTHLY = "monthly"
    CUSTOM = "custom"


class ShoppingList(Base, TimestampMixin):
    __tablename__ = "shopping_lists"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    frequency: Mapped[ListFrequency] = mapped_column(
        Enum(ListFrequency), default=ListFrequency.WEEKLY, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # When this list was last included in an order — drives the "due" logic
    # for the merged shopping view (monthly items reappear only when due).
    last_ordered_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="shopping_lists")
    items: Mapped[List["ListItem"]] = relationship(
        back_populates="shopping_list", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<ShoppingList '{self.name}' ({self.frequency})>"


class ListItem(Base, TimestampMixin):
    __tablename__ = "list_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    list_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shopping_lists.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Either a specific Rohlik product or a generic description
    rohlik_product_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    rohlik_product_name: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    rohlik_image_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    generic_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    quantity: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    unit: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # kg, ks, l, ...
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Checked off (offline purchase)
    is_checked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relationships
    shopping_list: Mapped["ShoppingList"] = relationship(back_populates="items")

    def __repr__(self) -> str:
        name = self.rohlik_product_name or self.generic_name or "Unknown"
        return f"<ListItem '{name}' x{self.quantity}>"
