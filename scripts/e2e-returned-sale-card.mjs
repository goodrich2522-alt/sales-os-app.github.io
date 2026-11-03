// scripts/e2e-returned-sale-card.mjs — ด่าน "รถที่ลูกค้าคืน ต้องไม่โชว์เป็นรถที่ขายแล้ว"
//
// ที่มา (3 พ.ย. 2569): ผู้ใช้เปิดการ์ด 08015JUP986 (ลูกค้าคืนรถ บัญชีออกใบลดหนี้ SR-690715001)
// รถกลับเป็น "พร้อมขาย" ถูกต้องแล้ว และระบบตัดยอด/ค่าคอมออกให้แล้วจริง
// แต่การ์ดยังโชว์บล็อก "ข้อมูลการขาย" เต็ม ๆ พร้อมป้ายเขียว "✓ เข้างวดค่าคอมเดือน มิ.ย. 2569 แล้ว"
// ผู้ใช้สั่ง: "ประวัติการคืนสินค้าต้องอยู่ที่อื่น ถ้าโชว์แบบนี้ก็จะเป็นรถขายไปแล้ว"
//
// ของที่ดูเหมือนขายแล้วอันตรายกว่าจอว่าง — รถพร้อมขายจริงแต่ไม่มีใครกล้าเสนอ
// และป้ายค่าคอมยังโกหกว่าเข้างวดแล้ว ทั้งที่ดีลถูกตัดออกจากค่าคอมไปแล้ว
//
// ด่านนี้ป้อนรถ 1 คันที่ "พร้อมขาย" + ดีลเดียวที่สถานะ "คืนสินค้า" แล้วตรวจการ์ดว่า
//   1) ไม่มีบล็อก "ข้อมูลการขาย"
//   2) ไม่มีป้าย "เข้างวดค่าคอม"
//   3) มีบล็อกประวัติการคืน พร้อมเหตุผล และบอกชัดว่าไม่นับยอด/ค่าคอม
//   4) ยังเสนอให้ปิดการขายใหม่ได้ (รถกลับมาขายได้แล้ว)
//
// รัน: npm run build แล้ว SB_URL=<supabase url> node scripts/e2e-returned-sale-card.mjs
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
await new Promise(r => srv.listen(4338, r));

const SN = "TESTRETURN001";
const REASON = "รถใช้งานไม่ได้ ลูกค้าคืน";
const forklifts = [{
  id: SN, SN, brand: "HELI", model: "CDD15J-RE", status: "พร้อมขาย",
  capacity: "1.5", height: "", fuel: "ไฟฟ้า", cost_price: 58000, stock_price: 0,
  created_at: "2026-05-27", received_date: "2026-05-27", vehicle_category: "Stacker",
  pi_no: "PI092", custom_fields: {},
}];
// ดีลเดียวของรถคันนี้ — ลูกค้าคืนไปแล้ว (ระบบตัดยอด/ค่าคอมออกให้แล้วใน lib/commission.ts)
// ใส่ "วันที่รับเงิน" ไว้ด้วย เพราะโค้ดเดิมจะเอาไปขึ้นป้าย "เข้างวดค่าคอมเดือน มิ.ย. แล้ว"
const sales = [{
  id: "sale_ret_1", forklift_id: SN, forklift_unit_no: SN,
  customer_name: "บริษัท ทดสอบคืนของ จำกัด", customer_tel: "0800000000", province: "สมุทรปราการ",
  sales_staff: "เซลล์ทดสอบ", actual_sale: 88000, payment_type: "บิลแวท",
  sale_status: "คืนสินค้า", delivery_date: "2026-06-16", payment_received_date: "2026-06-12",
  created_at: "2026-06-16", forklift_brand: "HELI", forklift_model: "CDD15J-RE",
  custom_fields: { "คืนสินค้าเมื่อ": "2026-07-15", "เหตุผลคืน": REASON, "สถานะก่อนคืน": "ปิดการขายแล้ว" },
}];

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
await page.goto("http://localhost:4338" + BASE + "/stock/login/", { waitUntil: "domcontentloaded" });
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

await page.goto("http://localhost:4338" + BASE + "/stock/main/", { waitUntil: "load" });
await page.waitForTimeout(3000);
await page.getByText(SN, { exact: false }).first().click();
await page.waitForTimeout(1200);

const card = await page.evaluate(() => {
  const box = document.querySelector("div.fixed.inset-0");
  return (box ?? document.body).innerText;
});
if (!card.includes(SN)) {
  console.log("✗ เปิดการ์ดรถไม่ขึ้น — ด่านนี้ตรวจไม่ได้");
  await browser.close(); srv.close(); process.exit(1);
}

const has = (s) => card.includes(s);
if (process.env.DUMP) console.log("--- ข้อความบนการ์ด ---\n" + card + "\n---");
const checks = [
  ["1) ไม่มีบล็อก \"ข้อมูลการขาย\"", !has("ข้อมูลการขาย"), "ยังโชว์เป็นรถที่ขายแล้ว"],
  ["2) ไม่มีป้ายเข้างวดค่าคอม", !has("เข้างวดค่าคอม"), "ป้ายโกหกว่าเข้างวดแล้ว ทั้งที่ดีลถูกตัดออกจากค่าคอม"],
  ["3) มีประวัติการคืน + เหตุผล", has("คืนสินค้า") && has(REASON), "ไม่เห็นประวัติว่าเคยขายแล้วลูกค้าคืน"],
  ["4) บอกว่าไม่นับยอด/ค่าคอม", has("ไม่นับ"), "ไม่ได้บอกว่าดีลนี้ถูกตัดออกจากยอดขายและค่าคอม"],
  ["5) ยังปิดการขายใหม่ได้", has("ยังไม่มีดีล") || has("ปิดการขายแทนฝ่ายขาย"), "รถกลับมาขายได้แล้วแต่สต็อกปิดการขายใหม่ไม่ได้"],
];
let fail = 0;
for (const [name, ok, why] of checks) {
  console.log(`${name}: ${ok ? "✓" : "✗ " + why}`);
  if (!ok) fail++;
}
if (errs.length) console.log("error:", [...new Set(errs)].slice(0, 3).join(" | "));
console.log(fail === 0
  ? "\n✓ รถที่ลูกค้าคืนแสดงเป็นประวัติ ไม่ใช่รถที่ขายแล้ว"
  : `\n✗ ไม่ผ่าน ${fail}/${checks.length} ข้อ`);

await browser.close(); srv.close();
process.exitCode = fail === 0 ? 0 : 1;
