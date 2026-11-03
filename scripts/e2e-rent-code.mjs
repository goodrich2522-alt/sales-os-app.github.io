// scripts/e2e-rent-code.mjs — ด่าน "รถเช่าต้องโชว์รหัสคันต่อท้ายสถานะ"
//
// ที่มา (3 พ.ย. 2569 · ผู้ใช้สั่ง): รถที่ตั้งสถานะ "รถเช่า" มีหลายคัน แยกไม่ออกว่าคันไหนคือสัญญาไหน
// บัญชีเรียกรถเช่าด้วยรหัส GR-xx (เห็นในบิลค่าเช่า: "GR-59 ค่าเช่า 6/09/69 - 05/10/69")
// แต่ในแอปมีแค่ป้าย "รถเช่า" เฉย ๆ → ต้องใส่รหัสได้ และโชว์เป็น "รถเช่า · GR-111"
//
// ด่านนี้ป้อนรถเช่า 2 คัน (มีรหัส / ไม่มีรหัส) แล้วตรวจว่า
//   1) รายการสต็อกโชว์รหัสต่อท้ายสถานะ
//   2) การ์ดรถก็โชว์รหัสเหมือนกัน
//   3) คันที่ไม่มีรหัส ต้องโชว์ "รถเช่า" เฉย ๆ ไม่มีขยะต่อท้าย
//   4) มีช่องกรอกรหัสรถเช่าในการ์ด (เฉพาะตอนสถานะเป็นรถเช่า)
//
// รัน: npm run build แล้ว SB_URL=<supabase url> node scripts/e2e-rent-code.mjs
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
await new Promise(r => srv.listen(4339, r));

const CODE = "GR-111";
const SN_WITH = "TESTRENT001";      // รถเช่าที่มีรหัส
const SN_WITHOUT = "TESTRENT002";   // รถเช่าที่ยังไม่ใส่รหัส
const forklifts = [
  { id: SN_WITH, SN: SN_WITH, brand: "HANGCHA", model: "CPCD50-A2XG53", status: "รถเช่า",
    capacity: "5", height: "", fuel: "ดีเซล", cost_price: 0, stock_price: 0,
    created_at: "2026-09-14", received_date: "2026-09-14", vehicle_category: "Forklift",
    pi_no: "HCTH-BFL2026091412", custom_fields: { "รหัสรถเช่า": CODE } },
  { id: SN_WITHOUT, SN: SN_WITHOUT, brand: "HELI", model: "CPCD30-Q22K2", status: "รถเช่า",
    capacity: "3", height: "", fuel: "ดีเซล", cost_price: 0, stock_price: 0,
    created_at: "2026-09-14", received_date: "2026-09-14", vehicle_category: "Forklift",
    pi_no: "", custom_fields: {} },
];

const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext();
const SB_HOST = new URL(process.env.SB_URL || "https://x.supabase.co").host;
const json = (route, body) => route.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": "0-0/*" }, body: JSON.stringify(body) });
await ctx.route("**://" + SB_HOST + "/**", async route => {
  const u = route.request().url();
  if (u.includes("/auth/v1/")) return json(route, { id: "t", email: "t@t.com", aud: "authenticated", role: "authenticated", user: { id: "t", email: "t@t.com" } });
  if (u.includes("/rpc/my_access")) return json(route, { user: { email: "t@t.com", role: "stock", status: "approved" }, is_admin: true });
  if (u.includes("/rest/v1/forklifts")) return json(route, forklifts);
  return json(route, []);
});

const page = await ctx.newPage();
const errs = [];
page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
await page.goto("http://localhost:4339" + BASE + "/stock/login/", { waitUntil: "domcontentloaded" });
await page.evaluate(sbUrl => {
  localStorage.setItem("stock_user", JSON.stringify({ name: "ทดสอบ สต็อก", email: "t@t.com" }));
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

await page.goto("http://localhost:4339" + BASE + "/stock/main/", { waitUntil: "load" });
await page.waitForTimeout(3000);

const listText = await page.evaluate(() => document.body.innerText);
const inList = listText.includes(CODE);

await page.getByText(SN_WITH, { exact: false }).first().click();
await page.waitForTimeout(1200);
const card = await page.evaluate(() => {
  const box = document.querySelector("div.fixed.inset-0");
  return (box ?? document.body).innerText;
});
// ⚠️ ห้ามเช็กแค่ "มีคำว่า GR-111 อยู่ในการ์ด" — การ์ดดัมพ์ custom_fields ดิบอยู่แล้ว
//    ต้องเช็กว่ารหัสอยู่ "ในป้ายสถานะ" จริง ๆ ไม่งั้นด่านผ่านทั้งที่ยังไม่ได้ทำอะไร
const inCard = await page.evaluate((code) => {
  const box = document.querySelector("div.fixed.inset-0") ?? document.body;
  return [...box.querySelectorAll("span")].some(el => {
    const t = (el.textContent ?? "").trim();
    return t.includes("รถเช่า") && t.includes(code) && t.length < 40;
  });
}, CODE);
// ช่องกรอกรหัสรถเช่า — ต้องเป็น input จริง ไม่ใช่แค่ข้อความชื่อคีย์ที่ดัมพ์มา
const hasInput = await page.locator('input[placeholder*="GR"]').count().catch(() => 0);

// คันที่ไม่มีรหัส ต้องไม่มีขยะต่อท้าย เช่น "รถเช่า ·" ลอย ๆ
const dirty = /รถเช่า\s*·\s*(\n|$)/.test(listText);

const checks = [
  ["1) รายการสต็อกโชว์รหัส " + CODE, inList, "ยังเห็นแค่ \"รถเช่า\" แยกไม่ออกว่าคันไหน"],
  ["2) ป้ายสถานะในการ์ดมีรหัส " + CODE, inCard, "ป้ายยังเป็น \"รถเช่า\" เฉย ๆ (ที่เจอเป็นแค่ custom_fields ดิบ)"],
  ["3) คันที่ไม่มีรหัส ไม่มีขยะต่อท้าย", !dirty, "โชว์ \"รถเช่า ·\" ค้างไว้ทั้งที่ไม่มีรหัส"],
  ["4) มีช่องกรอกรหัสรถเช่าจริง", hasInput > 0, "ไม่มี input ให้กรอกรหัส"],
];
let fail = 0;
for (const [name, ok, why] of checks) { console.log(`${name}: ${ok ? "✓" : "✗ " + why}`); if (!ok) fail++; }
if (errs.length) console.log("error:", [...new Set(errs)].slice(0, 3).join(" | "));
console.log(fail === 0 ? "\n✓ รถเช่าโชว์รหัสคันครบทุกที่" : `\n✗ ไม่ผ่าน ${fail}/${checks.length} ข้อ`);

await browser.close(); srv.close();
process.exitCode = fail === 0 ? 0 : 1;
