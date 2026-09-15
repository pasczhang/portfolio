"""Import all ORM modules so Alembic and metadata.create_all see every table."""

from app.models.cashflow import Cashflow
from app.models.compliance import ComplianceBreach, ComplianceRule
from app.models.fund import Fund, ShareClass
from app.models.fx_hedge import FXHedge
from app.models.instrument import Instrument, Issuer, SecurityMaster
from app.models.market_data import MarketQuote, YieldCurvePoint
from app.models.nav import NavSnapshot
from app.models.position import Position
from app.models.trade import Trade, Transaction

load_models = True

__all__ = [
    "Cashflow",
    "ComplianceBreach",
    "ComplianceRule",
    "FXHedge",
    "Fund",
    "Instrument",
    "Issuer",
    "MarketQuote",
    "NavSnapshot",
    "Position",
    "SecurityMaster",
    "ShareClass",
    "Trade",
    "Transaction",
    "YieldCurvePoint",
    "load_models",
]
