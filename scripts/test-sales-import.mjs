// scripts/test-sales-import.mjs — ทดสอบตัวอ่าน "ใบขายย้อนหลัง" (lib/salesImport.ts)
//
// ใช้ข้อมูลสมมติ ไม่ใช่ไฟล์ลูกค้าจริง (ไฟล์บัญชีจริงมีชื่อลูกค้า ไม่เอาขึ้น git)
// จุดที่ต้องไม่พลาด:
//   1. วันที่แบบ 2 หลักกำกวม (1/6/69) → ตัดสินด้วยเดือนในเลขที่เอกสาร ไม่เดามั่ว
//   2. ใบ "ยกเลิก/ร่าง" ต้องไม่ถูกนับเป็นการขาย
//   3. ใบเดียวหลาย SN → เฉลี่ยยอดเท่ากัน
//   4. แถวซ้ำ (งวดผ่อน) → รวมเป็นใบเดียว เก็บยอดสูงสุด
//
// รัน: node scripts/test-sales-import.mjs   (คอมไพล์ TS ชั่วคราวก่อนด้วย tsc)

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = mkdtempSync(join(tmpdir(), "salesimport-"));
execFileSync("npx", ["tsc", "lib/salesImport.ts", "--outDir", out, "--module", "esnext",
  "--target", "es2022", "--moduleResolution", "bundler", "--skipLibCheck"], { shell: true, stdio: "inherit" });
