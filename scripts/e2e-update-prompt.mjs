// scripts/e2e-update-prompt.mjs — ด่าน "มีเวอร์ชันใหม่แล้วต้องบอกผู้ใช้"
//
// ที่มา (21 ต.ค. 2569): แก้บั๊ก OCR แล้ว deploy แล้ว แต่ผู้ใช้ยังเจออาการเดิม
// เพราะเบราว์เซอร์ใช้ไฟล์เก่าที่แคชไว้ (ป้ายเวอร์ชันในจอยังเป็นของ build ก่อนหน้า)
// เสียเวลาไล่กันหลายรอบทั้งที่โค้ดใหม่ขึ้นเว็บไปแล้ว
//
// ด่านนี้เสิร์ฟ version.txt ที่ "ใหม่กว่าของในหน้า" แล้วตรวจว่าขึ้นปุ่มอัปเดตให้ผู้ใช้ไหม
//
// รัน: npm run build แล้ว SB_URL=<supabase url> node scripts/e2e-update-prompt.mjs
// ไม่แตะฐานข้อมูลจริง
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const BASE = "/sales-os-app.github.io";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".txt": "text/plain", ".ico": "image/x-icon", ".png": "image/png", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
const NEWER = "ffffffff · 31/12 23:59";     // เวอร์ชันปลอมที่ใหม่กว่าเสมอ

const srv = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.startsWith(BASE)) p = p.slice(BASE.length);
  if (p === "/version.txt") {                       // แกล้งว่ามีตัวใหม่บนเซิร์ฟเวอร์
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(NEWER + "\n");
    return;
  }
  let f = join("out", p);
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
  if (!existsSync(f) && existsSync(f + ".html")) f += ".html";
  if (!existsSync(f)) { res.writeHead(404); res.end("nope"); return; }
  res.writeHead(200, { "Content-Type": TYPES[extname(f)] ?? "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise(r => srv.listen(4332, r));

const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext();
const SB = new URL(process.env.SB_URL || "https://x.supabase.co").host;
await ctx.route("**://" + SB + "/**", r => r.fulfill({
  status: 200, contentType: "application/json", headers: { "content-range": "0-0/*" }, body: "[]",
}));

const page = await ctx.newPage();
await page.goto("http://localhost:4332" + BASE + "/stock/login/", { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.setItem("stock_user", JSON.stringify({ name: "ทดสอบ", email: "t@t.com" })));
await page.goto("http://localhost:4332" + BASE + "/stock/main/", { waitUntil: "load" });

// ตัวตรวจยิงครั้งแรกที่ 8 วินาที — รอให้เกินนั้น
let shown = 0;
for (let i = 0; i < 16; i++) {
  await page.waitForTimeout(1000);
  shown = await page.getByText("มีเวอร์ชันใหม่แล้ว", { exact: false }).count().catch(() => 0);
  if (shown > 0) break;
}
const btn = await page.getByRole("button", { name: /^อัปเดต$/ }).count().catch(() => 0);
console.log("1) ขึ้นแถบบอกว่ามีเวอร์ชันใหม่:", shown > 0 ? "✓ ขึ้นแล้ว" : "✗ ไม่ขึ้น — ผู้ใช้จะใช้ของเก่าต่อโดยไม่รู้ตัว");
console.log("2) มีปุ่มอัปเดตให้กด:", btn > 0 ? "✓ มี" : "✗ ไม่มี");

// กดแล้วต้องโหลดหน้าใหม่พร้อมตัวกันแคช
let moved = false;
if (btn > 0) {
  await page.getByRole("button", { name: /^อัปเดต$/ }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  moved = /[?&]v=\d+/.test(page.url());
  console.log("3) กดแล้วโหลดใหม่พร้อมกันแคช:", moved ? "✓ ใช่ (" + page.url().split("?")[1] + ")" : "✗ ไม่");
}

await browser.close(); srv.close();
process.exitCode = (shown > 0 && btn > 0 && moved) ? 0 : 1;
