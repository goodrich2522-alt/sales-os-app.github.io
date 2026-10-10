// scripts/e2e-save-rollback.mjs — ด่าน "บันทึกไม่สำเร็จ ต้องถอยข้อมูลบนจอกลับของเดิม"
//
// ที่มา (10 ต.ค. 2569): ทุกการบันทึกโชว์ผลบนจอก่อนรู้ผลจากเซิร์ฟเวอร์ (optimistic)
// ถ้าเซิร์ฟเวอร์ปฏิเสธ เดิมขึ้นแค่แถบแดง แต่ข้อมูลบนจอยังเป็นค่าใหม่
// → ผู้ใช้เห็นว่าบันทึกแล้ว ปิดแอปไป พอเปิดใหม่ข้อมูลหาย
//   (อาการเดียวกับ 010253T1376 แต่เกิดกับทุกช่อง เช่น ประกัน · สเปกรถ · ทุน)
//
// ด่านนี้ทำให้การบันทึกข้อมูลรถล้มเหลว (ตอบ 400) แล้วตรวจว่า
//   1) ขึ้นแถบแดงเตือน
//   2) เปิดการ์ดรถใหม่ ค่าที่กรอกต้องหายไป (ถอยกลับของเดิม) ไม่ใช่ค้างอยู่หลอกตา
//
// รัน: npm run build แล้ว SB_URL=<supabase url> node scripts/e2e-save-rollback.mjs
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
await new Promise(r => srv.listen(4327, r));

const SN = "TESTROLLBACK01";
const FORK_LEN = "1220";                 // ความยาวงาที่จะลองกรอก — ของเดิมต้องว่าง
const forklifts = [{
  id: SN, SN, brand: "HELI", model: "CPCD25-Q22K2", status: "พร้อมขาย",
  capacity: "2.5", height: "", fuel: "ดีเซล", cost_price: 222000, stock_price: 0,
  created_at: "2026-08-29", received_date: "2026-08-29", vehicle_category: "Forklift",
  pi_no: "PI104", custom_fields: {},
}];

const forkWrites = [];
const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext();
const SB_HOST = new URL(process.env.SB_URL || "https://x.supabase.co").host;
const json = (route, body) => route.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": "0-0/*" }, body: JSON.stringify(body) });
await ctx.route("**://" + SB_HOST + "/**", async route => {
  const u = route.request().url();
  const method = route.request().method();
  if (u.includes("/auth/v1/")) return json(route, { id: "t", email: "t@t.com", aud: "authenticated", role: "authenticated", user: { id: "t", email: "t@t.com" } });
  // ข้อมูลรถ: อ่านได้ แต่เขียนไม่ได้ — จำลองสิทธิ์ไม่พอ
  if (u.includes("/rest/v1/forklifts") && method !== "GET") {
    forkWrites.push(method);
    return route.fulfill({
      status: 400, contentType: "application/json",
      body: JSON.stringify({ code: "42501", message: "new row violates row-level security policy for table \"forklifts\"" }),
    });
  }
  if (u.includes("/rest/v1/forklifts")) return json(route, forklifts);
  return json(route, []);
});

const page = await ctx.newPage();
const errs = [];
page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
await page.goto("http://localhost:4327" + BASE + "/stock/login/", { waitUntil: "domcontentloaded" });
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

await page.goto("http://localhost:4327" + BASE + "/stock/main/", { waitUntil: "load" });
await page.waitForTimeout(3000);

// เปิดการ์ดรถ → แก้ไข → กรอกความยาวงา → บันทึกสเปก
const openCard = async () => {
  await page.getByText(SN, { exact: false }).first().click();
  await page.waitForTimeout(700);
};
const forkBox = () => page.locator("label", { hasText: "ความยาวงา" }).first()
  .locator("xpath=following-sibling::input[1] | ../input").first();

await openCard();
const editBtn = page.getByRole("button", { name: /แก้ไข/ }).first();
if (await editBtn.count()) { await editBtn.click(); await page.waitForTimeout(600); }
if (!(await forkBox().count())) {
  console.log("✗ ไม่เจอช่อง 'ความยาวงา' — ด่านนี้ตรวจไม่ได้");
  await browser.close(); srv.close(); process.exit(1);
}
console.log("ก่อนกรอก — ความยาวงา:", JSON.stringify(await forkBox().inputValue()), "(ควรว่าง)");
await forkBox().fill(FORK_LEN);
await page.getByRole("button", { name: /บันทึกสเปก/ }).first().click();
await page.waitForTimeout(2200);

console.log("คำสั่งบันทึกข้อมูลรถที่ยิงออกไป:", forkWrites.length, "ครั้ง (ฐานข้อมูลตอบ 400 ทุกครั้ง)");

const banner = await page.getByText("บันทึกขึ้นเซิร์ฟเวอร์ไม่สำเร็จ", { exact: false }).count().catch(() => 0);
console.log("1) แถบแดงเตือนผู้ใช้:", banner > 0 ? "✓ ขึ้นแล้ว" : "✗ ไม่ขึ้น — ผู้ใช้เข้าใจว่าบันทึกสำเร็จ");

// ปิดการ์ดแล้วเปิดใหม่ — ค่านี้อ่านจากข้อมูลกลาง ถ้าถอยคืนสำเร็จต้องว่างเหมือนเดิม
const closeCard = async () => {
  const x = page.locator("button:has(svg.lucide-x)").first();
  if (await x.count()) await x.click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(400);
  // ยังปิดไม่ลง → กดพื้นหลังนอกการ์ด
  if (await page.locator("div.fixed.inset-0").first().count()) {
    await page.mouse.click(6, 6).catch(() => {});
    await page.waitForTimeout(400);
  }
};
await closeCard();
await page.waitForTimeout(600);
await openCard();
const editBtn2 = page.getByRole("button", { name: /แก้ไข/ }).first();
if (await editBtn2.count()) { await editBtn2.click(); await page.waitForTimeout(600); }
const after = (await forkBox().inputValue().catch(() => "")).trim();
const reverted = after !== FORK_LEN;
console.log("2) เปิดการ์ดใหม่ — ความยาวงา:", JSON.stringify(after),
  reverted ? "✓ ถอยกลับของเดิมแล้ว" : "✗ ยังค้างค่าใหม่ (หลอกตา — ปิดแอปแล้วข้อมูลหาย)");

if (errs.length) console.log("error:", [...new Set(errs)].slice(0, 3).join(" | "));
await browser.close(); srv.close();
process.exitCode = (banner > 0 && reverted) ? 0 : 1;
