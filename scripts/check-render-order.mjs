// scripts/check-render-order.mjs — หาโค้ดที่ "ทำงานตอนวาดหน้า" แต่เรียกตัวแปรที่ประกาศทีหลัง
//
// ที่มา (28 ก.ย. 2569): หน้าฝ่ายสต็อกล้มทั้งหน้าตอนกดนำเข้าเอกสาร
//   ReferenceError: Cannot access 'toForklift' before initialization
// สาเหตุ: const fillPlan = rows.map(...) ถูกวางไว้ "ก่อน" const toForklift
//   โดย fillPlan ไม่ได้เรียก toForklift ตรง ๆ แต่เรียกผ่าน dupKeyOf() กับ stockMatch()
//   บล็อกแบบนี้ทำงานทันทีตอนวาดหน้า → ชน Temporal Dead Zone
//   และไม่พังตอนทดสอบ เพราะพังต่อเมื่อ rows มีข้อมูล (คือหลังอ่านไฟล์เข้ามาแล้ว)
//
// TypeScript จับให้ไม่ได้ เพราะมองว่าอาจถูกเรียกทีหลังก็ได้ — เลยต้องมีตัวตรวจของเราเอง
// ตัวนี้ไล่ตามสายเรียก (fillPlan → dupKeyOf → toForklift) ไม่ใช่ดูแค่ชื่อที่เขียนตรง ๆ
//
// รัน: node scripts/check-render-order.mjs        (ออก exit 1 ถ้าเจอ)

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["app", "components"];
const files = [];
const walk = d => { try { readdirSync(d).forEach(n => {
  const p = join(d, n);
  if (statSync(p).isDirectory()) walk(p);
  else if (/\.tsx?$/.test(n)) files.push(p.replace(/\\/g, "/"));
}); } catch { /* ไม่มีโฟลเดอร์นี้ก็ข้าม */ } };
roots.forEach(walk);

