from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Index, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Cashflow(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "cashflows"
    __table_args__ = (
        Index("ix_cashflows_fund_date", "fund_id", "cf_date"),
        Index("ix_cashflows_security_id", "security_id"),
        {"schema": "portfolio"},
    )

    fund_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("portfolio.funds.id"),
        nullable=False,
    )
    security_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("portfolio.security_master.id"),
        nullable=True,
    )
    cf_date: Mapped[date] = mapped_column(Date, nullable=False)
    cf_type: Mapped[str] = mapped_column(String(16), nullable=False)
    ccy: Mapped[str] = mapped_column(String(3), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="projected")
