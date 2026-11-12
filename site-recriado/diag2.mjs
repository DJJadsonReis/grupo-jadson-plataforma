import { chromium } from "playwright-core";
import { existsSync } from "node:fs";
const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe","C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find(c=>existsSync(c));
const b = await chromium.launch({ executablePath: chrome, headless: true });
for (const [w,h] of [[390,844],[1440,900]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: "no-preference" });
  const p = await ctx.newPage();
  await p.goto("http://localhost:4600/", { waitUntil: "load" });
  await p.waitForTimeout(500);
  console.log(w, await p.evaluate(() => document.documentElement.scrollWidth - innerWidth));
  await ctx.close();
}
await b.close();
