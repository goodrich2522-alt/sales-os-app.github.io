// scripts/e2e-sale-extra-fields.mjs — ด่าน "ห้ามส่งคอลัมน์ที่ไม่มีจริงตอนบันทึกใบขาย"
//
// ที่มา (29 ต.ค. 2569 · ผู้ใช้เจอหน้างาน):
//   ปิดการขาย HELI CPCD25-Q22K2 แล้วขึ้นแถบแดง
//   "addSale — Could not find the 'freebie' column of 'sales' in the schema cache"
//
// ต้นเหตุ: add_ons / freebie / shipping_cost ไม่ใช่คอลัมน์จริงในตาราง sales
//          (คอมเมนต์ใน lib/api.ts เขียนไว้แล้วว่าต้องเก็บใน custom_fields — แต่ทำแค่ฝั่ง "อ่าน")
//          ฝั่ง "เขียน" ยัง upsert ทั้งก้อน Sale → PostgREST ตีกลับทั้งคำขอ ดีลไม่ลง
//
// ทำไมเพิ่งโผล่: ทั้ง 3 ค่าเป็น undefined เมื่อไม่ได้กรอก → JSON.stringify ตัดคีย์ทิ้ง
//   ดีลธรรมดาจึงลงได้ · จะพังเฉพาะตอน "ติ๊กของแถม / ใส่ค่าขนส่ง / ใส่อุปกรณ์เสริม"
//   (ของแถมขึ้นเฉพาะรถ Q22K2 ดีเซล — ตรงกับรุ่นที่ผู้ใช้เจอพอดี)
//
// ด่านนี้ตรวจ 3 ข้อ:
//   1) ไม่มีคีย์นอกคอลัมน์จริงหลุดไปกับ POST/PATCH /rest/v1/sales
//   2) ค่าที่กรอก (ของแถม/ค่าขนส่ง) ต้องไม่หาย — ต้องไปโผล่ใน custom_fields
//   3) ต้องไม่ขึ้นแถบแดง "บันทึกขึ้นเซิร์ฟเวอร์ไม่สำเร็จ"
//
// รัน: npm run build แล้ว SB_URL=<supabase url> node scripts/e2e-sale-extra-fields.mjs
// ⚠️ ไม่แตะฐานข้อมูลจริง — ดัก request ไป Supabase แล้วตอบเอง
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const BASE = "/sales-os-app.github.io";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".txt": "text/plain", ".ico": "image/x-icon", ".png": "image/png", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
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
await new Promise(r => srv.listen(4337, r));

// คอลัมน์จริงของตาราง sales — ดึงจาก lib/api.ts โดยตรง จะได้ไม่ต้องมาคอยก๊อปตาม
const api = readFileSync("lib/api.ts", "utf8");
const block = /const SALE_COLUMNS = \[([\s\S]*?)\]\.join/.exec(api);
if (!block) { console.error("หา SALE_COLUMNS ใน lib/api.ts ไม่เจอ"); process.exit(1); }
const REAL = new Set([...block[1].matchAll(/"([a-z_]+)"/g)].map(m => m[1]));
// คอลัมน์รูปสลิป ไม่ได้อยู่ใน SALE_COLUMNS (ไม่ดึงมาตอนอ่าน) แต่เขียนลงได้
["payment_proof", "payment_proofs"].forEach(c => REAL.add(c));

// รถ Q22K2 ดีเซล 1 คัน — รุ่นที่ทำให้ช่อง "ของแถม" โผล่
const SN = "010254A6858";
const forklifts = [{
  id: SN, SN, brand: "HELI", model: "CPCD25-Q22K2", status: "พร้อมขาย",
  capacity: "2.5", height: "3.00 ม.", fuel: "ดีเซล", cost_price: 217000, stock_price: 0,
  created_at: "2026-09-05", received_date: "2026-09-05", vehicle_category: "Forklift",
  pi_no: "PI118", custom_fields: {},
}];

