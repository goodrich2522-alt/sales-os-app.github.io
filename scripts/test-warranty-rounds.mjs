// scripts/test-warranty-rounds.mjs — รอบเข้าเช็ค/บำรุงรักษา: บันทึกรอบเดียว รอบถัดไปคำนวณต่อเอง
//
// ที่มา (27 พ.ย. 2569 · ผู้ใช้สั่ง "เลือกครั้งแล้วให้ตั้งคำนวณรอบถัดไปอัตโนมัติ"):
// ตอนตรวจเจอว่าตัวบวกเดือนเพี้ยนอยู่ 2 ทาง และการ "ติ๊ก/ลงวัน" ไม่ผูกกันเลย
//   · addMonths คืนค่าผ่าน toISOString() (= UTC) → วันครบกำหนดทุกรอบเร็วไป 1 วัน
//   · 30 พ.ย. +3 เดือน เด้งไป 2 มี.ค. แทนที่จะเป็น 28 ก.พ.
//   · ติ๊ก "เช็คแล้ว" ไม่ลงวัน → รอบถัดไปถอยไปนับจากกำหนดเดิม ตารางเพี้ยนสะสม
//   · ลงวันแล้วลืมติ๊ก → ระบบยังเตือนรอบที่ไปเช็คมาแล้ว
// ด่านนี้ล็อกทั้ง 4 ข้อ + ล็อกเส้นแบ่งว่าอะไร "ห้ามเดาให้"
//
// รัน: node scripts/test-warranty-rounds.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const out = mkdtempSync(join(tmpdir(), "warrantyrounds-"));
const cleanup = () => rmSync(out, { recursive: true, force: true });
const req = createRequire(import.meta.url);
try {
  execFileSync(process.execPath, [req.resolve("typescript/bin/tsc"),
    "lib/warranty.ts",
    "--outDir", out, "--module", "commonjs", "--target", "es2022", "--moduleResolution", "node", "--skipLibCheck"],
    { stdio: "pipe" });
} catch (e) {
  console.error("คอมไพล์ lib/warranty.ts ไม่ผ่าน:\n" + String(e.stdout || e.message).slice(0, 1000));
  cleanup();
  process.exit(1);
}
const W = req(join(out, "warranty.js"));
const { addMonths, todayISO, applyRoundChange, roundDue, nextDue, dueStatus, emptySvcRounds } = W;

const cases = [];
const check = (name, ok, why = "") => cases.push([name, !!ok, why]);
const miss = (n) => typeof W[n] !== "function" && check(`มีฟังก์ชัน ${n}`, false, "ยังไม่มีฟังก์ชันนี้ใน lib/warranty.ts");
["addMonths", "todayISO", "applyRoundChange", "roundDue", "nextDue", "dueStatus"].forEach(miss);
if (cases.length) {
  for (const [name, , why] of cases) console.log(`${name}: ✗ ${why}`);
  console.log(`\n✗ ไม่ผ่าน ${cases.length}/${cases.length} ข้อ`);
  cleanup();
  process.exit(1);
}

const svcOf = (over = {}) => ({ start: "2026-09-15", terms: "x", rounds: emptySvcRounds(), history: [], ...over });

// ── ตัวบวกเดือน ────────────────────────────────────────────────────────────
// ⭐ ไทยเร็วกว่า UTC 7 ชม. — เที่ยงคืนบ้านเราคือ 17:00 ของเมื่อวานใน UTC
check("1) บวกเดือนแล้ววันไม่เลื่อนเพราะโซนเวลา",
  addMonths("2026-09-15", 3) === "2026-12-15",
  "ควรได้ 2026-12-15 · ได้ " + addMonths("2026-09-15", 3) + " — วันครบกำหนดทุกรอบเร็วไป 1 วัน");

check("2) สิ้นเดือนไม่ทะลุไปเดือนถัดไป (30 พ.ย. +3 = 28 ก.พ.)",
  addMonths("2026-11-30", 3) === "2027-02-28",
  "ควรได้ 2027-02-28 · ได้ " + addMonths("2026-11-30", 3) + " — JS เด้ง '30 ก.พ.' ไปเป็น 2 มี.ค.");

check("3) ข้ามปีถูก (ต.ค. +3 = ม.ค. ปีถัดไป)",
  addMonths("2026-10-15", 3) === "2027-01-15",
  "ได้ " + addMonths("2026-10-15", 3));

check("4) ไม่มีวันเริ่ม → ห้ามเดาวันกำหนด (ตัวคุม)",
  addMonths("", 3) === "" && addMonths("ไม่ใช่วันที่", 3) === "",
  "เดาวันกำหนดจากค่าว่าง = ตารางเช็คปลอม");

// วันนี้ต้องเป็นวันตามเวลาเครื่อง ไม่ใช่ UTC
const d = new Date(2026, 10, 27, 3, 0, 0);     // 27 พ.ย. 2569 ตี 3 (UTC ยังเป็นวันที่ 26)
check("5) วันนี้ = วันตามเวลาเครื่อง ไม่ใช่ UTC",
  todayISO(d) === "2026-11-27",
  "ควรได้ 2026-11-27 · ได้ " + todayISO(d) + " — ตอนเช้ามืดจะบันทึกเป็นเมื่อวาน");

