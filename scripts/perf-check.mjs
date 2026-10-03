// scripts/perf-check.mjs — เปิดหน้าสต็อกจริงในเบราว์เซอร์ พร้อมข้อมูล "ขนาดเท่าของจริง"
//
// ที่มา (28 ก.ย. 2569): ผู้ใช้เข้าหน้าสต็อกไม่ได้ ขึ้นแค่ "This page couldn't load"
// เดาสาเหตุอยู่หลายรอบ จนต้องทำตัวนี้ขึ้นมาวัดจริง แล้วเจอว่า "รูปสลิป base64 ในใบขาย"
// ทำให้หน่วยความจำพุ่งจาก 20 MB เป็น 125 MB (ยิ่งสลิปเยอะยิ่งพุ่ง จนแท็บตาย)
//
// รัน: npm run build แล้ว node scripts/perf-check.mjs   (ใช้ Edge ที่ติดตั้งในเครื่อง)
// ปรับขนาดข้อมูล: N_FK=1138 N_SL=1350 N_INS=76 IMG_KB=30 PROOF_EVERY=20 PROOF_KB=800
//
// ⚠️ ไม่แตะฐานข้อมูลจริง — ดัก request ไป Supabase ทั้งหมดแล้วตอบข้อมูลปลอมเอง
// เกณฑ์ที่ควรผ่าน: หน่วยความจำนิ่ง (ไม่ไต่ขึ้นเรื่อย ๆ) และไม่เกิน ~100 MB
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const BASE = "/sales-os-app.github.io";
const ROOT = "out";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".ico": "image/x-icon", ".png": "image/png", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".txt": "text/plain" };
const srv = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.startsWith(BASE)) p = p.slice(BASE.length);
  let f = join(ROOT, p);
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
  if (!existsSync(f) && existsSync(f + ".html")) f += ".html";
  if (!existsSync(f)) { res.writeHead(404); res.end("nope"); return; }
  res.writeHead(200, { "Content-Type": TYPES[extname(f)] ?? "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise(r => srv.listen(4321, r));

const N_FK = Number(process.env.N_FK || 1138);
const N_SL = Number(process.env.N_SL || 1350);
const forklifts = Array.from({ length: N_FK }, (_, i) => ({
  id: "SN" + (100000 + i), SN: "SN" + (100000 + i), brand: ["HELI", "HANGCHA", "STAXX", "CNC"][i % 4],
  model: ["CBD20J-LI-S", "CDD15J-M300", "CPCD30-Q22K2", "BF25"][i % 4],
  status: i % 3 === 0 ? "พร้อมขาย" : "ปิดการขายแล้ว", capacity: "2.5 ตัน", height: "3 เมตร",
  fuel: "ไฟฟ้า", cost_price: 200000 + i, stock_price: 0, created_at: "2026-01-01",
  received_date: "2026-01-15", vehicle_category: "Forklift", pi_no: "PI" + (i % 140),
  custom_fields: { MAST: "M300", "รหัสอ้างอิงนำเข้า": "C2072620-" + i },
}));
const sales = Array.from({ length: N_SL }, (_, i) => ({
  id: "sale_" + i, forklift_id: "SN" + (100000 + i), forklift_unit_no: "SN" + (100000 + i),
  forklift_brand: "HELI", forklift_model: "CBD20J-LI-S", sales_staff: "เซลล์ " + (i % 8),
  customer_name: "ลูกค้า " + i, customer_tel: "", customer_type: "นิติบุคคล", province: "",
  payment_type: "เครดิต", actual_sale: 300000, deposit: 0, delivery_date: "2026-05-01",
  sale_status: "ปิดการขาย/จัดส่งแล้ว", sale_type: "รถขายเต็มคัน", created_at: "2026-05-01T00:00:00.000Z",
  custom_fields: {},
  // หลักฐานโอนเงินที่ยังเป็น base64 (อัปขึ้นที่เก็บไฟล์ไม่ได้เพราะไม่ได้ตั้งค่า GAS_URL)
  payment_proofs: i % Number(process.env.PROOF_EVERY || 999999) === 0
    ? ["data:image/jpeg;base64," + "B".repeat(Number(process.env.PROOF_KB || 800) * 1024)] : [],
}));

// ── ข้อมูลที่ "รูปร่างเหมือนของจริง" เพิ่มเติม — ไว้ลองเส้นทางที่ข้อมูลปลอมธรรมดาไม่แตะ ──
// รถสั่งผลิตที่ยังไม่มี SN (รหัสชั่วคราว PI#n) + ดีลที่ผูกกับรหัสนั้น
for (let i = 0; i < 6; i++) {
  forklifts.push({ id: "PI#" + i, SN: "", brand: "HELI", model: "CQD20-GB2SLI", status: i % 2 ? "สั่งผลิต" : "รอรับ",
    capacity: "2.0 ตัน", height: "", fuel: "ไฟฟ้า", cost_price: 0, stock_price: 0, created_at: "2026-07-08",
    received_date: "", vehicle_category: "Reach Truck", pi_no: "PI116KD", custom_fields: { "รถสั่งผลิต (KD)": "ใช่" } });
  sales.push({ id: "sale_kd_" + i, forklift_id: "PI#" + i, forklift_unit_no: "", forklift_brand: "HELI",
    forklift_model: "CQD20-GB2SLI", sales_staff: "เซลล์ KD", customer_name: "ลูกค้า KD " + i, customer_tel: "",
    customer_type: "นิติบุคคล", province: "", payment_type: "เครดิต", actual_sale: 500000, deposit: 50000,
    delivery_date: "", sale_status: "จอง/โอนมัดจำแล้ว", sale_type: "รถขายเต็มคัน", created_at: "2026-07-08T00:00:00.000Z",
    custom_fields: {} });
}
// รถที่รหัสยังเป็นรหัสชั่วคราวแต่มี SN แล้ว (เจอจริง 34 คัน)
for (let i = 0; i < 5; i++) {
  forklifts.push({ id: "PI124#" + i, SN: "08015JWK73" + i, brand: "HELI", model: "CBD15J-LI-S", status: "พร้อมขาย",
    capacity: "1.5 ตัน", height: "3 เมตร", fuel: "ไฟฟ้า", cost_price: 100000, stock_price: 0, created_at: "2026-09-01",
    received_date: "5 ก.ย. 2569", vehicle_category: "Electric Pallet Truck", pi_no: "PI124", custom_fields: {} });
}
// ดีลที่รออนุมัติสต็อก + บิลไฟแนนซ์ + ดีลวันที่เพี้ยน
sales.push({ id: "sale_pending", forklift_id: "SN100001", forklift_unit_no: "SN100001", forklift_brand: "HELI",
  forklift_model: "CBD20J-LI-S", sales_staff: "เซลล์ 1", customer_name: "ลูกค้ารออนุมัติ", customer_tel: "",
  customer_type: "นิติบุคคล", province: "", payment_type: "เครดิต", actual_sale: 300000, deposit: 0,
  delivery_date: "2026-09-01", sale_status: "จอง", sale_type: "รถขายเต็มคัน", created_at: "2026-09-01T00:00:00.000Z",
  custom_fields: { "อนุมัติสต็อก": "รออนุมัติ" } });
sales.push({ id: "sale_fin", forklift_id: "SN100002", forklift_unit_no: "SN100002", forklift_brand: "HELI",
  forklift_model: "CPCD30-Q22K2", sales_staff: "อภิชญา", customer_name: "ธนาคารทิสโก้ จำกัด (มหาชน) บจก.กู๊ด แอนด์ ริช เพาเวอร์พลัส",
  customer_tel: "", customer_type: "นิติบุคคล", province: "", payment_type: "เครดิต", actual_sale: 305000, deposit: 0,
  delivery_date: "2026-08-19", sale_status: "ปิดการขาย/จัดส่งแล้ว", sale_type: "รถขายเต็มคัน",
  created_at: "2026-08-19T00:00:00.000Z", payment_received_date: "1983-08-25", custom_fields: {} });
const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext();

// ── ดักทุก request ไป Supabase แล้วตอบข้อมูลปลอมเอง (ไม่แตะฐานข้อมูลจริง) ──
const SB_HOST = new URL(process.env.SB_URL || "https://x.supabase.co").host;
const bigImg = "data:image/jpeg;base64," + "A".repeat(Number(process.env.IMG_KB || 200) * 1024);
const inspections = Array.from({ length: Number(process.env.N_INS || 76) }, (_, i) => ({
  id: "ins_" + i, unit_no: "SN" + (100000 + i), transporter_name: "คนขับ " + i, date: "2026-05-01",
  images: [bigImg, bigImg], image_slots: { front: bigImg }, role: "ผู้รับรถ", deleted_at: null,
}));
const bytes = new Map();
const json = (route, body) => {
  const txt = JSON.stringify(body);
  const tag2 = (route.request().url().split("/rest/v1/")[1] || "other").split("?")[0];
  bytes.set(tag2, (bytes.get(tag2) || 0) + txt.length);
  return route.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": "0-0/*" }, body: txt });
};
const hits = new Map();
await ctx.route("**://" + SB_HOST + "/**", async route => {
  const u = route.request().url();
  const tag = (u.split("/rest/v1/")[1] || u.split("/auth/v1/")[1] || "other").split("?")[0];
  hits.set(tag, (hits.get(tag) || 0) + 1);
  if (hits.get(tag) <= 2 && tag === "forklifts") console.log("   REQ#" + hits.get(tag), u.slice(u.indexOf("/rest/v1/")), "| headers:", JSON.stringify(Object.keys(route.request().headers()).filter(k => /range|prefer/i.test(k)).map(k => k + "=" + route.request().headers()[k])));
  if (u.includes("/auth/v1/")) return json(route, { id: "test", email: "t@t.com", aud: "authenticated", role: "authenticated", user: { id: "test", email: "t@t.com" } });
  // เคารพ Range header เหมือน PostgREST จริง (ไม่งั้น fetchAllRows วนไม่รู้จบ)
  // เคารพ offset/limit เหมือน PostgREST จริง
  // เลียนแบบ PostgREST: เคารพทั้ง offset/limit และ select=คอลัมน์
  const page = (arr) => {
    const q = new URL(u).searchParams;
    const off = Number(q.get("offset") || 0), lim = Number(q.get("limit") || arr.length);
    const sel = (q.get("select") || "*").split(",").map(x => x.trim()).filter(Boolean);
    const rows = arr.slice(off, off + lim);
    if (sel.length === 1 && sel[0] === "*") return rows;
    return rows.map(r => Object.fromEntries(sel.filter(k => k in r).map(k => [k, r[k]])));
  };
  if (u.includes("/rest/v1/forklifts")) return json(route, page(forklifts));
  if (u.includes("/rest/v1/sales")) return json(route, page(sales));
  if (u.includes("/rest/v1/inspections")) return json(route, page(inspections));
  if (u.includes("/rest/v1/customers")) return json(route, []);
  if (u.includes("/rest/v1/app_config")) return json(route, { data: {} });
  if (u.includes("/rest/v1/rpc/")) return json(route, []);
  return json(route, []);
});

const page = await ctx.newPage();
const errs = [];
page.on("console", m => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 300)); });
page.on("pageerror", e => errs.push("pageerror: " + String(e).slice(0, 500)));
page.on("crash", () => errs.push("!!! renderer crash"));

await page.goto("http://localhost:4321" + BASE + "/stock/login/", { waitUntil: "domcontentloaded" });
await page.evaluate(([fk, sl, sbUrl]) => {
  localStorage.setItem("stock_user", JSON.stringify({ name: "ทดสอบ", email: "t@t.com" }));
  void fk; void sl;   // ไม่ต้องยัดลง localStorage — ให้โหลดจาก "เซิร์ฟเวอร์" ปลอมแทน (เหมือนของจริง)
  try {
    const ref = new URL(sbUrl).hostname.split(".")[0];
    const exp = Math.floor(Date.now() / 1000) + 86400;
    const b64 = o => btoa(JSON.stringify(o)).replace(/=+$/, "");
    const jwt = b64({ alg: "HS256", typ: "JWT" }) + "." + b64({ sub: "test", email: "t@t.com", exp, role: "authenticated" }) + ".x";
    localStorage.setItem("sb-" + ref + "-auth-token", JSON.stringify({
      access_token: jwt, refresh_token: "r", expires_at: exp, expires_in: 86400, token_type: "bearer",
      user: { id: "test", email: "t@t.com", aud: "authenticated", role: "authenticated" },
    }));
  } catch { /* ไม่ได้ก็ปล่อย */ }
}, [forklifts, sales, process.env.SB_URL || "https://x.supabase.co"]);

