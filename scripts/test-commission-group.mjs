// scripts/test-commission-group.mjs — ด่าน "จำแนกกลุ่มค่าคอมจากรุ่นรถ"
//
// ที่มา (28 ต.ค. 2569): เทียบค่าคอมไหมแก้ว ก.ย. 2569 กับไฟล์บัญชี
// เจอรุ่นที่บัญชีนับเป็น "แฮนด์ลิฟท์ (1%)" แต่แอปจำแนกไม่ออก เพราะ regex ผูกกับ BF+ตัวเลข
//   · BFS รถลากพาเลท สแตนเลท  (ห้างฯ เอ็น.เอ. ซัพพลาย 3 คัน 135,000) → BFS ไม่ใช่ BF+เลข
//   · BDDJS400-1700            (โบว์เบเกอรี่เฮ้าส์ 38,000)           → BDD ไม่อยู่ในลิสต์
// รอดมาได้เพราะยี่ห้อเป็น STAXX (OTHER_GROUP_BRANDS ดักไว้) — แต่ถ้าลงยี่ห้อว่าง/ผิด
// รถจะหลุดไปเป็น "โฟล์คลิฟท์" แล้วรอเลือกหมวดค่าคอม → ค่าคอมเดือนนั้นขาด
//
// ด่านนี้ตรวจจาก "รุ่น" เพียวๆ (ไม่พึ่งยี่ห้อ) ตามกติกาในคอมเมนต์ของ isOtherGroupModel
//
// รัน: node scripts/test-commission-group.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const out = mkdtempSync(join(tmpdir(), "commgroup-"));
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
const { isOtherGroupModel, isStackerModel } = req(join(out, "commission.js"));

// [รุ่น, กลุ่มที่ถูก] — "อื่นๆ" = คิด 1% ของยอดเดือน · "สแตกเกอร์" = 500/800 ต่อคัน · "โฟล์คลิฟท์" = ตามกำไร
// ทุกรุ่นในตารางนี้คัดมาจากชีตบัญชีจริง เดือน ส.ค.–ก.ย. 2569
const CASES = [
  // รถกลุ่มอื่น (บัญชีลงบล็อก "แฮนด์ลิฟท์ (กู๊ด)")
  ["BFS รถลากพาเลท สแตนเลท", "อื่นๆ"],
  ["BFS1500", "อื่นๆ"],
  ["BDDJS400-1700", "อื่นๆ"],
  ["BF30-II", "อื่นๆ"],
  ["BF25-II", "อื่นๆ"],
  ["WMS1500-M2000", "อื่นๆ"],
  ["WMS1000-2000", "อื่นๆ"],
  ["SDA1500-3000", "อื่นๆ"],
  ["EPS400-1700", "อื่นๆ"],
  ["Hand Pallet Truck PWH20-II", "อื่นๆ"],
  ["PWH25-II", "อื่นๆ"],
  ["CBD20-WS", "อื่นๆ"],
  ["CBD20J-Li-S", "อื่นๆ"],
  ["CNS-306DP", "อื่นๆ"],
  ["AC50 (685)-H", "อื่นๆ"],
  ["ETAS50", "อื่นๆ"],
  // สแตกเกอร์ (บัญชีลงบล็อก "สแต๊กเกอร์ (กู๊ด)")
  ["CDD12J-M250", "สแตกเกอร์"],
  ["CDD12J-M350", "สแตกเกอร์"],
  ["CDD15J-WS", "สแตกเกอร์"],
  // โฟล์คลิฟท์ (บัญชีลงบล็อก "โฟร์คลิฟท์ (กู๊ด)") — ต้องไม่ถูกดูดเข้ากลุ่มอื่น
  ["CPCD25-M400", "โฟล์คลิฟท์"],
  ["CPCD25-Q22K2 M300", "โฟล์คลิฟท์"],
  ["CPCD30-Q22K2", "โฟล์คลิฟท์"],
  ["CPD25-XAJ4-I", "โฟล์คลิฟท์"],
  ["CPD20-A7XLIH4-S", "โฟล์คลิฟท์"],
  ["CQD18-A2RLIG2", "โฟล์คลิฟท์"],
];

const got = (m) => (isOtherGroupModel(m) ? "อื่นๆ" : isStackerModel(m) ? "สแตกเกอร์" : "โฟล์คลิฟท์");
const fails = [];
for (const [model, want] of CASES) {
  const g = got(model);
  if (g !== want) fails.push(model + " → ได้ \"" + g + "\" ควรเป็น \"" + want + "\"");
}
CASES.forEach(([model, want]) => {
  const g = got(model);
  console.log((g === want ? "  ✓ " : "  ✗ ") + model.padEnd(30) + " " + g + (g === want ? "" : "  (ควรเป็น " + want + ")"));
});

cleanup();
console.log(fails.length === 0
  ? "\n✓ ผ่านทั้งหมด " + CASES.length + "/" + CASES.length + " รุ่น"
  : "\n✗ ผิด " + fails.length + "/" + CASES.length + " รุ่น:\n   · " + fails.join("\n   · "));
process.exitCode = fails.length === 0 ? 0 : 1;
