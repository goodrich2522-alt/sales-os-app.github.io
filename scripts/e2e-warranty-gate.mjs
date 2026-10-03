// scripts/e2e-warranty-gate.mjs — ทดสอบ "กรอกประกันแล้วต้องกดปิดการขายได้ทันที"
//
// ที่มา (3 ต.ค. 2569): ฝ่ายขายกรอกบริการหลังการขายแล้ว แต่กดปิดการขายไม่ได้
// ต้องกดซ้ำ 3-4 ครั้งถึงผ่าน — เพราะด่านตรวจอ่านจาก "สำเนารถตอนกดเลือก" ซึ่งไม่อัปเดตตาม
//
// รัน: npm run build แล้ว SB_URL=<supabase url> node scripts/e2e-warranty-gate.mjs
// ⚠️ ไม่แตะฐานข้อมูลจริง — ดัก request ไป Supabase แล้วตอบข้อมูลปลอมเอง
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const BASE = "/sales-os-app.github.io";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2", ".ico": "image/x-icon", ".svg": "image/svg+xml" };
const srv = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.startsWith(BASE)) p = p.slice(BASE.length);
  let f = join("out", p);
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
  if (!existsSync(f) && existsSync(f + ".html")) f += ".html";
  if (!existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": TYPES[extname(f)] ?? "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise(r => srv.listen(4325, r));

const SN = "TESTFORK001";
const forklifts = [{
  id: SN, SN, brand: "HELI", model: "CPCD30-Q22K2", status: "พร้อมขาย",
  capacity: "3 ตัน", height: "4 เมตร", fuel: "ดีเซล", cost_price: 300000, stock_price: 0,
  created_at: "2026-09-01", received_date: "2026-09-01", vehicle_category: "Forklift",
  pi_no: "PI999", custom_fields: {},
}];

const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext();
const SB = new URL(process.env.SB_URL || "https://x.supabase.co").host;
const json = (r, b) => r.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": "0-0/*" }, body: JSON.stringify(b) });
await ctx.route("**://" + SB + "/**", async r => {
  const u = r.request().url();
  if (u.includes("/auth/v1/")) return json(r, { id: "t", email: "t@t.com", aud: "authenticated", role: "authenticated", user: { id: "t", email: "t@t.com" } });
  if (u.includes("/rest/v1/forklifts")) return json(r, forklifts);
  return json(r, []);
});

const page = await ctx.newPage();
const errs = [];
page.on("pageerror", e => errs.push(String(e).slice(0, 160)));
await page.goto("http://localhost:4325" + BASE + "/sales/login/", { waitUntil: "domcontentloaded" });
await page.evaluate(sb => {
  localStorage.setItem("sales_user", JSON.stringify({ name: "เซลล์ทดสอบ", email: "t@t.com", target_monthly: 0 }));
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

await page.goto("http://localhost:4325" + BASE + "/sales/main/", { waitUntil: "load" });
await page.waitForTimeout(2500);

// เปิดฟอร์มขายของรถคันนี้
await page.getByText(SN, { exact: false }).first().click();
await page.waitForTimeout(900);

const warnVisible = async () => page.getByText("ต้องกรอกและกดบันทึกกล่องนี้ก่อน").count();
console.log("ก่อนกรอกประกัน — คำเตือนในฟอร์ม:", await warnVisible(), "(ควรเป็น 1)");

// กรอกกล่องบริการหลังการขาย แล้วกดบันทึก
const dateBox = page.locator("label", { hasText: "วันเริ่มรับประกัน" }).first().locator("input[type=date]").first();
await dateBox.fill("2026-09-15").catch(e => console.log("กรอกวันที่ไม่ได้:", String(e).slice(0, 80)));
const terms = page.locator("label", { hasText: "เงื่อนไขรับประกัน" }).first().locator("textarea").first();
if (await terms.count()) {
  const cur = await terms.inputValue();
  if (!cur.trim()) await terms.fill("เครื่องยนต์ 3 ปี · ไฮดรอลิก 6 เดือน");
}
await page.getByRole("button", { name: /บันทึกบริการหลังการขาย/ }).first().click();
await page.waitForTimeout(900);

const after = await warnVisible();
console.log("หลังกดบันทึกประกัน — คำเตือนในฟอร์ม:", after, after === 0 ? "✓ หายแล้ว (กดปิดการขายได้ทันที)" : "✗ ยังค้าง");

// ลองกดปิดการขายจริง แล้วดูว่ามี error เรื่องประกันไหม
const closeBtn = page.getByRole("button", { name: /ปิดการขาย \/ จัดส่งแล้ว/ }).first();
if (await closeBtn.count()) {
  await closeBtn.click();
  await page.waitForTimeout(700);
  const gate = await page.getByText('กรุณากรอก "บริการหลังการขาย').count();
  console.log("กดปิดการขาย — ติดด่านประกันไหม:", gate, gate === 0 ? "✓ ไม่ติด" : "✗ ยังติด");
}
if (errs.length) console.log("error:", [...new Set(errs)].slice(0, 2).join(" | "));

await browser.close(); srv.close();
process.exitCode = after === 0 ? 0 : 1;