// ── ติ๊ก/ลงวัน แล้วรอบถัดไปคำนวณต่อเอง ─────────────────────────────────────
const r0 = emptySvcRounds();

// ⭐ รูที่ทำให้ตารางเพี้ยนสะสม: ติ๊กแล้วไม่มีวันให้รอบถัดไปเกาะ
const a = applyRoundChange(r0, 0, { done: true }, "2026-12-20");
check("6) ติ๊ก 'เช็คแล้ว' โดยไม่ลงวัน → ลงวันนี้ให้อัตโนมัติ",
  a[0].done === true && a[0].date === "2026-12-20",
  "ได้ " + JSON.stringify(a[0]) + " — ไม่มีวันเข้าจริง รอบถัดไปจะถอยไปนับจากกำหนดเดิม");

const b = applyRoundChange(r0, 0, { date: "2026-12-20" }, "2026-11-27");
check("7) ลงวันเข้าจริง → ติ๊กว่าเช็คแล้วให้เอง ไม่ต้องติ๊กซ้ำ",
  b[0].done === true && b[0].date === "2026-12-20",
  "ได้ " + JSON.stringify(b[0]) + " — ลงวันแล้วลืมติ๊ก ระบบจะเตือนรอบที่เช็คไปแล้ว");

check("8) รอบถัดไปนับจาก 'วันเข้าจริง' ของรอบก่อน",
  roundDue(svcOf({ rounds: b }), 1) === "2027-03-20",
  "ควรได้ 2027-03-20 (20 ธ.ค. + 3 เดือน) · ได้ " + roundDue(svcOf({ rounds: b }), 1));

// ── ตัวคุม: ของที่ห้ามเดา / ห้ามลบ ─────────────────────────────────────────
const keep = applyRoundChange(b, 0, { done: false }, "2026-11-27");
check("9) ติ๊กออก → วันที่ที่คนกรอกต้องไม่ถูกลบ (ตัวคุม)",
  keep[0].done === false && keep[0].date === "2026-12-20",
  "ลบวันที่ที่คนกรอกเอง = ข้อมูลจริงหาย");

const already = applyRoundChange(b, 0, { done: true }, "2026-11-27");
check("10) มีวันเข้าจริงอยู่แล้ว ติ๊กซ้ำ → ห้ามทับด้วยวันนี้ (ตัวคุม)",
  already[0].date === "2026-12-20",
  "ทับวันที่เดิม = ประวัติการเข้าเช็คผิด");

check("11) รอบที่ยังไม่ได้เข้า → นับจากกำหนดเดิม ไม่ใช่เดาวันเข้า (ตัวคุม)",
  roundDue(svcOf(), 0) === "2026-12-15" && roundDue(svcOf(), 1) === "2027-03-15",
  "ได้ " + roundDue(svcOf(), 0) + " / " + roundDue(svcOf(), 1));

check("12) รอบอื่นต้องไม่ถูกแตะ (ตัวคุม)",
  a.slice(1).every(r => r.date === "" && r.done === false && r.note === ""),
  "แก้รอบเดียวแล้วรอบอื่นเปลี่ยนตาม = ข้อมูลพัง");

// ── รอบถัดไป + ป้ายบอกสถานะ ───────────────────────────────────────────────
const nd = nextDue(svcOf({ rounds: b }));
check("13) รอบถัดไป = รอบที่ 2 พร้อมวันกำหนด",
  nd && nd.index === 1 && nd.due === "2027-03-20",
  "ได้ " + JSON.stringify(nd));

check("14) เช็คครบทุกรอบ → ไม่ต้องเตือนอีก (ตัวคุม)",
  nextDue(svcOf({ rounds: r0.map(r => ({ ...r, done: true, date: "2026-12-20" })) })) === null,
  "เช็คครบแล้วยังเตือนอยู่");

check("15) ป้ายบอกว่าเกินกำหนดมากี่วัน",
  dueStatus("2026-11-20", "2026-11-27").tone === "overdue" && /7 วัน/.test(dueStatus("2026-11-20", "2026-11-27").label),
  "ได้ " + JSON.stringify(dueStatus("2026-11-20", "2026-11-27")));

check("16) ใกล้ถึงกำหนด (≤30 วัน) ต้องแยกออกจากยังอีกนาน",
  dueStatus("2026-12-10", "2026-11-27").tone === "soon" && dueStatus("2027-03-20", "2026-11-27").tone === "ok",
  "ได้ " + dueStatus("2026-12-10", "2026-11-27").tone + " / " + dueStatus("2027-03-20", "2026-11-27").tone);

check("17) ไม่มีวันกำหนด → ไม่ขึ้นป้ายมั่ว (ตัวคุม)",
  dueStatus("", "2026-11-27").tone === "none" && dueStatus("", "2026-11-27").label === "",
  "ขึ้นป้ายทั้งที่ไม่รู้วันกำหนด");

let fail = 0;
for (const [name, ok, why] of cases) { console.log(`${name}: ${ok ? "✓" : "✗ " + why}`); if (!ok) fail++; }
console.log(fail === 0 ? `\nผ่านทั้งหมด ${cases.length}/${cases.length} ข้อ` : `\n✗ ไม่ผ่าน ${fail}/${cases.length} ข้อ`);
cleanup();
process.exitCode = fail === 0 ? 0 : 1;
