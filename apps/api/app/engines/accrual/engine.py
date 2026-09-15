from app.engines.nav import NavEngine


class AccrualEngine:
    """Daily amortized-cost / interest accrual (Act/365 HKD money market)."""

    def __init__(self) -> None:
        self._nav = NavEngine()
