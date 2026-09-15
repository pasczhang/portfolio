from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Index, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class MarketQuote(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """EOD / tick quotes (promote to Timescale hypertable on ts)."""

    __tablename__ = "market_quotes"
    __table_args__ = (
        Index("ix_market_quotes_security_ts", "security_id", "ts"),
        {"schema": "market"},
    )

    security_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("portfolio.security_master.id"),
        nullable=False,
    )
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    mid_yield: Mapped[Decimal | None] = mapped_column(Numeric(18, 10), nullable=True)
    mid_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 10), nullable=True)
    source: Mapped[str] = mapped_column(String(32), default="internal")


class YieldCurvePoint(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "yield_curve_points"
    __table_args__ = (
        Index("ix_yield_curve_name_date", "curve_name", "as_of_date"),
        {"schema": "market"},
    )

    curve_name: Mapped[str] = mapped_column(String(64), nullable=False)
    ccy: Mapped[str] = mapped_column(String(3), nullable=False)
    as_of_date: Mapped[date] = mapped_column(Date, nullable=False)
    tenor: Mapped[str] = mapped_column(String(16), nullable=False)
    rate: Mapped[Decimal] = mapped_column(Numeric(18, 10), nullable=False)
