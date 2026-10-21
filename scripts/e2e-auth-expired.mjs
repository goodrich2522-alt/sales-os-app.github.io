// scripts/e2e-auth-expired.mjs — ด่าน "เซสชันหมดอายุ ต้องฟ้อง ไม่ใช่ขึ้น 0 เงียบ ๆ"
//
// ที่มา (20 ต.ค. 2569): ผู้ใช้เปิดหน้าสต็อกแล้วเห็นข้อมูลหายหมด ทุกช่องเป็น 0
// ที่จริงข้อมูลอยู่ครบ 1,172 คัน แต่เซสชันฐานข้อมูลหมดอายุ
// RLS ตอบ 200 พร้อมผลลัพธ์ว่าง ซึ่งไม่ใช่ error เลยไม่มีอะไรฟ้อง
// ชื่อผู้ใช้ยังค้างบนหัวจอ ยิ่งทำให้เข้าใจผิดว่าข้อมูลถูกลบทิ้ง
//
// ด่านนี้เปิดหน้าสต็อกแบบ "ล็อกอินในแอปแล้ว แต่ไม่มีเซสชันฐานข้อมูล" แล้วตรวจว่าขึ้นคำเตือนไหม
//
// รัน: npm run build แล้ว SB_URL=<supabase url> node scripts/e2e-auth-expired.mjs
// ไม่แตะฐานข้อมูลจริง — ดัก request ไป Supabase แล้วตอบเอง
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const BASE = "/sales-os-app.github.io";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".ico": "image/x-icon", ".png": "image/png", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".txt": "text/plain" };
const srv = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.startsWith(BASE)) p = p.slice(BASE.length);
  let f = join("out", p);
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
  if (!existsSync(f) && existsSync(f + ".html")) f += ".html";
  if (!existsSync(f)) { res.writeHead(404); res.end("nope"); return; }
  res.writeHead(200, { "Content-Type": TYPES[extname(f)] ?? "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise(r => srv.listen(4330, r));

const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext();
const SB_HOST = new URL(process.env.SB_URL || "https://x.supabase.co").host;
// เลียนแบบของจริงตอนเซสชันหมดอายุ: ทุกตารางตอบ 200 แต่ว่างเปล่า ไม่มี error สักตัว
await ctx.route("**://" + SB_HOST + "/**", route => route.fulfill({
  status: 200, contentType: "application/json",
  headers: { "content-range": "0-0/*" }, body: "[]",
}));

const page = await ctx.newPage();
await page.goto("http://localhost:4330" + BASE + "/stock/login/", { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  localStorage.setItem("stock_user", JSON.stringify({ name: "วรลักษณ์ ทดสอบ", email: "t@t.com" }));
  Object.keys(localStorage).filter(k => k.startsWith("sb-")).forEach(k => localStorage.removeItem(k));
});
await page.goto("http://localhost:4330" + BASE + "/stock/main/", { waitUntil: "load" });
await page.waitForTimeout(6000);

const warned = await page.getByText("ยังโหลดข้อมูลไม่ได้", { exact: false }).count().catch(() => 0);
const reassured = await page.getByText("ข้อมูลไม่ได้หาย", { exact: false }).count().catch(() => 0);
const btn = await page.getByRole("button", { name: /เข้าสู่ระบบใหม่/ }).count().catch(() => 0);

console.log("1) ขึ้นคำเตือนว่าโหลดข้อมูลไม่ได้:", warned > 0 ? "✓ ขึ้นแล้ว" : "✗ ไม่ขึ้น — ผู้ใช้เข้าใจว่าข้อมูลหายทั้งระบบ");
console.log("2) บอกว่าข้อมูลไม่ได้หาย:", reassured > 0 ? "✓ บอกแล้ว" : "✗ ไม่บอก");
console.log("3) มีปุ่มเข้าสู่ระบบใหม่:", btn > 0 ? "✓ มี" : "✗ ไม่มี");

await browser.close(); srv.close();
process.exitCode = (warned > 0 && reassured > 0 && btn > 0) ? 0 : 1;
