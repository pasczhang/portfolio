"""Trade blotter / cash & securities transactions.

Index guidance
--------------
- ``ix_transactions_fund_trade_date``: blotter by book date (hot path).
- ``ix_transactions_security_id``: position rebuild from trades.
- ``ix_transactions_share_class_id``: class-level FX overlay trades.
- ``ix_transactions_open_status`` (partial): STP queue where status not terminal.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import AuditMixin, Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import Currency, TradeSide, TransactionStatus, TransactionType
from app.models.types import (
    Money,
    Rate,
    currency_col,
    trade_side_col,
    txn_status_col,
    txn_type_col,
)

if TYPE_CHECKING:
    from app.models.fund import Fund, ShareClass
    from app.models.security import SecurityMaster


class Transaction(UUIDPrimaryKeyMixin, TimestampMixin, AuditMixin, Base):
    __tablename__ = "transactions"
    __table_args__ = (
        Index("ix_transactions_fund_trade_date", "fund_id", "trade_date"),
        Index("ix_transactions_security_id", "security_id"),
        Index("ix_transactions_share_class_id", "share_class_id"),
        Index(
            "ix_transactions_open_status",
            "status",
            postgresql_where=text("status IN ('New', 'Booked')"),
        ),
        {"schema": "portfolio", "comment": "MMF trade and FX hedge bookings"},
    )

    fund_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("portfolio.funds.id"),
        nullable=False,
    )
    share_class_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("portfolio.share_classes.id"),
        nullable=True,
        comment="Set for class-level FX overlay; cash securities usually null",
    )
    security_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("portfolio.security_master.id"),
        nullable=False,
    )
    txn_type: Mapped[TransactionType] = mapped_column(txn_type_col, nullable=False)
    side: Mapped[TradeSide] = mapped_column(trade_side_col, nullable=False)
    trade_date: Mapped[date] = mapped_column(Date, nullable=False)
    value_date: Mapped[date] = mapped_column(Date, nullable=False)
    settle_date: Mapped[date] = mapped_column(Date, nullable=False)
    face_amount: Mapped[Decimal] = mapped_column(Money, nullable=False, comment="面值")
    price: Mapped[Decimal] = mapped_column(Rate, nullable=False)
    yield_rate: Mapped[Decimal | None] = mapped_column(Rate, nullable=True)
    notional: Mapped[Decimal] = mapped_column(Money, nullable=False)
    currency: Mapped[Currency] = mapped_column(currency_col, nullable=False)
    counterparty: Mapped[str | None] = mapped_column(String(256), nullable=True)
    status: Mapped[TransactionStatus] = mapped_column(
        txn_status_col, nullable=False, default=TransactionStatus.NEW
    )
    booked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    fund: Mapped[Fund] = relationship(back_populates="transactions")
    share_class: Mapped[ShareClass | None] = relationship(back_populates="transactions")
    security: Mapped[SecurityMaster] = relationship(back_populates="transactions")
