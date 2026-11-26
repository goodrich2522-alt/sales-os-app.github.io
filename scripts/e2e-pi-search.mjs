// scripts/e2e-pi-search.mjs — ด่าน "ค้นเลข PI พิมพ์แบบไหนก็ต้องเจอ + ศูนย์ผลลัพธ์ต้องบอกว่าติดตัวกรองไหน"
//
// ที่มา (24 พ.ย. 2569 · เจ้าของเจอเอง): ค้น "PI172" ในหน้าสต็อก ได้ "แสดง 0 จาก 1578 คัน"
// ทั้งที่รถคันนั้นมีอยู่จริง (หน้านำเข้า PI เตือนว่า "1 คัน SN ซ้ำกับที่มีในสต็อก")
//
// สาเหตุ 2 ชั้นที่ทับกัน:
//   ชั้นที่ 1 — ช่องค้นหาเทียบเลข PI แบบตรงตัว  "PI172" ≠ "PI-172" ≠ "172" ≠ "C20726201-172"
//              ทั้งที่เป็นใบเดียวกัน · ในฐานข้อมูลเก็บปนกันจริง (เจอทั้ง PI054 และ PI-055)
//   ชั้นที่ 2 — ตัวกรองสถานะค้างอยู่ที่ "พร้อมขาย" แต่จอบอกแค่ "ไม่พบรถตามเงื่อนไข"
//              ไม่บอกว่าติดตัวกรองตัวไหน → เข้าใจว่าไม่มีรถคันนี้ในระบบ
//
// เพิ่ม (26 พ.ย. 2569 · ผู้ใช้สั่ง): "รถที่ขายไปแล้ว อยากให้ค้นด้วยชื่อบริษัทลูกค้าก็เจอ"
// ชื่อลูกค้าอยู่ในใบขาย ไม่ได้อยู่ในแถวรถ — ช่องค้นหาเดิมจึงหาไม่เจอเลย
//
// ตรวจ 8 ข้อ:
//   1) ค้น "PI172"        → เจอรถที่เก็บเป็น "PI-172"
//   2) ค้น "172"          → เจอทั้ง "PI-172" และ "C20726201-172"
//   3) ค้น "pi 172"       → เจอ (เว้นวรรค/ตัวพิมพ์เล็กก็ต้องได้)
//   4) ค้นเลขที่ไม่มีจริง  → ต้องไม่เจอ (กันแก้แบบ "จับทุกอย่าง")
//   5) ผลลัพธ์ 0 ตอนมีตัวกรองเปิดอยู่ → ต้องบอกว่าติดตัวกรองอะไร + มีปุ่มล้างตัวกรอง
//   6) ค้นชื่อบริษัทลูกค้า → เจอรถที่ขายให้เจ้านั้น (ทั้งใบที่ผูกด้วยรหัสรถและผูกด้วย SN)
//   7) ค้นชื่อแบบเว้นวรรคไม่ตรง ("บจก.ทิสโก้" vs "บจก. ทิสโก้") → ต้องเจอเหมือนกัน
//   8) ค้นชื่อลูกค้าที่ไม่มีจริง → ต้องไม่เจอ (กันจับกว้างเกิน)
//
// รัน: npm run build แล้ว SB_URL=<supabase url> node scripts/e2e-pi-search.mjs
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
await new Promise(r => srv.listen(4341, r));

