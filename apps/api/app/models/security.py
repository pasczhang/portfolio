"""Security master (issuer + instrument static data).

Index guidance
--------------
- ``uq_security_master_code``: lookup by internal code / ISIN alias.
- ``uq_security_master_isin`` (partial): ISIN uniqueness where present.
- ``ix_security_master_asset_ccy``: universe screens (CD/CP in HKD vs USD).
- ``ix_security_master_issuer_id``: SFC issuer-concentration tests.
- ``ix_security_master_maturity_date``: WAL / 397-day maturity ladder.
- ``ix_security_master_rate_reset_date``: WAM to next reset (FRN / floating deposit).
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import AuditMixin, Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import AssetClass, CouponType, Currency, DayCount, PaymentFrequency
from app.models.types import (
    Rate,
    RatingCode,
    asset_class_col,
    coupon_type_col,
    currency_col,
    day_count_col,
    payment_freq_col,
)

if TYPE_CHECKING:
    from app.models.position import Position
    from app.models.transaction import Transaction


class Issuer(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "issuers"
    __table_args__ = (
        Index("ix_issuers_name", "name"),
        {"schema": "portfolio"},
    )

    name: Mapped[str] = mapped_column(String(256), nullable=False)
    lei: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True)
    country: Mapped[str | None] = mapped_column(String(2), nullable=True)
    sector: Mapped[str | None] = mapped_column(String(64), nullable=True)
    parent_issuer_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("portfolio.issuers.id"),
        nullable=True,
    )

    securities: Mapped[list[SecurityMaster]] = relationship(
        back_populates="issuer",
        foreign_keys="SecurityMaster.issuer_id",
    )


class SecurityMaster(UUIDPrimaryKeyMixin, TimestampMixin, AuditMixin, Base):
    """MMF-eligible static data: Deposit / CD / CP / T-Bill / Repo / FX Forward."""

    __tablename__ = "security_master"
    __table_args__ = (
        UniqueConstraint("security_code", name="uq_security_master_code"),
        Index(
            "uq_security_master_isin",
            "isin",
            unique=True,
            postgresql_where=text("isin IS NOT NULL"),
        ),
        Index("ix_security_master_asset_ccy", "asset_class", "currency"),
        Index("ix_security_master_issuer_id", "issuer_id"),
        Index("ix_security_master_maturity_date", "maturity_date"),
        Index("ix_security_master_rate_reset_date", "rate_reset_date"),
        CheckConstraint(
            "(coupon_type <> 'Floating') OR (rate_reset_date IS NOT NULL)",
            name="ck_security_master_floating_reset",
        ),
        {"schema": "portfolio", "comment": "HK public MMF security master"},
    )

    security_code: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        comment="Internal code; may equal ISIN",
    )
    isin: Mapped[str | None] = mapped_column(String(12), nullable=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    asset_class: Mapped[AssetClass] = mapped_column(asset_class_col, nullable=False)
    issuer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("portfolio.issuers.id"),
        nullable=False,
    )
    coupon_type: Mapped[CouponType] = mapped_column(coupon_type_col, nullable=False)
    value_date: Mapped[date] = mapped_column(Date, nullable=False, comment="起息日")
    maturity_date: Mapped[date] = mapped_column(Date, nullable=False, comment="到期日")
    rate_reset_date: Mapped[date | None] = mapped_column(
        Date, nullable=True, comment="下一利率重置日 (WAM)"
    )
    coupon_rate: Mapped[Decimal | None] = mapped_column(
        Rate, nullable=True, comment="票面利率或定存利率 (decimal, e.g. 0.045)"
    )
    payment_frequency: Mapped[PaymentFrequency] = mapped_column(
        payment_freq_col, nullable=False, default=PaymentFrequency.AT_MATURITY
    )
    currency: Mapped[Currency] = mapped_column(currency_col, nullable=False)
    day_count: Mapped[DayCount] = mapped_column(
        day_count_col, nullable=False, default=DayCount.ACT_365
    )
    rating_sp_short: Mapped[str | None] = mapped_column(RatingCode, nullable=True)
    rating_sp_long: Mapped[str | None] = mapped_column(RatingCode, nullable=True)
    rating_moodys_short: Mapped[str | None] = mapped_column(RatingCode, nullable=True)
    rating_moodys_long: Mapped[str | None] = mapped_column(RatingCode, nullable=True)
    rating_fitch_short: Mapped[str | None] = mapped_column(RatingCode, nullable=True)
    rating_fitch_long: Mapped[str | None] = mapped_column(RatingCode, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    issuer: Mapped[Issuer] = relationship(back_populates="securities", foreign_keys=[issuer_id])
    transactions: Mapped[list[Transaction]] = relationship(back_populates="security")
    positions: Mapped[list[Position]] = relationship(back_populates="security")
