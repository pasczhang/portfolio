from __future__ import annotations

from app.schemas.analytics import WamWalResult


class ComplianceEngine:
    """Pre-trade / post-trade SFC MMF rule evaluation."""

    def evaluate_wam_wal(self, metrics: WamWalResult) -> list[str]:
        breaches: list[str] = []
        if metrics.wam_days > metrics.wam_limit_days:
            breaches.append("WAM_LIMIT")
        if metrics.wal_days > metrics.wal_limit_days:
            breaches.append("WAL_LIMIT")
        return breaches
