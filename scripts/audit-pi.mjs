// scripts/audit-pi.mjs — ตรวจว่า PI ไหนอาจโดนบั๊ก "อ่านใบ PI ผิดรุ่น/ผิดจำนวน" (อ่านอย่างเดียว)
//
// บั๊ก (แก้แล้ว 12 ก.ย. 2569): parser เอา "รุ่นแรกของใบ" ไปใส่รถทุกคัน
// → ใบที่มีหลายรุ่นถูกบันทึกเป็นรุ่นเดียว จำนวนเพี้ยน (ดู QUOTE-IMPORT-RULES.md)
// สคริปต์นี้ไล่ดูรถที่นำเข้าจากใบเสนอราคา แล้วชี้ PI ที่ "น่าสงสัย" ให้คนไปเทียบกับใบจริง
//
// คีย์: อ่านจาก .env.local ในโฟลเดอร์โปรเจกต์ (ไม่ต้องส่งผ่านคำสั่ง)
//   NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY  (หรือ SUPABASE_URL / SUPABASE_KEY)
// รัน: node scripts/audit-pi.mjs

import { readFileSync, existsSync } from "node:fs";

// ── โหลด .env.local (ถ้ามี) เข้า process.env ──
for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const BASE = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!BASE || !KEY) {
  console.error("ไม่พบคีย์ — สร้างไฟล์ .env.local ในโฟลเดอร์โปรเจกต์แล้วใส่:");
  console.error("  NEXT_PUBLIC_SUPABASE_URL=...");
  console.error("  NEXT_PUBLIC_SUPABASE_ANON_KEY=...   (หรือ SUPABASE_KEY=<service role key> ถ้า RLS ปิดการอ่าน)");
  process.exit(1);
}

const get = async (table, query) => {
  const res = await fetch(`${BASE.replace(/\/$/, "")}/rest/v1/${table}?${query}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
};

const norm = (v) => String(v ?? "").trim();
const baht = (n) => (Number(n) || 0).toLocaleString("th-TH");

let forklifts;
try {
  forklifts = await get("forklifts", "select=id,SN,brand,model,pi_no,status,cost_price,created_at,custom_fields&limit=5000");
} catch (e) {
  console.error("อ่านข้อมูลไม่ได้:", e.message);
  console.error("ถ้าเป็น HTTP 401/0 แถว = RLS ปิดการอ่านด้วย anon key → ต้องใช้ service role key (ตั้ง SUPABASE_KEY ใน .env.local)");
  process.exit(1);
}
if (forklifts.length === 0) {
  console.error("อ่านได้ 0 แถว — anon key ถูก RLS ปิดอยู่ ต้องใช้ service role key");
  process.exit(1);
}

// เฉพาะรถที่นำเข้าจากใบเสนอราคา (ที่เสี่ยงโดนบั๊ก) · ไม่มี pi_no ก็ข้าม
const imported = forklifts.filter((f) => norm(f.custom_fields?.["ชีตต้นทาง"]) === "ใบเสนอราคา" && norm(f.pi_no));

const groups = new Map();
for (const f of imported) {
  const pi = norm(f.pi_no);
  if (!groups.has(pi)) groups.set(pi, []);
  groups.get(pi).push(f);
}

const rows = [...groups.entries()].map(([pi, cars]) => {
  const byModel = new Map();
  for (const c of cars) {
    const m = norm(c.model) || "(ไม่ระบุรุ่น)";
    if (!byModel.has(m)) byModel.set(m, { n: 0, costs: new Set() });
    const e = byModel.get(m);
    e.n++; e.costs.add(Number(c.cost_price) || 0);
  }
  const brands = [...new Set(cars.map((c) => norm(c.brand)))];
  // 🚩 เสี่ยง: ใบจากผู้ผลิตที่เคยมีบั๊ก + ลงเป็น "รุ่นเดียว" หลายคัน → ต้องเทียบกับใบจริงว่ามีรุ่นที่ 2 ไหม
  const risky = cars.length > 1 && byModel.size === 1 && brands.some((b) => /HANGCHA|HELI/i.test(b));
  // 🚩 ทุนไม่เท่ากันทั้งที่รุ่นเดียวกัน = ข้อมูลไม่สม่ำเสมอ
  const costSplit = [...byModel.values()].some((e) => e.costs.size > 1);
  return { pi, cars, byModel, brands, risky, costSplit, date: cars.map((c) => norm(c.created_at)).sort()[0] };
}).sort((a, b) => String(b.date).localeCompare(String(a.date)));

const flagged = rows.filter((r) => r.risky || r.costSplit);

console.log(`\n📦 รถที่นำเข้าจากใบเสนอราคา: ${imported.length} คัน · ${groups.size} PI (จากทั้งหมด ${forklifts.length} คันในระบบ)\n`);
console.log(`🚩 PI ที่ควรเทียบกับใบจริง: ${flagged.length} ใบ\n`);

const show = (r) => {
  const tags = [r.risky ? "รุ่นเดียวหลายคัน — เช็กว่าใบมีรุ่นที่ 2 ไหม" : "", r.costSplit ? "ทุนไม่เท่ากันในรุ่นเดียวกัน" : ""].filter(Boolean);
  console.log(`  ${r.risky || r.costSplit ? "🚩" : "  "} ${r.pi}  [${r.brands.join("/")}]  รวม ${r.cars.length} คัน  (นำเข้า ${r.date.slice(0, 10)})`);
  for (const [m, e] of r.byModel) console.log(`        ${m} × ${e.n}  ทุน ${[...e.costs].map(baht).join(" / ")}`);
  if (tags.length) console.log(`        ⚠️ ${tags.join(" · ")}`);
};

flagged.forEach(show);
console.log(`\n── PI อื่นทั้งหมด (${rows.length - flagged.length} ใบ) ──`);
rows.filter((r) => !r.risky && !r.costSplit).forEach(show);
console.log("\nวิธีตรวจ: เปิดใบ PI จริงเทียบจำนวนต่อรุ่นกับบรรทัดข้างบน — ไม่ตรงให้แก้ในหน้าสต็อก (ดู QUOTE-IMPORT-RULES.md)");
