// scripts/audit-sn.mjs — หา SN ที่ "น่าจะพิมพ์ผิด/OCR ผิด" ในสต็อก (อ่านอย่างเดียว)
//
// ที่มา (12 ก.ย. 2569): ใบกำกับภาษี TR202605-109 ระบุ SN M1BFS00963
// แต่ในระบบเป็น M1BFS009633 — เกินเลข 3 มา 1 ตัว → กลายเป็นรถคนละคัน หาไม่เจอ
//
// ⚠️ เทียบ SN ทีละคู่ไม่ได้ผล — SN ในล็อตเดียวกันเรียงเลขติดกันอยู่แล้ว
//    (08020JVY900...909 · 66069-1...66069-12 = รถคนละคันจริง ไม่ใช่พิมพ์ผิด)
//
// วิธีที่ใช้: **ดูความยาวเทียบกับพวกเดียวกัน**
//    SN ของผู้ผลิตเดียวกันมีรูปแบบคงที่ เช่น M1B?S + เลข 5 หลัก
//    ตัวที่ยาว/สั้นผิดจากพวก = น่าจะพิมพ์เกิน/ขาด (M1BFS009633 มี 6 หลัก ในขณะที่พวกเดียวกันมี 5)
// เสริม: คู่ที่ต่างกันแค่ตัวอักษรที่ OCR สับสนบ่อย (0↔O · 1↔I · 5↔S · 8↔B · 2↔Z · 6↔G)
//
// คีย์: อ่านจาก .env.local (เหมือน audit-pi.mjs) · RLS ปิด → ใช้ RPC ผู้ขนส่งอัตโนมัติ
// รัน: node scripts/audit-sn.mjs

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
if (!BASE || !KEY) { console.error("ไม่พบคีย์ — สร้าง .env.local ก่อน (ดู audit-pi.mjs)"); process.exit(1); }
const root = BASE.replace(/\/+$/, "");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

let rows = [];
try {
  const r = await fetch(`${root}/rest/v1/forklifts?select=id,SN,brand,model,pi_no,status&limit=5000`, { headers: H });
  if (r.ok) rows = await r.json();
} catch { /* RLS ปิด */ }
if (rows.length === 0) {
  const r = await fetch(`${root}/rest/v1/rpc/transporter_stock`, {
    method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: "{}",
  });
  if (!r.ok) { console.error(`อ่านข้อมูลไม่ได้: HTTP ${r.status}`); process.exit(1); }
  rows = await r.json();
}

const cars = rows
  .map((r) => ({ ...r, sn: String(r.SN ?? "").trim().toUpperCase() }))
  .filter((c) => c.sn.length >= 5);

// ── แยก SN เป็น "หัว (รูปแบบผู้ผลิต)" + "เลขลำดับท้าย" ──
const split = (sn) => {
  const m = /^(.*?)(\d+)$/.exec(sn);
  return m && m[1] ? { head: m[1], tail: m[2] } : null;
};

const fams = new Map();
for (const c of cars) {
  const s = split(c.sn);
  if (!s) continue;
  if (!fams.has(s.head)) fams.set(s.head, []);
  fams.get(s.head).push({ ...c, ...s });
}

const allSns = new Set(cars.map((c) => c.sn));

const odd = [];
for (const [head, members] of fams) {
  if (members.length < 4) continue;                 // กลุ่มเล็กเกินไป ตัดสินไม่ได้
  // หัวลงท้ายด้วยขีด/จุด = "เลขลำดับล็อต" ธรรมดา (66070-1 ... 66070-12) ความยาวไม่คงที่เป็นปกติ
  if (/[-._/]$/.test(head)) continue;
  const count = new Map();
  for (const m of members) count.set(m.tail.length, (count.get(m.tail.length) ?? 0) + 1);
  const [modeLen, modeN] = [...count].sort((a, b) => b[1] - a[1])[0];
  if (modeN / members.length < 0.6) continue;       // กลุ่มนี้ความยาวไม่คงที่อยู่แล้ว → ข้าม
  for (const m of members)
    if (m.tail.length !== modeLen) {
      // สั้นไป → เดาว่าตก 0 นำหน้า (เจอบ่อยเวลาข้อมูลผ่าน Excel) · เช็กว่ารูปที่เติม 0 ชนกับคันอื่นไหม
      const padded = m.tail.length < modeLen ? head + m.tail.padStart(modeLen, "0") : null;
      odd.push({
        ...m, head, modeLen, famSize: members.length,
        guess: m.tail.length > modeLen ? "ยาวเกิน" : "สั้นไป",
        padded, paddedExists: padded ? allSns.has(padded) : false,
      });
    }
}

