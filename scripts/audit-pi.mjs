// scripts/audit-pi.mjs — ตรวจว่า PI ไหนอาจโดนบั๊ก "อ่านใบ PI ผิดรุ่น/ผิดจำนวน" (อ่านอย่างเดียว)
//
// บั๊ก (แก้แล้ว 12 ก.ย. 2569): parser เอา "รุ่นแรกของใบ" ไปใส่รถทุกคัน
// → ใบที่มีหลายรุ่นถูกบันทึกเป็นรุ่นเดียว จำนวนเพี้ยน (ดู QUOTE-IMPORT-RULES.md)
//
// สัญญาณที่ใช้ชี้เป้า:
//   1) กลุ่ม PI ที่มีรหัสชั่วคราว <PI>#N = ผ่านตัวอ่านเอกสารแน่นอน (ลำดับ #N ขาดช่วง = มีแถวถูกข้าม/ลบ)
//   2) เลข PI เป็นเลขใบผู้ผลิต (HCTH-/EPZL/NBPI) + ลงเป็น "รุ่นเดียวหลายคัน"
//   (PI แบบ PIxxx ของ HELI ส่วนใหญ่มาจากการนำเข้า Excel เฟส B — ไม่ผ่าน parser จึงไม่นับ)
//
// คีย์: อ่านจาก .env.local ในโฟลเดอร์โปรเจกต์ (ไม่ต้องส่งผ่านคำสั่ง)
//   NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY  (หรือ SUPABASE_URL / SUPABASE_KEY)
// RLS ปิดการอ่านตรงด้วย anon key → ตกไปใช้ RPC ผู้ขนส่งอัตโนมัติ (ได้รุ่น/SN/PI แต่ไม่มีราคาทุน)
// รัน: node scripts/audit-pi.mjs

