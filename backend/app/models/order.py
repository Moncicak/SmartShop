import uuid
from typing import Optional, List
from decimal import Decimal
from enum import Enum as PyEnum
from datetime import datetime

from sqlalchemy import String, Float, ForeignKey, Enum, DateTime, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base
from app.models.base import TimestampMixin


class OrderStatus(str, PyEnum):
    DRAFT = "draft"               # Agent sestavil, ceka na souhlas
    PENDING_APPROVAL = "pending_approval"  # Notifikace odeslana
    APPROVED = "approved"         # Uzivatel schvalil
    REJECTED = "rejected"         # Uzivatel zamitl
    PLACING = "placing"           # Probiha objednavani na Rohliku
    PLACED = "placed"             # Objednano na Rohliku
    PAID = "paid"                 # Zaplaceno pres Revolut
    DELIVERED = "delivered"       # Doruceno
    FAILED = "failed"             # Chyba


class Order(Base, TimestampMixin):
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # External IDs
    rohlik_order_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    revolut_payment_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus), default=OrderStatus.DRAFT, nullable=False, index=True
    )

    total_amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), default="CZK", nullable=False)
    discount_saved: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # Delivery
    delivery_window_start: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    delivery_window_end: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    delivery_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Approval
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    agent_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    user: Mapped["User"] = relationship(back_populates="orders")
    items: Mapped[List["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Order {self.id} status={self.status} total={self.total_amount}>"


class OrderItem(Base, TimestampMixin):
    __tablename__ = "order_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )

    rohlik_product_id: Mapped[str] = mapped_column(String(100), nullable=False)
    product_name: Mapped[str] = mapped_column(String(500), nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    unit_price: Mapped[float] = mapped_column(Float, nullable=False)
    total_price: Mapped[float] = mapped_column(Float, nullable=False)
    discount_applied: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    is_on_sale: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relationships
    order: Mapped["Order"] = relationship(back_populates="items")

    def __repr__(self) -> str:
        return f"<OrderItem '{self.product_name}' x{self.quantity} @ {self.unit_price}>"
