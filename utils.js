const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT_DIR = __dirname;
const DOWNLOADS_DIR = path.join(ROOT_DIR, 'downloads');
const LOG_FILE = path.join(ROOT_DIR, 'logs.txt');
const SUMMARY_FILE = path.join(ROOT_DIR, 'summary.txt');

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const appendLog = (message) => {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, `${line}\n`);
};

const resetLogs = () => {
  fs.writeFileSync(LOG_FILE, '');
};

const sanitizeFilenamePart = (value) =>
  String(value || 'COMPANY')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .toUpperCase()
    .slice(0, 120);

const currentDateLabel = () => new Date().toISOString().slice(0, 10);

const waitForEnter = (promptText) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(promptText, () => {
      rl.close();
      resolve(true);
    });
  });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const writeSummary = (summary) => {
  const content = [
    `Total Companies: ${summary.total}`,
    `Downloaded: ${summary.downloaded}`,
    `Failed: ${summary.failed}`,
    `Skipped: ${summary.skipped}`
  ].join('\n');

  fs.writeFileSync(SUMMARY_FILE, `${content}\n`);
};

module.exports = {
  ROOT_DIR,
  DOWNLOADS_DIR,
  LOG_FILE,
  SUMMARY_FILE,
  ensureDir,
  appendLog,
  resetLogs,
  sanitizeFilenamePart,
  currentDateLabel,
  waitForEnter,
  sleep,
  writeSummary
};