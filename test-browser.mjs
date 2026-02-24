import { chromium } from 'playwright';

async function test() {
  console.log('Starting browser test...');

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Collect console errors
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    page.on('pageerror', err => {
      errors.push(err.message);
    });

    console.log('Loading page...');
    await page.goto('http://localhost:5173/', { timeout: 30000 });

    // Wait for content
    await page.waitForTimeout(3000);

    // Check for the header
    const title = await page.title();
    console.log('Page title:', title);

    // Check if CashBlocks header is visible
    const headerText = await page.locator('h1').first().textContent().catch(() => null);
    console.log('Header text:', headerText);

    // Check if error boundary triggered
    const errorBoundary = await page.locator('text=CashBlocks Error').count();

    if (errorBoundary > 0) {
      const errorText = await page.locator('pre').first().textContent();
      console.log('\n❌ ERROR BOUNDARY TRIGGERED:');
      console.log(errorText);
      process.exit(1);
    }

    if (errors.length > 0) {
      console.log('\n⚠️ Console errors:');
      errors.forEach(e => console.log('  -', e));
    }

    // Check for Blockly canvas
    const blocklyWorkspace = await page.locator('.blocklySvg').count();
    console.log('Blockly workspace found:', blocklyWorkspace > 0);

    if (headerText === 'CashBlocks' && blocklyWorkspace > 0) {
      console.log('\n✅ Page loaded successfully!');
      process.exit(0);
    } else {
      console.log('\n❌ Page did not load correctly');
      // Take screenshot for debugging
      await page.screenshot({ path: 'test-screenshot.png' });
      console.log('Screenshot saved to test-screenshot.png');
      process.exit(1);
    }

  } catch (err) {
    console.error('Test failed:', err.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

test();
