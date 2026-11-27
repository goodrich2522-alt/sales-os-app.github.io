// scripts/e2e-warranty-by-staff.mjs — แถบเตือน "ยังไม่ลงข้อมูลรับประกัน" ต้องบอกว่าค้างอยู่ที่เซลล์คนไหน
//
// ที่มา (26 พ.ย. 2569 · ผู้ใช้สั่ง): หน้าขายขึ้นแถบแดง "มี 32 ดีลยังไม่ลงข้อมูลรับประกัน · ค่าคอมยังไม่ออก"
// แต่บอกแค่ยอดรวม เจ้าของจึงไม่รู้ว่าต้องไปตามใคร ต้องไล่เปิดทีละดีลเอง
// → แยกยอดตาม "เจ้าของเซลล์" + กดชื่อแล้วเห็นเฉพาะดีลของคนนั้น
//
// ตรวจ 4 ข้อ:
//   1) โหมดแอดมิน (ดูทุกเซลล์) → แถบแดงแยกยอดตามชื่อเซลล์ ตัวเลขถูกทุกคน
//   2) กดชื่อเซลล์ → ป๊อปอัพโชว์เฉพาะดีลของคนนั้น จำนวนตรง
//   3) กด "ทุกเซลล์" → กลับมาครบทุกดีล
//   4) เซลล์ธรรมดา (ดูเฉพาะของฉัน) → ไม่ต้องขึ้นแถวแยกชื่อ (มีคนเดียว = รก)
//
// รัน: npm run build แล้ว SB_URL=<supabase url> node scripts/e2e-warranty-by-staff.mjs
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
await new Promise(r => srv.listen(4343, r));

// เจ้าของระบบ = แอดมินเสมอ (OWNER_EMAILS ใน lib/auth.ts) · ชื่อเซลล์ของตัวเอง = "ไหมแก้ว"
const ADMIN_EMAIL = "goodrichforklift@gmail.com";
const ME = "ไหมแก้ว";
const OTHER = "อภิชญา";
const NO_STAFF = "(ไม่มีชื่อเซลล์)";
// จำนวนดีลค้างของแต่ละคน — ตัวเลขที่แถบแดงต้องโชว์ให้ตรง
const PLAN = [[ME, 3], [OTHER, 2], ["", 1]];

const forklifts = [];
const sales = [];
let n = 0;
for (const [staff, count] of PLAN) {
  for (let i = 0; i < count; i++) {
    const sn = "SNW" + String(++n).padStart(3, "0");
    // custom_fields ว่าง = ยังไม่ลงข้อมูลรับประกัน (warrantyFilled = false)
    forklifts.push({
      id: sn, SN: sn, brand: "HELI", model: "CPCD30-Q22K2", status: "ปิดการขายแล้ว",
      capacity: "3 ตัน", height: "4 เมตร", fuel: "ดีเซล", cost_price: 300000, stock_price: 0,
      created_at: "2026-10-01", received_date: "2026-10-01", vehicle_category: "Forklift",
      pi_no: "PI500", custom_fields: {},
    });
    sales.push({
      id: "sale_" + sn, forklift_id: sn, forklift_unit_no: sn, forklift_brand: "HELI",
      forklift_model: "CPCD30-Q22K2", sales_staff: staff, customer_name: "ลูกค้า " + sn,
      customer_tel: "", customer_type: "นิติบุคคล", province: "", payment_type: "เครดิต",
      actual_sale: 500000, deposit: 0,
      delivery_date: "2026-10-1" + i,              // ปิดเดือน ต.ค. 69 → หลังด่านประกันเริ่มบังคับ (ส.ค. 69)
      sale_status: "ปิดการขาย/จัดส่งแล้ว", sale_type: "รถขายเต็มคัน",
      created_at: "2026-10-1" + i + "T00:00:00.000Z", custom_fields: {},
    });
  }
}
// ใบสุดท้าย "ไม่มีวันส่งมอบ" — ระบบต้องเติมอัตโนมัติไม่ได้ ปล่อยค้างไว้ให้คนกรอก (ตัวคุมของข้อ 5)
// วันเริ่มประกันต้องเป็นวันส่งมอบเท่านั้น (กติกาข้อ 8) ห้ามถอยไปใช้วันเปิดดีล
sales[sales.length - 1].delivery_date = "";
const TOTAL = sales.length;

