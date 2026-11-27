// scripts/test-warranty-autofill.mjs — กติกา "ปิดดีลแล้วระบบเติมข้อมูลรับประกันให้เอง"
//
// ที่มา (27 พ.ย. 2569 · ผู้ใช้เลือก "ทางสายกลาง"):
// ด่านรับประกันทำให้มีดีลค้าง 32 ใบ ค่าคอมไม่ออก ต้องไล่ตามเซลล์ทีละคน
// ทั้งที่ข้อมูลส่วนใหญ่คำนวณได้อยู่แล้ว — บังคับให้คนพิมพ์ซ้ำคือความสูญเปล่า
//
// ทางสายกลาง = เติมให้เฉพาะส่วนที่ "แน่" · ส่วนที่ต้องใช้คนตัดสินใจ ด่านยังเตือนเหมือนเดิม
// ด่านนี้ล็อกเส้นแบ่งนั้นไว้ ไม่ให้ใครเผลอขยายจนระบบเดาเอาเองทั้งหมด
//
// รัน: node scripts/test-warranty-autofill.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const out = mkdtempSync(join(tmpdir(), "warrantyfill-"));
const cleanup = () => rmSync(out, { recursive: true, force: true });
const req = createRequire(import.meta.url);
try {
  execFileSync(process.execPath, [req.resolve("typescript/bin/tsc"),
    "lib/commission.ts",
    "--outDir", out, "--module", "commonjs", "--target", "es2022", "--moduleResolution", "node", "--skipLibCheck"],
    { stdio: "pipe" });
} catch (e) {
  console.error("คอมไพล์ lib/commission.ts ไม่ผ่าน:\n" + String(e.stdout || e.message).slice(0, 1000));
  cleanup();
  process.exit(1);
}
const { autoFillWarranty } = req(join(out, "commission.js"));
const { parseSvc, isSystemFilled, DEFAULT_WARRANTY, HYDRAULIC_WARRANTY, SVC_FIELD } = req(join(out, "warranty.js"));

const fk = (over = {}) => ({
  id: "SN1", SN: "SN1", brand: "HELI", model: "CPCD30-Q22K2", capacity: "3", height: "4",
  fuel: "ดีเซล", cost_price: 300000, stock_price: 0, status: "ปิดการขายแล้ว",
  created_at: "2026-10-01", vehicle_category: "Forklift", custom_fields: {}, ...over,
});
const sale = (over = {}) => ({
  id: "s1", forklift_id: "SN1", forklift_unit_no: "SN1", forklift_brand: "HELI",
  forklift_model: "CPCD30-Q22K2", sales_staff: "เซลล์ ก", customer_name: "ลูกค้า",
  actual_sale: 500000, deposit: 0, delivery_date: "2026-10-15",
  sale_status: "ปิดการขาย/จัดส่งแล้ว", created_at: "2026-10-15T00:00:00.000Z",
  custom_fields: {}, ...over,
});
const svcOf = (f) => (f ? parseSvc(f) : null);

const cases = [];
const check = (name, ok, why = "") => cases.push([name, !!ok, why]);

// ── ควรเติม ────────────────────────────────────────────────────────────────
const r1 = autoFillWarranty(fk(), sale());
check("1) ดีลปิดแล้ว + มีวันส่งมอบ + หมวดโฟล์คลิฟท์ → เติมให้",
  r1 && svcOf(r1)?.start === "2026-10-15" && svcOf(r1)?.terms === DEFAULT_WARRANTY,
  "ควรได้วันเริ่ม 2026-10-15 + เงื่อนไขมาตรฐานโฟล์คลิฟท์ · ได้ " + JSON.stringify(svcOf(r1)));

// ⭐ รูที่เคยทำให้ค้างวน: ช่อง "หมวดรถ" ว่าง → เดิมเติมไม่ได้เลย ต้องเดาจากรหัสรุ่นแทน
const r2 = autoFillWarranty(fk({ vehicle_category: "" }), sale());
check("2) หมวดรถว่าง แต่รุ่นเป็นโฟล์คลิฟท์ → เดาจากรหัสรุ่นได้",
  r2 && svcOf(r2)?.terms === DEFAULT_WARRANTY,
  "หมวดรถว่างแล้วเติมไม่ได้ = ค้างวนอยู่แบบนั้นตลอด");

