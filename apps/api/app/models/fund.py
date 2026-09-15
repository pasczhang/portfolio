"""Fund and share-class static data (base USD + HKD/CNH hedged classes).

Index guidance
--------------
- ``uq_funds_code`` / ``uq_share_classes_code``: operational identifiers.
- ``ix_share_classes_fund_id``: class list by master fund.
- ``ix_share_classes_hedged`` (partial): overlay classes for FX desk.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import AuditMixin, Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import Currency, ShareClassType
from app.models.types import Money, NavPx, currency_col, share_class_type_col

if TYPE_CHECKING:
    from app.models.fx_hedge import FXHedge
    from app.models.nav import NavSnapshot
    from app.models.position import Position
    from app.models.transaction import Transaction


class Fund(UUIDPrimaryKeyMixin, TimestampMixin, AuditMixin, Base):
    """SFC-authorized public money market fund (unit trust / OFC)."""

    __tablename__ = "funds"
    __table_args__ = (
        UniqueConstraint("code", name="uq_funds_code"),
        Index("ix_funds_base_ccy", "base_ccy"),
        {"schema": "portfolio"},
    )

    code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    legal_structure: Mapped[str] = mapped_column(String(32), default="unit_trust")
    base_ccy: Mapped[Currency] = mapped_column(currency_col, nullable=False, default=Currency.USD)
    sfc_authorization_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    trustee: Mapped[str | None] = mapped_column(String(256), nullable=True)
    manager: Mapped[str | None] = mapped_column(String(256), nullable=True)
    wam_limit_days: Mapped[int] = mapped_column(default=60)
    wal_limit_days: Mapped[int] = mapped_column(default=120)
    max_final_maturity_days: Mapped[int] = mapped_column(default=397)
    inception_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="active")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    share_classes: Mapped[list[ShareClass]] = relationship(back_populates="fund")
    transactions: Mapped[list[Transaction]] = relationship(back_populates="fund")
    positions: Mapped[list[Position]] = relationship(back_populates="fund")
    nav_snapshots: Mapped[list[NavSnapshot]] = relationship(back_populates="fund")
    fx_hedges: Mapped[list[FXHedge]] = relationship(back_populates="fund")


class ShareClass(UUIDPrimaryKeyMixin, TimestampMixin, AuditMixin, Base):
    """Master (e.g. USD) or hedged (HKD-Hedged / RMB-Hedged) unit class."""

    __tablename__ = "share_classes"
    __table_args__ = (
        UniqueConstraint("code", name="uq_share_classes_code"),
        UniqueConstraint("fund_id", "ccy", "class_type", name="uq_share_classes_fund_ccy_type"),
        Index("ix_share_classes_fund_id", "fund_id"),
        Index(
            "ix_share_classes_hedged",
            "fund_id",
            postgresql_where=text("class_type = 'Hedged'"),
        ),
        CheckConstraint(
            "(class_type = 'Base') OR (hedge_target_ccy IS NOT NULL)",
            name="ck_share_classes_hedge_ccy",
        ),
        {"schema": "portfolio"},
    )

    fund_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("portfolio.funds.id"),
        nullable=False,
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False, comment="e.g. USD / HKD-H / CNH-H")
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    ccy: Mapped[Currency] = mapped_column(currency_col, nullable=False)
    class_type: Mapped[ShareClassType] = mapped_column(
        share_class_type_col, nullable=False, default=ShareClassType.BASE
    )
    hedge_target_ccy: Mapped[Currency | None] = mapped_column(currency_col, nullable=True)
    hedge_ratio: Mapped[Decimal] = mapped_column(NavPx, nullable=False, default=Decimal("1"))
    nav_precision: Mapped[int] = mapped_column(default=4)
    min_initial_subscription: Mapped[Decimal | None] = mapped_column(Money, nullable=True)
    class_nav: Mapped[Decimal | None] = mapped_column(
        NavPx, nullable=True, comment="Latest published class NAV per unit"
    )
    class_nav_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    class_aum: Mapped[Decimal | None] = mapped_column(Money, nullable=True)
    units_outstanding: Mapped[Decimal | None] = mapped_column(Money, nullable=True)

    fund: Mapped[Fund] = relationship(back_populates="share_classes")
    transactions: Mapped[list[Transaction]] = relationship(back_populates="share_class")
    positions: Mapped[list[Position]] = relationship(back_populates="share_class")
    nav_snapshots: Mapped[list[NavSnapshot]] = relationship(back_populates="share_class")
    fx_hedges: Mapped[list[FXHedge]] = relationship(back_populates="share_class")
