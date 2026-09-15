"""Backward-compatible alias. Prefer Transaction."""

from app.models.transaction import Transaction

Trade = Transaction

__all__ = ["Trade", "Transaction"]
