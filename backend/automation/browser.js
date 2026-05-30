const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const sessions = new Map();
const USER_DATA_ROOT = path.join(__dirname, '..', 'playwright-user-data');

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const createSession = async (companyId) => {
  // Persistent context keeps browser storage/session and reduces repeated cold-start friction.
  ensureDir(USER_DATA_ROOT);
  const userDataDir = path.join(USER_DATA_ROOT, companyId);
  ensureDir(userDataDir);

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    slowMo: 80
  });
  const page = context.pages().length ? context.pages()[0] : await context.newPage();

  sessions.set(companyId, { context, page, createdAt: Date.now(), userDataDir });
  return sessions.get(companyId);
};

const getSession = (companyId) => sessions.get(companyId);

const closeSession = async (companyId) => {
  const session = sessions.get(companyId);
  if (!session) return;

  try {
    await session.context.close();
  } catch (_error) {
    // Ignore session close errors to keep cleanup safe.
  }

  sessions.delete(companyId);
};

module.exports = {
  createSession,
  getSession,
  closeSession
};
