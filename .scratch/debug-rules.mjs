import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
await page.waitForTimeout(500);

const info = await page.evaluate(() => {
  function rect(sel) {
    const el = document.querySelector(sel);
    if (!el) return "NOT FOUND: " + sel;
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height, top: r.top, left: r.left };
  }
  return {
    rulesSection: rect('section[aria-label*="1 contra 1"]'),
    rulesDiv: rect('section[aria-label*="1 contra 1"] > div'),
    reglasImgWrapper: rect('section[aria-label*="1 contra 1"] > div > div'),
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
