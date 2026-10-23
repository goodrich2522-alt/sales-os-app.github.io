// scripts/e2e-cost-import.mjs — ด่าน "เติมราคาทุนจากไฟล์ ต้องแก้ของเดิม ไม่สร้างรถใหม่"
//
// ที่มา (23 ต.ค. 2569): เจ้าของกรอกราคาทุนในไฟล์แล้วอยากอัปกลับ
// ปุ่ม "อัปโหลดหลายคัน" เดิมใช้ไม่ได้ เพราะมันสร้างรถใหม่ (SN ซ้ำ → SN#2) = รถซ้ำทั้งชุด
// จึงทำเส้นทางแยก: ดาวน์โหลดรายการที่ทุนเป็น 0 → กรอก → อัปกลับ → เติมเฉพาะคันที่ทุนยังเป็น 0
//
// ตรวจ 3 ข้อ:
//   1) อัปไฟล์แล้วขึ้นกล่องยืนยันบอกจำนวนที่จะเติม
//   2) กดยืนยันแล้วยิง PATCH/POST ไปที่ของเดิม — ห้ามมีรหัสรถใหม่โผล่
//   3) คันที่มีทุนอยู่แล้วต้องไม่ถูกทับ
//
// รัน: npm run build แล้ว SB_URL=<supabase url> node scripts/e2e-cost-import.mjs
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

const BASE = "/sales-os-app.github.io";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".csv": "text/csv", ".txt": "text/plain", ".ico": "image/x-icon", ".png": "image/png", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
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
await new Promise(r => srv.listen(4333, r));

// 3 คัน: 2 คันทุนเป็น 0 (ต้องเติม) · 1 คันมีทุนแล้ว (ห้ามทับ)
const forklifts = [
  { id: "COST001", SN: "COST001", brand: "STAXX", model: "BF25 (685PD)-H", status: "พร้อมขาย", cost_price: 0, stock_price: 0, created_at: "2026-09-01", received_date: "2026-09-01", vehicle_category: "Handlift", pi_no: "PI900", custom_fields: {} },
  { id: "COST002", SN: "COST002", brand: "STAXX", model: "BF25 (685PD)-H", status: "พร้อมขาย", cost_price: 0, stock_price: 0, created_at: "2026-09-01", received_date: "2026-09-01", vehicle_category: "Handlift", pi_no: "PI900", custom_fields: {} },
  { id: "COST003", SN: "COST003", brand: "STAXX", model: "BF25 (685PD)-H", status: "พร้อมขาย", cost_price: 9999, stock_price: 0, created_at: "2026-09-01", received_date: "2026-09-01", vehicle_category: "Handlift", pi_no: "PI900", custom_fields: {} },
];

const writes = [];
const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext({ acceptDownloads: true });
const SB = new URL(process.env.SB_URL || "https://x.supabase.co").host;
const json = (r, b) => r.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": "0-0/*" }, body: JSON.stringify(b) });
await ctx.route("**://" + SB + "/**", async r => {
  const u = r.request().url(), m = r.request().method();
  if (u.includes("/auth/v1/")) return json(r, { id: "t", email: "t@t.com", aud: "authenticated", role: "authenticated", user: { id: "t", email: "t@t.com" } });
  if (u.includes("/rest/v1/forklifts") && m !== "GET") {
    try { const b = JSON.parse(r.request().postData() || "[]"); (Array.isArray(b) ? b : [b]).forEach(x => writes.push({ id: x.id, cost: x.cost_price })); } catch { /* ข้าม */ }
    return json(r, []);
  }
  if (u.includes("/rest/v1/forklifts")) return json(r, forklifts);
  return json(r, []);
});

const page = await ctx.newPage();
await page.goto("http://localhost:4333" + BASE + "/stock/login/", { waitUntil: "domcontentloaded" });
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
await page.goto("http://localhost:4333" + BASE + "/stock/main/", { waitUntil: "load" });
await page.waitForTimeout(3000);

// ไฟล์ที่ "กรอกทุนแล้ว" — COST003 ใส่มาด้วย เพื่อดูว่าโดนทับไหม
const dir = mkdtempSync(join(tmpdir(), "costimp-"));
const csv = join(dir, "cost.csv");
writeFileSync(csv, "﻿" + [
  "รหัสรถ_ห้ามแก้,SN,ยี่ห้อ,รุ่น,เลข PI,สถานะ,วันรับรถ,ราคาทุน_กรอกตรงนี้",
  "COST001,COST001,STAXX,BF25 (685PD)-H,PI900,พร้อมขาย,2026-09-01,6745",
  "COST002,COST002,STAXX,BF25 (685PD)-H,PI900,พร้อมขาย,2026-09-01,6745",
  "COST003,COST003,STAXX,BF25 (685PD)-H,PI900,พร้อมขาย,2026-09-01,1111",
].join("\n") + "\n", "utf8");

const tools = page.getByRole("button", { name: /เครื่องมือข้อมูล/ }).first();
if (await tools.count()) { await tools.click().catch(() => {}); await page.waitForTimeout(600); }
const input = page.locator('[data-testid="cost-input"]');
await input.setInputFiles(csv);
await page.waitForTimeout(1800);

const shown = await page.getByRole("button", { name: /เติมทุนให้ \d+ คัน/ }).count().catch(() => 0);
const says2 = await page.getByText("เติมทุนให้ 2 คัน", { exact: false }).count().catch(() => 0);
console.log("1) ขึ้นกล่องยืนยัน:", shown > 0 ? "✓ ขึ้นแล้ว" : "✗ ไม่ขึ้น");
console.log("2) นับจำนวนถูก (2 คัน ไม่ใช่ 3):", says2 > 0 ? "✓ ถูก — ข้ามคันที่มีทุนแล้ว" : "✗ ผิด");

if (says2 > 0) {
  await page.getByRole("button", { name: /เติมทุนให้ 2 คัน/ }).first().click();
  await page.waitForTimeout(1800);
}
const ids = [...new Set(writes.map(w => w.id))];
const newRows = ids.filter(i => !forklifts.some(f => f.id === i));
const overwrote = writes.some(w => w.id === "COST003" && Number(w.cost) === 1111);
console.log("3) รหัสรถที่ถูกเขียน:", ids.join(", ") || "(ไม่มี)");
console.log("4) สร้างรถใหม่ไหม:", newRows.length === 0 ? "✓ ไม่สร้าง" : "✗ สร้างใหม่ " + newRows.join(", "));
console.log("5) ทับทุนคันที่มีอยู่แล้วไหม:", overwrote ? "✗ ทับ!" : "✓ ไม่ทับ");

await browser.close(); srv.close();
process.exitCode = (shown > 0 && says2 > 0 && newRows.length === 0 && !overwrote && ids.length === 2) ? 0 : 1;
