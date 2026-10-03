// scripts/verify.mjs — ด่านตรวจก่อนขึ้นระบบ รันทีเดียวจบ
//
// ที่มา (3 ต.ค. 2569 · ผู้ใช้สั่ง "ห้ามทำผิดบ่อย ตรวจสอบให้เสถียร"):
// สัปดาห์นี้มีของหลุดขึ้นเว็บหลายครั้ง ทั้งที่ตรวจทีละอย่างก็ผ่าน
//   · เรียกตัวแปรก่อนประกาศ → หน้าสต็อกล้มทั้งหน้าตอนกดนำเข้าเอกสาร
//   · ชื่อคอลัมน์ไม่มีจริง   → ใบขายไม่โหลดเลยทั้งระบบ
//   · ลืมใส่ dependency     → ปุ่มกรองกดแล้วรายการไม่เปลี่ยน
//   · อ่านจากสำเนาเก่า      → กรอกประกันแล้วยังกดปิดการขายไม่ได้
// ทุกตัวจับได้ด้วยการ "เปิดหน้าจริงแล้วกดจริง" ซึ่งเมื่อก่อนไม่ได้ทำทุกครั้ง
//
// รัน: npm run verify      (ต้องผ่านทุกข้อก่อน push)

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LINT_BASELINE = ".lint-baseline.json";
const line = "─".repeat(64);
const steps = [];
let failed = 0;

/** รัน 1 ขั้น · คืน true เมื่อผ่าน */
function step(name, fn, { optional = false } = {}) {
  process.stdout.write(`▶ ${name} … `);
  const t0 = Date.now();
  try {
    const note = fn() ?? "";
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`ผ่าน (${sec}s)${note ? " · " + note : ""}`);
    steps.push({ name, ok: true, note });
    return true;
  } catch (e) {
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    const msg = String(e.stdout || e.message || e).split("\n").filter(Boolean).slice(-6).join("\n     ");
    console.log(`${optional ? "ข้าม" : "ไม่ผ่าน"} (${sec}s)`);
    console.log("     " + msg);
    steps.push({ name, ok: false, optional, msg });
    if (!optional) failed++;
    return false;
  }
}

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { shell: true, encoding: "utf8", stdio: "pipe", maxBuffer: 32 * 1024 * 1024, ...opts });

console.log(line);
console.log("ตรวจก่อนขึ้นระบบ — ต้องผ่านทุกข้อ");
console.log(line);

// 1) ชนิดข้อมูล
step("ชนิดข้อมูล (tsc)", () => { run("npx", ["tsc", "--noEmit"]); });

// 2) ลำดับโค้ด — เรียกตัวแปรก่อนประกาศ
step("ลำดับโค้ด (ตัวแปรก่อนประกาศ)", () => { run("node", ["scripts/check-render-order.mjs"]); });

// 3) ชื่อคอลัมน์ตรงกับฐานข้อมูลจริง
step("ชื่อคอลัมน์ในฐานข้อมูล", () => { run("node", ["scripts/check-columns.mjs"]); });

// 4) eslint — ห้ามมี error เพิ่มจากเดิม (ของเดิมค้างอยู่ ยังไม่ไล่แก้)
step("eslint (ห้าม error เพิ่ม)", () => {
  // เขียนผลลง ไฟล์ ไม่รับทาง stdout — ผลเป็น JSON เกือบ 1 MB ซึ่งเกินบัฟเฟอร์ของ child process
  const tmp = join(tmpdir(), "eslint-verify.json");
  try { run("npx", ["eslint", "app/", "components/", "lib/", "-f", "json", "-o", tmp]); } catch { /* มี error = exit 1 ปกติ */ }
  const files = JSON.parse(existsSync(tmp) ? readFileSync(tmp, "utf8") || "[]" : "[]");
  const errors = files.reduce((n, f) => n + f.messages.filter(m => m.severity === 2).length, 0);
  const base = existsSync(LINT_BASELINE) ? JSON.parse(readFileSync(LINT_BASELINE, "utf8")).errors : null;
  if (base === null) {
    writeFileSync(LINT_BASELINE, JSON.stringify({ errors, at: new Date().toISOString().slice(0, 10) }, null, 2) + "\n");
    return `บันทึกค่าตั้งต้น ${errors} error`;
  }
  if (errors > base) throw new Error(`error เพิ่มจาก ${base} เป็น ${errors} — แก้ของใหม่ก่อน`);
  if (errors < base) {
    writeFileSync(LINT_BASELINE, JSON.stringify({ errors, at: new Date().toISOString().slice(0, 10) }, null, 2) + "\n");
    return `ลดลงเหลือ ${errors} (เดิม ${base}) · อัปเดตค่าตั้งต้นให้แล้ว`;
  }
  return `${errors} error (เท่าเดิม)`;
});

