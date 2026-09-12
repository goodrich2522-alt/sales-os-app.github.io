// scripts/test-quote-parsers.mjs — ทดสอบตัวอ่านใบ PI กับข้อความจากใบจริง
//
// กติกา (QUOTE-IMPORT-RULES.md): แก้ parser เมื่อไหร่ ต้องรันอันนี้ก่อน commit
// เช็ก: เลข PI · จำนวนรวม · จำนวน+ราคาทุนต่อรุ่น · SN · เสา · รถสั่งผลิต · ระยะเวลาส่งมอบ
//
// ใบตัวอย่างอยู่ที่ local-data/quote-samples/*.txt + local-data/quote-expected.json
// (เก็บนอก repo เพราะมีราคาทุน — เครื่องที่ไม่มีไฟล์จะข้ามการทดสอบ ไม่ error)
//
// รัน: node scripts/test-quote-parsers.mjs

import { readFileSync, readdirSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const SAMPLES = "local-data/quote-samples";
const EXPECTED = "local-data/quote-expected.json";
if (!existsSync(SAMPLES) || !existsSync(EXPECTED)) {
  console.log(`ข้ามการทดสอบ — ไม่มี ${SAMPLES} หรือ ${EXPECTED} ในเครื่องนี้`);
  console.log("(ไฟล์ตัวอย่างมีราคาทุน จึงไม่ขึ้น repo สาธารณะ — ขอจากเครื่องที่มีได้)");
  process.exit(0);
}

// parser เป็น TypeScript → คอมไพล์ลงโฟลเดอร์ชั่วคราวก่อนเรียกใช้ (ไม่ต้องลง dependency เพิ่ม)
const out = mkdtempSync(join(tmpdir(), "quoteparser-"));
const cleanup = () => rmSync(out, { recursive: true, force: true });
const req = createRequire(import.meta.url);
try {
  // เรียก tsc ตรงๆ ด้วย node (ไม่ผ่าน shell — เลี่ยงปัญหา quoting/คำเตือน deprecated)
  execFileSync(process.execPath, [req.resolve("typescript/bin/tsc"),
    "lib/quoteImport/hangcha.ts", "lib/quoteImport/heli.ts", "lib/quoteImport/hangchaTax.ts",
    "--outDir", out, "--module", "commonjs", "--target", "es2022", "--moduleResolution", "node", "--skipLibCheck"],
    { stdio: "pipe" });
} catch (e) {
  console.error("คอมไพล์ parser ไม่ผ่าน:\n" + String(e.stdout || e.message).slice(0, 1000));
  cleanup();
  process.exit(1);
}
const { parseHangcha } = req(join(out, "hangcha.js"));
const { parseHangchaTax } = req(join(out, "hangchaTax.js"));
const { parseHeli } = req(join(out, "heli.js"));

const expected = JSON.parse(readFileSync(EXPECTED, "utf8"));
const up = (v) => String(v ?? "").toUpperCase();
let pass = 0;
const fails = [];

for (const file of readdirSync(SAMPLES).filter((f) => f.endsWith(".txt")).sort()) {
  const name = file.replace(/\.txt$/, "");
  const exp = expected[name];
  if (!exp) { fails.push(`${name}: ไม่มีผลที่คาดไว้ใน ${EXPECTED}`); console.log(`  ?? ${name}`); continue; }

  const parser = exp.vendor === "HELI" ? parseHeli : exp.vendor === "HANGCHA-TAX" ? parseHangchaTax : parseHangcha;
  const r = parser(readFileSync(join(SAMPLES, file), "utf8"));
  const bad = [];

  if (r.pi_no !== exp.pi_no) bad.push(`เลข PI: ได้ "${r.pi_no}" คาด "${exp.pi_no}"`);

  // เคส "อ่านไม่ครบแต่ต้องเตือน" — ไฟล์ที่ข้อความเรียงสลับ ต้องไม่เดามั่ว ต้องติดธง + บอกยอดจริงจากใบ
  if (exp.degraded) {
    if (r.docCheck?.totalQty !== exp.degraded.docTotal)
      bad.push(`docCheck.totalQty: ได้ ${r.docCheck?.totalQty} คาด ${exp.degraded.docTotal} (ต้องรู้ยอดจริงจากใบเพื่อเตือน)`);
    if (!r.vehicles.every((v) => (v.flags ?? []).some((f) => f.includes(exp.degraded.flag))))
      bad.push(`ต้องติดธง "${exp.degraded.flag}" ทุกคัน`);
    if (r.vehicles.length >= exp.degraded.docTotal)
      bad.push("อ่านได้เท่า/เกินยอดในใบ — เคสนี้ต้องอ่านได้ไม่ครบ จึงจะทดสอบการเตือนได้");
    if (bad.length) { fails.push(`${name}\n      - ${bad.join("\n      - ")}`); console.log(`  ไม่ผ่าน  ${name}`); }
    else { pass++; console.log(`  ผ่าน     ${name} (เตือนถูกต้อง)`); }
    continue;
  }
  if (r.vehicles.length !== exp.total) bad.push(`จำนวนรวม: ได้ ${r.vehicles.length} คาด ${exp.total}`);
  if (r.docCheck && r.docCheck.totalQty !== exp.total) bad.push(`docCheck.totalQty: ได้ ${r.docCheck.totalQty} คาด ${exp.total}`);

  // จำนวน + ราคาทุนต่อรุ่น
  const got = new Map();
  for (const v of r.vehicles) {
    const k = up(v.model);
    if (!got.has(k)) got.set(k, { qty: 0, costs: new Set() });
    got.get(k).qty++;
    got.get(k).costs.add(v.cost_price);
  }
  for (const [model, e] of Object.entries(exp.models)) {
    const g = got.get(up(model));
    if (!g) { bad.push(`ไม่พบรุ่น ${model}`); continue; }
    if (g.qty !== e.qty) bad.push(`${model}: จำนวน ได้ ${g.qty} คาด ${e.qty}`);
    if (e.cost != null && !(g.costs.size === 1 && [...g.costs][0] === e.cost))
      bad.push(`${model}: ราคาทุน ได้ ${[...g.costs].join("/")} คาด ${e.cost}`);
  }
  for (const model of got.keys())
    if (!Object.keys(exp.models).some((m) => up(m) === model)) bad.push(`มีรุ่นเกินมา: ${model}`);

  // SN
  const gotSns = r.vehicles.map((v) => up(v.SN)).filter(Boolean).sort().join(",");
  const expSns = [...(exp.sns ?? [])].map(up).sort().join(",");
  if (gotSns !== expSns) bad.push(`SN: ได้ [${gotSns}] คาด [${expSns}]`);

  // ราคาทุนรายคัน (ใบที่รุ่นเดียวกันแต่คนละราคา) · เสา · รถสั่งผลิต · ระยะเวลาส่งมอบ
  if (exp.costs) {
    const c = r.vehicles.map((v) => v.cost_price).sort((a, b) => a - b).join(",");
    if (c !== [...exp.costs].sort((a, b) => a - b).join(",")) bad.push(`ราคาทุนรายคัน: ได้ [${c}] คาด [${exp.costs}]`);
  }
  if (exp.masts) {
    const m = r.vehicles.map((v) => String(v.mast ?? "")).sort().join(",");
    if (m !== [...exp.masts].sort().join(",")) bad.push(`เสา: ได้ [${m}] คาด [${exp.masts}]`);
  }
  if (exp.madeToOrder != null) {
    const n = r.vehicles.filter((v) => v.made_to_order).length;
    if (n !== exp.madeToOrder) bad.push(`รถสั่งผลิต: ได้ ${n} คาด ${exp.madeToOrder}`);
  }
  if (exp.invoice_no && r.invoice_no !== exp.invoice_no) bad.push(`เลขใบกำกับ: ได้ "${r.invoice_no}" คาด "${exp.invoice_no}"`);
  if (exp.receivedDate) {
    const d = [...new Set(r.vehicles.map((v) => v.received_date))];
    if (d.length !== 1 || d[0] !== exp.receivedDate) bad.push(`วันส่งรถ: ได้ [${d}] คาด ${exp.receivedDate}`);
  }
  if (exp.lead) {
    const l = r.vehicles.find((v) => v.lead_days)?.lead_days;
    if (!l || l.min !== exp.lead.min || l.max !== exp.lead.max)
      bad.push(`ระยะเวลาส่งมอบ: ได้ ${l ? `${l.min}-${l.max}` : "(ไม่พบ)"} คาด ${exp.lead.min}-${exp.lead.max}`);
  }

  if (bad.length) { fails.push(`${name}\n      - ${bad.join("\n      - ")}`); console.log(`  ไม่ผ่าน  ${name}`); }
  else { pass++; console.log(`  ผ่าน     ${name}`); }
}

cleanup();
console.log(`\nผ่าน ${pass}/${pass + fails.length} ใบ`);
if (fails.length) { console.error("\nรายละเอียดที่ไม่ผ่าน:\n   " + fails.join("\n   ")); process.exit(1); }