const r3 = autoFillWarranty(fk({ vehicle_category: "", model: "BF25" }), sale({ forklift_model: "BF25" }));
check("3) หมวดรถว่าง รุ่นแฮนด์ลิฟท์ → ได้เงื่อนไขไฮดรอลิก ไม่ใช่ของโฟล์คลิฟท์",
  r3 && svcOf(r3)?.terms === HYDRAULIC_WARRANTY,
  "แฮนด์ลิฟท์ได้เงื่อนไขผิดชนิด · ได้ " + JSON.stringify(svcOf(r3)?.terms));

// ⭐ รูที่ 1: เดิมเติมเฉพาะสถานะ "ปิดการขาย/จัดส่งแล้ว" — สถานะอื่นที่แปลว่าปิดก็ต้องเติม
const r4 = autoFillWarranty(fk(), sale({ sale_status: "ขายแล้ว" }));
check('4) สถานะ "ขายแล้ว" (ปิดเหมือนกัน) → เติมให้ด้วย', !!r4,
  "เติมเฉพาะสถานะเดียว ทางอื่นยังค้างเหมือนเดิม");

// ── ไม่ควรเติม (ตัวคุม — กันขยายจนระบบเดาเอาเองหมด) ─────────────────────────
check("5) ไม่มีวันส่งมอบ → ห้ามเดา (ด่านต้องเตือนต่อ)",
  autoFillWarranty(fk(), sale({ delivery_date: "" })) === null,
  "ถอยไปใช้วันเปิดดีลแทน = วันเริ่มประกันเร็วเกินจริง ประกันหมดก่อนกำหนด");

check("6) ดีลยังไม่ปิด (จอง) → ยังไม่เติม",
  autoFillWarranty(fk(), sale({ sale_status: "จอง/โอนมัดจำแล้ว" })) === null,
  "เติมตั้งแต่ยังไม่ปิด = ประกันเริ่มทั้งที่ลูกค้ายังไม่ได้รถ");

check("7) ดีลปิดก่อน ส.ค. 69 → ไม่แตะ (ไม่อยู่ใต้ด่านนี้)",
  autoFillWarranty(fk(), sale({ delivery_date: "2026-07-20", created_at: "2026-07-20T00:00:00.000Z" })) === null,
  "ไปแก้ข้อมูลย้อนหลังของดีลเก่าที่จ่ายค่าคอมไปแล้ว");

const human = fk({ custom_fields: { [SVC_FIELD]: JSON.stringify({ start: "2026-09-01", terms: "เงื่อนไขพิเศษที่คนกรอกเอง", rounds: [], history: [{ by: "ไหมแก้ว", at: "1/10/2569" }] }) } });
check("8) มีข้อมูลที่คนกรอกไว้แล้ว → ห้ามทับ",
  autoFillWarranty(human, sale()) === null,
  "ทับของที่คนกรอกเอง = ข้อมูลจริงหาย");

// ── ให้ฝ่ายขายแก้ค่าที่ระบบเดาได้ แต่ของที่คนกรอกแล้วต้องล็อก ──────────────
check("9) ค่าที่ระบบเติม → ยังให้ฝ่ายขายแก้ทับได้", isSystemFilled(r1) === true,
  "ระบบเดาผิดแล้วฝ่ายขายแก้ไม่ได้เลย");
check("10) ค่าที่คนกรอกเอง → ล็อกตามกติกาเดิม", isSystemFilled(human) === false,
  "ของที่คนกรอกแล้วถูกปลดล็อก ใครก็แก้ทับได้");

let fail = 0;
for (const [name, ok, why] of cases) { console.log(`${name}: ${ok ? "✓" : "✗ " + why}`); if (!ok) fail++; }
console.log(fail === 0 ? `\nผ่านทั้งหมด ${cases.length}/${cases.length} ข้อ` : `\n✗ ไม่ผ่าน ${fail}/${cases.length} ข้อ`);
cleanup();
process.exitCode = fail === 0 ? 0 : 1;