// 5) ชุดทดสอบตัวอ่านเอกสาร
step("ตัวอ่านใบ PI/ใบกำกับภาษี", () => {
  const out = run("node", ["scripts/test-quote-parsers.mjs"]);
  const m = /ผ่าน (\d+)\/(\d+) ใบ/.exec(out);
  if (!m || m[1] !== m[2]) throw new Error(out.split("\n").slice(-3).join("\n"));
  return `${m[1]}/${m[2]} ใบ`;
});
step("ตัวอ่านใบขายย้อนหลัง", () => {
  const out = run("node", ["scripts/test-sales-import.mjs"]);
  const m = /ผ่านทั้งหมด (\d+)\/(\d+) ข้อ/.exec(out);
  if (!m) throw new Error(out.split("\n").slice(-3).join("\n"));
  return `${m[1]}/${m[2]} ข้อ`;
});

// 6) build — ต้องผ่านก่อนถึงจะทดสอบหน้าจริงได้
const built = step("build", () => {
  const out = run("npm", ["run", "build"]);
  if (!/Compiled successfully/.test(out)) throw new Error(out.split("\n").slice(-8).join("\n"));
});

// 7) เปิดหน้าจริงในเบราว์เซอร์แล้วกดจริง — ด่านที่จับบั๊กได้จริงที่สุด
if (built) {
  const env = { ...process.env };
  if (!env.SB_URL && existsSync(".env.local")) {
    const m = /NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.+)/.exec(readFileSync(".env.local", "utf8"));
    if (m) env.SB_URL = m[1].trim().replace(/^["']|["']$/g, "");
  }
  step("หน้าสต็อก: เปิดได้ · ไม่แครช · ปุ่มกรองใช้ได้", () => {
    const out = run("node", ["scripts/perf-check.mjs"], { env: { ...env, CLICK: "1", IMG_KB: "10", N_INS: "5", N_SL: "200" } });
    if (/แครช: true/.test(out)) throw new Error("หน้าแครช");
    const mem = /หน่วยความจำ JS: (\d+) MB/.exec(out);
    if (mem && Number(mem[1]) > 150) throw new Error(`หน่วยความจำสูงผิดปกติ ${mem[1]} MB`);
    const grow = [...out.matchAll(/ที่ \d+ วิ: (\d+) MB/g)].map(x => Number(x[1]));
    if (grow.length >= 2 && grow[grow.length - 1] > grow[0] * 3) throw new Error("หน่วยความจำไต่ขึ้นเรื่อย ๆ (น่าจะวนไม่รู้จบ)");
    const filt = [...out.matchAll(/แสดง (\d+) จาก/g)].map(x => Number(x[1]));
    if (filt.length >= 2 && new Set(filt).size === 1) throw new Error("กดปุ่มกรองแล้วรายการไม่เปลี่ยน");
    return mem ? `${mem[1]} MB` : "";
  });
  step("ฝ่ายสต็อกปิดการขายแทนฝ่ายขายได้", () => {
    const out = run("node", ["scripts/e2e-close-for-staff.mjs"], { env });
    if (!/✓ ขึ้นแล้ว/.test(out)) throw new Error(out.split("\n").slice(-4).join("\n"));
  });
  step("กรอกประกันแล้วปิดการขายได้ทันที", () => {
    const out = run("node", ["scripts/e2e-warranty-gate.mjs"], { env });
    if (!/✓ หายแล้ว/.test(out) || !/✓ ไม่ติด/.test(out)) throw new Error(out.split("\n").slice(-4).join("\n"));
  });
}

console.log(line);
if (failed === 0) {
  console.log(`✓ ผ่านครบ ${steps.filter(s => s.ok).length} ข้อ — ขึ้นระบบได้`);
} else {
  console.log(`✗ ไม่ผ่าน ${failed} ข้อ — ยังไม่ควร push`);
  steps.filter(s => !s.ok && !s.optional).forEach(s => console.log("   · " + s.name));
}
console.log(line);
process.exitCode = failed === 0 ? 0 : 1;
