// scripts/e2e-close-for-staff.mjs — ทดสอบ "ฝ่ายสต็อกปิดการขายแทนฝ่ายขาย" ตั้งแต่กดจนขึ้นป้ายชื่อเซลล์
//
// ที่มา (29 ก.ย. 2569): ผู้ใช้ปิดการขายให้เซลล์แล้ว แต่ป้ายชื่อเซลล์ในรายการสต็อกไม่ขึ้น
// ต้องพิสูจน์ว่าเส้นทางนี้ทำงานครบจริงไหม ไม่ใช่เดา
//
// รัน: npm run build แล้ว SB_URL=<supabase url> node scripts/e2e-close-for-staff.mjs
// ⚠️ ไม่แตะฐานข้อมูลจริง — ดัก request ไป Supabase แล้วตอบข้อมูลปลอมเอง
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
await new Promise(r => srv.listen(4322, r));

// รถ 1 คัน ยังไม่มีดีล (เหมือนเคสจริง)
const SN = "05030DV3678";
const forklifts = [{
  id: SN, SN, brand: "HELI", model: "CPCD30-GC6LI-S", status: "พร้อมขาย",
  capacity: "3", height: "4.00 ม.", fuel: "ดีเซล", cost_price: 400000, stock_price: 0,
  created_at: "2026-07-27", received_date: "2026-07-27", vehicle_category: "Forklift",
  pi_no: "PI075", custom_fields: {},
}];
const sales = [];
const inserted = [];

const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext();
const SB_HOST = new URL(process.env.SB_URL || "https://x.supabase.co").host;
const json = (route, body) => route.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": "0-0/*" }, body: JSON.stringify(body) });
await ctx.route("**://" + SB_HOST + "/**", async route => {
  const u = route.request().url();
  const method = route.request().method();
  if (u.includes("/auth/v1/")) return json(route, { id: "t", email: "t@t.com", aud: "authenticated", role: "authenticated", user: { id: "t", email: "t@t.com" } });
  if (u.includes("/rest/v1/sales") && method === "POST") {
    // บันทึกดีลใหม่ที่แอปยิงมา — นี่คือจุดที่ต้องเกิดจริง
    try { inserted.push(JSON.parse(route.request().postData() || "{}")); } catch { /* อ่านไม่ออกก็ข้าม */ }
    return json(route, []);
  }
  if (u.includes("/rest/v1/forklifts")) return json(route, forklifts);
  if (u.includes("/rest/v1/sales")) return json(route, sales);
  return json(route, []);
});

const page = await ctx.newPage();
const errs = [];
page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
await page.goto("http://localhost:4322" + BASE + "/stock/login/", { waitUntil: "domcontentloaded" });
await page.evaluate(sbUrl => {
  localStorage.setItem("stock_user", JSON.stringify({ name: "วรลักษณ์ ทดสอบ", email: "t@t.com" }));
  try {
    const ref = new URL(sbUrl).hostname.split(".")[0];
    const exp = Math.floor(Date.now() / 1000) + 86400;
    const b64 = o => btoa(JSON.stringify(o)).replace(/=+$/, "");
    localStorage.setItem("sb-" + ref + "-auth-token", JSON.stringify({
      access_token: b64({ alg: "HS256" }) + "." + b64({ sub: "t", email: "t@t.com", exp, role: "authenticated" }) + ".x",
      refresh_token: "r", expires_at: exp, expires_in: 86400, token_type: "bearer",
      user: { id: "t", email: "t@t.com", aud: "authenticated", role: "authenticated" },
    }));
  } catch { /* ข้าม */ }
}, process.env.SB_URL || "https://x.supabase.co");

await page.goto("http://localhost:4322" + BASE + "/stock/main/", { waitUntil: "load" });
await page.waitForTimeout(3000);

const tagCount = async () => page.evaluate(() =>
  [...document.querySelectorAll("span[title]")].filter(e => (e.getAttribute("title") || "").includes("เซลล์เจ้าของงาน")).length);

console.log("ก่อนปิดการขาย — ป้ายชื่อเซลล์ในรายการ:", await tagCount());

// เปิดการ์ดรถ → แก้ไข → ปิดการขายแทนฝ่ายขาย
await page.getByText(SN, { exact: false }).first().click();
await page.waitForTimeout(600);
const editBtn = page.getByRole("button", { name: /แก้ไข/ }).first();
if (await editBtn.count()) { await editBtn.click(); await page.waitForTimeout(500); }
const openClose = page.getByRole("button", { name: "ปิดการขายแทนฝ่ายขาย" }).first();
if (!(await openClose.count())) { console.log("✗ ไม่เจอปุ่ม 'ปิดการขายแทนฝ่ายขาย'"); }
else {
  await openClose.click(); await page.waitForTimeout(400);
  await page.locator("#close-staff-opts").evaluate(() => {});   // กันกรณี datalist ยังไม่ mount
  const fill = async (label, value) => {
    const box = page.locator("label", { hasText: label }).first().locator("input, select").first();
    await box.fill(value).catch(async () => { await box.selectOption(value).catch(() => {}); });
  };
  await fill("เซลล์เจ้าของงาน", "ไหมแก้ว");
  await fill("ลูกค้า", "บริษัทลวดเชื่อมไทยฮันซ่า");
  await fill("ราคาขาย", "540000");
  await fill("วันส่งมอบ", "2026-08-27");
  await page.getByRole("button", { name: "บันทึกปิดการขาย" }).first().click();
  await page.waitForTimeout(1500);
}

console.log("ยิงเข้าฐานข้อมูล (POST /sales):", inserted.length, "ครั้ง",
  inserted[0] ? "· เซลล์=" + (inserted[0].sales_staff ?? "—") + " · รถ=" + (inserted[0].forklift_id ?? "—") : "");

// ปิดการ์ดแล้วดูรายการ
await page.keyboard.press("Escape").catch(() => {});
await page.waitForTimeout(800);
const after = await tagCount();
console.log("หลังปิดการขาย — ป้ายชื่อเซลล์ในรายการ:", after, after > 0 ? "✓ ขึ้นแล้ว" : "✗ ไม่ขึ้น");
if (errs.length) console.log("error:", [...new Set(errs)].slice(0, 3).join(" | "));

await browser.close(); srv.close();
process.exitCode = after > 0 && inserted.length > 0 ? 0 : 1;
