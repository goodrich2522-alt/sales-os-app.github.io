// scripts/e2e-first-paint.mjs — "กดเข้าหน้าสต็อกแล้วต้องเห็นรถทันที"
//
// ที่มา (25 พ.ย. 2569 · ผู้ใช้แจ้ง "กดเข้าหน้าแรกแล้วโหลด 1-2 นาที"):
// ตอนเปิดแอป api.bootstrap() ดึง 4 ตารางพร้อมกันด้วย Promise.all แล้ว "รอให้ครบทุกตาราง"
// ถึงจะยิงข้อมูลลงจอ → จอว่างอยู่นานเท่าตารางที่ช้าที่สุด
// ตารางที่ช้าที่สุดคือ inspections เพราะรูปใบตรวจรับเก็บเป็น base64 อยู่ในแถว
// (คอลัมน์ images + image_slots · ไม่ได้ตั้งค่า GAS_URL จึงอัปขึ้นที่เก็บไฟล์ไม่ได้)
// รูปพวกนั้นหน้าสต็อกใช้แค่ "รูปหน้ารถบนการ์ด" กับในหน้าต่างรายละเอียด — ไม่ใช่สิ่งที่ต้องรอ
//
// ด่านนี้จึงจำลองว่า inspections/customers ช้า (SLOW_MS) แล้วบังคับว่า:
//   1) รายการรถต้องขึ้นก่อนตารางช้าจะมาถึง
//   2) ขึ้นเร็วแล้วต้องครบ ไม่ใช่เร็วเพราะโหลดมาไม่หมด
//   3) ตารางที่เหลือต้องยังโหลดจริง (กันแก้แบบ "ตัด inspections ทิ้ง" แล้วข้อมูลหาย)
//
// รัน: npm run build แล้ว node scripts/e2e-first-paint.mjs
// ปรับได้: SLOW_MS=8000 N_FK=1200
//
// ⚠️ ไม่แตะฐานข้อมูลจริง — ดัก request ไป Supabase ทั้งหมดแล้วตอบข้อมูลปลอมเอง
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const BASE = "/sales-os-app.github.io";
const ROOT = "out";
const SLOW_MS = Number(process.env.SLOW_MS || 8000);
const N_FK = Number(process.env.N_FK || 1200);
const FIRST_PAINT_LIMIT_MS = 5000;   // เกินนี้ถือว่า "กดแล้วรอ" — ผู้ใช้รับไม่ได้

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".ico": "image/x-icon", ".png": "image/png", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".txt": "text/plain" };
const srv = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.startsWith(BASE)) p = p.slice(BASE.length);
  let f = join(ROOT, p);
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
  if (!existsSync(f) && existsSync(f + ".html")) f += ".html";
  if (!existsSync(f)) { res.writeHead(404); res.end("nope"); return; }
  res.writeHead(200, { "Content-Type": TYPES[extname(f)] ?? "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise(r => srv.listen(4324, r));

// ── ข้อมูลปลอมขนาดใกล้ของจริง ──
const PENDING_SN = "SNPENDING1";
const DRIVER = "คนขับทดสอบ";
const forklifts = Array.from({ length: N_FK }, (_, i) => ({
  id: "SN" + (100000 + i), SN: "SN" + (100000 + i), brand: ["HELI", "HANGCHA", "STAXX"][i % 3],
  model: ["CBD20J-LI-S", "CPCD30-Q22K2", "BF25"][i % 3],
  status: i % 3 === 0 ? "พร้อมขาย" : "ปิดการขายแล้ว", capacity: "2.5 ตัน", height: "3 เมตร",
  fuel: "ไฟฟ้า", cost_price: 200000 + i, stock_price: 0, created_at: "2026-01-01",
  received_date: "2026-01-15", vehicle_category: "Forklift", pi_no: "PI" + (i % 140), custom_fields: {},
}));
// รถที่ผู้ขนส่งรับเข้ามาแล้ว รอสต็อกยืนยัน — บล็อกนี้โชว์ชื่อผู้รับรถจากตาราง inspections
forklifts.push({
  id: PENDING_SN, SN: PENDING_SN, brand: "HELI", model: "CBD15J-LI-S", status: "รอยืนยันนำเข้าสต็อก",
  capacity: "1.5 ตัน", height: "3 เมตร", fuel: "ไฟฟ้า", cost_price: 0, stock_price: 0,
  created_at: "2026-11-20", received_date: "2026-11-20", vehicle_category: "Electric Pallet Truck",
  pi_no: "PI200", custom_fields: {},
});
const TOTAL_FK = forklifts.length;

const sales = Array.from({ length: 300 }, (_, i) => ({
  id: "sale_" + i, forklift_id: "SN" + (100000 + i), forklift_unit_no: "SN" + (100000 + i),
  forklift_brand: "HELI", forklift_model: "CBD20J-LI-S", sales_staff: "เซลล์ " + (i % 8),
  customer_name: "ลูกค้า " + i, customer_tel: "", customer_type: "นิติบุคคล", province: "",
  payment_type: "เครดิต", actual_sale: 300000, deposit: 0, delivery_date: "2026-05-01",
  sale_status: "ปิดการขาย/จัดส่งแล้ว", sale_type: "รถขายเต็มคัน",
  created_at: "2026-05-01T00:00:00.000Z", custom_fields: {},
}));

// รูป base64 ก้อนโต = เหตุผลที่ตาราง inspections ช้า
const bigImg = "data:image/jpeg;base64," + "A".repeat(80 * 1024);
const inspections = [
  { id: "ins_pending", unit_no: PENDING_SN, transporter_name: DRIVER, date: "2026-11-20",
    images: [bigImg, bigImg], image_slots: { front: bigImg }, role: "ผู้รับรถ", deleted_at: null },
  ...Array.from({ length: 40 }, (_, i) => ({
    id: "ins_" + i, unit_no: "SN" + (100000 + i), transporter_name: "คนขับ " + i, date: "2026-05-01",
    images: [bigImg, bigImg], image_slots: { front: bigImg }, role: "ผู้รับรถ", deleted_at: null,
  })),
];
const customers = Array.from({ length: 200 }, (_, i) => ({ id: "c" + i, name: "ลูกค้า " + i }));

const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext();

// ต้องรู้โฮสต์ Supabase จริง ไม่งั้นดัก request ไม่ติด แล้วด่านจะ "ไม่ผ่าน" เพราะเหตุผลผิด
const sbUrlFromEnvFile = () => {
  try { return (/NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.+)/.exec(readFileSync(".env.local", "utf8"))?.[1] ?? "").trim().replace(/^["']|["']$/g, ""); }
  catch { return ""; }
};
const SB_URL = process.env.SB_URL || sbUrlFromEnvFile();
if (!SB_URL) { console.log("✗ ไม่รู้ที่อยู่ Supabase (ตั้ง SB_URL หรือใส่ NEXT_PUBLIC_SUPABASE_URL ใน .env.local)"); process.exit(1); }
const SB_HOST = new URL(SB_URL).host;
const askedAt = {};                       // ตารางไหนถูกขอเมื่อไหร่ (ms นับจาก t0)
let t0 = Date.now();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

await ctx.route("**://" + SB_HOST + "/**", async route => {
  const u = route.request().url();
  const json = (body) => route.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": "0-0/*" }, body: JSON.stringify(body) });
  if (u.includes("/auth/v1/")) return json({ id: "test", email: "t@t.com", aud: "authenticated", role: "authenticated", user: { id: "test", email: "t@t.com" } });

  // เลียนแบบ PostgREST: เคารพ offset/limit และ select=คอลัมน์
  const take = (arr) => {
    const q = new URL(u).searchParams;
    const off = Number(q.get("offset") || 0), lim = Number(q.get("limit") || arr.length);
    const sel = (q.get("select") || "*").split(",").map(x => x.trim()).filter(Boolean);
    const rows = arr.slice(off, off + lim);
    if (sel.length === 1 && sel[0] === "*") return rows;
    return rows.map(r => Object.fromEntries(sel.filter(k => k in r).map(k => [k, r[k]])));
  };
  const mark = (t) => { if (askedAt[t] == null) askedAt[t] = Date.now() - t0; };

  if (u.includes("/rest/v1/forklifts"))  { mark("forklifts"); return json(take(forklifts)); }
  if (u.includes("/rest/v1/sales"))      { mark("sales");     return json(take(sales)); }
  if (u.includes("/rest/v1/app_config")) { mark("app_config"); return json({ data: {} }); }
  // ── ตารางที่ช้า — ของจริงช้าเพราะแบกรูป base64 มาด้วย ──
  if (u.includes("/rest/v1/inspections")) { mark("inspections"); await sleep(SLOW_MS); return json(take(inspections)); }
  if (u.includes("/rest/v1/customers"))   { mark("customers");   await sleep(SLOW_MS); return json(take(customers)); }
  if (u.includes("/rest/v1/rpc/")) return json([]);
  return json([]);
});

const page = await ctx.newPage();
const errs = [];
page.on("pageerror", e => errs.push("pageerror: " + String(e).slice(0, 300)));

await page.goto("http://localhost:4324" + BASE + "/stock/login/", { waitUntil: "domcontentloaded" });
await page.evaluate((sbUrl) => {
  localStorage.setItem("stock_user", JSON.stringify({ name: "ทดสอบ", email: "t@t.com" }));
  try {
    const ref = new URL(sbUrl).hostname.split(".")[0];
    const exp = Math.floor(Date.now() / 1000) + 86400;
    const b64 = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/=+$/, "");
    const jwt = b64({ alg: "HS256", typ: "JWT" }) + "." + b64({ sub: "test", email: "t@t.com", exp, role: "authenticated" }) + ".x";
    localStorage.setItem("sb-" + ref + "-auth-token", JSON.stringify({
      access_token: jwt, refresh_token: "r", expires_at: exp, expires_in: 86400, token_type: "bearer",
      user: { id: "test", email: "t@t.com", aud: "authenticated", role: "authenticated" },
    }));
  } catch { /* ไม่ได้ก็ปล่อย */ }
}, SB_URL);
// ล้างแคชในเครื่องให้เหมือน "เปิดแอปครั้งแรก" — ด่านนี้วัดการโหลดจากเซิร์ฟเวอร์
await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("salesos_")) localStorage.removeItem(k); });

