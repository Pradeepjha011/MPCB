const { exec } = require('child_process');

const OTP_REGEX = /\b\d{4,6}\b/;
const POLL_INTERVAL_MS = 3000;
const TIMEOUT_MS = 120000;

const buildAdbQuery = () => {
  const adbPath = process.env.ADB_PATH ? `"${process.env.ADB_PATH}"` : 'adb';
  return `${adbPath} shell content query --uri content://sms/inbox --projection body:date --sort "date"`;
};

const runQuery = () =>
  new Promise((resolve, reject) => {
    exec(buildAdbQuery(), { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr?.trim() || error.message));
        return;
      }
      resolve(stdout || '');
    });
  });

const parseRows = (rawOutput) => {
  if (!rawOutput) return [];

  return rawOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^Row:\s*\d+/i.test(line))
    .map((line) => {
      const bodyMatch = line.match(/\bbody=([\s\S]*?)(?=,\s*\w+=|$)/i);
      const dateMatch = line.match(/\bdate=(\d+)/i);
      return {
        body: bodyMatch ? bodyMatch[1].trim() : '',
        date: dateMatch ? Number(dateMatch[1]) : -1
      };
    });
};

const extractOtp = (message) => {
  const match = String(message || '').match(OTP_REGEX);
  return match ? match[0] : '';
};

const waitForOTP = async (sinceTimestamp = 0) => {
  const startedAt = Date.now();
  let latestSeenDate = sinceTimestamp || -1;

  while (Date.now() - startedAt < TIMEOUT_MS) {
    const raw = await runQuery();
    const rows = parseRows(raw);

    let newest = null;
    for (const row of rows) {
      if (row.date < latestSeenDate) continue;
      if (!row.body) continue;

      const otp = extractOtp(row.body);
      if (!otp) continue;

      if (!newest || row.date > newest.date) {
        newest = { otp, date: row.date };
      }
    }

    if (newest) {
      return newest.otp;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error('OTP timeout after 120 seconds');
};

module.exports = {
  waitForOTP
};