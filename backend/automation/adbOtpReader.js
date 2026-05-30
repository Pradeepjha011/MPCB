const { exec } = require('child_process');

const OTP_REGEX = /\b\d{4,6}\b/;
const POLL_INTERVAL_MS = 3000;
const TIMEOUT_MS = 120000;

const buildAdbSmsQuery = () => {
  const adbBinary = process.env.ADB_PATH ? `"${process.env.ADB_PATH}"` : 'adb';
  return `${adbBinary} shell content query --uri content://sms/inbox --projection body:date --sort "date"`;
};

const runAdbSmsQuery = () =>
  new Promise((resolve, reject) => {
    const adbSmsQuery = buildAdbSmsQuery();
    exec(adbSmsQuery, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const message = stderr?.trim() || error.message;
        reject(new Error(`ADB query failed: ${message}. ADB_PATH=${process.env.ADB_PATH || 'not_set'}`));
        return;
      }

      resolve(stdout || '');
    });
  });

const parseSmsRows = (rawOutput) => {
  if (!rawOutput) return [];

  const rows = rawOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^Row:\s*\d+/i.test(line));

  return rows.map((row) => {
    const bodyMatch = row.match(/\bbody=([\s\S]*?)(?=,\s*\w+=|$)/i);
    const dateMatch = row.match(/\bdate=(\d+)/i);
    const body = bodyMatch ? bodyMatch[1].trim() : '';
    const date = dateMatch ? Number(dateMatch[1]) : -1;
    return { body, date };
  });
};

const extractOtp = (message) => {
  if (!message) return '';
  const otpMatch = message.match(OTP_REGEX);
  return otpMatch ? otpMatch[0] : '';
};

const extractLatestOtpCandidate = (rawOutput) => {
  const parsedRows = parseSmsRows(rawOutput);
  let latest = { date: -1, body: '' };

  for (const row of parsedRows) {
    if (!row.body) continue;
    if (!extractOtp(row.body)) continue;

    if (row.date > latest.date) {
      latest = row;
    }
  }

  return latest;
};

const waitForOTP = async (options = {}) => {
  const sinceTimestamp = Number(options.sinceTimestamp || 0);
  console.log('Waiting for OTP...');

  const startTime = Date.now();
  let lastSeenDate = sinceTimestamp > 0 ? sinceTimestamp : -1;
  const firstSnapshot = await runAdbSmsQuery().catch(() => '');
  const initialRows = parseSmsRows(firstSnapshot);
  for (const row of initialRows) {
    if (row.date > lastSeenDate && (sinceTimestamp <= 0 || row.date >= sinceTimestamp)) {
      lastSeenDate = row.date;
    }
  }

  while (Date.now() - startTime < TIMEOUT_MS) {
    const rawOutput = await runAdbSmsQuery();
    const latestOtp = extractLatestOtpCandidate(rawOutput);
    console.log('Checking SMS inbox...');

    if (latestOtp.body && latestOtp.date >= lastSeenDate && (sinceTimestamp <= 0 || latestOtp.date >= sinceTimestamp)) {
      console.log('SMS received');
      lastSeenDate = latestOtp.date + 1;

      const otp = extractOtp(latestOtp.body);
      if (otp) {
        console.log('OTP found');
        return otp;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error('OTP wait timeout after 120 seconds');
};

module.exports = {
  waitForOTP
};