const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext();
const sbUrlFromEnvFile = () => {
  try { return (/NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.+)/.exec(readFileSync(".env.local", "utf8"))?.[1] ?? "").trim().replace(/^["']|["']$/g, ""); }
  catch { return ""; }
};
const SB_URL = process.env.SB_URL || sbUrlFromEnvFile();
if (!SB_URL) { console.log("✗ ไม่รู้ที่อยู่ Supabase (ตั้ง SB_URL หรือใส่ NEXT_PUBLIC_SUPABASE_URL ใน .env.local)"); process.exit(1); }
const SB_HOST = new URL(SB_URL).host;
const json = (route, body) => route.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": "0-0/*" }, body: JSON.stringify(body) });
await ctx.route("**://" + SB_HOST + "/**", async route => {
  const u = route.request().url();
  if (u.includes("/auth/v1/")) return json(route, { id: "t", email: ADMIN_EMAIL, aud: "authenticated", role: "authenticated", user: { id: "t", email: ADMIN_EMAIL } });
  if (u.includes("/rpc/my_access")) return json(route, { user: { email: ADMIN_EMAIL, role: "sales", status: "approved" }, is_admin: true });
  if (u.includes("/rest/v1/forklifts")) return json(route, forklifts);
  if (u.includes("/rest/v1/sales")) return json(route, sales);
  return json(route, []);
});

const page = await ctx.newPage();
const errs = [];
page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
await page.goto("http://localhost:4343" + BASE + "/sales/login/", { waitUntil: "domcontentloaded" });
await page.evaluate(([sbUrl, email, name]) => {
  localStorage.setItem("sales_user", JSON.stringify({ name, email, target_monthly: 0 }));
  try {
    const ref = new URL(sbUrl).hostname.split(".")[0];
    const exp = Math.floor(Date.now() / 1000) + 86400;
    const b64 = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/=+$/, "");
    localStorage.setItem("sb-" + ref + "-auth-token", JSON.stringify({
      access_token: b64({ alg: "HS256" }) + "." + b64({ sub: "t", email, exp, role: "authenticated" }) + ".x",
      refresh_token: "r", expires_at: exp, expires_in: 86400, token_type: "bearer",
      user: { id: "t", email, aud: "authenticated", role: "authenticated" },
    }));
  } catch { /* ข้าม */ }
}, [SB_URL, ADMIN_EMAIL, ME]);

await page.goto("http://localhost:4343" + BASE + "/sales/main/", { waitUntil: "load" });
await page.waitForTimeout(3000);

const text = () => page.evaluate(() => document.body.innerText.replace(/\n+/g, " | "));
/** จำนวนแถวดีลในป๊อปอัพ = ปุ่มที่เขียนว่า "ลงข้อมูล →" */
const popupRows = () => page.locator("button", { hasText: "ลงข้อมูล →" }).count();
const dismissPopup = async () => {
  const b = page.getByRole("button", { name: "ไว้ทีหลัง" });
  if (await b.count()) { await b.first().click(); await page.waitForTimeout(400); }
};

// ป๊อปอัพเด้งเองตอนเปิดหน้า — ปิดก่อนเพื่อดูแถบแดง
await dismissPopup();

// ── ข้อ 4 (ทำก่อน เพราะยังอยู่โหมด "เฉพาะของฉัน") ──────────────────────────
// เซลล์คนเดียว = ไม่ต้องขึ้นแถวแยกชื่อ
const tOwn = await text();
const ownCountOk = /มี 3 ดีลยังไม่ลงข้อมูลรับประกัน/.test(tOwn);
const ok4 = ownCountOk && !/ค้างอยู่ที่:/.test(tOwn);
const why4 = !ownCountOk ? "ยอดดีลของตัวเองไม่ใช่ 3 (ข้อมูลทดสอบเพี้ยน)" : "มีเซลล์คนเดียวแต่ยังขึ้นแถวแยกชื่อ — รกเปล่า ๆ";

// ── สลับเป็นโหมดแอดมิน "ดูทุกเซลล์" ────────────────────────────────────────
const crown = page.locator("button[title*='ดูดีลของทุกเซลล์']").first();
if (await crown.count()) { await crown.click(); await page.waitForTimeout(900); }
await dismissPopup();

// ── ข้อ 1: แถบแดงแยกยอดตามชื่อเซลล์ ───────────────────────────────────────
const tAll = await text();
const totalOk = new RegExp("มี " + TOTAL + " ดีลยังไม่ลงข้อมูลรับประกัน").test(tAll);
const hasRow = /ค้างอยู่ที่:/.test(tAll);
const chipOk = (name, count) => new RegExp(name.replace(/[()]/g, "\\$&") + "\\s*" + count).test(tAll);
const allChips = PLAN.every(([staff, count]) => chipOk(staff || NO_STAFF, count));
const ok1 = totalOk && hasRow && allChips;
const why1 = !totalOk ? "ยอดรวมไม่ใช่ " + TOTAL + " ดีล"
  : !hasRow ? "ไม่มีแถวแยกตามเซลล์ในแถบแดง"
  : "ตัวเลขรายคนไม่ตรง — ต้องได้ " + PLAN.map(([s, c]) => (s || NO_STAFF) + " " + c).join(" · ");

