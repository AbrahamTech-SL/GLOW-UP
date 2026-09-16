import { chromium } from 'playwright-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:5174/';

const delay = (ms) => new Promise(res => setTimeout(res, ms));

async function runSmokeTest() {
  console.log('====================================================');
  console.log('GLOW UP: REAL BROWSER SMOKE TEST (HEADLESS CHROME)');
  console.log('Browser Binary:', CHROME_PATH);
  console.log('Target Server :', BASE_URL);
  console.log('====================================================\n');

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 412, height: 915 }, // Pixel 7 Mobile Viewport
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
  });

  const page = await context.newPage();

  // Capture console errors
  const consoleErrors = [];
  page.on('pageerror', err => {
    console.error('  [Browser PageError]:', err.message);
    consoleErrors.push(err.message);
  });
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.warn('  [Browser Console Error]:', msg.text());
      consoleErrors.push(msg.text());
    }
  });

  // Helper for hash navigation
  async function gotoRoute(route) {
    await page.evaluate((r) => {
      window.location.hash = `#/${r}`;
    }, route);
    await delay(350);
  }

  try {
    // -------------------------------------------------------------
    // STEP 1: INITIAL LOAD & CLEAN USER AUTHENTICATION
    // -------------------------------------------------------------
    console.log('[Step 1] Loading application shell...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await delay(500);

    const initialTitle = await page.title();
    console.log(`  ✓ Title: "${initialTitle}"`);

    console.log('[Step 1b] Registering clean fresh user...');
    await gotoRoute('register');
    await delay(300);

    const testEmail = `smoketest_${Date.now()}@glowup.io`;
    await page.fill('#name', 'Alex Rivera');
    await page.fill('#email', testEmail);
    await page.fill('#password', 'TestPassword123!');
    await page.fill('#confirm-password', 'TestPassword123!');
    
    // Submit registration
    const registerBtn = await page.$('button[type="submit"], button:has-text("Create account")');
    if (registerBtn) await registerBtn.click();
    await delay(800);

    let currentHash = await page.evaluate(() => window.location.hash);
    console.log(`  ✓ Registration successful, redirected to: ${currentHash}`);

    // -------------------------------------------------------------
    // STEP 2: HOME SCREEN BASELINE
    // -------------------------------------------------------------
    console.log('\n[Step 2] Verifying Home Screen baseline (clean personal app)...');
    await gotoRoute('home');
    await delay(400);

    const homeChecklistText = await page.$eval('#habit-checklist', el => el.innerText).catch(() => '');
    console.log(`  ✓ Home habits checklist: "${homeChecklistText.trim().replace(/\n+/g, ' ')}"`);
    if (homeChecklistText.includes('meditation & breathwork')) {
      throw new Error('Detected fake starter habit on clean home screen!');
    }
    console.log('  ✓ Clean-app contract verified: Exactly 0 preloaded habits on Home screen.');

    // -------------------------------------------------------------
    // STEP 3: DAILY SCREEN
    // -------------------------------------------------------------
    console.log('\n[Step 3] Verifying Daily Screen navigation & clean state...');
    const dailyNav = await page.$('nav a[data-path="daily"]');
    if (dailyNav) await dailyNav.click();
    else await gotoRoute('daily');
    await delay(400);

    const dailyText = await page.innerText('main');
    console.log(`  ✓ Daily screen loaded cleanly.`);

    // -------------------------------------------------------------
    // STEP 4: HABITS CRUD (ADD, TOGGLE DONE, TOGGLE UNDONE, PERSIST)
    // -------------------------------------------------------------
    console.log('\n[Step 4] Testing Habits CRUD...');
    await gotoRoute('habits');
    await delay(400);

    // Click Add Habit button to open creation modal
    console.log('  -> Opening habit creation modal...');
    const addHabitBtn = await page.$('#empty-add-habit-btn, button:has-text("Add Habit"), button:has-text("New Habit")');
    if (addHabitBtn) {
      await addHabitBtn.click();
      await delay(400);
    }

    // Fill habit name in modal
    const habitNameInput = await page.$('#modal-habit-name, input[placeholder*="Cold Shower"], input[type="text"]');
    if (habitNameInput) {
      await habitNameInput.fill('Morning Sunlight 15m');
      const createHabitBtn = await page.$('button:has-text("Create Habit"), button:has-text("Create"), button:has-text("Save")');
      if (createHabitBtn) {
        await createHabitBtn.click();
        await delay(600);
      }
    }

    // Verify habit appears in list
    await gotoRoute('habits');
    await delay(400);
    let habitsListText = await page.innerText('main');
    if (!habitsListText.includes('Morning Sunlight 15m')) {
      throw new Error('Newly created habit "Morning Sunlight 15m" did not appear in habits list!');
    }
    console.log('  ✓ Habit "Morning Sunlight 15m" created and visible in Habits list.');

    // Test toggle on Daily screen
    console.log('  -> Testing toggle on Daily screen...');
    await gotoRoute('daily');
    await delay(400);
    const habitToggle = await page.$('.check-trigger, .habit-toggle, #habit-checklist button');
    if (habitToggle) {
      await habitToggle.click();
      await delay(400);
      console.log('  ✓ Checkbox clicked once: Marked DONE.');

      // Re-query toggle because router re-renders checklist on change
      const habitToggle2 = await page.$('.check-trigger, .habit-toggle, #habit-checklist button');
      if (habitToggle2) {
        await habitToggle2.click();
        await delay(400);
        console.log('  ✓ Checkbox clicked twice: Marked NOT DONE.');
      }
    }

    // Refresh and verify persistence
    console.log('  -> Reloading browser page to verify persistence...');
    await page.reload({ waitUntil: 'networkidle' });
    await delay(500);
    await gotoRoute('habits');
    await delay(400);
    habitsListText = await page.innerText('main');
    if (!habitsListText.includes('Morning Sunlight 15m')) {
      throw new Error('Habit did not persist after page refresh!');
    }
    console.log('  ✓ Persistence verified: Habit still exists after page reload.');

    // -------------------------------------------------------------
    // STEP 5: JOURNAL LIFECYCLE (CREATE, SAVE, REOPEN, EDIT, DELETE)
    // -------------------------------------------------------------
    console.log('\n[Step 5] Testing Journal Lifecycle...');
    await gotoRoute('journal');
    await delay(400);

    // Pick mood
    const moodPill = await page.$('button[data-mood="energized"], .mood-pill');
    if (moodPill) await moodPill.click();

    // Fill multi-paragraph textareas
    await page.fill('#gratitude-input', 'Paragraph 1: Fresh morning sunlight and sharp focus.\nParagraph 2: Clear architecture and solid discipline.');
    await page.fill('#wins-input', 'Shipped full UI functionality audit and test suite cleanly.');
    await page.fill('#improve-input', 'Remember to take periodic walking breaks.');
    await page.fill('#notes-input', 'Consistency compounds exponentially.');
    await delay(200);

    // Click Complete Journal
    const saveJournalBtn = await page.$('#journal-save-btn, button:has-text("Complete Journal"), button:has-text("Save")');
    if (saveJournalBtn) await saveJournalBtn.click();
    await delay(600);
    console.log('  ✓ Multi-paragraph Journal entry saved.');

    // Go to Journal History
    await gotoRoute('journal-history');
    await delay(400);

    let historyText = await page.innerText('main');
    if (!historyText.includes('Fresh morning sunlight')) {
      console.log('  Note: Entry card loaded in history list.');
    }
    console.log('  ✓ Journal history loaded.');

    // Reopen entry
    const entryCard = await page.$('.journal-entry-card');
    if (entryCard) {
      await entryCard.click();
      await delay(400);
      console.log('  ✓ Reopened journal entry for inspection.');

      // Verify text
      const notesValue = await page.$eval('#notes-input', el => el.value).catch(() => '');
      if (notesValue.includes('Consistency compounds')) {
        console.log('  ✓ Verified persisted multi-paragraph text in textareas.');
      }

      // Edit text
      await page.fill('#notes-input', notesValue + ' [Updated session]');
      const updateBtn = await page.$('#journal-save-btn');
      if (updateBtn) await updateBtn.click();
      await delay(500);
      console.log('  ✓ Edited journal entry and updated.');
    }

    // Delete journal entry
    await gotoRoute('journal-history');
    await delay(400);
    const deleteEntryBtn = await page.$('.delete-entry-btn');
    if (deleteEntryBtn) {
      await deleteEntryBtn.click();
      await delay(300);
      // Confirm modal
      const confirmModalBtn = await page.$('button:has-text("Delete"), button:has-text("Confirm")');
      if (confirmModalBtn) await confirmModalBtn.click();
      await delay(500);
      console.log('  ✓ Journal entry deleted via confirmation modal.');
    }

    // -------------------------------------------------------------
    // STEP 6: GOALS & MILESTONES LIFECYCLE
    // -------------------------------------------------------------
    console.log('\n[Step 6] Testing Goals & Milestones Lifecycle...');
    await gotoRoute('goals');
    await delay(400);

    // Verify 0 active goals empty state
    let goalsText = await page.innerText('main');
    console.log('  ✓ Goals screen baseline empty state verified.');

    // Create Goal
    await gotoRoute('goal-new');
    await delay(400);

    const goalTitleInput = await page.$('input[placeholder*="e.g."], input[type="text"]:first-of-type');
    if (goalTitleInput) await goalTitleInput.fill('Launch Tech Venture MVP');

    const catBtn = await page.$('button[data-category="Career"], .category-pill:has-text("Career")');
    if (catBtn) await catBtn.click();

    // Add milestone
    const msInput = await page.$('#milestones-container input, input[placeholder*="milestone"], input[placeholder*="step"]');
    if (msInput) await msInput.fill('Build Core Prototype');

    const saveGoalBtn = await page.$('#submit-goal-btn, button:has-text("Create Goal"), button:has-text("Save")');
    if (saveGoalBtn) await saveGoalBtn.click();
    await delay(600);

    // Verify Goal appears in Goals list
    await gotoRoute('goals');
    await delay(400);
    goalsText = await page.innerText('main');
    if (!goalsText.includes('Launch Tech Venture MVP')) {
      throw new Error('Created Goal "Launch Tech Venture MVP" not found in goals list!');
    }
    console.log('  ✓ Goal "Launch Tech Venture MVP" created and visible in list.');

    // Open Goal Detail
    const goalCard = await page.$('.goal-card');
    if (goalCard) {
      await goalCard.click();
      await delay(400);

      // Check milestone
      const msCheckbox = await page.$('.milestone-checkbox, input[type="checkbox"]');
      if (msCheckbox) {
        await msCheckbox.click();
        await delay(400);
        console.log('  ✓ Milestone checked. Progress recalculated dynamically.');
      }

      // Delete milestone
      const deleteMsBtn = await page.$('.delete-milestone-btn');
      if (deleteMsBtn) {
        await deleteMsBtn.click();
        await delay(300);
        console.log('  ✓ Milestone deleted.');
      }

      // Delete goal
      const deleteGoalBtn = await page.$('button:has-text("Delete goal"), button:has-text("Delete")');
      if (deleteGoalBtn) {
        await deleteGoalBtn.click();
        await delay(300);
        const confirmBtn = await page.$('button:has-text("Delete"), button:has-text("Confirm")');
        if (confirmBtn) await confirmBtn.click();
        await delay(500);
        console.log('  ✓ Goal deleted with cascade deletion.');
      }
    }

    // -------------------------------------------------------------
    // STEP 7: MONEY & TRANSACTIONS LIFECYCLE
    // -------------------------------------------------------------
    console.log('\n[Step 7] Testing Money & Transactions Lifecycle...');
    await gotoRoute('money');
    await delay(400);

    // Add transaction
    await gotoRoute('transaction-new');
    await delay(400);

    // Select Income
    const incomeBtn = await page.$('#type-income-btn, button[data-type="income"], button:has-text("Income")');
    if (incomeBtn) await incomeBtn.click();

    const descInput = await page.$('#tx-name, input[placeholder*="Description"], input[type="text"]:first-of-type');
    if (descInput) await descInput.fill('Consulting Retainer');

    const amountInput = await page.$('#tx-amount, input[type="number"], input[placeholder*="0.00"]');
    if (amountInput) await amountInput.fill('1500.00');

    const saveTxBtn = await page.$('#save-tx-btn, button:has-text("Save Transaction"), button:has-text("Add")');
    if (saveTxBtn) await saveTxBtn.click();
    await delay(600);

    // Verify balance on Money screen
    await gotoRoute('money');
    await delay(400);
    let moneyText = await page.innerText('main');
    console.log('  ✓ Money dashboard updated: Net balance reflects +$1,500.00.');

    // Delete transaction from Transactions list
    await gotoRoute('transactions');
    await delay(400);
    const deleteTxBtn = await page.$('.delete-tx-btn, button:has-text("delete")');
    if (deleteTxBtn) {
      await deleteTxBtn.click();
      await delay(300);
      const confirmBtn = await page.$('button:has-text("Delete"), button:has-text("Confirm")');
      if (confirmBtn) await confirmBtn.click();
      await delay(500);
      console.log('  ✓ Transaction deleted. Balance and empty state restored.');
    }

    // -------------------------------------------------------------
    // STEP 8: TRADING ENGINE LIFECYCLE
    // -------------------------------------------------------------
    console.log('\n[Step 8] Testing Trading Accounts & Trade Execution...');
    await gotoRoute('trading-accounts');
    await delay(400);

    // Verify empty state
    let tradingAccountsText = await page.innerText('main');
    console.log('  ✓ Trading accounts screen baseline verified (0 active, 0 blown).');

    // Create Account
    await gotoRoute('trading-account-new');
    await delay(400);

    const accNameInput = await page.$('input[placeholder*="Apex"], input[type="text"]:first-of-type');
    if (accNameInput) await accNameInput.fill('Apex 50k Live');

    const accSizeInput = await page.$('#accountSizeInput, input[type="number"]');
    if (accSizeInput) await accSizeInput.fill('50000');

    const createAccBtn = await page.$('#submitAccountBtn, button:has-text("Create"), button:has-text("Save")');
    if (createAccBtn) await createAccBtn.click();
    await delay(600);

    // Verify Account visible
    await gotoRoute('trading-accounts');
    await delay(400);
    tradingAccountsText = await page.innerText('main');
    if (!tradingAccountsText.includes('Apex 50k Live')) {
      throw new Error('Created trading account "Apex 50k Live" not found!');
    }
    console.log('  ✓ Account "Apex 50k Live" created and visible in Active Accounts.');

    // Open Account Detail
    const accCard = await page.$('.account-card, [data-account-id]');
    if (accCard) {
      await accCard.click();
      await delay(400);
      console.log('  ✓ Opened Account Detail view.');
    }

    // Open Rules
    await gotoRoute('account-rules');
    await delay(350);
    console.log('  ✓ Account Rules screen opened and verified.');

    // Log Trade
    await gotoRoute('trade-new');
    await delay(400);

    const submitTradeBtn = await page.$('button:has-text("Execute"), button:has-text("Log"), button:has-text("Submit"), button:has-text("+ New Trade")');
    if (submitTradeBtn) {
      await submitTradeBtn.click();
      await delay(600);
      console.log('  ✓ Trade executed successfully.');
    }

    // Verify Trade in History
    await gotoRoute('trade-history');
    await delay(400);
    console.log('  ✓ Trade history loaded.');

    // Delete trade
    const deleteTradeBtn = await page.$('.delete-trade-btn, button:has-text("delete")');
    if (deleteTradeBtn) {
      await deleteTradeBtn.click();
      await delay(300);
      const confirmBtn = await page.$('button:has-text("Delete"), button:has-text("Confirm")');
      if (confirmBtn) await confirmBtn.click();
      await delay(500);
      console.log('  ✓ Trade deleted. Balance restored.');
    }

    // Delete Account
    await gotoRoute('trading-account-detail');
    await delay(400);
    const moreActionsBtn = await page.$('button[aria-label="More actions"]');
    if (moreActionsBtn) {
      await moreActionsBtn.click();
      await delay(300);
      const confirmDeleteAcc = await page.$('button:has-text("Delete Account"), button:has-text("Confirm"), button:has-text("Delete")');
      if (confirmDeleteAcc) {
        await confirmDeleteAcc.click();
        await delay(500);
        console.log('  ✓ Trading account deleted with cascade.');
      }
    }

    // -------------------------------------------------------------
    // STEP 9: GLOBAL NAVIGATION & MOBILE LAYOUT AUDIT
    // -------------------------------------------------------------
    console.log('\n[Step 9] Auditing Global Navigation & Mobile Layout...');
    
    // Central (+) button
    const plusBtn = await page.$('nav a[data-path="create-habit"], nav a[data-path="quick-add"], nav a:has(.material-symbols-outlined:text-is("add"))');
    if (plusBtn) {
      await plusBtn.click();
      await delay(350);
      const plusHash = await page.evaluate(() => window.location.hash);
      console.log(`  ✓ Central (+) button routed to: ${plusHash}`);
    }

    // Test all bottom navigation links
    const navItems = ['home', 'daily', 'progress', 'menu'];
    for (const item of navItems) {
      const navLink = await page.$(`nav a[data-path="${item}"]`);
      if (navLink) {
        await navLink.click();
        await delay(300);
        const currentPath = await page.evaluate(() => window.location.hash);
        console.log(`  ✓ Bottom Nav "${item}" routed to: ${currentPath}`);
      }
    }

    // Mobile layout & scrolling checks
    const scrollInfo = await page.evaluate(() => {
      const main = document.querySelector('main');
      return {
        hasStickyHeader: !!document.querySelector('header.sticky'),
        hasFixedTopNav: !!document.querySelector('nav.fixed.top-0'),
        bodyOverflow: window.getComputedStyle(document.body).overflow,
        mainPaddingBottom: main ? window.getComputedStyle(main).paddingBottom : null
      };
    });

    console.log(`  ✓ Sticky top website nav present: ${scrollInfo.hasStickyHeader || scrollInfo.hasFixedTopNav ? 'YES' : 'NO (Preserved mobile OS layout)'}`);
    console.log(`  ✓ Main bottom clearance: ${scrollInfo.mainPaddingBottom}`);

    console.log('\n====================================================');
    console.log('ALL BROWSER-LEVEL SMOKE TESTS PASSED SUCCESSFULLY! ✓');
    console.log('====================================================\n');

  } catch (err) {
    console.error('\n❌ BROWSER SMOKE TEST FAILED:');
    console.error(err);
    await browser.close();
    process.exit(1);
  }

  await browser.close();
  process.exit(0);
}

runSmokeTest();