const writes = [];      // ทุกก้อนที่ยิงเข้า /rest/v1/sales
const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext();
const SB = new URL(process.env.SB_URL || "https://x.supabase.co").host;
const json = (r, b) => r.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": "0-0/*" }, body: JSON.stringify(b) });
await ctx.route("**://" + SB + "/**", r => {
  const u = r.request().url(), m = r.request().method();
  if (u.includes("/auth/v1/")) return json(r, { id: "t", email: "t@t.com", aud: "authenticated", role: "authenticated", user: { id: "t", email: "t@t.com" } });
  if (u.includes("/rpc/my_access")) return json(r, { user: { email: "t@t.com", role: "sales", status: "approved" }, is_admin: true });
  if (u.includes("/rest/v1/sales") && m !== "GET") {
    try {
      const b = JSON.parse(r.request().postData() || "[]");
      (Array.isArray(b) ? b : [b]).forEach(x => writes.push(x));
    } catch { /* ข้าม */ }
    // ⚠️ ตอบ 200 เสมอ — ด่านนี้ตรวจ "ก้อนที่ส่ง" ไม่ได้พึ่งให้เซิร์ฟเวอร์ตีกลับ
    //    ของจริง PostgREST จะตอบ 400 แต่ถ้าจำลอง 400 จะแยกไม่ออกว่าพังเพราะคีย์ไหน
    return json(r, []);
  }
  if (u.includes("/rest/v1/forklifts") && m === "GET") return json(r, forklifts);
  return json(r, []);
});

const page = await ctx.newPage();
const errs = [];
page.on("console", e => { if (e.type() === "error") errs.push(e.text().slice(0, 160)); });
await page.goto("http://localhost:4337" + BASE + "/sales/login/", { waitUntil: "domcontentloaded" });
await page.evaluate(sb => {
  localStorage.setItem("sales_user", JSON.stringify({ name: "ไหมแก้ว", email: "t@t.com" }));
  try {
    const ref = new URL(sb).hostname.split(".")[0];
    const exp = Math.floor(Date.now() / 1000) + 86400;
    const b64 = o => btoa(JSON.stringify(o)).replace(/=+$/, "");
    localStorage.setItem("sb-" + ref + "-auth-token", JSON.stringify({
      access_token: b64({ alg: "HS256" }) + "." + b64({ sub: "t", email: "t@t.com", exp, role: "authenticated" }) + ".x",
      refresh_token: "r", expires_at: exp, expires_in: 86400, token_type: "bearer",
      user: { id: "t", email: "t@t.com", aud: "authenticated", role: "authenticated" },
    }));
  } catch { /* ข้าม */ }
}, process.env.SB_URL || "https://x.supabase.co");

await page.goto("http://localhost:4337" + BASE + "/sales/main/", { waitUntil: "load" });
await page.waitForTimeout(3000);

// เปิดฟอร์มขายของรถคันนี้ (กดที่การ์ด เหมือนด่านประกัน)
await page.getByText(SN, { exact: false }).first().click();
await page.waitForTimeout(1200);

// กรอกช่องบังคับ — select เลือกตัวเลือกแรกที่ไม่ว่าง
// ⚠️ SField วาง <label> กับช่องกรอกเป็น "พี่น้องกัน" ใน div เดียว ไม่ได้ครอบกัน
//    จึงต้องขึ้นไปที่ div แม่ก่อน (xpath=..) แล้วค่อยหาช่องกรอก
const box = (label, sel = "input, select, textarea") =>
  page.locator("label", { hasText: label }).first().locator("xpath=..").locator(sel).first();
const fill = async (label, value) => { await box(label).fill(value).catch(() => {}); };
const pick = async (label) => {
  const s = box(label, "select");
  const v = await s.evaluate(el => { const o = [...el.options].find(x => x.value); return o ? o.value : ""; }).catch(() => "");
  if (v) await s.selectOption(v).catch(() => {});
};
await fill("ชื่อลูกค้า", "บริษัท ทดสอบของแถม จำกัด");
await fill("เบอร์โทร", "0812345678");
await pick("ประเภทลูกค้า");
await pick("จังหวัด");
await pick("ประเภทการชำระ");
await fill("ราคาขายจริง", "286000");
await fill("วันส่งมอบ", "2026-10-29");

