"""EOD holdings. Intraday live book is cached in Redis.

Index guidance
--------------
- ``uq_positions_book``: one row per fund / class overlay / security / date
  (``NULLS NOT DISTINCT`` so fund-level rows with null share_class_id stay unique).
- ``ix_positions_fund_asof``: EOD NAV / WAM batch by fund.
- ``ix_positions_security_asof``: security history and issuer look-through.
- Consider BRIN on ``as_of_date`` once the Timescale/history table exceeds ~50m rows.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import PledgeStatus, PricingSource
from app.models.types import Money, Rate, pledge_status_col, pricing_source_col

if TYPE_CHECKING:
    from app.models.fund import Fund, ShareClass
    from app.models.security import SecurityMaster


class Position(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "positions"
    __table_args__ = (
        UniqueConstraint(
            "fund_id",
            "share_class_id",
            "security_id",
            "as_of_date",
            name="uq_positions_book",
            postgresql_nulls_not_distinct=True,
        ),
        Index("ix_positions_fund_asof", "fund_id", "as_of_date"),
        Index("ix_positions_security_asof", "security_id", "as_of_date"),
        Index("ix_positions_share_class_asof", "share_class_id", "as_of_date"),
        CheckConstraint("face_amount >= 0", name="ck_positions_face_nonneg"),
        {"schema": "portfolio", "comment": "EOD MMF holdings including FX overlay"},
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
        comment="Null = master portfolio; set for HKD/CNH hedged overlay",
    )
    security_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("portfolio.security_master.id"),
        nullable=False,
    )
    as_of_date: Mapped[date] = mapped_column(Date, nullable=False)
    face_amount: Mapped[Decimal] = mapped_column(Money, nullable=False, comment="持仓面值")
    amortized_cost_book_value: Mapped[Decimal] = mapped_column(
        Money, nullable=False, comment="摊余成本账面价值"
    )
    accrued_interest: Mapped[Decimal] = mapped_column(
        Money, nullable=False, default=Decimal("0"), comment="当日应计利息"
    )
    shadow_fair_value: Mapped[Decimal | None] = mapped_column(
        Money, nullable=True, comment="影子定价公允价值 (Wind / BVAL)"
    )
    pricing_source: Mapped[PricingSource | None] = mapped_column(
        pricing_source_col, nullable=True
    )
    bval_score: Mapped[Decimal | None] = mapped_column(Rate, nullable=True)
    pledge_status: Mapped[PledgeStatus] = mapped_column(
        pledge_status_col, nullable=False, default=PledgeStatus.UNENCUMBERED
    )
    pledged_face_amount: Mapped[Decimal] = mapped_column(
        Money, nullable=False, default=Decimal("0")
    )
    wam_days: Mapped[Decimal | None] = mapped_column(Rate, nullable=True)
    wal_days: Mapped[Decimal | None] = mapped_column(Rate, nullable=True)

    fund: Mapped[Fund] = relationship(back_populates="positions")
    share_class: Mapped[ShareClass | None] = relationship(back_populates="positions")
    security: Mapped[SecurityMaster] = relationship(back_populates="positions")

    @property
    def amortized_cost(self) -> Decimal:
        """Alias used by WAM/WAL engines (book value)."""
        return self.amortized_cost_book_value