renameSync(join(out, "salesImport.js"), join(out, "salesImport.mjs"));
const SI = await import("file:///" + join(out, "salesImport.mjs").replace(/\\/g, "/"));

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "  ผ่าน" : "  ไม่ผ่าน"}  ${name}${ok ? "" : `\n         ได้ ${JSON.stringify(got)}\n         ควรได้ ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
};

// ── 1. วันที่ ──
console.log("วันที่:");
eq("ISO พ.ศ.", SI.invoiceDate("2569-04-01"), "2026-04-01");
eq("วัน/เดือน/ปี ค.ศ.", SI.invoiceDate("04/06/2026"), "2026-06-04");
eq("วัน/เดือน/ปี พ.ศ.", SI.invoiceDate("18/09/2569"), "2026-09-18");
eq("2 หลัก + เลขที่เอกสารบอกเดือน 01 → เดือน/วัน", SI.invoiceDate("1/6/69", "CH6901-001"), "2026-01-06");
eq("2 หลัก วันเกิน 12 → วัน/เดือน", SI.invoiceDate("13/1/69", "CH6901-005"), "2026-01-13");
eq("2 หลัก ไม่มีตัวเทียบ ไม่เดา", SI.invoiceDate("1/6/69"), "");
eq("อ่านไม่ออก", SI.invoiceDate("ไม่ระบุ", "IV-690107008"), "");
eq("เลขที่เอกสารบอกปี/เดือน", SI.docHint("IV-690107008"), { year: 2026, month: 1 });

// ── 2. ดึง SN ──
console.log("SN:");
eq("SN เดียว", SI.snsFrom("HANGCHA CBD20-WS SN : M1BES02519"), ["M1BES02519"]);
eq("หลาย SN ในใบเดียว", SI.snsFrom("CBD20-WS SN : M1BDS00462,SN : M1BDS00463"), ["M1BDS00462", "M1BDS00463"]);
eq("มี EN ต่อท้าย ไม่เอามาด้วย", SI.snsFrom("HELI CPCD25 SN : 010253P5046 /EN : Q250873749H"), ["010253P5046"]);
eq("ไม่มี SN", SI.snsFrom("กรองน้ำมันเครื่อง,กรองอากาศ"), []);

// ── 3. อ่านทั้งชีต ──
console.log("อ่านชีต:");
const rows = [
  ["ชื่อรายงาน : รายงานใบเสร็จรับเงิน"],
  ["ลำดับ", "เลขที่เอกสาร", "วันที่ออก", "สถานะ", "ชื่อลูกค้า", "ชื่อสินค้า/บริการ", "ยอดก่อน VAT", "ทั้งหมด", "ประเภทงาน", "เซลล์ดูแล"],
  ["1", "IV-690107008", "07/01/2569", "รับชำระแล้ว", "ลูกค้า ก", "CBD20-WS SN : AAA11111", "28000", "29960", "งานขาย", "เซลล์ ก"],
  ["2", "IV-690108009", "08/01/2569", "รับชำระแล้ว", "ลูกค้า ข", "CBD20 SN : BBB22222,SN : CCC33333", "100000", "107000", "งานขาย", "เซลล์ ข"],
  ["", "IV-690108009", "", "", "", "", "40000", "42800", "", ""],          // งวดผ่อน — ต้องรวมเป็นใบเดียว
  ["3", "IV-690109010", "09/01/2569", "ยกเลิก", "ลูกค้า ค", "CDD12J SN : DDD44444", "0", "0", "งานขาย", "เซลล์ ก"],
  ["4", "IV-690110011", "10/01/2569", "ร่าง", "ลูกค้า ง", "CDD12J SN : EEE55555", "50000", "53500", "งานขาย", "เซลล์ ก"],
  ["5", "IV-690111012", "11/01/2569", "รับชำระแล้ว", "ลูกค้า จ", "กรองอากาศ", "2250", "2407", "งานซ่อม", "เซลล์ ค"],
];
const docs = SI.parseInvoiceSheet(rows, "รายงานใบเสร็จรับเงิน", "ทดสอบ.xlsx");
eq("จำนวนเอกสาร (งวดผ่อนรวมเป็นใบเดียว)", docs.length, 5);

const byDoc = Object.fromEntries(docs.map(d => [d.doc, d]));
eq("ใบผ่อน: เก็บยอดสูงสุด", byDoc["IV-690108009"].net, 100000);
eq("ใบผ่อน: SN ครบ 2 คัน", byDoc["IV-690108009"].sns, ["BBB22222", "CCC33333"]);
eq("อ่านวันที่", byDoc["IV-690107008"].date, "2026-01-07");
eq("อ่านชื่อเซลล์", byDoc["IV-690107008"].staff, "เซลล์ ก");
eq("อ่านชื่อลูกค้า", byDoc["IV-690107008"].customer, "ลูกค้า ก");

const live = docs.filter(d => d.sns.length && SI.SALE_KINDS.includes(d.kind) && SI.isLiveDoc(d));
eq("นับเป็นการขายจริง (ตัดยกเลิก/ร่าง/งานซ่อม)", live.map(d => d.doc), ["IV-690107008", "IV-690108009"]);
eq("SN ที่จะนำเข้า", live.flatMap(d => d.sns), ["AAA11111", "BBB22222", "CCC33333"]);
eq("เฉลี่ยยอดเมื่อใบเดียวขาย 2 คัน", Math.round(byDoc["IV-690108009"].net / 2), 50000);

// ── 4. ชีตบิลเงินสด (หัวคอลัมน์คนละชื่อ) ──
console.log("ชีตบิลเงินสด:");
const cash = SI.parseInvoiceSheet([
  ["GR ขายบิลเงินสด เดือนมกราคม 2569"],
  ["ลำดับ", "วันที่", "เลขที่", "บจก.", "รายการ", " จำนวนเงิน ", "ประเภทงาน", "เซลล์"],
  ["1", "1/6/69", "CH6901-001", "ลูกค้า ก", "HELI CPCD25 SN : FFF66666", " 265,000.00 ", "งานขาย", "เซลล์ ก"],
], "บิลเงินสด", "ทดสอบ2.xlsx");
eq("อ่านได้ 1 ใบ", cash.length, 1);
eq("วันที่กำกวมตัดสินถูก", cash[0].date, "2026-01-06");
eq("ยอดมีจุลภาค", cash[0].net, 265000);
eq("ไม่มีคอลัมน์สถานะ → ยังนับเป็นการขาย", SI.isLiveDoc(cash[0]), true);

rmSync(out, { recursive: true, force: true });
console.log(`\n${fail === 0 ? "ผ่านทั้งหมด" : "มีข้อผิดพลาด"} ${pass}/${pass + fail} ข้อ`);
process.exit(fail === 0 ? 0 : 1);