// หลักฐานการชำระเงิน — บังคับแนบ (PNG 1x1)
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const fileIn = page.locator('input[type=file]').first();
if (await fileIn.count()) await fileIn.setInputFiles({ name: "slip.png", mimeType: "image/png", buffer: PNG }).catch(() => {});
await page.waitForTimeout(600);

// ① ติ๊ก "มีของแถม" (ขึ้นเฉพาะรถ Q22K2 ดีเซล)
const freebieBox = page.locator('label:has-text("มีของแถม") input[type=checkbox]').first();
const hasFreebie = await freebieBox.count();
if (hasFreebie) await freebieBox.check().catch(() => {});
console.log("ช่อง \"มีของแถม\":", hasFreebie ? "✓ มี (รถ Q22K2 ดีเซล)" : "✗ ไม่โผล่ — เช็กเงื่อนไข isQ22K2");

// ② ใส่ค่าขนส่ง (ช่องเงินใต้หัวข้อ "ค่าคอม/คำนวณกำไร")
const shipBox = page.locator('input[placeholder="0"]').last();
if (await shipBox.count()) await shipBox.fill("3500").catch(() => {});

await page.waitForTimeout(400);
await page.getByRole("button", { name: /ปิดการขาย \/ จัดส่งแล้ว/ }).first().click().catch(() => {});
await page.waitForTimeout(2500);

if (writes.length === 0) {
  const why = await page.locator("#sale-error-summary").textContent().catch(() => "");
  console.log("⚠️ ไม่มีอะไรยิงเข้าฐานข้อมูล — ฟอร์มติดตรงไหน:",
    (why || "(ไม่มีกล่องแดง)").replace(/\s+/g, " ").slice(0, 300));
}

// ── ตรวจผล ──────────────────────────────────────────────────────────────────
const GHOST = ["freebie", "add_ons", "shipping_cost"];
const bad = [];
writes.forEach(w => Object.keys(w).forEach(k => { if (!REAL.has(k)) bad.push(k); }));
const ghost = [...new Set(bad)].filter(k => GHOST.includes(k));
const other = [...new Set(bad)].filter(k => !GHOST.includes(k));

console.log("ยิงเข้า /rest/v1/sales:", writes.length, "ก้อน");
console.log("1) คีย์ที่ไม่ใช่คอลัมน์จริง:",
  bad.length === 0 ? "✓ ไม่มี" : "✗ หลุดไป: " + [...new Set(bad)].join(", "));
if (ghost.length) console.log("   ← ตัวนี้แหละที่ทำให้ขึ้น \"Could not find the '" + ghost[0] + "' column\"");
if (other.length) console.log("   ← คีย์แปลกปลอมตัวอื่น: " + other.join(", "));

// ค่าที่กรอกต้องไม่หาย — ต้องไปอยู่ใน custom_fields
const cf = writes.map(w => w.custom_fields || {});
const keptFreebie = !hasFreebie || cf.some(c => String(c["ของแถม"] ?? "") !== "");
const keptShip    = cf.some(c => String(c["ค่าขนส่ง"] ?? "") !== "");
console.log("2) ค่าที่กรอกถูกเก็บไว้:",
  keptFreebie && keptShip ? "✓ ของแถม + ค่าขนส่ง อยู่ใน custom_fields"
    : "✗ หาย — ของแถม:" + (keptFreebie ? "✓" : "✗") + " ค่าขนส่ง:" + (keptShip ? "✓" : "✗"));

const banner = await page.evaluate(() => document.body.innerText.includes("บันทึกขึ้นเซิร์ฟเวอร์ไม่สำเร็จ"));
console.log("3) แถบแดงบันทึกไม่สำเร็จ:", banner ? "✗ ขึ้น" : "✓ ไม่ขึ้น");
if (errs.length) console.log("   error ในคอนโซล:", [...new Set(errs)].slice(0, 2).join(" | "));

await browser.close(); srv.close();
const ok = writes.length > 0 && bad.length === 0 && keptFreebie && keptShip && !banner;
console.log(ok ? "\n✓ ผ่าน — ใบขายส่งเฉพาะคอลัมน์จริง และค่าที่กรอกไม่หาย"
               : "\n✗ ไม่ผ่าน");
process.exitCode = ok ? 0 : 1;
