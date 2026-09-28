// scripts/check-columns.mjs — ตรวจว่าชื่อคอลัมน์ที่โค้ดขอ มีอยู่จริงในตารางไหม
//
// ที่มา (28 ก.ย. 2569): เปลี่ยนมาเลือกคอลัมน์เองเพื่อไม่ดึงรูปสลิป แต่ใส่ชื่อที่ไม่มีจริงไป 3 ตัว
// (add_ons / freebie / shipping_cost — ของพวกนี้เก็บใน custom_fields ไม่ใช่คอลัมน์)
// PostgREST ตอบ 400 ทั้งคำขอ → ใบขายไม่โหลดเลยทั้งระบบ และไม่มีอะไรฟ้องให้รู้
//
// รัน: node scripts/check-columns.mjs     (ใช้คีย์จาก .env.local · อ่านอย่างเดียว)
import { readFileSync, existsSync } from "node:fs";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const root = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!root || !KEY) { console.error("ไม่พบคีย์ใน .env.local"); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

// ดึงรายชื่อคอลัมน์ที่โค้ดขอ ออกมาจาก lib/api.ts โดยตรง (จะได้ไม่ต้องมาคอยก๊อปตาม)
const api = readFileSync("lib/api.ts", "utf8");
const block = /const SALE_COLUMNS = \[([\s\S]*?)\]\.join/.exec(api);
if (!block) { console.error("หา SALE_COLUMNS ใน lib/api.ts ไม่เจอ"); process.exit(1); }
const cols = [...block[1].matchAll(/"([a-z_]+)"/g)].map(m => m[1]);

let bad = 0;
const r = await fetch(`${root}/rest/v1/sales?select=${cols.join(",")}&limit=1`, { headers: H });
if (r.ok) {
  console.log(`sales: ขอ ${cols.length} คอลัมน์ — ✓ มีครบทุกตัว`);
} else {
  console.log(`sales: ✗ ${(await r.text()).slice(0, 160)}`);
  for (const c of cols) {
    const rr = await fetch(`${root}/rest/v1/sales?select=${c}&limit=1`, { headers: H });
    if (!rr.ok) { console.log(`   ไม่มีคอลัมน์: ${c}`); bad++; }
  }
}
process.exitCode = (bad === 0 && r.ok) ? 0 : 1;