t0 = Date.now();
await page.goto("http://localhost:4324" + BASE + "/stock/main/", { waitUntil: "commit" });

// ── รอจน "แสดง X จาก Y คัน" ขึ้นโดย Y > 0 ──
let firstPaintMs = null, shownTotal = 0;
for (let i = 0; i < 300; i++) {                     // ไม่เกิน 30 วิ
  const m = await page.evaluate(() => {
    const t = document.body.innerText;
    const r = /แสดง\s+([\d,]+)\s+จาก\s+([\d,]+)\s+คัน/.exec(t);
    return r ? [Number(r[1].replace(/,/g, "")), Number(r[2].replace(/,/g, ""))] : null;
  }).catch(() => null);
  if (m && m[1] > 0) { firstPaintMs = Date.now() - t0; shownTotal = m[1]; break; }
  await page.waitForTimeout(100);
}

console.log("── ด่าน: กดเข้าหน้าสต็อกแล้วต้องเห็นรถทันที ──");
console.log("ข้อมูลทดสอบ: รถ " + TOTAL_FK + " คัน · ตาราง inspections/customers หน่วงไว้ " + (SLOW_MS / 1000) + " วิ");
console.log("เวลาที่ตารางถูกขอ (วิ):", Object.fromEntries(Object.entries(askedAt).map(([k, v]) => [k, (v / 1000).toFixed(1)])));

