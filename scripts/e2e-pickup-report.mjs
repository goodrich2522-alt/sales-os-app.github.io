// scripts/e2e-pickup-report.mjs — ด่าน "รายงานรถที่ต้องไปรับ"
//
// ที่มา (27 ต.ค. 2569 · เจ้าของขอ): รถค้างไม่เข้าคลัง 43 คัน 18 ล็อต บางล็อต 129 วัน
// และ 13 จาก 18 ล็อตไม่มีวันรับระบุไว้เลย — มองไม่ออกว่าอะไรค้าง
//
// ตรวจ 4 ข้อ:
//   1) แยก "ไปรับได้แล้ว" กับ "รอผลิต" ถูกกลุ่ม (รถสั่งผลิตต้องไม่ปนกับของที่ไปรับได้)
//   2) จัดกลุ่มตามล็อตและนับคันถูก
//   3) บอกอายุค้างเป็นวัน
//   4) ตั้งวันนัดรับแล้วบันทึกลงทุกคันในล็อต ไม่ใช่คันเดียว
//
// รัน: npm run build แล้ว SB_URL=<supabase url> node scripts/e2e-pickup-report.mjs
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
await new Promise(r => srv.listen(4334, r));

const old = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);   // ค้างมา 60 วัน
const mk = (id, pi, status, received) => ({
  id, SN: id, brand: "HANGCHA", model: "CBD20-WS", status,
  cost_price: 1, stock_price: 0, created_at: received, received_date: received,
  vehicle_category: "Forklift", pi_no: pi, custom_fields: {},
});
// ล็อต A: ไปรับได้ 3 คัน ค้าง 60 วัน · ล็อต B: รอผลิต 2 คัน (ต้องแยกกลุ่ม)
const forklifts = [
  mk("PK001", "LOT-A", "รอรับ", old), mk("PK002", "LOT-A", "รอรับ", old), mk("PK003", "LOT-A", "รอรับ", old),
  mk("PK004", "LOT-B", "สั่งผลิต", old), mk("PK005", "LOT-B", "สั่งผลิต", old),
];

const writes = [];
const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext();
const SB = new URL(process.env.SB_URL || "https://x.supabase.co").host;
const json = (r, b) => r.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": "0-0/*" }, body: JSON.stringify(b) });
await ctx.route("**://" + SB + "/**", async r => {
  const u = r.request().url(), m = r.request().method();
  if (u.includes("/auth/v1/")) return json(r, { id: "t", email: "t@t.com", aud: "authenticated", role: "authenticated", user: { id: "t", email: "t@t.com" } });
  if (u.includes("/rest/v1/forklifts") && m !== "GET") {
    try { const b = JSON.parse(r.request().postData() || "[]"); (Array.isArray(b) ? b : [b]).forEach(x => writes.push(x)); } catch { /* ข้าม */ }
    return json(r, []);
  }
  if (u.includes("/rest/v1/forklifts")) return json(r, forklifts);
  return json(r, []);
});

const page = await ctx.newPage();
await page.goto("http://localhost:4334" + BASE + "/stock/login/", { waitUntil: "domcontentloaded" });
await page.evaluate(sb => {
  localStorage.setItem("stock_user", JSON.stringify({ name: "ทดสอบ", email: "t@t.com" }));
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

await page.goto("http://localhost:4334" + BASE + "/stock/pickup/", { waitUntil: "load" });
await page.waitForTimeout(3000);

const body = () => page.evaluate(() => document.body.innerText.replace(/\n+/g, " | "));
const txt = await body();
const readyTab = /ไปรับได้แล้ว \(3 คัน · 1 ล็อต\)/.test(txt);
const makingTab = /รอผลิต \(2 คัน · 1 ล็อต\)/.test(txt);
console.log("1) แยกกลุ่มถูก:", readyTab && makingTab ? "✓ ไปรับได้ 3 คัน · รอผลิต 2 คัน" : "✗ ผิด — " + txt.slice(0, 160));
const lotA = /LOT-A/.test(txt) && !/LOT-B/.test(txt);
console.log("2) แท็บแรกโชว์เฉพาะล็อตที่ไปรับได้:", lotA ? "✓ เห็น LOT-A ไม่เห็น LOT-B" : "✗ ปนกัน");
const aged = /ค้าง (59|60|61) วัน/.test(txt);
console.log("3) บอกอายุค้าง:", aged ? "✓ " + (/ค้าง \d+ วัน/.exec(txt) || [""])[0] : "✗ ไม่บอก");

// ตั้งวันนัดรับ → ต้องเขียนลงทั้ง 3 คันในล็อต
let savedAll = false;
const btn = page.getByRole("button", { name: "ตั้งวันนัดรับ" }).first();
if (await btn.count()) {
  await btn.click();
  await page.waitForTimeout(600);
  await page.locator('input[type=date]').first().fill("2026-11-05").catch(() => {});
  await page.locator('input[placeholder*="ท่าเรือ"]').first().fill("ท่าเรือแหลมฉบัง").catch(() => {});
  await page.getByRole("button", { name: "บันทึก" }).first().click();
  await page.waitForTimeout(1800);
  const ids = writes.map(w => w.id);
  savedAll = ["PK001", "PK002", "PK003"].every(i => ids.includes(i)) && !ids.includes("PK004");
  console.log("4) บันทึกลงทุกคันในล็อต:", savedAll ? "✓ ครบ 3 คัน (ไม่แตะล็อตอื่น)" : "✗ เขียนไป: " + (ids.join(",") || "(ไม่มี)"));
  const okDate = writes.some(w => w.custom_fields?.["วันนัดรับ"] === "2026-11-05");
  console.log("   วันนัดรับถูกบันทึก:", okDate ? "✓" : "✗");
  savedAll = savedAll && okDate;
} else {
  console.log("4) ✗ ไม่เจอปุ่มตั้งวันนัดรับ");
}

await browser.close(); srv.close();
process.exitCode = (readyTab && makingTab && lotA && aged && savedAll) ? 0 : 1;