/** ลบคอมเมนต์กับข้อความในเครื่องหมายคำพูด (กันจับชื่อที่อยู่ในคอมเมนต์) */
const strip = src => src
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "))
  .replace(/\/\/[^\n]*/g, m => " ".repeat(m.length))
  .replace(/"(?:[^"\\\n]|\\.)*"/g, m => " ".repeat(m.length))
  .replace(/'(?:[^'\\\n]|\\.)*'/g, m => " ".repeat(m.length))
  .replace(/`(?:[^`\\]|\\.)*`/g, m => m.replace(/[^\n]/g, " "));

let found = 0;
for (const file of files) {
  const lines = strip(readFileSync(file, "utf8")).split(/\r?\n/);

  // ขอบเขตของแต่ละคอมโพเนนต์ในไฟล์ (บรรทัดที่ขึ้นต้นด้วย function/export default function ที่คอลัมน์ 0)
  // ถ้าไม่แยก จะไปจับชื่อซ้ำของคอมโพเนนต์อื่นที่อยู่ท้ายไฟล์ แล้วรายงานผิด
  const compStart = [];
  lines.forEach((l, i) => { if (/^(?:export default )?function [A-Za-z_$]/.test(l)) compStart.push(i); });
  const compOf = i => { let s = -1; for (const c of compStart) if (c <= i) s = c; return s; };

  // ประกาศระดับ component (เยื้อง 2 ช่อง) — พวกนี้อยู่ใน TDZ ได้
  const decl = new Map();
  lines.forEach((l, i) => {
    const m = /^  (?:const|let) ([A-Za-z_$][\w$]*)\s*[=:]/.exec(l);
    if (m && !decl.has(m[1])) decl.set(m[1], i + 1);
  });

  const blockEnd = i => {
    let depth = 0, started = false;
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if ("({[".includes(ch)) { depth++; started = true; }
        else if (")}]".includes(ch)) depth--;
      }
      if (started && depth <= 0) return j;
    }
    return lines.length - 1;
  };

  /** ชื่อที่ถูกอ้างถึงในช่วงบรรทัดนี้ (ตัดชื่อที่เป็นพารามิเตอร์ของตัวเอง = ชื่อซ้อน) */
  const refsIn = (from, to) => {
    const body = lines.slice(from, to + 1).join("\n");
    const shadow = new Set();
    for (const m of body.matchAll(/\(([^()]*)\)\s*=>/g))
      m[1].split(",").forEach(s => { const n = /^\s*([A-Za-z_$][\w$]*)/.exec(s); if (n) shadow.add(n[1]); });
    // ตัวแปรที่ประกาศ "ข้างใน" บล็อกนี้เอง — ชื่อซ้ำกับข้างนอกได้ ไม่เกี่ยวกัน
    for (const m of body.matchAll(/\b(?:const|let|var)\s+([^;\n]+)/g))
      m[1].split(",").forEach(s => { const n = /^\s*[{[\s]*([A-Za-z_$][\w$]*)/.exec(s); if (n) shadow.add(n[1]); });
    for (const m of body.matchAll(/(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*\(/g)) shadow.delete(m[1]); // ชื่อที่ถูกเรียกเป็นฟังก์ชัน ไม่ใช่ชื่อซ้อน
    const out = new Set();
    for (const m of body.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)(?![\w$])/g)) {
      // ข้ามชื่อคีย์ของ object ({ receiverNames: "" }) — เป็นชื่อฟิลด์ ไม่ใช่การเรียกตัวแปร
      const after = body.slice(m.index + m[1].length, m.index + m[1].length + 2);
      if (/^\s*:/.test(after) && !/\?\s*$/.test(body.slice(Math.max(0, m.index - 2), m.index))) continue;
      if (!shadow.has(m[1])) out.add(m[1]);
    }
    return out;
  };

  // ช่วงบรรทัดของแต่ละตัวที่ประกาศ (ไว้ไล่ตามสายเรียก)
  const span = new Map();
  for (const [name, at] of decl) span.set(name, [at - 1, blockEnd(at - 1)]);

  /** ชื่อทั้งหมดที่บล็อกนี้แตะ รวมที่เรียกผ่านฟังก์ชันอื่นในคอมโพเนนต์เดียวกัน */
  const reachable = (from, to) => {
    const seen = new Set();
    const queue = [...refsIn(from, to)];
    while (queue.length) {
      const n = queue.shift();
      if (seen.has(n)) continue;
      seen.add(n);
      const sp = span.get(n);
      if (sp && sp[0] >= to) continue;          // ตัวที่ประกาศทีหลัง — ไม่ไล่ต่อ (มันคือตัวที่จะรายงาน)
      if (sp) for (const r of refsIn(sp[0], sp[1])) if (!seen.has(r)) queue.push(r);
    }
    return seen;
  };

  for (let i = 0; i < lines.length; i++) {
    // บล็อกที่ทำงานทันทีตอนวาดหน้า: useMemo(...) · xxx.map(...) · IIFE
    const m = /^  (?:const|let) ([A-Za-z_$][\w$]*)\s*=\s*(?:useMemo\(|\(\(\)|\(function|[\w$.?]+\.(?:map|filter|flatMap|reduce|forEach)\()/.exec(lines[i]);
    if (!m) continue;
    const end = blockEnd(i);
    const touched = reachable(i, end);
    for (const name of touched) {
      const at = decl.get(name);
      if (!at || name === m[1] || at <= end + 1) continue;   // ประกาศก่อน หรืออยู่ในบล็อกเดียวกัน
      if (compOf(at - 1) !== compOf(i)) continue;            // คนละคอมโพเนนต์ ไม่เกี่ยวกัน
      console.log(`⚠️  ${file}:${i + 1}  "${m[1]}" ทำงานตอนวาดหน้า แต่ไปถึง "${name}" ที่ประกาศบรรทัด ${at}`);
      found++;
    }
  }
}
console.log(found ? `\nเจอ ${found} จุด — ย้ายบล็อกไปไว้หลังตัวที่มันเรียกใช้` : "✓ ไม่พบโค้ดที่เรียกตัวแปรก่อนประกาศ");
process.exitCode = found ? 1 : 0;