// 1) รายการรถต้องขึ้นก่อนตารางช้าจะมาถึง
const beforeSlow = firstPaintMs != null && firstPaintMs < SLOW_MS;
const quick = firstPaintMs != null && firstPaintMs < FIRST_PAINT_LIMIT_MS;
console.log("1) เห็นรายการรถใน: " + (firstPaintMs == null ? "ไม่ขึ้นเลย (เกิน 30 วิ)" : (firstPaintMs / 1000).toFixed(1) + " วิ")
  + " · เกณฑ์ < " + (FIRST_PAINT_LIMIT_MS / 1000) + " วิ และก่อนตารางช้า (" + (SLOW_MS / 1000) + " วิ) → "
  + (beforeSlow && quick ? "✓" : "✗ ยังรอตารางที่ช้าที่สุดอยู่"));

// 2) เร็วแล้วต้องครบ — ไม่ใช่เร็วเพราะโหลดมาไม่หมด
await page.waitForTimeout(SLOW_MS + 4000);
const after = await page.evaluate(() => {
  const r = /แสดง\s+([\d,]+)\s+จาก\s+([\d,]+)\s+คัน/.exec(document.body.innerText);
  return r ? Number(r[2].replace(/,/g, "")) : 0;
});
const complete = after === TOTAL_FK;
console.log("2) จำนวนรถบนจอหลังโหลดครบ: " + after + " / " + TOTAL_FK + " → " + (complete ? "✓" : "✗ ข้อมูลหาย"));

// 3) ตารางที่เหลือต้องยังโหลดจริง (ชื่อผู้รับรถมาจาก inspections)
const gotDriver = (await page.evaluate(() => document.body.innerText)).includes("รับโดย " + DRIVER);
console.log("3) ข้อมูลใบตรวจรับมาถึงแล้ว (ขึ้น “รับโดย " + DRIVER + "”) → " + (gotDriver ? "✓" : "✗ ไม่โหลด inspections เลย — ข้อมูลหาย"));

if (errs.length) console.log("ข้อผิดพลาดบนหน้า:", errs.slice(0, 3).join(" | "));

await browser.close();
srv.close();
const pass = beforeSlow && quick && complete && gotDriver;
console.log(pass ? "✓ ผ่านทั้ง 3 ข้อ" : "✗ ไม่ผ่าน");
process.exitCode = pass ? 0 : 1;