const t0 = Date.now();
let crashed = false;
try {
  await page.goto("http://localhost:4321" + BASE + "/stock/main/" + (process.env.QS || ""), { waitUntil: "load", timeout: 60000 });
  for (const t of [2, 5, 10, 20]) {
    await page.waitForTimeout(t === 2 ? 2000 : 3000 + (t === 20 ? 7000 : 0));
    const h = await page.evaluate(() => ({
      mb: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
      nodes: document.getElementsByTagName("*").length,
    })).catch(() => ({ mb: "แครช", nodes: 0 }));
    console.log("   ที่ " + t + " วิ: " + h.mb + " MB · element " + h.nodes);
  }
} catch (e) { crashed = true; errs.push("goto: " + String(e).slice(0, 300)); }
console.log("ข้อมูลทดสอบ: รถ", N_FK, "คัน · ดีล", N_SL, "ใบ");
console.log("ใช้เวลาโหลด:", ((Date.now() - t0) / 1000).toFixed(1), "วินาที");
try {
  const m = await page.evaluate(() => ({
    heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    nodes: document.getElementsByTagName("*").length,
    text: document.body.innerText.slice(0, 200).replace(/\s+/g, " "),
  }));
  console.log("หน่วยความจำ JS:", m.heap, "MB · element:", m.nodes);
  console.log("บนหน้า:", m.text);
} catch (e) { console.log("อ่านหน้าไม่ได้:", String(e).slice(0, 200)); crashed = true; }
// ── ทดสอบปุ่มกรอง: กดแล้วรายการต้องเปลี่ยนตามจริง (ไม่ใช่ค้างเป็น 0) ──
if (process.env.CLICK) {
  const shown = async () => (await page.getByText(/แสดง \d+ จาก/).first().textContent().catch(() => "?")) ?? "?";
  console.log("--- ทดสอบปุ่มกรอง ---");
  console.log("   ก่อนกด:", (await shown()).trim());
  for (const label of ["ยังไม่มีทุน", "ขายแล้วไม่มีใบขาย"]) {
    const b = page.locator("button", { hasText: label }).first();
    if (!(await b.count())) { console.log("   ไม่เจอปุ่ม", label); continue; }
    const before = (await shown()).trim();
    await b.click(); await page.waitForTimeout(400);
    const on = (await shown()).trim();
    await b.click(); await page.waitForTimeout(400);
    const off = (await shown()).trim();
    // ปุ่มกรองต้องทำให้รายการเปลี่ยนจริง — เคยพลาดเพราะลืมใส่ dependency แล้วรายการไม่คำนวณใหม่
    const ok = on !== before && off === before;
    console.log("   ปุ่ม " + label + ": " + before + " → " + on + " → " + off + (ok ? "  ✓ เปลี่ยนจริง" : "  ✗ ไม่เปลี่ยน"));
  }
}
// TAGCHECK — ป้ายชื่อเซลล์ในรายการสต็อกขึ้นไหม
if (process.env.TAGCHECK) {
  const info = await page.evaluate(() => {
    const tags = [...document.querySelectorAll("span[title]")].filter(e => (e.getAttribute("title") || "").includes("เซลล์เจ้าของงาน"));
    const warn = [...document.querySelectorAll("span")].filter(e => (e.textContent || "").includes("ดีลไม่มีชื่อเซลล์") || (e.textContent || "").includes("ไม่มีดีลผูก"));
    return { tags: tags.length, sample: tags.slice(0, 3).map(e => e.textContent.trim()), warn: warn.length };
  }).catch(e => ({ err: String(e).slice(0, 120) }));
  console.log("ป้ายเซลล์ที่เจอ:", info.tags, info.sample || "", "· ป้ายเตือน:", info.warn, info.err || "");
}
console.log("แครช:", crashed);
console.log("--- ขนาดข้อมูลที่ส่งให้เบราว์เซอร์ ---");
console.log([...bytes].map(([k, v]) => k + ": " + (v / 1048576).toFixed(1) + " MB").join(" · "));
console.log("--- จำนวน request ---");
console.log([...hits].map(([k, v]) => k + ": " + v).join(" · "));
console.log("--- error ---");
console.log(errs.length ? [...new Set(errs)].slice(0, 15).join("\n") : "(ไม่มี)");
await browser.close(); srv.close();
