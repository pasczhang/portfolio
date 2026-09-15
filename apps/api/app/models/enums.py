from __future__ import annotations

from enum import StrEnum


class AssetClass(StrEnum):
    DEPOSIT = "Deposit"
    CD = "CD"
    CP = "CP"
    T_BILL = "T-Bill"
    REPO = "Repo"
    FX_FORWARD = "FX_Forward"


class CouponType(StrEnum):
    FIXED = "Fixed"
    FLOATING = "Floating"


class Currency(StrEnum):
    USD = "USD"
    HKD = "HKD"
    CNH = "CNH"
    CNY = "CNY"
    EUR = "EUR"
    GBP = "GBP"
    SGD = "SGD"
    JPY = "JPY"


class PaymentFrequency(StrEnum):
    ANNUAL = "Annual"
    SEMI_ANNUAL = "SemiAnnual"
    QUARTERLY = "Quarterly"
    MONTHLY = "Monthly"
    AT_MATURITY = "AtMaturity"
    NONE = "None"


class DayCount(StrEnum):
    ACT_365 = "Act/365"
    ACT_360 = "Act/360"
    ACT_365L = "Act/365L"
    THIRTY_360 = "30/360"


class TransactionType(StrEnum):
    BUY = "Buy"
    SELL = "Sell"
    DEPOSIT = "Deposit"
    WITHDRAWAL = "Withdrawal"
    REPO = "Repo"
    REVERSE_REPO = "ReverseRepo"
    FX_FORWARD = "FX_Forward"
    FX_SWAP = "FX_Swap"
    SUBSCRIPTION = "Subscription"
    REDEMPTION = "Redemption"


class TradeSide(StrEnum):
    BUY = "Buy"
    SELL = "Sell"


class TransactionStatus(StrEnum):
    NEW = "New"
    BOOKED = "Booked"
    SETTLED = "Settled"
    CANCELLED = "Cancelled"


class PledgeStatus(StrEnum):
    UNENCUMBERED = "Unencumbered"
    PLEDGED = "Pledged"
    PARTIAL = "Partial"


class PricingSource(StrEnum):
    WIND = "Wind"
    BVAL = "BVAL"
    INTERNAL = "Internal"
    BROKER = "Broker"


class ShareClassType(StrEnum):
    BASE = "Base"
    HEDGED = "Hedged"


class HedgeType(StrEnum):
    FX_FORWARD = "FX_Forward"
    FX_SWAP = "FX_Swap"
    NDF = "NDF"


class HedgeStatus(StrEnum):
    OPEN = "Open"
    ROLLED = "Rolled"
    SETTLED = "Settled"
    CANCELLED = "Cancelled"


class RatingAgency(StrEnum):
    SP = "S&P"
    MOODYS = "Moody"
    FITCH = "Fitch"
