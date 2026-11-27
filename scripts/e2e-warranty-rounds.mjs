// scripts/e2e-warranty-rounds.mjs — กดจริงในหน้าจริง: ลงรอบเช็ค 1 รอบ แล้วรอบถัดไปต้องคำนวณให้เอง
//
// ที่มา (27 พ.ย. 2569 · ผู้ใช้สั่ง "เลือกครั้งแล้วให้ตั้งคำนวณรอบถัดไปอัตโนมัติ")
// ตรรกะล้วนอยู่ในด่าน test-warranty-rounds.mjs แล้ว — ด่านนี้พิสูจน์ว่า "หน้าจอต่อสายถึงตรรกะนั้นจริง"
// (เคยมีกรณีแก้ lib แล้วลืมเปลี่ยนที่หน้าจอ คนใช้จึงไม่เห็นความเปลี่ยนแปลงเลย)
//
// รัน: npm run build แล้ว SB_URL=<supabase url> node scripts/e2e-warranty-rounds.mjs
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
await new Promise(r => srv.listen(4331, r));

const SN = "TESTROUND001";
// รถที่ลงข้อมูลรับประกันไว้แล้ว (วันเริ่ม 15 ก.ย. 69) แต่ยังไม่เคยเข้าเช็คสักรอบ
const SVC = { start: "2026-09-15", terms: "เครื่องยนต์ 3 ปี", rounds: [0, 1, 2, 3].map(() => ({ date: "", done: false, note: "" })), history: [] };
const forklifts = [{
  id: SN, SN, brand: "HELI", model: "CPCD30-Q22K2", status: "พร้อมขาย",
  capacity: "3 ตัน", height: "4 เมตร", fuel: "ดีเซล", cost_price: 300000, stock_price: 0,
  created_at: "2026-09-01", received_date: "2026-09-01", vehicle_category: "Forklift",
  pi_no: "PI998", custom_fields: { "บริการหลังการขาย": JSON.stringify(SVC) },
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
await page.goto("http://localhost:4331" + BASE + "/sales/login/", { waitUntil: "domcontentloaded" });
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

await page.goto("http://localhost:4331" + BASE + "/sales/main/", { waitUntil: "load" });
await page.waitForTimeout(2500);
await page.getByText(SN, { exact: false }).first().click();
await page.waitForTimeout(900);

const row = n => page.locator(`[data-round="${n}"]`).first();
const dateOf = n => row(n).locator("input[type=date]").first();
const checkOf = n => row(n).locator("input[type=checkbox]").first();
const fail = [];
const ok = (name, pass, why = "") => { console.log(`${name}: ${pass ? "✓" : "✗ " + why}`); if (!pass) fail.push(name); };

if (!(await row(1).count())) {
  console.log("✗ ไม่เจอรอบเข้าเช็คในกล่องรับประกัน — หน้าจอไม่ได้แสดงรอบเลย");
  await browser.close(); srv.close(); process.exit(1);
}

// 1) ติ๊ก "เช็คแล้ว" โดยไม่ลงวัน → ระบบต้องลงวันนี้ให้เอง
const today = (d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`)(new Date());
await checkOf(1).check();
await page.waitForTimeout(400);
const got1 = await dateOf(1).inputValue();
ok("1) ติ๊กรอบที่ 1 แล้วลงวันนี้ให้เอง", got1 === today, `ควรได้ ${today} · ได้ "${got1}" — ไม่มีวันเข้าจริง รอบถัดไปจะนับผิด`);

// 2) แก้วันเข้าจริงเป็นวันอื่น → รอบที่ 2 ต้องขยับตาม (+3 เดือน) ทันที ไม่ต้องกดบันทึกก่อน
await dateOf(1).fill("2026-12-20");
await page.waitForTimeout(400);
const txt2 = (await row(2).innerText()).replace(/\s+/g, " ");
ok("2) รอบที่ 2 ขยับตามวันเข้าจริงของรอบที่ 1", txt2.includes("2027-03-20"),
  `รอบที่ 2 ควรครบกำหนด 2027-03-20 (20 ธ.ค. + 3 เดือน) · เห็น "${txt2.slice(0, 120)}"`);

// 3) มีบรรทัดสรุป "รอบถัดไป" พร้อมวันครบกำหนด — ไม่ต้องไล่อ่านทีละรอบ
const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
ok("3) มีบรรทัดสรุปรอบถัดไปพร้อมวันครบกำหนด", /รอบถัดไป:.*รอบที่ 2/.test(body) && body.includes("2027-03-20"),
  "ไม่เจอบรรทัด 'รอบถัดไป: รอบที่ 2 · ครบกำหนด 2027-03-20'");

// 4) ตัวคุม — ติ๊กออก ต้องไม่ลบวันที่ที่คนกรอกไว้
await checkOf(1).uncheck();
await page.waitForTimeout(400);
const kept = await dateOf(1).inputValue();
ok("4) ติ๊กออกแล้ววันที่ที่กรอกไว้ต้องไม่หาย (ตัวคุม)", kept === "2026-12-20", `ได้ "${kept}" — ลบข้อมูลที่คนกรอกเอง`);

// 5) ตัวคุม — ลงวันเข้าจริงที่รอบที่ 2 ต้องติ๊กว่าเช็คแล้วให้เอง
await dateOf(2).fill("2027-03-25");
await page.waitForTimeout(400);
ok("5) ลงวันที่รอบที่ 2 แล้วติ๊กให้เอง", await checkOf(2).isChecked(),
  "ลงวันแล้วยังไม่นับว่าเช็ค — ระบบจะเตือนรอบที่ไปเช็คมาแล้ว");

if (errs.length) console.log("error:", [...new Set(errs)].slice(0, 2).join(" | "));
console.log(fail.length === 0 ? `\nผ่านทั้งหมด 5/5 ข้อ` : `\n✗ ไม่ผ่าน ${fail.length}/5 ข้อ`);
await browser.close(); srv.close();
process.exitCode = fail.length === 0 ? 0 : 1;