const mk = (sn, pi, status) => ({
  id: sn, SN: sn, brand: "HELI", model: "CPCD25-WS1H", status,
  capacity: "2.5", height: "4.00", fuel: "ดีเซล", cost_price: 385600, stock_price: 0,
  created_at: "2026-11-16", received_date: "", vehicle_category: "Forklift",
  pi_no: pi, custom_fields: {},
});
// เคสจริงจากใบ C20726201-172 (16 พ.ย. 2569) — SN 010253R7514 · สถานะยังไม่ใช่ "พร้อมขาย"
const SN_DASH = "010253R7514";   // เก็บเป็น "PI-172"            ← ค้น "PI172" ต้องเจอ
const SN_FULL = "010253R7515";   // เก็บเป็น "C20726201-172"      ← ค้น "172" ต้องเจอ
const SN_OTHER = "010253R9999";  // เก็บเป็น "PI880"              ← ต้องไม่โผล่มามั่ว
// รถที่ขายไปแล้ว — ใบขายผูกคนละแบบ (ใบหนึ่งผูกด้วย SN · อีกใบผูกด้วยรหัสรถ/PI ชั่วคราว)
const SN_CUST = "010253R8001";   // ขายให้ "บจก. ทิสโก้ ลีสซิ่ง"   ← ใบขายผูกด้วย SN
const ID_CUST = "PI900#1";       // ขายให้ "หจก. สมชายขนส่ง"       ← ใบขายผูกด้วยรหัสรถ
const forklifts = [
  mk(SN_DASH, "PI-172", "สั่งผลิต"),
  mk(SN_FULL, "C20726201-172", "รอรับ"),
  mk(SN_OTHER, "PI880", "พร้อมขาย"),
  { ...mk(SN_CUST, "PI900", "ปิดการขายแล้ว") },
  { ...mk(ID_CUST, "PI900", "ปิดการขายแล้ว"), id: ID_CUST, SN: "" },
];
const sales = [
  { id: "sale_cust_1", forklift_id: SN_CUST, forklift_unit_no: SN_CUST, forklift_brand: "HELI",
    forklift_model: "CPCD25-WS1H", sales_staff: "เซลล์ ก", customer_name: "บจก. ทิสโก้ ลีสซิ่ง",
    customer_tel: "", customer_type: "นิติบุคคล", province: "", payment_type: "เครดิต",
    actual_sale: 450000, deposit: 0, delivery_date: "2026-10-05",
    sale_status: "ปิดการขาย/จัดส่งแล้ว", sale_type: "รถขายเต็มคัน",
    created_at: "2026-10-05T00:00:00.000Z", custom_fields: {} },
  { id: "sale_cust_2", forklift_id: ID_CUST, forklift_unit_no: "", forklift_brand: "HELI",
    forklift_model: "CPCD25-WS1H", sales_staff: "เซลล์ ข", customer_name: "หจก. สมชายขนส่ง",
    customer_tel: "", customer_type: "นิติบุคคล", province: "", payment_type: "เครดิต",
    actual_sale: 420000, deposit: 0, delivery_date: "2026-10-09",
    sale_status: "ปิดการขาย/จัดส่งแล้ว", sale_type: "รถขายเต็มคัน",
    created_at: "2026-10-09T00:00:00.000Z", custom_fields: {} },
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
  if (u.includes("/rest/v1/sales")) return json(route, sales);
  return json(route, []);
});

const page = await ctx.newPage();
const errs = [];
page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
await page.goto("http://localhost:4341" + BASE + "/stock/login/", { waitUntil: "domcontentloaded" });
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

await page.goto("http://localhost:4341" + BASE + "/stock/main/", { waitUntil: "load" });
await page.waitForTimeout(3000);

// เกาะช่องค้นหาของ "รายการสต็อก" โดยตรง — หน้านี้มีช่องค้นหาอีกช่อง (ประวัติการขาย)
const box = page.locator('input[placeholder*="ค้นหา"][placeholder*="PI"]').first();
if (!(await box.count())) {
  console.log("✗ ไม่เจอช่องค้นหาในหน้าสต็อก");
  await browser.close(); srv.close();
  process.exit(1);
}

/** พิมพ์คำค้น แล้วคืนข้อความทั้งหน้า (รอให้รายการวาดใหม่) */
const search = async (q) => {
  await box.fill("");
  await page.waitForTimeout(250);
  await box.fill(q);
  await page.waitForTimeout(900);
  return page.evaluate(() => document.body.innerText.replace(/\n+/g, " | "));
};

const t1 = await search("PI172");
const ok1 = t1.includes(SN_DASH);

const t2 = await search("172");
const ok2 = t2.includes(SN_DASH) && t2.includes(SN_FULL);

const t3 = await search("pi 172");
const ok3 = t3.includes(SN_DASH);

// กันแก้แบบมักง่าย: ค้นเลขที่ไม่มีจริง ต้องไม่โผล่อะไรเลย
const t4 = await search("PI173");
const ok4 = !t4.includes(SN_DASH) && !t4.includes(SN_FULL) && !t4.includes(SN_OTHER);

// ── ข้อ 5: ศูนย์ผลลัพธ์ทั้งที่มีตัวกรองเปิดอยู่ ───────────────────────────
// ตั้งสถานะเป็น "พร้อมขาย" (เหมือนที่เจ้าของเจอ) แล้วค้น PI172 → ต้องได้ 0 คัน
// แต่จอต้องบอกว่าติดตัวกรอง "พร้อมขาย" อยู่ และมีปุ่มล้างตัวกรองให้กด
let ok5 = false, why5 = "";
const statusSel = page.locator("select").filter({ hasText: "ทุกสถานะ" }).first();
if (await statusSel.count()) {
  await statusSel.selectOption({ label: "พร้อมขาย" }).catch(() => {});
  const t5 = await search("PI172");
  const empty = /ไม่พบรถ/.test(t5);
  const namesFilter = /พร้อมขาย/.test(t5) && /(ตัวกรอง|กรองอยู่|เงื่อนไขที่เปิดอยู่)/.test(t5);
  const hasClear = await page.getByRole("button", { name: /ล้างตัวกรอง/ }).count();
  ok5 = empty && namesFilter && hasClear > 0;
  why5 = !empty ? "ไม่ได้ขึ้นข้อความว่าไม่พบรถ"
    : !namesFilter ? "ขึ้นแค่ \"ไม่พบรถตามเงื่อนไข\" ไม่บอกว่าติดตัวกรองสถานะ \"พร้อมขาย\" อยู่"
    : "ไม่มีปุ่มล้างตัวกรองให้กด";
} else {
  why5 = "ไม่เจอช่องเลือกสถานะ";
}

