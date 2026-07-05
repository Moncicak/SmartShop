import uuid
from typing import Optional, List

from sqlalchemy import String, Boolean, Text, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base
from app.models.base import TimestampMixin


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Revolut OAuth
    revolut_access_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    revolut_refresh_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    revolut_connected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Rohlík account (used by the MCP integration to log in on the user's behalf)
    rohlik_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    rohlik_password_enc: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Fernet-encrypted
    rohlik_connected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Preferred Rohlík delivery address (their numeric id); None = account's active one
    rohlik_address_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Firebase push token
    fcm_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    shopping_lists: Mapped[List["ShoppingList"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    schedule_slots: Mapped[List["ScheduleSlot"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    orders: Mapped[List["Order"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    notifications: Mapped[List["Notification"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    chat_messages: Mapped[List["ChatMessage"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User {self.email}>"