// ── ข้อ 2: กดชื่อเซลล์ → เห็นเฉพาะดีลของคนนั้น ─────────────────────────────
let ok2 = false, why2 = "ไม่เจอปุ่มชื่อเซลล์ในแถบแดง";
const chip = page.locator("button[title*='" + OTHER + "']").first();
if (await chip.count()) {
  await chip.click();
  await page.waitForTimeout(700);
  const rows = await popupRows();
  const t2 = await text();
  // ทุกแถวต้องเป็นของคนนั้น — ไม่มีชื่อคนอื่นโผล่
  const onlyOther = !t2.includes("เซลล์: " + ME) && !t2.includes("เซลล์: " + NO_STAFF);
  ok2 = rows === 2 && t2.includes("เซลล์: " + OTHER) && onlyOther;
  why2 = rows !== 2 ? "ควรเหลือ 2 ดีล แต่ได้ " + rows
    : !t2.includes("เซลล์: " + OTHER) ? "ไม่ได้บอกชื่อเซลล์ในแต่ละแถว"
    : "ยังมีดีลของคนอื่นปนอยู่";
}

// ── ข้อ 3: กด "ทุกเซลล์" → กลับมาครบ ──────────────────────────────────────
let ok3 = false, why3 = "ไม่เจอปุ่ม \"ทุกเซลล์\" ในป๊อปอัพ";
const allBtn = page.locator("button", { hasText: new RegExp("^ทุกเซลล์ " + TOTAL + "$") }).first();
if (await allBtn.count()) {
  await allBtn.click();
  await page.waitForTimeout(600);
  const rows = await popupRows();
  ok3 = rows === TOTAL;
  why3 = "ควรกลับมา " + TOTAL + " ดีล แต่ได้ " + rows;
}

// ── ข้อ 5: ปุ่มเติมอัตโนมัติบนแถบแดง (27 พ.ย. 2569 · "ทางสายกลาง") ─────────
// ของที่คำนวณได้ต้องไม่บังคับให้คนพิมพ์ — กดครั้งเดียวต้องหายทั้งกอง
// ดีลสุดท้ายในชุดทดสอบ "ไม่มีวันส่งมอบ" → ต้องเหลือค้างไว้ให้คนกรอกเอง (ตัวคุม)
let ok5 = false, why5 = "ไม่เจอปุ่มเติมอัตโนมัติบนแถบแดง";
await dismissPopup();
const fillBtn = page.locator("button", { hasText: /เติมให้อัตโนมัติ/ }).first();
if (await fillBtn.count()) {
  await fillBtn.click();
  await page.waitForTimeout(1500);
  const t5 = await text();
  const left = /มี (\d+) ดีลยังไม่ลงข้อมูลรับประกัน/.exec(t5);
  const leftN = left ? Number(left[1]) : -1;
  const told = /เติมให้ \d+ ดีลแล้ว/.test(t5);
  // เติมได้ TOTAL-1 · เหลือ 1 ใบที่ไม่มีวันส่งมอบ
  ok5 = leftN === 1 && told;
  why5 = leftN === -1 ? "แถบแดงหายไปหมด ทั้งที่ยังมีดีลที่เติมอัตโนมัติไม่ได้"
    : leftN !== 1 ? "ควรเหลือ 1 ดีล (ใบที่ไม่มีวันส่งมอบ) แต่เหลือ " + leftN
    : "ไม่ได้บอกผลว่าเติมให้กี่ดีล";
}

const checks = [
  ["1) แถบแดงแยกยอดตามชื่อเซลล์ ตัวเลขถูก", ok1, why1],
  ["2) กดชื่อเซลล์ → เห็นเฉพาะดีลของคนนั้น", ok2, why2],
  ['3) กด "ทุกเซลล์" → กลับมาครบทุกดีล', ok3, why3],
  ["4) เซลล์คนเดียว → ไม่ขึ้นแถวแยกชื่อ", ok4, why4],
  ["5) ปุ่มเติมอัตโนมัติเคลียร์ทั้งกอง · เหลือเฉพาะใบที่เดาไม่ได้", ok5, why5],
];
let fail = 0;
for (const [name, ok, why] of checks) { console.log(`${name}: ${ok ? "✓" : "✗ " + why}`); if (!ok) fail++; }
if (errs.length) console.log("error:", [...new Set(errs)].slice(0, 3).join(" | "));
console.log(fail === 0 ? "\n✓ แถบเตือนบอกได้ว่าค้างอยู่ที่เซลล์คนไหน" : `\n✗ ไม่ผ่าน ${fail}/${checks.length} ข้อ`);

await browser.close(); srv.close();
process.exitCode = fail === 0 ? 0 : 1;
