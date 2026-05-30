"""Read and validate company rows from Excel."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd


EXPECTED_COLUMNS = [
    "Name",
    "Full Phone Number",
    "Phone Number",
    "Country Code",
    "Email ID",
]


@dataclass(slots=True)
class CompanyRecord:
    row_index: int
    name: str
    full_phone_number: str
    phone_number: str
    country_code: str
    email_id: str

    @property
    def phone_for_form(self) -> str:
        return self.full_phone_number or self.phone_number


def _safe_value(value: Any) -> str:
    if value is None:
        return ""
    if pd.isna(value):
        return ""
    text = str(value).strip()
    return "" if text.lower() == "nan" else text


def read_companies(path: str | Path) -> list[CompanyRecord]:
    excel_path = Path(path)
    if not excel_path.exists():
        raise FileNotFoundError(f"Excel file not found: {excel_path}")

    frame = pd.read_excel(excel_path, engine="openpyxl")
    frame.columns = [str(column).strip() for column in frame.columns]

    missing = [column for column in EXPECTED_COLUMNS if column not in frame.columns]
    if missing:
        raise ValueError(f"Missing required Excel columns: {', '.join(missing)}")

    companies: list[CompanyRecord] = []
    for row_index, row in frame.iterrows():
        name = _safe_value(row.get("Name"))
        if not name:
            continue

        companies.append(
            CompanyRecord(
                row_index=int(row_index),
                name=name,
                full_phone_number=_safe_value(row.get("Full Phone Number")),
                phone_number=_safe_value(row.get("Phone Number")),
                country_code=_safe_value(row.get("Country Code")),
                email_id=_safe_value(row.get("Email ID")),
            )
        )

    return companies
