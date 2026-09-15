from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, Index, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.fund import Fund, ShareClass


class NavSnapshot(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Official amortized-cost class NAV vs shadow MTM NAV."""

    __tablename__ = "nav_snapshots"
    __table_args__ = (
        UniqueConstraint("share_class_id", "nav_date", name="uq_nav_share_class_date"),
        Index("ix_nav_snapshots_fund_date", "fund_id", "nav_date"),
        {"schema": "portfolio"},
    )

    fund_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("portfolio.funds.id"),
        nullable=False,
    )
    share_class_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("portfolio.share_classes.id"),
        nullable=False,
    )
    nav_date: Mapped[date] = mapped_column(Date, nullable=False)
    official_nav: Mapped[Decimal] = mapped_column(Numeric(24, 10), nullable=False)
    shadow_nav: Mapped[Decimal | None] = mapped_column(Numeric(24, 10), nullable=True)
    collar_bps: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    aum: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    units_outstanding: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="draft")

    fund: Mapped[Fund] = relationship(back_populates="nav_snapshots")
    share_class: Mapped[ShareClass] = relationship(back_populates="nav_snapshots")