import { readFileSync, existsSync } from "node:fs";

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
  console.error("ไม่พบคีย์ — สร้าง .env.local แล้วใส่ NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}
const root = BASE.replace(/\/+$/, "");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const getTable = async (t, q) => {
  const r = await fetch(`${root}/rest/v1/${t}?${q}`, { headers: H });
  if (!r.ok) throw new Error(`${t}: HTTP ${r.status}`);
  return r.json();
};
/** สำรองเมื่อ RLS ปิดการอ่านตรง — RPC ผู้ขนส่ง (anon เรียกได้ · ตัดราคาทุน/ลูกค้าออก) */
const getViaRpc = async () => {
  const r = await fetch(`${root}/rest/v1/rpc/transporter_stock`, {
    method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: "{}",
  });
  if (!r.ok) throw new Error(`RPC transporter_stock: HTTP ${r.status}`);
  return r.json();
};

const norm = (v) => String(v ?? "").trim();
const baht = (n) => (Number(n) || 0).toLocaleString("th-TH");
/** เลข PI ที่เป็น "เลขใบของผู้ผลิต" = มาจากตัวอ่านเอกสาร (ไม่ใช่ PIxxx ที่คนตั้งเองตอนนำเข้า Excel) */
const vendorDocPi = (pi) => /^(HCTH|EPZL|NBPI|HC|C\d)/i.test(pi);

let forklifts = [];
let viaRpc = false;
try {
  forklifts = await getTable("forklifts", "select=id,SN,brand,model,pi_no,status,cost_price,custom_fields&limit=5000");
} catch { /* RLS ปิด → ลองทาง RPC */ }
if (forklifts.length === 0) { forklifts = await getViaRpc(); viaRpc = true; }
if (forklifts.length === 0) {
  console.error("อ่านข้อมูลไม่ได้ทั้ง 2 ทาง — ต้องใช้ service role key (ตั้ง SUPABASE_KEY ใน .env.local)");
  process.exit(1);
}

const groups = new Map();
for (const f of forklifts) {
  const pi = norm(f.pi_no);
  if (!pi) continue;
  if (!groups.has(pi)) groups.set(pi, []);
  groups.get(pi).push(f);
}

const rows = [...groups.entries()].map(([pi, cars]) => {
  const byModel = new Map();
  for (const c of cars) {
    const m = norm(c.model) || "(ไม่ระบุรุ่น)";
    if (!byModel.has(m)) byModel.set(m, { n: 0, costs: new Set(), noSn: 0 });
    const e = byModel.get(m);
    e.n++;
    if (!norm(c.SN)) e.noSn++;
    e.costs.add(Number(c.cost_price) || 0);
  }
  // ลำดับรหัสชั่วคราว <PI>#N — มาจากตัวอ่านเอกสารแน่นอน · ขาดช่วง/ไม่เริ่มที่ 1 = มีแถวถูกข้ามหรือลบ
  const seq = cars.map((c) => Number(String(c.id).match(/#(\d+)$/)?.[1])).filter(Boolean).sort((a, b) => a - b);
  const gappy = seq.length > 0 && (seq[0] !== 1 || seq[seq.length - 1] - seq[0] + 1 !== seq.length);
  const oneModel = cars.length > 1 && byModel.size === 1;
  const tier = seq.length && oneModel ? "A" : vendorDocPi(pi) && oneModel ? "B" : null;
  return {
    pi, cars, byModel, seq, gappy, tier,
    brands: [...new Set(cars.map((c) => norm(c.brand)))],
    costSplit: !viaRpc && [...byModel.values()].some((e) => e.costs.size > 1),
  };
}).sort((a, b) => a.pi.localeCompare(b.pi));

const show = (r) => {
  console.log(`  ${r.pi}  [${r.brands.join("/")}]  รวม ${r.cars.length} คัน`);
  for (const [m, e] of r.byModel) {
    const cost = viaRpc ? "" : `  ทุน ${[...e.costs].map(baht).join(" / ")}`;
    console.log(`     ${m} × ${e.n}${e.noSn ? ` (ยังไม่มี SN ${e.noSn})` : ""}${cost}`);
  }
  if (r.seq.length) console.log(`     รหัสชั่วคราว: #${r.seq.join(", #")}${r.gappy ? "  ⚠️ ลำดับขาดช่วง/ไม่เริ่มที่ 1 — มีแถวถูกข้ามหรือลบตอนนำเข้า" : ""}`);
  if (r.costSplit) console.log("     ⚠️ ทุนไม่เท่ากันทั้งที่รุ่นเดียวกัน");
};

const A = rows.filter((r) => r.tier === "A");
const B = rows.filter((r) => r.tier === "B");
const C = rows.filter((r) => !r.tier && r.costSplit);

console.log(`\n📦 รถที่มีเลข PI: ${rows.reduce((n, r) => n + r.cars.length, 0)} คัน · ${rows.length} PI (ทั้งระบบ ${forklifts.length} คัน)`);
if (viaRpc) console.log("   (อ่านผ่าน RPC ผู้ขนส่ง เพราะ RLS ปิดการอ่านตรง — ไม่มีราคาทุนให้ตรวจ)");

console.log(`\n🔴 ระดับ A — ผ่านตัวอ่านเอกสารแน่นอน + ลงเป็นรุ่นเดียว (${A.length} ใบ) · ตรวจก่อน`);
A.length ? A.forEach(show) : console.log("  (ไม่มี)");

console.log(`\n🟠 ระดับ B — เลขใบผู้ผลิต + ลงเป็นรุ่นเดียวหลายคัน (${B.length} ใบ) · เทียบกับใบจริงด้วย`);
B.length ? B.forEach(show) : console.log("  (ไม่มี)");

if (C.length) {
  console.log(`\n🟡 อื่นๆ — ทุนไม่เท่ากันในรุ่นเดียวกัน (${C.length} ใบ)`);
  C.forEach(show);
}

console.log("\nวิธีตรวจ: เปิดใบ PI จริง เทียบจำนวนต่อรุ่นกับบรรทัดข้างบน — ไม่ตรงให้แก้ในหน้าสต็อก (ดู QUOTE-IMPORT-RULES.md)");
