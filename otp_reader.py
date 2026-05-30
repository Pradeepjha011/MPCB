"""Poll Android SMS inbox through ADB and extract OTP codes."""
from __future__ import annotations

from dataclasses import dataclass
import logging
import re
import subprocess
import time
import os
import shutil

from utils import DEFAULT_ADB_PATH, OTP_REGEX


@dataclass(slots=True)
class SmsMessage:
    date_ms: int
    body: str


class OtpReader:
    """Read the latest SMS and extract 4 or 6 digit OTPs."""

    def __init__(self, adb_path: str | None = None) -> None:
        configured = adb_path or os.environ.get("ADB_PATH") or DEFAULT_ADB_PATH or "adb"
        self.adb_path = self._resolve_adb(configured)
        self._warned_missing_adb = False

    @staticmethod
    def _resolve_adb(adb_path: str) -> str:
        """Resolve adb to an executable path if possible."""
        candidate = adb_path.strip()
        if not candidate:
            candidate = "adb"

        if os.path.isabs(candidate) and os.path.exists(candidate):
            return candidate

        resolved = shutil.which(candidate)
        if resolved:
            return resolved

        if candidate.lower().endswith(".exe") and os.path.exists(candidate):
            return candidate

        return candidate

    def _run_query(self) -> str:
        command = [
            self.adb_path,
            "shell",
            "content",
            "query",
            "--uri",
            "content://sms/inbox",
            "--projection",
            "date:body",
            "--sort",
            "date DESC",
        ]
        try:
            completed = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=15,
                check=False,
            )
        except FileNotFoundError:
            if not self._warned_missing_adb:
                logging.error(
                    "ADB executable was not found. Set ADB_PATH or add adb.exe to PATH before waiting for OTP."
                )
                self._warned_missing_adb = True
            return ""
        except Exception as exc:
            logging.error("ADB query failed: %s", exc)
            return ""

        if completed.returncode != 0:
            return ""
        return completed.stdout or ""

    @staticmethod
    def _parse_messages(raw_output: str) -> list[SmsMessage]:
        messages: list[SmsMessage] = []
        for line in raw_output.splitlines():
            line = line.strip()
            if not line.startswith("Row:"):
                continue

            date_match = re.search(r"\bdate=(\d+)", line)
            body_match = re.search(r"\bbody=([\s\S]*?)(?=,\s*\w+=|$)", line)
            if not date_match or not body_match:
                continue

            try:
                date_ms = int(date_match.group(1))
            except ValueError:
                continue

            messages.append(
                SmsMessage(
                    date_ms=date_ms,
                    body=body_match.group(1).strip(),
                )
            )
        return messages

    @staticmethod
    def _extract_otp(message_body: str) -> str | None:
        match = OTP_REGEX.search(message_body or "")
        return match.group(1) if match else None

    @staticmethod
    def _extract_otp_from_raw_output(raw_output: str) -> str | None:
        """Fallback parser for adb output formats that don't expose Row/body cleanly."""
        matches = OTP_REGEX.findall(raw_output or "")
        if not matches:
            return None
        return matches[0]

    def wait_for_otp(
        self,
        timeout: int = 120,
        poll_interval: int = 5,
        seen_since_ms: int | None = None,
    ) -> str | None:
        """Poll until a new OTP appears or the timeout is reached."""
        deadline = time.monotonic() + timeout
        baseline = seen_since_ms or 0

        while time.monotonic() < deadline:
            raw_output = self._run_query()
            messages = self._parse_messages(raw_output)

            for message in messages:
                if message.date_ms < baseline:
                    continue
                otp = self._extract_otp(message.body)
                if otp:
                    return otp

            fallback_otp = self._extract_otp_from_raw_output(raw_output)
            if fallback_otp:
                return fallback_otp

            time.sleep(poll_interval)

        return None
