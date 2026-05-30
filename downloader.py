"""Document download helpers."""
from __future__ import annotations

from pathlib import Path

from playwright.sync_api import Page

from browser_manager import BrowserManager


class Downloader:
    """Persist a downloaded PDF to the target downloads folder."""

    def __init__(self, download_dir: Path) -> None:
        self.download_dir = Path(download_dir)
        self.download_dir.mkdir(parents=True, exist_ok=True)

    def download_for_company(self, browser: BrowserManager, page: Page, filename: str) -> bool:
        destination = self.download_dir / filename
        return browser.download_document(page, destination)
