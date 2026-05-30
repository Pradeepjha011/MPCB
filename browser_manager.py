"""Playwright browser/session management for the automation flow."""
from __future__ import annotations

from contextlib import suppress
from pathlib import Path
import logging
import time

from playwright.sync_api import Page, TimeoutError as PlaywrightTimeoutError, sync_playwright

from utils import (
    AUTH_STATE_PATH,
    BASE_URL,
    CHROME_CDP_URL,
    SCREENSHOTS_DIR,
    SELECTORS,
    USE_REMOTE_DEBUGGING_BROWSER,
)


class BrowserManager:
    """Own the Playwright lifecycle and site-specific interactions."""

    def __init__(
        self,
        base_url: str = BASE_URL,
        auth_path: Path = AUTH_STATE_PATH,
        cdp_url: str | None = CHROME_CDP_URL,
        use_remote_debugging_browser: bool = USE_REMOTE_DEBUGGING_BROWSER,
    ) -> None:
        self.base_url = base_url
        self.auth_path = Path(auth_path)
        self.cdp_url = cdp_url
        self.use_remote_debugging_browser = use_remote_debugging_browser
        self._playwright = None
        self._browser = None
        self._context = None
        self._owns_browser = False
        self._captcha_handled = False

    def __enter__(self) -> "BrowserManager":
        self._playwright = sync_playwright().start()
        if self.use_remote_debugging_browser:
            try:
                self._browser = self._playwright.chromium.connect_over_cdp(self.cdp_url)
                self._context = self._browser.contexts[0] if self._browser.contexts else None
                self._owns_browser = False
                logging.info("Connected to Chrome debugging browser at %s", self.cdp_url)
                return self
            except Exception as exc:
                logging.error(
                    "Could not connect to Chrome at %s (%s). Start Chrome with remote debugging before running this script.",
                    self.cdp_url,
                    exc,
                )
                raise RuntimeError(
                    f"Could not connect to Chrome debugging browser at {self.cdp_url}. "
                    "Start Chrome with --remote-debugging-port=9222 and the same user-data-dir, then run again."
                ) from exc

        self._browser = self._playwright.chromium.launch(headless=False)
        self._context = self._create_context()
        self._owns_browser = True
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        with suppress(Exception):
            if self._context and self._owns_browser:
                self._context.close()
        with suppress(Exception):
            if self._browser and self._owns_browser:
                self._browser.close()
        with suppress(Exception):
            if self._playwright:
                self._playwright.stop()

    def _create_context(self):
        if self.auth_path.exists():
            logging.info("Loading Playwright auth from %s", self.auth_path)
            return self._browser.new_context(storage_state=str(self.auth_path))

        logging.info("No auth state found. Opening a fresh browser for manual login.")
        return self._browser.new_context()

    def open_login_page(self) -> Page:
        if self._context is None:
            raise RuntimeError("Browser context is not available.")
        page = self._context.new_page()
        page.goto(self.base_url, wait_until="domcontentloaded")
        page.bring_to_front()
        return page

    def save_auth_state(self) -> None:
        if not self._owns_browser:
            logging.info("Skipping auth-state save because Chrome profile is already persistent.")
            return
        self.auth_path.parent.mkdir(parents=True, exist_ok=True)
        self._context.storage_state(path=str(self.auth_path))
        logging.info("Saved Playwright auth state to %s", self.auth_path)

    @staticmethod
    def pause_for_user(message: str) -> None:
        print(message)
        input("Press Enter to continue after you finish that step...")

    @staticmethod
    def _selector_candidates(key: str, company_name: str | None = None) -> list[str]:
        candidates = []
        for selector in SELECTORS.get(key, []):
            if company_name:
                candidates.append(selector.format(company_name=company_name))
            else:
                candidates.append(selector)
        return candidates

    @staticmethod
    def _take_stage_screenshot(page: Page, filename: str) -> None:
        try:
            page.screenshot(path=str(SCREENSHOTS_DIR / filename), full_page=True)
        except Exception as exc:
            logging.debug("Could not save screenshot %s: %s", filename, exc)

    @staticmethod
    def _has_captcha(page: Page) -> bool:
        probes = [
            "iframe[src*='captcha']",
            "iframe[title*='captcha' i]",
            "[class*='captcha' i]",
            "[id*='captcha' i]",
            "text=/captcha/i",
            "text=/captacha/i",
            "text=/enter\\s+code\\s+here/i",
        ]
        for probe in probes:
            try:
                if page.locator(probe).count() > 0:
                    return True
            except Exception:
                continue
        return False

    def wait_for_captcha_if_present(self, page: Page) -> None:
        if self._has_captcha(page) and not self._captcha_handled:
            self.pause_for_user("Captcha detected. Solve it in the browser, then continue.")
            self._captcha_handled = True
        elif self._has_captcha(page):
            logging.info("Captcha still present, but it was already handled once during this run.")

    def wait_for_initial_captcha_before_action(self, page: Page) -> None:
        """Pause before any automated action if the page is showing the MPCB captcha."""
        if self._has_captcha(page) and not self._captcha_handled:
            self.pause_for_user(
                "Captcha is visible on the page. Please solve it manually first, then press Enter so automation can continue."
            )
            self._captcha_handled = True
            try:
                page.wait_for_load_state("networkidle", timeout=15000)
            except PlaywrightTimeoutError:
                pass

    def ensure_manual_login_once(self, page: Page) -> None:
        """Allow a first-run login and save the resulting browser session."""
        if self.use_remote_debugging_browser:
            return

        if self.auth_path.exists():
            return

        self.pause_for_user(
            "First run detected. Log in manually in the browser, solve any login captcha once, "
            "and then continue so the session can be saved."
        )
        self.save_auth_state()

    def _fill_first_available(self, page: Page, selector_key: str, value: str) -> bool:
        for selector in self._selector_candidates(selector_key):
            try:
                locator = page.locator(selector).first
                locator.wait_for(state="visible", timeout=5000)
                try:
                    locator.fill("")
                    locator.fill(value)
                except Exception:
                    try:
                        locator.click()
                    except Exception:
                        pass
                    locator.press_sequentially(value)
                self._set_locator_value(locator, value)
                return True
            except Exception:
                continue
        return False

    def paste_company_name(self, page: Page, company_name: str) -> bool:
        """Paste the company name into the visible MPCB search field only."""
        selectors = [
            "input[name='search_by_name']",
            "input[name*='search' i]",
            "xpath=(//input[not(@type='hidden')])[1]",
        ]
        for selector in selectors:
            try:
                locator = page.locator(selector).first
                locator.wait_for(state="visible", timeout=5000)
                locator.fill("")
                locator.fill(company_name)
                self._set_locator_value(locator, company_name)
                try:
                    page.bring_to_front()
                    page.wait_for_timeout(500)
                except Exception:
                    pass
                return True
            except Exception:
                continue

        logging.warning("Could not find the MPCB search box for %s", company_name)
        return False

    def clear_search_box(self, page: Page) -> bool:
        """Clear the MPCB search field before the next company."""
        selectors = [
            "input[name='search_by_name']",
            "input[name*='search' i]",
            "xpath=(//input[not(@type='hidden')])[1]",
        ]
        for selector in selectors:
            try:
                locator = page.locator(selector).first
                locator.wait_for(state="visible", timeout=5000)
                locator.fill("")
                self._set_locator_value(locator, "")
                try:
                    page.bring_to_front()
                    page.wait_for_timeout(300)
                except Exception:
                    pass
                return True
            except Exception:
                continue
        return False

    @staticmethod
    def _set_locator_value(locator, value: str) -> None:
        """Force a visible input value and fire input/change events."""
        try:
            locator.evaluate(
                """(el, val) => {
                    el.value = val;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }""",
                value,
            )
        except Exception:
            pass

    def click_go_button(self, page: Page) -> bool:
        """Click the MPCB Go button."""
        selectors = [
            "button:has-text('Go !')",
            "button:has-text('Go!')",
            "text=Go !",
        ]
        for selector in selectors:
            try:
                locator = page.locator(selector).first
                locator.wait_for(state="visible", timeout=5000)
                locator.click()
                return True
            except Exception:
                continue
        return False

    @staticmethod
    def _page_has_no_data(page: Page) -> bool:
        markers = [
            "text=/no\\s+data/i",
            "text=/no\\s+records?\\s+found/i",
            "text=/no\\s+result/i",
            "text=/invalid\\s+captacha/i",
            "text=/invalid\\s+captcha/i",
        ]
        for marker in markers:
            try:
                if page.locator(marker).count() > 0:
                    return True
            except Exception:
                continue
        return False

    def wait_for_results_ready(self, page: Page, timeout_ms: int = 12000) -> None:
        """Wait until the results table or a no-data message appears."""
        end_time = time.monotonic() + (timeout_ms / 1000.0)
        while time.monotonic() < end_time:
            if self._page_has_no_data(page):
                return
            try:
                header = page.locator("text=Sr. No").first
                if header.count() > 0:
                    return
            except Exception:
                pass
            try:
                page.wait_for_timeout(300)
            except Exception:
                break

    def read_first_result_row(self, page: Page) -> str | None:
        """Return the first data row from the results table, if present."""
        try:
            page.wait_for_load_state("networkidle", timeout=15000)
        except PlaywrightTimeoutError:
            pass

        if self._page_has_no_data(page):
            return None

        tables = page.locator("table")
        table_count = tables.count()
        for table_index in range(table_count):
            try:
                table = tables.nth(table_index)
                text = (table.inner_text(timeout=3000) or "").lower()
                if "sr. no" not in text or "scan copy" not in text:
                    continue

                rows = table.locator("tr")
                row_count = rows.count()
                for row_index in range(1, row_count):
                    try:
                        row_text = (rows.nth(row_index).inner_text(timeout=3000) or "").strip()
                    except Exception:
                        continue
                    if not row_text:
                        continue
                    lowered = row_text.lower()
                    if "no data" in lowered or "no records" in lowered or "not found" in lowered:
                        return None
                    return row_text
            except Exception:
                continue

        return None

    def _click_first_available(self, page: Page, selector_key: str) -> bool:
        for selector in self._selector_candidates(selector_key):
            try:
                locator = page.locator(selector).first
                locator.wait_for(state="visible", timeout=5000)
                locator.click()
                return True
            except Exception:
                continue
        return False

    @staticmethod
    def _page_has_phone_form(page: Page) -> bool:
        markers = [
            "text=/mobile\\s+number/i",
            "text=/get\\s+otp/i",
            "text=/request\\s+otp/i",
            "input[placeholder*='mobile' i]",
            "input[placeholder*='otp' i]",
        ]
        for marker in markers:
            try:
                if page.locator(marker).count() > 0:
                    return True
            except Exception:
                continue
        return False

    def click_pdf_and_open_phone_page(self, page: Page, company_name: str) -> Page | None:
        """Click the first scan-copy/PDF control in the results table and return the active phone page."""
        original_context = page.context

        tables = page.locator("table")
        table_count = tables.count()

        for table_index in range(table_count):
            try:
                table = tables.nth(table_index)
                table_text = (table.inner_text(timeout=3000) or "").lower()
                if "scan copy" not in table_text or "sr. no" not in table_text:
                    continue

                rows = table.locator("tr")
                row_count = rows.count()
                for row_index in range(1, row_count):
                    row = rows.nth(row_index)
                    try:
                        row_text = (row.inner_text(timeout=3000) or "").strip()
                    except Exception:
                        row_text = ""
                    if not row_text:
                        continue

                    click_targets = [
                        "td:last-child a",
                        "td:last-child img",
                        "td:last-child a:has(img)",
                        "a:has-text('PDF')",
                        "a[href*='pdf' i]",
                        "img[alt*='pdf' i]",
                        "img[src*='pdf' i]",
                        "a:has(img)",
                        "a",
                    ]

                    for target in click_targets:
                        try:
                            locator = row.locator(target).first
                            locator.wait_for(state="visible", timeout=3000)
                            popup_page = None
                            try:
                                with page.expect_popup(timeout=2500) as popup_info:
                                    locator.evaluate("(el) => el.click()")
                                popup_page = popup_info.value
                            except PlaywrightTimeoutError:
                                locator.evaluate("(el) => el.click()")
                            except Exception:
                                locator.evaluate("(el) => el.click()")

                            if popup_page is not None:
                                try:
                                    popup_page.wait_for_load_state("domcontentloaded", timeout=15000)
                                    page = popup_page
                                except Exception:
                                    page = popup_page
                            else:
                                try:
                                    if len(original_context.pages) > 1:
                                        candidate = original_context.pages[-1]
                                        try:
                                            candidate.wait_for_load_state("domcontentloaded", timeout=5000)
                                        except Exception:
                                            pass
                                        page = candidate
                                except Exception:
                                    pass

                            try:
                                page.wait_for_load_state("domcontentloaded", timeout=5000)
                            except Exception:
                                pass

                            end_time = time.monotonic() + 12
                            while time.monotonic() < end_time:
                                if self._page_has_phone_form(page):
                                    self._take_stage_screenshot(page, "otp_page.png")
                                    try:
                                        page.bring_to_front()
                                    except Exception:
                                        pass
                                    return page
                                try:
                                    page.wait_for_timeout(300)
                                except Exception:
                                    break

                            if self._page_has_phone_form(page):
                                self._take_stage_screenshot(page, "otp_page.png")
                                try:
                                    page.bring_to_front()
                                except Exception:
                                    pass
                                return page
                        except Exception:
                            continue
                break
            except Exception:
                continue

        return None

    def fill_mobile_number(self, page: Page, phone_number: str) -> bool:
        """Fill the MPCB mobile number field."""
        try:
            page.bring_to_front()
        except Exception:
            pass

        selectors = [
            "input[placeholder='Enter 10 Digit Mobile Number']",
            "input[placeholder*='Enter 10 Digit Mobile Number' i]",
            "xpath=//div[contains(., 'Download Scan Copy')]//input[@placeholder='Enter 10 Digit Mobile Number']",
            "xpath=//tr[.//*[contains(normalize-space(.), 'Mobile Number')]]//td[last()]//input[not(@type='hidden')]",
            "xpath=//td[contains(normalize-space(.), 'Mobile Number')]/following-sibling::td[1]//input[not(@type='hidden')]",
            "xpath=//tr[.//*[contains(normalize-space(.), 'Mobile Number')]]//input[not(@type='hidden')]",
            "xpath=//*[contains(normalize-space(.), 'Mobile Number')]/following::input[not(@type='hidden')][1]",
            "xpath=//label[contains(normalize-space(.), 'Mobile Number')]/following::input[not(@type='hidden')][1]",
            "input[name*='mobile' i]",
            "input[id*='mobile' i]",
            "input[placeholder*='Mobile' i]",
            "input[placeholder*='Phone' i]",
            "input[type='tel']",
        ]

        for selector in selectors:
            try:
                locator = page.locator(selector).first
                locator.wait_for(state="visible", timeout=5000)
                try:
                    locator.click()
                except Exception:
                    pass
                try:
                    locator.fill("")
                    locator.fill(phone_number)
                except Exception:
                    locator.press_sequentially(phone_number)
                self._set_locator_value(locator, phone_number)
                try:
                    current_value = locator.input_value(timeout=2000)
                    logging.info("Phone field value after fill attempt: %s", current_value)
                except Exception:
                    pass
                try:
                    page.wait_for_timeout(400)
                except Exception:
                    pass
                return True
            except Exception:
                continue
        return False

    def click_get_otp(self, page: Page) -> bool:
        """Click the Get OTP button on the phone page."""
        try:
            page.bring_to_front()
        except Exception:
            pass

        selectors = [
            "button:has-text('Get OTP!')",
            "button:has-text('Get OTP')",
            "input[value*='Get OTP' i]",
            "a:has-text('Get OTP!')",
            "a:has-text('Get OTP')",
            "text=Get OTP!",
        ]

        for selector in selectors:
            try:
                locator = page.locator(selector).first
                locator.wait_for(state="visible", timeout=5000)
                try:
                    locator.evaluate("(el) => el.click()")
                except Exception:
                    locator.click()
                try:
                    page.wait_for_timeout(800)
                except Exception:
                    pass
                return True
            except Exception:
                continue
        return False

    def fill_otp(self, page: Page, otp: str) -> bool:
        """Fill the OTP verification field."""
        try:
            page.bring_to_front()
        except Exception:
            pass

        try:
            page.wait_for_timeout(500)
        except Exception:
            pass

        selectors = [
            "input[placeholder='Enter OTP']",
            "input[placeholder*='Enter OTP' i]",
            "xpath=//*[contains(normalize-space(.), 'OTP')]/following::input[1]",
            "input[placeholder*='OTP' i]",
            "input[name*='otp' i]",
            "input[id*='otp' i]",
        ]

        for selector in selectors:
            try:
                locator = page.locator(selector).first
                locator.wait_for(state="visible", timeout=5000)
                try:
                    locator.click()
                except Exception:
                    pass
                try:
                    locator.fill("")
                    locator.fill(otp)
                except Exception:
                    locator.press_sequentially(otp)
                self._set_locator_value(locator, otp)
                return True
            except Exception:
                continue
        return False

    def wait_for_otp_input(self, page: Page, timeout_ms: int = 15000) -> bool:
        """Wait for the actual OTP input field to be visible."""
        end_time = time.monotonic() + (timeout_ms / 1000.0)
        selectors = [
            "input[placeholder='Enter OTP']",
            "input[placeholder*='Enter OTP' i]",
            "input[placeholder*='OTP' i]",
            "xpath=//*[contains(normalize-space(.), 'OTP')]/following::input[1]",
            "input[name*='otp' i]",
            "input[id*='otp' i]",
        ]
        while time.monotonic() < end_time:
            for selector in selectors:
                try:
                    locator = page.locator(selector).first
                    if locator.count() > 0:
                        locator.wait_for(state="visible", timeout=1000)
                        return True
                except Exception:
                    continue
            try:
                page.wait_for_timeout(300)
            except Exception:
                break
        return False

    def click_verify_button(self, page: Page) -> bool:
        """Click the OTP verify/submit button."""
        try:
            page.bring_to_front()
        except Exception:
            pass

        selectors = [
            "button:has-text('Verify')",
            "button:has-text('Submit')",
            "button:has-text('Close Verify')",
            "input[value*='Verify' i]",
            "input[value*='Submit' i]",
            "a:has-text('Verify')",
            "a:has-text('Submit')",
        ]

        for selector in selectors:
            try:
                locator = page.locator(selector).first
                locator.wait_for(state="visible", timeout=5000)
                try:
                    locator.evaluate("(el) => el.click()")
                except Exception:
                    locator.click()
                return True
            except Exception:
                continue
        return False

    def wait_for_otp_form(self, page: Page, timeout_ms: int = 15000) -> bool:
        """Wait until the OTP verify field or related controls are visible."""
        end_time = time.monotonic() + (timeout_ms / 1000.0)
        while time.monotonic() < end_time:
            try:
                if self._page_has_phone_form(page):
                    return True
                for selector in self._selector_candidates("otp_input"):
                    try:
                        locator = page.locator(selector).first
                        if locator.count() > 0:
                            locator.wait_for(state="visible", timeout=1000)
                            return True
                    except Exception:
                        continue
            except Exception:
                pass
            try:
                page.wait_for_timeout(300)
            except Exception:
                break
        return False
