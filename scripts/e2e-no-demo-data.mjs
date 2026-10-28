// scripts/e2e-no-demo-data.mjs — ด่าน "ห้ามโชว์ข้อมูลสาธิตเมื่อต่อฐานข้อมูลจริง"
//
// ที่มา (28 ต.ค. 2569): หน้าค่าคอมขึ้นเดือน "ส.ค. 2567 … ม.ค. 2567"
// ผู้ใช้เข้าใจว่าข้อมูลจริงไม่อัปเดต — ที่จริงคือข้อมูลจริงยังไม่มา
// แล้วแอปโชว์ข้อมูลสาธิตใน lib/mockData.ts แทนโดยไม่บอก (ปี 2024 = 2567)
// หน้าแดชบอร์ดก็เคยขึ้น "สมชาย ใจดี ฿12.37 ล." ด้วยเหตุเดียวกัน
//
// ของปลอมที่ดูเหมือนจริงอันตรายกว่าจอว่าง — ตัดสินใจผิดได้
//
// ด่านนี้ต่อฐานข้อมูล (จำลอง) ที่ตอบกลับว่าง แล้วตรวจว่าไม่มีชื่อ/ปีของข้อมูลสาธิตโผล่
//
// รัน: npm run build แล้ว SB_URL=<supabase url> node scripts/e2e-no-demo-data.mjs
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
await new Promise(r => srv.listen(4336, r));

const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext();
const SB = new URL(process.env.SB_URL || "https://x.supabase.co").host;
const json = (r, b) => r.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": "0-0/*" }, body: JSON.stringify(b) });
// ⚠️ ต้องทำให้ "โหลดข้อมูลล้มเหลว" ไม่ใช่ตอบว่าง
//    ตอบว่าง = bootstrap สำเร็จ แล้วเขียนทับด้วย [] ซึ่งไม่เกิดอาการ
//    ล้มเหลวต่างหากที่ทำให้แอปถอยไปใช้ข้อมูลในเครื่อง → ไม่มีแคช → โผล่ข้อมูลสาธิต
await ctx.route("**://" + SB + "/**", r => {
  const u = r.request().url();
  if (u.includes("/auth/v1/")) return json(r, { id: "t", email: "t@t.com", aud: "authenticated", role: "authenticated", user: { id: "t", email: "t@t.com" } });
  if (u.includes("/rpc/my_access")) return json(r, { user: { email: "t@t.com", role: "stock", status: "approved" }, is_admin: true });
  if (u.includes("/rest/v1/")) {
    return r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "จำลองโหลดข้อมูลล้มเหลว" }) });
  }
  return json(r, []);
});

const page = await ctx.newPage();
await page.goto("http://localhost:4336" + BASE + "/stock/login/", { waitUntil: "domcontentloaded" });
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

// ชื่อ/ค่าที่มีเฉพาะในข้อมูลสาธิต (lib/mockData.ts)
const DEMO = ["สมชาย ใจดี", "สมหญิง รักดี", "วิชัย แข็งแรง", "นภา สดใส", "เอกชัย มุ่งมั่น", "KOM-006", "HEL-H01", "MIT-H04", "2567"];
let bad = [];
for (const path of ["/stock/main/", "/dashboard/commission/", "/dashboard/"]) {
  await page.goto("http://localhost:4336" + BASE + path, { waitUntil: "load" });
  await page.waitForTimeout(5000);
  const txt = await page.evaluate(() => document.body.innerText);
  const hit = DEMO.filter(d => txt.includes(d));
  console.log(path.padEnd(26) + (hit.length ? "✗ เจอข้อมูลสาธิต: " + hit.join(", ") : "✓ ไม่มีข้อมูลสาธิต"));
  if (hit.length) bad.push(path + " → " + hit.join(", "));
}

console.log(bad.length === 0
  ? "\n✓ ไม่มีข้อมูลสาธิตโผล่เลย — ข้อมูลจริงไม่มาก็ขึ้นว่าง ไม่หลอกตา"
  : "\n✗ ยังมีข้อมูลสาธิตโผล่ " + bad.length + " หน้า");

await browser.close(); srv.close();
process.exitCode = bad.length === 0 ? 0 : 1;
