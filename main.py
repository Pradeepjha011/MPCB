#!/usr/bin/env python3
"""Single-company runner for MPCB: search, open first PDF, and stop on phone page."""
from __future__ import annotations

import logging
import time

from browser_manager import BrowserManager
from excel_reader import read_companies
from otp_reader import OtpReader
from utils import ROOT, ensure_runtime_dirs, setup_logging


EXCEL_FILE = ROOT / "companies.xlsx"


def main() -> None:
    ensure_runtime_dirs()
    setup_logging()
    logging.info("Single-company MPCB flow started")

    companies = read_companies(EXCEL_FILE)
    logging.info("Loaded %s companies from Excel", len(companies))

    if not companies:
        logging.warning("No companies found in Excel.")
        return

    with BrowserManager() as browser:
        otp_reader = OtpReader()
        page = browser.open_login_page()
        company = companies[0]
        logging.info("Processing first company only: %s", company.name)

        page.goto(browser.base_url, wait_until="domcontentloaded")
        try:
            page.bring_to_front()
        except Exception:
            pass

        browser.clear_search_box(page)
        browser.paste_company_name(page, company.name)
        logging.info("Company name pasted: %s", company.name)
        print(f"Pasted: {company.name}")

        browser.wait_for_initial_captcha_before_action(page)
        print("Solve captcha if shown. After that, press Enter so Go can be clicked automatically.")

        browser.click_go_button(page)
        logging.info("Go button clicked for %s", company.name)

        browser.wait_for_results_ready(page, timeout_ms=15000)

        try:
            current_url = page.url
            logging.info("Refreshing results page before PDF click: %s", current_url)
            page.reload(wait_until="domcontentloaded")
            try:
                page.bring_to_front()
            except Exception:
                pass
            browser.wait_for_results_ready(page, timeout_ms=15000)
        except Exception as exc:
            logging.warning("Results page refresh failed for %s: %s", company.name, exc)

        if browser._page_has_no_data(page):
            print("No data found")
            logging.info("No data found for %s", company.name)
            return

        phone_page = browser.click_pdf_and_open_phone_page(page, company.name)
        if phone_page is not None:
            print("PDF clicked and mobile number page is visible.")
            logging.info("Mobile number page opened for %s", company.name)
            logging.info("Current phone-page URL: %s", phone_page.url)
            if browser.fill_mobile_number(phone_page, "9920817917"):
                logging.info("Mobile number filled for %s", company.name)
                print("Mobile number filled.")
            else:
                logging.warning("Could not fill mobile number for %s", company.name)
                print("Could not fill mobile number.")

            otp_request_ms = int(time.time() * 1000)
            if browser.click_get_otp(phone_page):
                logging.info("Get OTP clicked for %s", company.name)
                print("Get OTP clicked.")
                print("Waiting for OTP SMS from ADB...")
                otp = otp_reader.wait_for_otp(timeout=180, poll_interval=5, seen_since_ms=otp_request_ms)
                if not otp:
                    logging.warning("OTP timeout for %s", company.name)
                    print("OTP timeout.")
                    return

                logging.info("OTP received for %s: %s", company.name, otp)
                print(f"OTP received: {otp}")

                if browser.wait_for_otp_input(phone_page, timeout_ms=15000):
                    logging.info("OTP input is visible for %s", company.name)
                else:
                    logging.warning("OTP input was not visible for %s", company.name)

                if browser.fill_otp(phone_page, otp):
                    logging.info("OTP filled for %s", company.name)
                    print("OTP filled.")
                else:
                    logging.warning("Could not fill OTP for %s", company.name)
                    print("Could not fill OTP.")
                    return

                if browser.click_verify_button(phone_page):
                    logging.info("OTP verify clicked for %s", company.name)
                    print("Verify clicked.")
                else:
                    logging.warning("Could not click verify for %s", company.name)
                    print("Could not click verify.")
            else:
                logging.warning("Could not click Get OTP for %s", company.name)
        else:
            print("Could not open the mobile number page.")
            logging.warning("Could not open the mobile number page for %s", company.name)

    logging.info("Single-company MPCB flow finished")


if __name__ == "__main__":
    main()
