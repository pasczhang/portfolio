"""Initial HK MMF PMS schema: security master, transactions, positions, share classes, FX hedges.

Revision ID: 0001_initial_pms
Revises:
Create Date: 2026-09-10

Index notes (also declared on ORM ``__table_args__``):
- security_master: unique code; partial unique ISIN; (asset_class, currency);
  issuer_id; maturity_date (WAL); rate_reset_date (WAM)
- transactions: (fund_id, trade_date); security_id; partial open status
- positions: UNIQUE NULLS NOT DISTINCT book key; (fund_id, as_of_date)
- fx_hedges: (share_class_id, maturity_date); partial open hedges
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial_pms"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=False)
MONEY = sa.Numeric(24, 8)
RATE = sa.Numeric(18, 10)
NAV = sa.Numeric(24, 10)
TS = sa.DateTime(timezone=True)


def _uuid_pk() -> sa.Column:
    return sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()"))


def _timestamps() -> tuple[sa.Column, sa.Column]:
    return (
        sa.Column("created_at", TS, nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", TS, nullable=False, server_default=sa.text("now()")),
    )


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS portfolio")
    op.execute("CREATE SCHEMA IF NOT EXISTS market")
    op.execute("CREATE SCHEMA IF NOT EXISTS compliance")
    op.execute("CREATE SCHEMA IF NOT EXISTS ops")

    op.create_table(
        "issuers",
        _uuid_pk(),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("lei", sa.String(20), nullable=True),
        sa.Column("country", sa.String(2), nullable=True),
        sa.Column("sector", sa.String(64), nullable=True),
        sa.Column("parent_issuer_id", UUID, nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["parent_issuer_id"], ["portfolio.issuers.id"]),
        sa.UniqueConstraint("lei", name="uq_issuers_lei"),
        schema="portfolio",
    )
    op.create_index("ix_issuers_name", "issuers", ["name"], schema="portfolio")

    op.create_table(
        "funds",
        _uuid_pk(),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("legal_structure", sa.String(32), nullable=False, server_default="unit_trust"),
        sa.Column("base_ccy", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("sfc_authorization_no", sa.String(64), nullable=True),
        sa.Column("trustee", sa.String(256), nullable=True),
        sa.Column("manager", sa.String(256), nullable=True),
        sa.Column("wam_limit_days", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("wal_limit_days", sa.Integer(), nullable=False, server_default="120"),
        sa.Column("max_final_maturity_days", sa.Integer(), nullable=False, server_default="397"),
        sa.Column("inception_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(64), nullable=True),
        sa.Column("updated_by", sa.String(64), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("code", name="uq_funds_code"),
        schema="portfolio",
    )
    op.create_index("ix_funds_base_ccy", "funds", ["base_ccy"], schema="portfolio")

    op.create_table(
        "security_master",
        _uuid_pk(),
        sa.Column("security_code", sa.String(32), nullable=False, comment="Internal code; may equal ISIN"),
        sa.Column("isin", sa.String(12), nullable=True),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("asset_class", sa.String(16), nullable=False),
        sa.Column("issuer_id", UUID, nullable=False),
        sa.Column("coupon_type", sa.String(16), nullable=False),
        sa.Column("value_date", sa.Date(), nullable=False, comment="起息日"),
        sa.Column("maturity_date", sa.Date(), nullable=False, comment="到期日"),
        sa.Column("rate_reset_date", sa.Date(), nullable=True, comment="下一利率重置日 (WAM)"),
        sa.Column("coupon_rate", RATE, nullable=True, comment="票面/定存利率"),
        sa.Column("payment_frequency", sa.String(16), nullable=False, server_default="AtMaturity"),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("day_count", sa.String(16), nullable=False, server_default="Act/365"),
        sa.Column("rating_sp_short", sa.String(16), nullable=True),
        sa.Column("rating_sp_long", sa.String(16), nullable=True),
        sa.Column("rating_moodys_short", sa.String(16), nullable=True),
        sa.Column("rating_moodys_long", sa.String(16), nullable=True),
        sa.Column("rating_fitch_short", sa.String(16), nullable=True),
        sa.Column("rating_fitch_long", sa.String(16), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(64), nullable=True),
        sa.Column("updated_by", sa.String(64), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["issuer_id"], ["portfolio.issuers.id"]),
        sa.UniqueConstraint("security_code", name="uq_security_master_code"),
        sa.CheckConstraint(
            "(coupon_type <> 'Floating') OR (rate_reset_date IS NOT NULL)",
            name="ck_security_master_floating_reset",
        ),
        schema="portfolio",
    )
    op.create_index(
        "uq_security_master_isin",
        "security_master",
        ["isin"],
        unique=True,
        schema="portfolio",
        postgresql_where=sa.text("isin IS NOT NULL"),
    )
    op.create_index(
        "ix_security_master_asset_ccy",
        "security_master",
        ["asset_class", "currency"],
        schema="portfolio",
    )
    op.create_index("ix_security_master_issuer_id", "security_master", ["issuer_id"], schema="portfolio")
    op.create_index(
        "ix_security_master_maturity_date", "security_master", ["maturity_date"], schema="portfolio"
    )
    op.create_index(
        "ix_security_master_rate_reset_date",
        "security_master",
        ["rate_reset_date"],
        schema="portfolio",
    )

    op.create_table(
        "share_classes",
        _uuid_pk(),
        sa.Column("fund_id", UUID, nullable=False),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("ccy", sa.String(3), nullable=False),
        sa.Column("class_type", sa.String(16), nullable=False, server_default="Base"),
        sa.Column("hedge_target_ccy", sa.String(3), nullable=True),
        sa.Column("hedge_ratio", NAV, nullable=False, server_default="1"),
        sa.Column("nav_precision", sa.Integer(), nullable=False, server_default="4"),
        sa.Column("min_initial_subscription", MONEY, nullable=True),
        sa.Column("class_nav", NAV, nullable=True, comment="Latest published class NAV"),
        sa.Column("class_nav_date", sa.Date(), nullable=True),
        sa.Column("class_aum", MONEY, nullable=True),
        sa.Column("units_outstanding", MONEY, nullable=True),
        sa.Column("created_by", sa.String(64), nullable=True),
        sa.Column("updated_by", sa.String(64), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["fund_id"], ["portfolio.funds.id"]),
        sa.UniqueConstraint("code", name="uq_share_classes_code"),
        sa.UniqueConstraint("fund_id", "ccy", "class_type", name="uq_share_classes_fund_ccy_type"),
        sa.CheckConstraint(
            "(class_type = 'Base') OR (hedge_target_ccy IS NOT NULL)",
            name="ck_share_classes_hedge_ccy",
        ),
        schema="portfolio",
    )
    op.create_index("ix_share_classes_fund_id", "share_classes", ["fund_id"], schema="portfolio")
    op.create_index(
        "ix_share_classes_hedged",
        "share_classes",
        ["fund_id"],
        schema="portfolio",
        postgresql_where=sa.text("class_type = 'Hedged'"),
    )

    op.create_table(
        "transactions",
        _uuid_pk(),
        sa.Column("fund_id", UUID, nullable=False),
        sa.Column("share_class_id", UUID, nullable=True),
        sa.Column("security_id", UUID, nullable=False),
        sa.Column("txn_type", sa.String(16), nullable=False),
        sa.Column("side", sa.String(8), nullable=False),
        sa.Column("trade_date", sa.Date(), nullable=False),
        sa.Column("value_date", sa.Date(), nullable=False),
        sa.Column("settle_date", sa.Date(), nullable=False),
        sa.Column("face_amount", MONEY, nullable=False, comment="面值"),
        sa.Column("price", RATE, nullable=False),
        sa.Column("yield_rate", RATE, nullable=True),
        sa.Column("notional", MONEY, nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("counterparty", sa.String(256), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="New"),
        sa.Column("booked_at", TS, nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(64), nullable=True),
        sa.Column("updated_by", sa.String(64), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["fund_id"], ["portfolio.funds.id"]),
        sa.ForeignKeyConstraint(["share_class_id"], ["portfolio.share_classes.id"]),
        sa.ForeignKeyConstraint(["security_id"], ["portfolio.security_master.id"]),
        schema="portfolio",
    )
    op.create_index(
        "ix_transactions_fund_trade_date",
        "transactions",
        ["fund_id", "trade_date"],
        schema="portfolio",
    )
    op.create_index("ix_transactions_security_id", "transactions", ["security_id"], schema="portfolio")
    op.create_index(
        "ix_transactions_share_class_id", "transactions", ["share_class_id"], schema="portfolio"
    )
    op.create_index(
        "ix_transactions_open_status",
        "transactions",
        ["status"],
        schema="portfolio",
        postgresql_where=sa.text("status IN ('New', 'Booked')"),
    )

    op.create_table(
        "positions",
        _uuid_pk(),
        sa.Column("fund_id", UUID, nullable=False),
        sa.Column("share_class_id", UUID, nullable=True),
        sa.Column("security_id", UUID, nullable=False),
        sa.Column("as_of_date", sa.Date(), nullable=False),
        sa.Column("face_amount", MONEY, nullable=False, comment="持仓面值"),
        sa.Column("amortized_cost_book_value", MONEY, nullable=False, comment="摊余成本账面价值"),
        sa.Column("accrued_interest", MONEY, nullable=False, server_default="0", comment="当日应计利息"),
        sa.Column("shadow_fair_value", MONEY, nullable=True, comment="影子定价 (Wind / BVAL)"),
        sa.Column("pricing_source", sa.String(16), nullable=True),
        sa.Column("bval_score", RATE, nullable=True),
        sa.Column("pledge_status", sa.String(16), nullable=False, server_default="Unencumbered"),
        sa.Column("pledged_face_amount", MONEY, nullable=False, server_default="0"),
        sa.Column("wam_days", RATE, nullable=True),
        sa.Column("wal_days", RATE, nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["fund_id"], ["portfolio.funds.id"]),
        sa.ForeignKeyConstraint(["share_class_id"], ["portfolio.share_classes.id"]),
        sa.ForeignKeyConstraint(["security_id"], ["portfolio.security_master.id"]),
        sa.CheckConstraint("face_amount >= 0", name="ck_positions_face_nonneg"),
        schema="portfolio",
    )
    op.execute(
        """
        ALTER TABLE portfolio.positions
        ADD CONSTRAINT uq_positions_book
        UNIQUE NULLS NOT DISTINCT (fund_id, share_class_id, security_id, as_of_date)
        """
    )
    op.create_index("ix_positions_fund_asof", "positions", ["fund_id", "as_of_date"], schema="portfolio")
    op.create_index(
        "ix_positions_security_asof", "positions", ["security_id", "as_of_date"], schema="portfolio"
    )
    op.create_index(
        "ix_positions_share_class_asof",
        "positions",
        ["share_class_id", "as_of_date"],
        schema="portfolio",
    )

    op.create_table(
        "fx_hedges",
        _uuid_pk(),
        sa.Column("fund_id", UUID, nullable=False),
        sa.Column("share_class_id", UUID, nullable=False),
        sa.Column("security_id", UUID, nullable=False, comment="FX_Forward in security_master"),
        sa.Column("transaction_id", UUID, nullable=True),
        sa.Column("position_id", UUID, nullable=True),
        sa.Column("hedge_type", sa.String(16), nullable=False),
        sa.Column("pair", sa.String(7), nullable=False),
        sa.Column("base_ccy", sa.String(3), nullable=False),
        sa.Column("quote_ccy", sa.String(3), nullable=False),
        sa.Column("near_date", sa.Date(), nullable=True),
        sa.Column("maturity_date", sa.Date(), nullable=False),
        sa.Column("bought_ccy", sa.String(3), nullable=False),
        sa.Column("sold_ccy", sa.String(3), nullable=False),
        sa.Column("bought_amount", MONEY, nullable=False),
        sa.Column("sold_amount", MONEY, nullable=False),
        sa.Column("forward_rate", RATE, nullable=False),
        sa.Column("hedged_base_notional", MONEY, nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="Open"),
        sa.Column("created_by", sa.String(64), nullable=True),
        sa.Column("updated_by", sa.String(64), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["fund_id"], ["portfolio.funds.id"]),
        sa.ForeignKeyConstraint(["share_class_id"], ["portfolio.share_classes.id"]),
        sa.ForeignKeyConstraint(["security_id"], ["portfolio.security_master.id"]),
        sa.ForeignKeyConstraint(["transaction_id"], ["portfolio.transactions.id"]),
        sa.ForeignKeyConstraint(["position_id"], ["portfolio.positions.id"]),
        sa.UniqueConstraint("security_id", name="uq_fx_hedges_security"),
        schema="portfolio",
    )
    op.create_index(
        "ix_fx_hedges_class_maturity",
        "fx_hedges",
        ["share_class_id", "maturity_date"],
        schema="portfolio",
    )
    op.create_index("ix_fx_hedges_security_id", "fx_hedges", ["security_id"], schema="portfolio")
    op.create_index("ix_fx_hedges_position_id", "fx_hedges", ["position_id"], schema="portfolio")
    op.create_index(
        "ix_fx_hedges_open",
        "fx_hedges",
        ["share_class_id"],
        schema="portfolio",
        postgresql_where=sa.text("status = 'Open'"),
    )

    op.create_table(
        "cashflows",
        _uuid_pk(),
        sa.Column("fund_id", UUID, nullable=False),
        sa.Column("security_id", UUID, nullable=True),
        sa.Column("cf_date", sa.Date(), nullable=False),
        sa.Column("cf_type", sa.String(16), nullable=False),
        sa.Column("ccy", sa.String(3), nullable=False),
        sa.Column("amount", MONEY, nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="projected"),
        *_timestamps(),
        sa.ForeignKeyConstraint(["fund_id"], ["portfolio.funds.id"]),
        sa.ForeignKeyConstraint(["security_id"], ["portfolio.security_master.id"]),
        schema="portfolio",
    )
    op.create_index("ix_cashflows_fund_date", "cashflows", ["fund_id", "cf_date"], schema="portfolio")
    op.create_index("ix_cashflows_security_id", "cashflows", ["security_id"], schema="portfolio")

    op.create_table(
        "nav_snapshots",
        _uuid_pk(),
        sa.Column("fund_id", UUID, nullable=False),
        sa.Column("share_class_id", UUID, nullable=False),
        sa.Column("nav_date", sa.Date(), nullable=False),
        sa.Column("official_nav", NAV, nullable=False),
        sa.Column("shadow_nav", NAV, nullable=True),
        sa.Column("collar_bps", sa.Numeric(12, 4), nullable=True),
        sa.Column("aum", MONEY, nullable=False),
        sa.Column("units_outstanding", MONEY, nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="draft"),
        *_timestamps(),
        sa.ForeignKeyConstraint(["fund_id"], ["portfolio.funds.id"]),
        sa.ForeignKeyConstraint(["share_class_id"], ["portfolio.share_classes.id"]),
        sa.UniqueConstraint("share_class_id", "nav_date", name="uq_nav_share_class_date"),
        schema="portfolio",
    )
    op.create_index(
        "ix_nav_snapshots_fund_date", "nav_snapshots", ["fund_id", "nav_date"], schema="portfolio"
    )

    op.create_table(
        "market_quotes",
        _uuid_pk(),
        sa.Column("security_id", UUID, nullable=False),
        sa.Column("ts", TS, nullable=False),
        sa.Column("mid_yield", RATE, nullable=True),
        sa.Column("mid_price", RATE, nullable=True),
        sa.Column("source", sa.String(32), nullable=False, server_default="internal"),
        *_timestamps(),
        sa.ForeignKeyConstraint(["security_id"], ["portfolio.security_master.id"]),
        schema="market",
    )
    op.create_index(
        "ix_market_quotes_security_ts", "market_quotes", ["security_id", "ts"], schema="market"
    )

    op.create_table(
        "yield_curve_points",
        _uuid_pk(),
        sa.Column("curve_name", sa.String(64), nullable=False),
        sa.Column("ccy", sa.String(3), nullable=False),
        sa.Column("as_of_date", sa.Date(), nullable=False),
        sa.Column("tenor", sa.String(16), nullable=False),
        sa.Column("rate", RATE, nullable=False),
        *_timestamps(),
        schema="market",
    )
    op.create_index(
        "ix_yield_curve_name_date",
        "yield_curve_points",
        ["curve_name", "as_of_date"],
        schema="market",
    )

    op.create_table(
        "compliance_rules",
        _uuid_pk(),
        sa.Column("fund_id", UUID, nullable=True),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("threshold", sa.Numeric(18, 8), nullable=True),
        sa.Column("comparator", sa.String(8), nullable=False, server_default="<="),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        *_timestamps(),
        sa.ForeignKeyConstraint(["fund_id"], ["portfolio.funds.id"]),
        sa.UniqueConstraint("code", name="uq_compliance_rules_code"),
        schema="compliance",
    )

    op.create_table(
        "compliance_breaches",
        _uuid_pk(),
        sa.Column("fund_id", UUID, nullable=False),
        sa.Column("rule_id", UUID, nullable=False),
        sa.Column("as_of_date", sa.Date(), nullable=False),
        sa.Column("severity", sa.String(16), nullable=False),
        sa.Column("measured_value", sa.Numeric(18, 8), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="open"),
        *_timestamps(),
        sa.ForeignKeyConstraint(["fund_id"], ["portfolio.funds.id"]),
        sa.ForeignKeyConstraint(["rule_id"], ["compliance.compliance_rules.id"]),
        schema="compliance",
    )
    op.create_index(
        "ix_compliance_breaches_fund_date",
        "compliance_breaches",
        ["fund_id", "as_of_date"],
        schema="compliance",
    )


def downgrade() -> None:
    op.drop_table("compliance_breaches", schema="compliance")
    op.drop_table("compliance_rules", schema="compliance")
    op.drop_table("yield_curve_points", schema="market")
    op.drop_table("market_quotes", schema="market")
    op.drop_table("nav_snapshots", schema="portfolio")
    op.drop_table("cashflows", schema="portfolio")
    op.drop_table("fx_hedges", schema="portfolio")
    op.drop_table("positions", schema="portfolio")
    op.drop_table("transactions", schema="portfolio")
    op.drop_table("share_classes", schema="portfolio")
    op.drop_table("security_master", schema="portfolio")
    op.drop_table("funds", schema="portfolio")
    op.drop_table("issuers", schema="portfolio")
