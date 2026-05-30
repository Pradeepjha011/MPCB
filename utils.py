"""Shared configuration, logging, and filesystem helpers."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import logging
import re


ROOT = Path(__file__).resolve().parent
DOWNLOADS_DIR = ROOT / "downloads"
SCREENSHOTS_DIR = ROOT / "screenshots"
AUTH_DIR = ROOT / "playwright_auth"
AUTH_STATE_PATH = AUTH_DIR / "auth.json"
LOG_FILE = ROOT / "logs.txt"
SUMMARY_FILE = ROOT / "summary.txt"
STATE_FILE = ROOT / "run_state.json"

# MPCB consent copies portal.
BASE_URL = "https://www.ecmpcb.in/cms"

# Attach Playwright to an already-running Chrome started with remote debugging.
USE_REMOTE_DEBUGGING_BROWSER = True
CHROME_CDP_URL = "http://127.0.0.1:9222"

# Default ADB location on this machine.
DEFAULT_ADB_PATH = r"C:\Users\VIKAS\Downloads\platform-tools-latest-windows\platform-tools\adb.exe"

# Tune these selectors to match the target website.
SELECTORS = {
    "search_input": [
        "input[name='search_by_name']",
        "input[name*='search' i]",
        "xpath=(//input[not(@type='hidden')])[1]",
        "input[placeholder*='Search by name' i]",
    ],
    "search_submit": [
        "button:has-text('Go !')",
        "button:has-text('Go!')",
        "text=Go !",
    ],
    "company_link": [
        "table a:has-text('{company_name}')",
        "a:has-text('{company_name}')",
        "text={company_name}",
    ],
    "pdf_link": [
        "tr:has-text('{company_name}') a:has-text('PDF')",
        "tr:has-text('{company_name}') img[alt*='pdf' i]",
        "tr:has-text('{company_name}') a[href*='pdf' i]",
    ],
    "phone_input": [
        "xpath=//*[contains(normalize-space(.), 'Mobile Number')]/following::input[1]",
        "xpath=//*[contains(normalize-space(.), 'Mobile Number')]/following::textarea[1]",
        "input[name*='mobile' i]",
        "input[id*='mobile' i]",
        "input[placeholder*='Mobile' i]",
        "input[placeholder*='Phone' i]",
        "input[type='tel']",
    ],
    "request_otp_button": [
        "button:has-text('Get OTP!')",
        "button:has-text('Get OTP')",
        "a:has-text('Get OTP!')",
        "a:has-text('Get OTP')",
        "input[value*='OTP' i]",
        "text=Get OTP!",
    ],
    "otp_input": [
        "xpath=//*[contains(normalize-space(.), 'OTP')]/following::input[1]",
        "input[autocomplete='one-time-code']",
        "input[placeholder*='OTP' i]",
        "input[name*='otp' i]",
        "input[id*='otp' i]",
        "input[type='tel']",
    ],
    "submit_otp_button": [
        "button:has-text('Close Verify')",
        "button:has-text('Verify')",
        "button:has-text('Submit')",
    ],
    "download_button": [
        "button:has-text('Download Scan Copy')",
        "a:has-text('Download Scan Copy')",
        "a:has-text('Download')",
        "a[download]",
    ],
}

OTP_REGEX = re.compile(r"\b(\d{4}|\d{5}|\d{6})\b")
INVALID_FILENAME_CHARS = r'\\/:*?"<>|'


@dataclass(slots=True)
class Summary:
    total: int = 0
    downloaded: int = 0
    failed: int = 0
    skipped: int = 0


def setup_logging() -> None:
    """Configure both file and console logging once."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[
            logging.FileHandler(LOG_FILE, encoding="utf-8"),
            logging.StreamHandler(),
        ],
    )


def ensure_runtime_dirs() -> None:
    """Create runtime directories used by the automation."""
    DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
    SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    AUTH_DIR.mkdir(parents=True, exist_ok=True)


def safe_filename_part(value: str | None) -> str:
    """Return a filesystem-safe uppercase token for filenames."""
    text = (value or "").strip()
    text = re.sub(f"[{re.escape(INVALID_FILENAME_CHARS)}]", "", text)
    text = re.sub(r"\s+", "_", text)
    text = re.sub(r"_+", "_", text)
    text = text.strip("._ ")
    return text.upper()[:120] or "COMPANY"


def today_label() -> str:
    return datetime.now().strftime("%Y%m%d")


def append_blank_line(path: Path) -> None:
    with path.open("a", encoding="utf-8") as handle:
        handle.write("\n")


def write_summary(summary: Summary) -> None:
    lines = [
        f"Total Companies: {summary.total}",
        f"Downloaded: {summary.downloaded}",
        f"Failed: {summary.failed}",
        f"Skipped: {summary.skipped}",
    ]
    SUMMARY_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")
