import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
page.on("pageerror", (err) => errors.push(String(err)));

await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.screenshot({ path: "screenshots/01-new-layout.png", fullPage: true });

await page.setViewportSize({ width: 1024, height: 900 });
await page.waitForTimeout(400);
await page.screenshot({ path: "screenshots/02-tablet.png", fullPage: true });

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
await page.screenshot({ path: "screenshots/03-mobile.png", fullPage: true });

await page.setViewportSize({ width: 1600, height: 1000 });
await page.waitForTimeout(300);

// switch to login via the new link (no tabs)
await page.click('button:has-text("Iniciar sesión")');
await page.waitForTimeout(300);
await page.screenshot({ path: "screenshots/04-login-view.png", fullPage: true });

// switch back
await page.click('button:has-text("Crear cuenta")');
await page.waitForTimeout(300);
await page.screenshot({ path: "screenshots/05-back-to-register.png", fullPage: true });

// bakery gate: not logged in
await page.goto("http://localhost:3000/bakery", { waitUntil: "networkidle" });
await page.waitForTimeout(300);
await page.screenshot({ path: "screenshots/06-bakery-login-gate.png", fullPage: true });

// login as admin via bakery gate
await page.fill("#bakery-identifier", "AdminMasoku");
await page.fill("#bakery-password", "admin1234");
await page.click('button[type="submit"]');
await page.waitForTimeout(500);
await page.screenshot({ path: "screenshots/07-bakery-dashboard-after-login.png", fullPage: true });

console.log("CONSOLE_ERRORS:", JSON.stringify(errors));
console.log("URL:", page.url());
await browser.close();
