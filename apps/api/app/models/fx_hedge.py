"""Share-class FX overlay (forward / swap) linked to SecurityMaster FX_Forward.

Index guidance
--------------
- ``ix_fx_hedges_class_maturity``: roll calendar by hedged class.
- ``ix_fx_hedges_open`` (partial): live overlay notionals vs class AUM.
- ``ix_fx_hedges_security_id``: join to the FX_Forward static record.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, Index, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import AuditMixin, Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import Currency, HedgeStatus, HedgeType
from app.models.types import Money, Rate, currency_col, hedge_status_col, hedge_type_col

if TYPE_CHECKING:
    from app.models.fund import Fund, ShareClass
    from app.models.position import Position
    from app.models.security import SecurityMaster
    from app.models.transaction import Transaction


class FXHedge(UUIDPrimaryKeyMixin, TimestampMixin, AuditMixin, Base):
    __tablename__ = "fx_hedges"
    __table_args__ = (
        UniqueConstraint("security_id", name="uq_fx_hedges_security"),
        Index("ix_fx_hedges_class_maturity", "share_class_id", "maturity_date"),
        Index("ix_fx_hedges_security_id", "security_id"),
        Index("ix_fx_hedges_position_id", "position_id"),
        Index(
            "ix_fx_hedges_open",
            "share_class_id",
            postgresql_where=text("status = 'Open'"),
        ),
        {"schema": "portfolio", "comment": "Class-level FX hedge overlay"},
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
    security_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("portfolio.security_master.id"),
        nullable=False,
        comment="SecurityMaster row with asset_class = FX_Forward",
    )
    transaction_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("portfolio.transactions.id"),
        nullable=True,
    )
    position_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("portfolio.positions.id"),
        nullable=True,
        comment="EOD overlay position carrying MTM / collateral",
    )
    hedge_type: Mapped[HedgeType] = mapped_column(hedge_type_col, nullable=False)
    pair: Mapped[str] = mapped_column(String(7), nullable=False, comment="USDHKD / USDCNH")
    base_ccy: Mapped[Currency] = mapped_column(currency_col, nullable=False)
    quote_ccy: Mapped[Currency] = mapped_column(currency_col, nullable=False)
    near_date: Mapped[date | None] = mapped_column(Date, nullable=True, comment="FX swap near leg")
    maturity_date: Mapped[date] = mapped_column(Date, nullable=False, comment="Forward / far-leg expiry")
    bought_ccy: Mapped[Currency] = mapped_column(currency_col, nullable=False)
    sold_ccy: Mapped[Currency] = mapped_column(currency_col, nullable=False)
    bought_amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    sold_amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    forward_rate: Mapped[Decimal] = mapped_column(Rate, nullable=False)
    hedged_base_notional: Mapped[Decimal] = mapped_column(
        Money, nullable=False, comment="USD (fund base) notional being hedged"
    )
    status: Mapped[HedgeStatus] = mapped_column(
        hedge_status_col, nullable=False, default=HedgeStatus.OPEN
    )

    fund: Mapped[Fund] = relationship(back_populates="fx_hedges")
    share_class: Mapped[ShareClass] = relationship(back_populates="fx_hedges")
    security: Mapped[SecurityMaster] = relationship()
    transaction: Mapped[Transaction | None] = relationship()
    position: Mapped[Position | None] = relationship()
