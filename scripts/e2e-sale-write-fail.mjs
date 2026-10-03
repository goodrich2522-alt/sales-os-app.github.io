// scripts/e2e-sale-write-fail.mjs — ด่าน "ใบขายบันทึกไม่ลง ห้ามตั้งรถเป็นขายแล้ว"
//
// ที่มา (3 ต.ค. 2569): รถ 010253T1376 ขึ้น "ปิดการขายแล้ว" แต่ไม่มีดีลผูก ไม่มีบิลในไฟล์บัญชีเลย
// สาเหตุ: ตอนปิดการขาย แอปยิง 2 คำสั่งแยกกันและไม่รอกัน
//     api.addSaleApi(...)        ← ใบขาย
//     api.updateForkliftApi(...) ← สถานะรถ
// ถ้าใบขายลงไม่สำเร็จ (สิทธิ์ · คอลัมน์ · รูปสลิปใหญ่เกิน · เน็ตสะดุด) แต่สถานะรถลงสำเร็จ
// → ได้รถ "ปิดการขายแล้ว" ที่ไม่มีดีล ตลอดไป · คนที่กดเห็นว่าสำเร็จ เพราะจอโชว์แบบ optimistic
//
// ด่านนี้ทำให้ใบขายลงไม่ได้ (ตอบ 400) แล้วตรวจว่า
//   1) ไม่มีคำสั่งเปลี่ยนสถานะรถเป็น "ขายแล้ว" ยิงออกไป
//   2) ขึ้นแถบแดงบอกผู้ใช้ว่าบันทึกไม่สำเร็จ
//   3) สถานะรถบนจอกลับเป็นของเดิม ไม่หลอกว่าปิดการขายแล้ว
//
// รัน: npm run build แล้ว SB_URL=<supabase url> node scripts/e2e-sale-write-fail.mjs
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
await new Promise(r => srv.listen(4326, r));

const SN = "010253T1376";                      // คันที่เจอปัญหาจริง
const SOLD = ["ปิดการขายแล้ว", "ส่งมอบแล้ว", "ขายแล้ว", "รอจัดส่ง", "จอง"];
const forklifts = [{
  id: SN, SN, brand: "HELI", model: "CPCD25-Q22K2", status: "พร้อมขาย",
  capacity: "2.5", height: "3.00 ม.", fuel: "ดีเซล", cost_price: 222000, stock_price: 0,
  created_at: "2026-08-29", received_date: "2026-08-29", vehicle_category: "Forklift",
  pi_no: "PI104", custom_fields: {},
}];

const saleTries = [];        // ทุกครั้งที่พยายามลงใบขาย
const forkWrites = [];       // ทุกครั้งที่สั่งแก้ข้อมูลรถ

const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext();
const SB_HOST = new URL(process.env.SB_URL || "https://x.supabase.co").host;
const json = (route, body) => route.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": "0-0/*" }, body: JSON.stringify(body) });
await ctx.route("**://" + SB_HOST + "/**", async route => {
  const u = route.request().url();
  const method = route.request().method();
  if (u.includes("/auth/v1/")) return json(route, { id: "t", email: "t@t.com", aud: "authenticated", role: "authenticated", user: { id: "t", email: "t@t.com" } });

  // ใบขาย: อ่านได้ แต่ "เขียนไม่ได้" — จำลองสิทธิ์ไม่พอ/คอลัมน์ไม่ตรง
  if (u.includes("/rest/v1/sales") && method !== "GET") {
    saleTries.push(method);
    return route.fulfill({
      status: 400, contentType: "application/json",
      body: JSON.stringify({ code: "42501", message: "new row violates row-level security policy for table \"sales\"" }),
    });
  }
  // ข้อมูลรถ: เขียนได้ปกติ — เก็บไว้ดูว่ามีการตั้งสถานะขายแล้วหลุดออกไปไหม
  if (u.includes("/rest/v1/forklifts") && method !== "GET") {
    let body = {};
    try { body = JSON.parse(route.request().postData() || "{}"); } catch { /* อ่านไม่ออกก็ข้าม */ }
    forkWrites.push({ method, status: body.status ?? "(ไม่ระบุ)" });
    return json(route, []);
  }
  if (u.includes("/rest/v1/forklifts")) return json(route, forklifts);
  return json(route, []);
});

const page = await ctx.newPage();
const errs = [];
page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
await page.goto("http://localhost:4326" + BASE + "/stock/login/", { waitUntil: "domcontentloaded" });
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