// ── ข้อ 6-8: ค้นด้วยชื่อบริษัท/ลูกค้า (26 พ.ย. 2569) ──────────────────────
// ล้างตัวกรองสถานะก่อน (ข้อ 5 ตั้งค้างไว้ที่ "พร้อมขาย" แต่รถที่ขายแล้วเป็น "ปิดการขายแล้ว")
if (await statusSel.count()) await statusSel.selectOption({ label: "ทุกสถานะ" }).catch(() => {});

const t6 = await search("ทิสโก้");
const ok6a = t6.includes(SN_CUST);
const t6b = await search("สมชายขนส่ง");
const ok6b = t6b.includes(ID_CUST) || /สมชายขนส่ง/.test(t6b);
const ok6 = ok6a && ok6b;

// เว้นวรรคไม่ตรงกับที่เก็บไว้ ("บจก. ทิสโก้ ลีสซิ่ง" ในฐานข้อมูล)
const t7 = await search("บจก.ทิสโก้");
const ok7 = t7.includes(SN_CUST);

// ชื่อที่ไม่มีลูกค้ารายไหนชื่อนี้ → ต้องไม่เจออะไรเลย
const t8 = await search("บริษัทไม่มีจริงจำกัด");
const ok8 = !t8.includes(SN_CUST) && !t8.includes(ID_CUST) && !t8.includes(SN_DASH);

const checks = [
  ['1) ค้น "PI172" เจอรถที่เก็บเป็น "PI-172"', ok1, "ขีดคั่นทำให้ค้นไม่เจอ"],
  ['2) ค้น "172" เจอทั้ง "PI-172" และ "C20726201-172"', ok2, "เลขใบเดียวกันแต่เก็บคนละรูปแบบ ค้นไม่ครบ"],
  ['3) ค้น "pi 172" (เว้นวรรค/ตัวเล็ก) เจอ', ok3, "เว้นวรรคแล้วค้นไม่เจอ"],
  ['4) ค้น "PI173" ที่ไม่มีจริง → ไม่เจออะไร', ok4, "จับกว้างเกินไป คืนรถที่ไม่เกี่ยวมาด้วย"],
  ["5) ศูนย์ผลลัพธ์ บอกตัวกรองที่เปิดอยู่ + ปุ่มล้าง", ok5, why5],
  ['6) ค้นชื่อบริษัทลูกค้า เจอรถที่ขายให้เจ้านั้น', ok6,
    !ok6a ? "ค้น \"ทิสโก้\" ไม่เจอรถที่ขายให้ (ใบขายผูกด้วย SN)" : "ค้น \"สมชายขนส่ง\" ไม่เจอ (ใบขายผูกด้วยรหัสรถ)"],
  ['7) ชื่อเว้นวรรคไม่ตรง ("บจก.ทิสโก้") ก็ต้องเจอ', ok7, "ต้องตัดเว้นวรรค/จุดก่อนเทียบ ไม่งั้นพิมพ์ต่างนิดเดียวก็หาย"],
  ['8) ค้นชื่อลูกค้าที่ไม่มีจริง → ไม่เจออะไร', ok8, "จับกว้างเกินไป คืนรถที่ไม่เกี่ยวมาด้วย"],
];
let fail = 0;
for (const [name, ok, why] of checks) { console.log(`${name}: ${ok ? "✓" : "✗ " + why}`); if (!ok) fail++; }
if (errs.length) console.log("error:", [...new Set(errs)].slice(0, 3).join(" | "));
console.log(fail === 0 ? "\n✓ ค้นเลข PI ได้ทุกรูปแบบ + ศูนย์ผลลัพธ์อธิบายตัวเอง" : `\n✗ ไม่ผ่าน ${fail}/${checks.length} ข้อ`);

await browser.close(); srv.close();
process.exitCode = fail === 0 ? 0 : 1;
