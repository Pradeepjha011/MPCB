const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const selectors = require('./selectors');
const { waitForOTP } = require('./adbOtpReader');
const { createSession, getSession, closeSession } = require('./browser');

const DEFAULT_TIMEOUT = 30000;
const MANUAL_WAIT_TIMEOUT = 120000;
const DOWNLOAD_TIMEOUT = 60000;
const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');
const DOWNLOAD_DIR = path.join(__dirname, '..', 'downloads');
const SYSTEM_DOWNLOAD_DIR = process.env.SYSTEM_DOWNLOAD_DIR || path.join(require('os').homedir(), 'Downloads');
const shouldAutoCloseOnError = () => process.env.AUTO_CLOSE_BROWSER_ON_ERROR === 'true';

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const ensureScreenshotDir = () => ensureDir(SCREENSHOT_DIR);
const ensureDownloadDir = () => ensureDir(DOWNLOAD_DIR);

const sanitizeFilenamePart = (value) =>
  String(value || 'company')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);

const todayDateLabel = () => new Date().toISOString().slice(0, 10);

const downloadViaNodeRequest = (fileUrl, outputPath) =>
  new Promise((resolve, reject) => {
    const isHttps = fileUrl.startsWith('https://');
    const client = isHttps ? https : http;
    const request = client.get(
      fileUrl,
      {
        rejectUnauthorized: false,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      },
      (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          const nextUrl = new URL(response.headers.location, fileUrl).toString();
          downloadViaNodeRequest(nextUrl, outputPath).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Download failed: unable to fetch file (${response.statusCode})`));
          return;
        }

        const fileStream = fs.createWriteStream(outputPath);
        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close(() => resolve(true));
        });

        fileStream.on('error', (error) => {
          reject(error);
        });
      }
    );

    request.on('error', (error) => reject(error));
  });

const findEcmpcbNameInput = async (page) => {
  const strictInput = page.locator('input[name="search_by_name"]').first();
  if ((await strictInput.count()) > 0) return strictInput;

  const fallbackInput = page.locator('input.input-form-control[name*="search"]').first();
  if ((await fallbackInput.count()) > 0) return fallbackInput;

  return null;
};

const setInputValueReliably = async (page, inputLocator, value) => {
  const finalValue = String(value || '');

  const inserted = await page.evaluate((nextValue) => {
    const xpath =
      '//td[contains(normalize-space(.),"Search by name/UAN No")]/following-sibling::td[1]//input[1]';
    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    const input = result.singleNodeValue;
    if (!input) return false;

    input.focus();
    input.value = '';
    input.value = nextValue;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
    return (input.value || '').trim().length > 0;
  }, finalValue);

  if (!inserted) {
    await inputLocator.click({ timeout: 5000 }).catch(() => {});
    await inputLocator.fill(finalValue, { force: true }).catch(async () => {
      await inputLocator.type(finalValue, { delay: 40 });
    });
  }

  const currentValue = await inputLocator.inputValue().catch(() => '').then((v) => String(v || '').trim());
  if (!currentValue) {
    throw new Error('Could not set value in company search input');
  }
};

const setEcmpcbNameInputDirect = async (page, value) => {
  const finalValue = String(value || '').trim();
  if (!finalValue) {
    throw new Error('companyName is empty, cannot fill ECMPCB search field');
  }

  const input = page.locator('input[name="search_by_name"]').first();
  await input.waitFor({ state: 'visible', timeout: DEFAULT_TIMEOUT });
  await page.bringToFront().catch(() => {});
  await input.click({ timeout: 5000, force: true });

  const setValueWithEvents = async () => {
    await input.evaluate((el, nextValue) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      el.focus();
      if (nativeSetter) {
        nativeSetter.call(el, '');
        nativeSetter.call(el, nextValue);
      } else {
        el.value = '';
        el.value = nextValue;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'A' }));
    }, finalValue);
  };

  await setValueWithEvents();
  await page.waitForTimeout(250);
  let readBack = (await input.inputValue()).trim();

  if (!readBack || readBack !== finalValue) {
    await setValueWithEvents();
    await page.waitForTimeout(300);
    readBack = (await input.inputValue()).trim();
  }

  if (!readBack) {
    throw new Error('Could not set ECMPCB search input (input[name="search_by_name"])');
  }

  console.log(`ECMPCB input debug => name:search_by_name value:${readBack}`);
  return readBack;
};

const findSearchInput = async (page) => {
  const ecmpcbInput = await findEcmpcbNameInput(page);
  if (ecmpcbInput) {
    return ecmpcbInput;
  }

  for (const placeholder of selectors.searchPlaceholders) {
    const candidate = page.getByPlaceholder(placeholder, { exact: false }).first();
    if ((await candidate.count()) > 0) {
      return candidate;
    }
  }

  for (const roleConfig of selectors.searchRoles) {
    const candidate = page.getByRole(roleConfig.role, { name: roleConfig.name }).first();
    if ((await candidate.count()) > 0) {
      return candidate;
    }
  }

  for (const locatorText of selectors.searchInputLocators) {
    const candidate = page.locator(locatorText).first();
    if ((await candidate.count()) > 0) {
      return candidate;
    }
  }

  throw new Error('Search box not found. Update selectors for this website.');
};

const findSearchButton = async (page) => {
  for (const roleConfig of selectors.searchButtonRoles) {
    const candidate = page.getByRole(roleConfig.role, { name: roleConfig.name }).first();
    if ((await candidate.count()) > 0) {
      return candidate;
    }
  }

  for (const locatorText of selectors.searchButtonLocators) {
    const candidate = page.locator(locatorText).first();
    if ((await candidate.count()) > 0) {
      return candidate;
    }
  }

  return null;
};

const clickMatchingResult = async (page, companyName) => {
  const normalizeText = (value) =>
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  const exactText = (companyName || '').trim();
  const partialText = normalizeText(exactText);

  for (const locatorText of selectors.resultLocators) {
    const resultItems = page.locator(locatorText);
    const count = await resultItems.count();

    if (!count) continue;

    for (let index = 0; index < count; index += 1) {
      const item = resultItems.nth(index);
      const text = (await item.innerText().catch(() => '')).trim();
      if (normalizeText(text).includes(partialText)) {
        const linkInRow = item.locator('a').first();
        const hasLink = (await linkInRow.count()) > 0;

        if (hasLink) {
          await linkInRow.click();
        } else {
          await item.click().catch(() => {});
        }
        return true;
      }
    }
  }

  return false;
};

const hasCaptchaInput = async (page) => {
  const captchaCandidates = [
    'input[placeholder*="code"]',
    'input[placeholder*="captcha"]',
    'input[name*="captcha"]',
    'input[id*="captcha"]',
    'input[name*="code"]',
    'input[id*="code"]'
  ];

  for (const selector of captchaCandidates) {
    const field = page.locator(selector).first();
    if ((await field.count()) > 0 && (await field.isVisible().catch(() => false))) {
      return true;
    }
  }

  return false;
};

const findVisibleLocatorFromList = async (page, locatorList) => {
  for (const locatorText of locatorList) {
    const locator = page.locator(locatorText).first();
    const count = await locator.count();
    if (!count) continue;
    const visible = await locator.isVisible().catch(() => false);
    if (visible) {
      return locator;
    }
  }

  return null;
};

const downloadCompanyDocument = async (page, companyName) => {
  console.log('Looking for document');

  const downloadTrigger = await findVisibleLocatorFromList(page, selectors.downloadButtonLocators);
  if (!downloadTrigger) {
    throw new Error('No document found');
  }

  console.log('Download started');
  ensureDownloadDir();
  const safeName = sanitizeFilenamePart(companyName);
  const filename = `${safeName}_${todayDateLabel()}.pdf`;
  const absoluteFilePath = path.join(DOWNLOAD_DIR, filename);
  const systemFilePath = path.join(SYSTEM_DOWNLOAD_DIR, filename);

  const downloadPromise = page.waitForEvent('download', { timeout: 12000 }).catch(() => null);
  const popupPromise = page.waitForEvent('popup', { timeout: 12000 }).catch(() => null);

  await downloadTrigger.click();

  const download = await downloadPromise;
  if (download) {
    await download.saveAs(absoluteFilePath);
    ensureDir(SYSTEM_DOWNLOAD_DIR);
    fs.copyFileSync(absoluteFilePath, systemFilePath);
    console.log('Download completed');
    console.log('File saved');
    return {
      fileName: filename,
      absoluteFilePath,
      relativePdfPath: `downloads/${filename}`
    };
  }

  // Fallback: some portals open PDF inline in a new tab instead of browser download event.
  const popup = await popupPromise;
  let pdfUrl = '';

  if (popup) {
    await popup.waitForLoadState('domcontentloaded', { timeout: DEFAULT_TIMEOUT }).catch(() => {});
    pdfUrl = popup.url();
  } else {
    await page.waitForLoadState('domcontentloaded', { timeout: DEFAULT_TIMEOUT }).catch(() => {});
    pdfUrl = page.url();
  }

  if (!pdfUrl) {
    throw new Error('Download failed: no file URL found');
  }

  try {
    const response = await page.request.get(pdfUrl, { timeout: DOWNLOAD_TIMEOUT });
    if (!response.ok()) {
      throw new Error(`Download failed: unable to fetch file (${response.status()})`);
    }
    const body = await response.body();
    fs.writeFileSync(absoluteFilePath, body);
  } catch (error) {
    // Fallback for certificate chains that browser accepts but API request context rejects.
    if (/certificate|unable to verify the first certificate/i.test(error.message)) {
      await downloadViaNodeRequest(pdfUrl, absoluteFilePath);
    } else {
      throw error;
    }
  }

  ensureDir(SYSTEM_DOWNLOAD_DIR);
  fs.copyFileSync(absoluteFilePath, systemFilePath);
  console.log('Download completed');
  console.log('File saved');

  return {
    fileName: filename,
    absoluteFilePath,
    relativePdfPath: `downloads/${filename}`
  };
};

const autoReadAndSubmitOtp = async (page) => {
  const otpInput = await findVisibleLocatorFromList(page, selectors.otpInputLocators);
  if (!otpInput) {
    throw new Error('OTP input field not found on page');
  }

  const otp = await waitForOTP();
  await otpInput.click({ force: true }).catch(() => {});
  await otpInput.fill('');
  await otpInput.fill(otp);

  const otpSubmit = await findVisibleLocatorFromList(page, selectors.otpSubmitLocators);
  if (!otpSubmit) {
    throw new Error('OTP submit button not found on page');
  }

  await otpSubmit.click();
  console.log('OTP entered successfully');

  return otp;
};

const searchCompany = async (company, externalPage = null) => {
  const targetUrl = process.env.TARGET_URL;

  if (!targetUrl) {
    throw new Error('TARGET_URL is not configured in .env');
  }

  if (!company || !company.companyName) {
    throw new Error('companyName is required for automation');
  }

  ensureScreenshotDir();

  const page = externalPage;

  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: DEFAULT_TIMEOUT });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'homepage.png'), fullPage: true });

    const currentUrl = page.url();
    let searchInput;

    if (/ecmpcb\.in/i.test(currentUrl) || /ecmpcb\.in/i.test(targetUrl)) {
      const filledValue = await setEcmpcbNameInputDirect(page, company.companyName);
      console.log(`ECMPCB field filled with: ${filledValue}`);
      searchInput = await findEcmpcbNameInput(page);
      if (!searchInput) {
        throw new Error('Search box not found. Update selectors for this website.');
      }

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'search-result.png'), fullPage: true });
      return {
        success: false,
        manualActionRequired: true,
        message: 'Company name filled. Enter CAPTCHA and click Go manually.'
      };
    } else {
      searchInput = await findSearchInput(page);
      await searchInput.waitFor({ state: 'visible', timeout: DEFAULT_TIMEOUT });
      await setInputValueReliably(page, searchInput, company.companyName);
    }

    await searchInput.press('Enter');
    await page.waitForTimeout(1500);

    const searchButton = await findSearchButton(page);
    if (searchButton) {
      await searchButton.click().catch(() => {});
    }

    await page.waitForLoadState('domcontentloaded', { timeout: DEFAULT_TIMEOUT }).catch(() => {});
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'search-result.png'), fullPage: true });

    let found = await clickMatchingResult(page, company.companyName);

    if (!found) {
      const waitUntil = Date.now() + MANUAL_WAIT_TIMEOUT;

      while (Date.now() < waitUntil) {
        found = await clickMatchingResult(page, company.companyName);
        if (found) break;
        await page.waitForTimeout(2000);
      }
    }

    if (!found) {
      if (await hasCaptchaInput(page)) {
        throw new Error('CAPTCHA_OR_MANUAL_ACTION_REQUIRED');
      }
      throw new Error('Company not found');
    }

    await page.waitForLoadState('domcontentloaded', { timeout: DEFAULT_TIMEOUT });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'company-page.png'), fullPage: true });

    console.log('Company found successfully');
    return { success: true, message: 'Company found successfully' };
  } catch (error) {
    if (/timeout/i.test(error.message)) {
      throw new Error('CAPTCHA_OR_MANUAL_ACTION_REQUIRED');
    }

    if (/Search box not found/i.test(error.message)) {
      throw error;
    }

    if (/Company not found/i.test(error.message)) {
      throw error;
    }

    if (/CAPTCHA_OR_MANUAL_ACTION_REQUIRED/i.test(error.message)) {
      throw error;
    }

    throw new Error(`Website automation failed: ${error.message}`);
  }
};

const startCompanyAutomation = async (company) => {
  const companyKey = company._id ? company._id.toString() : `company-${Date.now()}`;
  await closeSession(companyKey);
  const session = await createSession(companyKey);

  try {
    return await searchCompany(company, session.page);
  } catch (error) {
    if (/CAPTCHA_OR_MANUAL_ACTION_REQUIRED/i.test(error.message)) {
      return {
        success: false,
        manualActionRequired: true,
        message: 'Manual action required: enter CAPTCHA/click Go and wait. Browser kept open.'
      };
    }
    if (shouldAutoCloseOnError()) {
      await closeSession(companyKey);
    }
    throw error;
  }
};

const continueWithOtp = async (companyId, manualOtp = '', companyName = 'company') => {
  const session = getSession(companyId);
  if (!session?.page) {
    throw new Error('No active browser session found. Start process again.');
  }

  const page = session.page;

  const otpInput = await findVisibleLocatorFromList(page, selectors.otpInputLocators);
  if (!otpInput) {
    throw new Error('OTP input field not found on page');
  }

  const otp = String(manualOtp || '').trim() || (await waitForOTP());

  await otpInput.click({ force: true }).catch(() => {});
  await otpInput.fill('');
  await otpInput.fill(otp);

  const otpSubmit = await findVisibleLocatorFromList(page, selectors.otpSubmitLocators);
  if (!otpSubmit) {
    throw new Error('OTP submit button not found on page');
  }

  await otpSubmit.click();
  console.log('OTP entered successfully');
  console.log('OTP verified');

  await page.waitForLoadState('domcontentloaded', { timeout: DEFAULT_TIMEOUT }).catch(() => {});
  await page.waitForTimeout(2000);

  const downloadInfo = await downloadCompanyDocument(page, companyName);

  return {
    success: true,
    message: 'Verification completed and document downloaded',
    otp,
    pdfPath: downloadInfo.relativePdfPath,
    downloadDate: new Date()
  };
};

module.exports = {
  searchCompany,
  startCompanyAutomation,
  autoReadAndSubmitOtp,
  continueWithOtp,
  closeSession
};