await page.goto("http://localhost:4326" + BASE + "/stock/main/", { waitUntil: "load" });
await page.waitForTimeout(3000);

// ตัวนับ "ขายไปแล้ว" บนการ์ดสรุปหัวหน้าสต็อก — สัญญาณที่วัดได้แน่นอนว่าจอโชว์ว่าขายแล้วหรือยัง
const readSoldCount = () => page.evaluate(() => {
  const card = [...document.querySelectorAll("button")]
    .find(b => [...b.querySelectorAll("p")].some(p => (p.textContent || "").trim() === "ขายไปแล้ว"));
  const num = card ? [...card.querySelectorAll("p")].map(p => (p.textContent || "").trim()).find(t => /^[0-9]+$/.test(t)) : null;
  return num === null || num === undefined ? -1 : Number(num);
});
console.log("ก่อนกด — ตัวนับ “ขายไปแล้ว”:", await readSoldCount(), "(ควรเป็น 0)");

// ปิดการขายแทนฝ่ายขาย — เส้นทางเดียวกับที่ฝ่ายสต็อกใช้จริง
await page.getByText(SN, { exact: false }).first().click();
await page.waitForTimeout(600);
const editBtn = page.getByRole("button", { name: /แก้ไข/ }).first();
if (await editBtn.count()) { await editBtn.click(); await page.waitForTimeout(500); }
const openClose = page.getByRole("button", { name: "ปิดการขายแทนฝ่ายขาย" }).first();
if (!(await openClose.count())) {
  console.log("✗ ไม่เจอปุ่ม 'ปิดการขายแทนฝ่ายขาย' — ด่านนี้ตรวจไม่ได้");
  await browser.close(); srv.close(); process.exit(1);
}
await openClose.click();
await page.waitForTimeout(400);
const fill = async (label, value) => {
  const box = page.locator("label", { hasText: label }).first().locator("input, select").first();
  await box.fill(value).catch(async () => { await box.selectOption(value).catch(() => {}); });
};
await fill("เซลล์เจ้าของงาน", "ไหมแก้ว");
await fill("ลูกค้า", "บริษัททดสอบ จำกัด");
await fill("ราคาขาย", "303500");
await fill("วันส่งมอบ", "2026-09-12");
await page.getByRole("button", { name: "บันทึกปิดการขาย" }).first().click();
await page.waitForTimeout(2500);

// ── ตรวจผล ───────────────────────────────────────────────────────────────
console.log("พยายามลงใบขาย:", saleTries.length, "ครั้ง (ฐานข้อมูลตอบ 400 ทุกครั้ง)");
console.log("คำสั่งแก้ข้อมูลรถที่ยิงออกไป:", forkWrites.length
  ? forkWrites.map(w => w.method + " status=" + w.status).join(" · ") : "(ไม่มี)");

const leaked = forkWrites.filter(w => SOLD.includes(String(w.status).trim()));
console.log("1) ตั้งสถานะรถเป็นขายแล้วทั้งที่ใบขายไม่ลง:", leaked.length,
  leaked.length === 0 ? "✓ ไม่หลุด" : "✗ หลุดไปแล้ว — จะได้รถขายแล้วไม่มีดีล");

const banner = await page.getByText("บันทึกขึ้นเซิร์ฟเวอร์ไม่สำเร็จ", { exact: false }).count()
  .catch(() => 0);
const bannerAlt = banner || await page.locator("text=/บันทึก.*ไม่สำเร็จ|บันทึกไม่ขึ้น|เซิร์ฟเวอร์/").count().catch(() => 0);
console.log("2) แถบแดงเตือนผู้ใช้:", bannerAlt > 0 ? "✓ ขึ้นแล้ว" : "✗ ไม่ขึ้น — ผู้ใช้เข้าใจว่าบันทึกสำเร็จ");

await page.keyboard.press("Escape").catch(() => {});
await page.waitForTimeout(600);
const soldOnScreen = await readSoldCount();
console.log("3) ตัวนับ “ขายไปแล้ว” บนหน้าสต็อก:", soldOnScreen,
  soldOnScreen === 0 ? "✓ ยังเป็น 0 (ไม่หลอกตา)" : "✗ ขึ้นเป็น " + soldOnScreen + " ทั้งที่บันทึกไม่สำเร็จ");

if (errs.length) console.log("error:", [...new Set(errs)].slice(0, 3).join(" | "));
await browser.close(); srv.close();
process.exitCode = (leaked.length === 0 && bannerAlt > 0 && soldOnScreen === 0) ? 0 : 1;