// ── คู่ที่ต่างกันแค่ตัวอักษรที่ OCR/คนพิมพ์สับสนบ่อย (ความยาวเท่ากัน) ──
const CONFUSABLE = new Map(Object.entries({
  "0": "O", "O": "0", "1": "I", "I": "1", "L": "1", "5": "S", "S": "5",
  "8": "B", "B": "8", "2": "Z", "Z": "2", "6": "G", "G": "6",
}));
const confusePairs = [];
const bySameLen = new Map();
for (const c of cars) {
  const k = `${c.sn.length}|${c.sn.slice(0, 3)}`;
  if (!bySameLen.has(k)) bySameLen.set(k, []);
  bySameLen.get(k).push(c);
}
for (const group of bySameLen.values())
  for (let i = 0; i < group.length; i++)
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i].sn, b = group[j].sn;
      let at = -1, ok = true;
      for (let k = 0; k < a.length; k++) {
        if (a[k] === b[k]) continue;
        if (at >= 0) { ok = false; break; }
        at = k;
      }
      if (!ok || at < 0) continue;
      if (CONFUSABLE.get(a[at]) === b[at]) confusePairs.push({ a: group[i], b: group[j], at, from: a[at], to: b[at] });
    }

// ── SN ซ้ำเป๊ะ ──
const dup = new Map();
for (const c of cars) { if (!dup.has(c.sn)) dup.set(c.sn, []); dup.get(c.sn).push(c); }
const dups = [...dup].filter(([, v]) => v.length > 1);

const line = (c) => `${String(c.sn).padEnd(14)} ${String(c.model ?? "-").padEnd(18)} PI ${String(c.pi_no ?? "-").padEnd(24)} ${c.status ?? ""}`;

console.log(`\n🔎 ตรวจ SN ${cars.length} คัน · ${fams.size} รูปแบบ\n`);

console.log(`🔴 SN ที่ความยาวผิดจากพวกเดียวกัน (${odd.length} คัน) — น่าจะพิมพ์เกิน/ขาด`);
if (!odd.length) console.log("   ไม่พบ ✓");
for (const o of odd.sort((a, b) => b.famSize - a.famSize)) {
  console.log(`   ${line(o)}`);
  console.log(`      เลขท้าย ${o.tail.length} หลัก (${o.guess}) · พวก "${o.head}*" อีก ${o.famSize - 1} คันใช้ ${o.modeLen} หลัก`);
  if (o.padded) console.log(`      💡 น่าจะตก 0 นำหน้า → ${o.padded}${o.paddedExists ? "  ⛔ มีคันนี้อยู่แล้ว = รถซ้ำ!" : ""}`);
}

console.log(`\n🟠 คู่ที่ต่างกันแค่ตัวอักษรที่สับสนบ่อย (${confusePairs.length} คู่)`);
if (!confusePairs.length) console.log("   ไม่พบ ✓");
for (const c of confusePairs)
  console.log(`   ${c.a.sn} ↔ ${c.b.sn}  (ตำแหน่งที่ ${c.at + 1}: ${c.from}↔${c.to})\n      ${line(c.a)}\n      ${line(c.b)}`);

console.log(`\n🟡 SN ซ้ำเป๊ะ (${dups.length} กลุ่ม)`);
if (!dups.length) console.log("   ไม่พบ ✓");
for (const [sn, v] of dups) console.log(`   ${sn} — ${v.length} คัน: ${v.map((c) => c.id).join(", ")}`);

console.log("\nวิธีตรวจ: เทียบกับ SN บนตัวรถ / ใบกำกับภาษี — ผิดให้แก้ในหน้าสต็อก");
console.log('(SN ที่ผู้ผลิตใส่ซ้ำจริง ให้ติดป้าย custom_fields["หมายเหตุ SN"] ดู SN-RULES.md ข้อ 5.ก)');
