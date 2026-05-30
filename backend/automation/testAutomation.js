const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createSession, closeSession } = require('./browser');
const { searchCompany } = require('./companyAutomation');

const sampleCompany = {
  companyName: 'ARTUR SCHADE STEEL PRODUCTS INDIA PVT LTD',
  phoneNumber: '9763718253',
  email: 'm.mohite@schade-india.com'
};

const run = async () => {
  const sessionKey = `test-${Date.now()}`;

  try {
    // Step 1: Launch browser session with visible Chromium.
    const session = await createSession(sessionKey);

    // Step 2: Execute company search and page open flow.
    const result = await searchCompany(sampleCompany, session.page);
    console.log(result.message);
  } catch (error) {
    console.error('Automation test failed:', error.message);
  } finally {
    // Step 3: Cleanup browser session after test run.
    await closeSession(sessionKey);
  }
};

run();
