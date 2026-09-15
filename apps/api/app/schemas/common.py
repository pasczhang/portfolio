from __future__ import annotations

from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

Money = Annotated[Decimal, Field(max_digits=24, decimal_places=8)]
Rate = Annotated[Decimal, Field(max_digits=18, decimal_places=10)]
NavPx = Annotated[Decimal, Field(max_digits=24, decimal_places=10)]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)
