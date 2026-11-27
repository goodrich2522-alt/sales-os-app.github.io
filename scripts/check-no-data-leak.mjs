// scripts/check-no-data-leak.mjs — repo นี้เป็น public: ห้ามมีข้อมูลธุรกิจจริงอยู่ในไฟล์ที่ track
//
// ที่มา (27 พ.ย. 2569): .gitignore กันแต่ไฟล์เอกสาร (.xlsx .pdf .csv) แต่ไม่ได้กัน .sql
// ไฟล์ SQL ที่เขียนไว้แก้ข้อมูลจึงถูก commit ขึ้น repo สาธารณะไปโดยไม่มีใครทักเลย 3 ไฟล์:
//   · supabase-fill-handlift-cost.sql          → ราคาทุนจริง 10 รุ่น
//   · supabase-fix-commission-sep-2026-10-28   → ชื่อบริษัทลูกค้าจริง 2 ราย
//   · supabase-add-admin-2026-09-24.sql        → อีเมลแอดมิน
// ย้ายออกแล้ว + เพิ่ม *.sql ใน .gitignore — ด่านนี้กันไม่ให้พลาดซ้ำ
// (.gitignore กันได้แค่ไฟล์ "ใหม่" — ถ้ามีคน git add -f หรือแก้ไฟล์เก่าที่ track อยู่ จะหลุดอีก)
//
// รัน: node scripts/check-no-data-leak.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n").map(s => s.trim()).filter(Boolean)
  .filter(f => !/^(out|public\/fleet|node_modules)\//.test(f));

const bad = [];
const hit = (file, line, what, why) => bad.push({ file, line, what, why });

// ── 1) ไฟล์เอกสารที่มีข้อมูลลูกค้า/ราคาทุน ห้าม track ─────────────────────
for (const f of tracked) {
  if (/\.(xlsx|xls|csv|pdf)$/i.test(f)) hit(f, 0, f, "ไฟล์เอกสารมีข้อมูลลูกค้า/ราคาทุน — ต้องอยู่นอก repo");
}

// ── 2) ไฟล์ .sql ที่ track ต้องเป็นสคีมา/สิทธิ์/คำสั่งอ่าน เท่านั้น ─────────
// (คำสั่งที่ "เขียนค่าจริงลงไป" = ค่านั้นถูกเปิดเผยพร้อมไฟล์)
const RULES = [
  { re: /\bset\s+(cost_price|stock_price)\s*=\s*\d{3,}/i, why: "ราคาทุน/ราคาขายจริง — คู่แข่งอ่านได้" },
  { re: /\bset\s+customer_name\s*=\s*'[^']+'/i, why: "ชื่อลูกค้าจริง" },
  { re: /\bset\s+name\s*=\s*'[^']*บริษัท[^']*'/i, why: "ชื่อบริษัทลูกค้าจริง" },
  // อีเมลจริง (ยอมให้ <อีเมลแอดมิน> หรือ example.com ที่เป็นตัวแทน)
  { re: /[a-zA-Z0-9._%-]+@(?!example\.)[a-zA-Z0-9.-]+\.(com|co\.th|net|org)/i, why: "อีเมลจริง — บอกใบ้ว่าต้องไปเจาะบัญชีไหน" },
];
for (const f of tracked.filter(x => /\.sql$/i.test(x))) {
  const lines = readFileSync(f, "utf8").split("\n");
  lines.forEach((ln, i) => {
    if (/^\s*--/.test(ln)) return;                      // บรรทัดคอมเมนต์ ไม่ใช่คำสั่งที่รัน
    for (const r of RULES) {
      const m = r.re.exec(ln);
      if (m) hit(f, i + 1, m[0].slice(0, 70), r.why);
    }
  });
}

if (bad.length === 0) {
  console.log(`ผ่านทั้งหมด ${tracked.length}/${tracked.length} ไฟล์ — ไม่มีข้อมูลธุรกิจจริงใน repo สาธารณะ`);
  process.exit(0);
}
console.log("✗ เจอข้อมูลจริงในไฟล์ที่ขึ้น repo สาธารณะ:\n");
for (const b of bad) console.log(`  ${b.file}${b.line ? ":" + b.line : ""}\n    ${b.what}\n    → ${b.why}\n`);
console.log("วิธีแก้: ย้ายไฟล์ไป C:\\Users\\Ace\\Downloads\\ แล้ว git rm --cached <ไฟล์>");
console.log("        หรือแทนค่าจริงด้วยตัวยึด เช่น <อีเมลแอดมิน> / <ชื่อลูกค้า>");
process.exit(1);
