from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class ComplianceRule(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "compliance_rules"
    __table_args__ = (
        Index("ix_compliance_rules_fund_id", "fund_id"),
        {"schema": "compliance"},
    )

    fund_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("portfolio.funds.id"),
        nullable=True,
    )
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    threshold: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    comparator: Mapped[str] = mapped_column(String(8), default="<=")
    is_active: Mapped[bool] = mapped_column(default=True)


class ComplianceBreach(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "compliance_breaches"
    __table_args__ = (
        Index("ix_compliance_breaches_fund_date", "fund_id", "as_of_date"),
        {"schema": "compliance"},
    )

    fund_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("portfolio.funds.id"),
        nullable=False,
    )
    rule_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("compliance.compliance_rules.id"),
        nullable=False,
    )
    as_of_date: Mapped[date] = mapped_column(Date, nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    measured_value: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="open")
