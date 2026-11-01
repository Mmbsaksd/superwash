const puppeteer = require('../frontend/node_modules/puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const LOCAL_URL = 'http://127.0.0.1:5173';
const EVIDENCE_DIR = path.join(__dirname, '..', 'SUPERWASH_SECOND_STAGE_EVIDENCE', 'payments');

if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function verifyCustomerCodExperience() {
  console.log('========================================================================');
  console.log('SUPERWASH EXPREZ — FINAL QA CLOSEOUT: CUSTOMER COD-ONLY UI VERIFICATION');
  console.log('========================================================================\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    const cust = {
      id: 'cust-demo-1',
      full_name: 'Pooja Sharma',
      phone: '9876543210',
      role: 'customer'
    };
    const custOrder = {
      id: 'ord-cust-001',
      order_number: 'SW-1099',
      customer_id: cust.id,
      user_id: cust.id,
      customer_name: cust.full_name,
      customer_phone: cust.phone,
      pickup_address: '42, Indiranagar 100ft Road, Bengaluru',
      pickup_pincode: '560038',
      pickup_date: '2026-11-05',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      service_id: 'f520c538-65e3-4b64-825e-5fdd3c282e8d',
      service_name: 'Wash & Fold (Normal)',
      order_status: 'ready_for_delivery',
      payment_status: 'pending',
      payment_method: 'cash',
      price_per_kg_paise: 7900,
      min_weight_kg: 1.0,
      measured_weight: 4.0,
      billable_weight: 4.0,
      total_amount_paise: 31600,
      paid_amount_paise: 0,
      created_at: new Date().toISOString()
    };

    await page.goto(`${LOCAL_URL}/`);
    await page.waitForSelector('#root');

    await page.evaluate((c, o) => {
      localStorage.setItem('superwash_auth_profile', JSON.stringify(c));
      localStorage.setItem('superwash_orders', JSON.stringify([o]));
      localStorage.setItem('superwash_settings', JSON.stringify({
        online_payment_enabled: false,
        cod_payment_enabled: true,
        advance_payment_enabled: false,
        upi_id: 'superwash@upi'
      }));
    }, cust, custOrder);

    await page.goto(`${LOCAL_URL}/customer?tab=current`, { waitUntil: 'networkidle2' });
    await delay(1200);

    // Verify Cash on Delivery button is displayed on active order card
    const textBeforeModal = await page.evaluate(() => document.body.innerText);
    const hasCodOrderBtn = textBeforeModal.includes('Cash on Delivery') && textBeforeModal.includes('due at doorstep');
    console.log('1. Active Order Card displays Cash on Delivery button:', hasCodOrderBtn ? 'PASS' : 'FAIL');

    // Click Cash on Delivery button
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find(b => b.innerText.includes('Cash on Delivery'));
      if (btn) btn.click();
    });
    await delay(800);

    // Capture high-resolution screenshot for evidence
    const ssPath = path.join(EVIDENCE_DIR, '08_pay_ui_customer_view.png');
    await page.screenshot({ path: ssPath, fullPage: false });
    console.log('2. Screenshot captured:', ssPath);

    // Inspect modal text
    const modalText = await page.evaluate(() => document.body.innerText);
    const hasCodHeader = modalText.includes('Cash on Delivery (Doorstep Payment)');
    const hasStandardPolicy = modalText.includes('Standard Policy');
    const hasAmountDue = modalText.includes('Amount Due at Delivery:') && modalText.includes('316.00');
    const hasCourierGuidance = modalText.includes('Payment is collected in cash by our verified delivery courier');
    const hasReceiptAssurance = modalText.includes('Our staff will immediately record the payment and provide a digital receipt');
    const hasNoRazorpay = !modalText.includes('Instant Online Payment') && !modalText.includes('Pay ₹');
    const hasNoUtrInput = !modalText.includes('Enter 12-digit UTR') && !modalText.includes('UPI 12-Digit Reference');
    const hasNoSelfConfirm = !modalText.includes('Confirm & Record');

    console.log('3. Modal Header (Doorstep Payment):', hasCodHeader ? 'PASS' : 'FAIL');
    console.log('4. Standard Policy Badge:', hasStandardPolicy ? 'PASS' : 'FAIL');
    console.log('5. Amount Due at Delivery (₹316.00):', hasAmountDue ? 'PASS' : 'FAIL');
    console.log('6. Verified Courier Guidance:', hasCourierGuidance ? 'PASS' : 'FAIL');
    console.log('7. Digital Receipt Assurance:', hasReceiptAssurance ? 'PASS' : 'FAIL');
    console.log('8. Online Gateway Absent (Razorpay disabled):', hasNoRazorpay ? 'PASS' : 'FAIL');
    console.log('9. Manual UPI Input Absent (Customer view):', hasNoUtrInput ? 'PASS' : 'FAIL');
    console.log('10. Customer Self-Confirmation Disabled:', hasNoSelfConfirm ? 'PASS' : 'FAIL');

    const allPassed = hasCodOrderBtn && hasCodHeader && hasStandardPolicy && hasAmountDue &&
                      hasCourierGuidance && hasReceiptAssurance && hasNoRazorpay && hasNoUtrInput && hasNoSelfConfirm;

    console.log('\n------------------------------------------------------------------------');
    console.log('OVERALL CUSTOMER COD-ONLY EXPERIENCE VERIFICATION:', allPassed ? 'PASSED (10/10)' : 'FAILED');
    console.log('------------------------------------------------------------------------\n');

    if (!allPassed) {
      process.exit(1);
    }
  } finally {
    await browser.close();
  }
}

verifyCustomerCodExperience().catch(err => {
  console.error('Error during verification:', err);
  process.exit(1);
});
