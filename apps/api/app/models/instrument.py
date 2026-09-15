"""Backward-compatible aliases. Prefer SecurityMaster."""

from app.models.security import Issuer, SecurityMaster

Instrument = SecurityMaster

__all__ = ["Instrument", "Issuer", "SecurityMaster"]
