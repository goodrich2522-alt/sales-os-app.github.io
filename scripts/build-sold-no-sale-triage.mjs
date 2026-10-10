// scripts/build-sold-no-sale-triage.mjs — แยกกลุ่ม "รถขายแล้วไม่มีใบขาย" พร้อมบอกว่าต้องทำอะไร
//
// ที่มา (10 ต.ค. 2569): หลังติดด่านในฐานข้อมูล เหลือรถค้างเก่า 35 คัน
// ไล่ทีละคันด้วยมือไม่ไหว → เอา SN ไปค้นในไฟล์บัญชีทุกไฟล์ แล้วแยกให้ว่า
//   A ขายจริงมีบิลขาย · B บิลเป็นงานซ่อม/อะไหล่ (ห้ามเปิดดีลขาย) · C ไม่เจอบิลแต่รถใหญ่ · D ของเล็ก
//
// ⚠️ บทเรียน: SN ในรายงานภาษีขายฝังอยู่กลางข้อความรายการสินค้า
//    "NEW FORKLIFT HELI CPCD25-Q22K2 M400 SN : 010253T1379 / EN : Q260382100H"
//    ตอนแรกเทียบทั้งช่องแบบตรงตัว → ได้ผล 0/35 ทั้งที่มีจริง ต้องค้นแบบเศษข้อความ
//    และ SN ที่สั้นกว่า 8 ตัวอักษรไม่ค้นอัตโนมัติ เสี่ยงไปตรงกับตัวเลขอื่นโดยบังเอิญ
//
// วิธีเอา csv มา: Supabase SQL Editor → รันคำสั่งท้ายไฟล์
//   supabase-block-sold-without-deal-2026-10-03.sql → ปุ่ม Export → CSV
//
// รัน: node scripts/build-sold-no-sale-triage.mjs "<csv จาก supabase>" "<ไฟล์ผลลัพธ์ .xlsx>"
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
const X0 = await import("xlsx");
const XLSX = X0.default ?? X0;

const CSV = process.argv[2], OUT = process.argv[3];
const rows = readFileSync(CSV, "utf8").split(/\r?\n/).filter(Boolean).slice(1)
  .map(l => { const c = l.split(","); return { sn: c[1], brand: c[2], model: c[3], pi: c[5] === "null" ? "" : c[5], recv: c[6], cost: Number(c[7]) || 0 }; });

const norm = v => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const MIN = 8;
const walk = d => {
  let out = []; let names = [];
  try { names = readdirSync(d); } catch { return out; }
  for (const n of names) {
    if (n.startsWith("~$")) continue;
    const p = join(d, n);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) out = out.concat(walk(p));
    else if (/\.xlsx?$/i.test(n)) out.push(p);
  }
  return out;
};
const files = [...new Set(["data", "D:/ai-agent/agents/ค่าคอม", "D:/ai-agent/ap/2569", "D:/ai-agent/ap/2568"].flatMap(walk))];

const hits = new Map();
for (const f of files) {
  let wb; try { wb = XLSX.read(readFileSync(f), { type: "buffer" }); } catch { continue; }
  for (const sheet of wb.SheetNames) {
    let aoa; try { aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, raw: false, defval: "" }); } catch { continue; }
    for (const row of aoa) {
      if (!Array.isArray(row)) continue;
      const line = row.map(c => String(c ?? "").trim()).filter(Boolean).join(" | ");
      if (!line) continue;
      const flat = norm(line);
      for (const r of rows) {
        const k = norm(r.sn);
        if (k.length < MIN || !flat.includes(k)) continue;
        if (!hits.has(k)) hits.set(k, []);
        const l = hits.get(k);
        if (l.length < 3 && !l.some(x => x.line === line)) l.push({ file: basename(f), line });
      }
    }
  }
}

const out = rows.map(r => {
  const k = norm(r.sn);
  const h = hits.get(k) || [];
  const short = k.length < MIN;
  const best = h[0];
  const line = best?.line ?? "";
  const bill = (/\b(?:IV|R)-\d{9}\b/.exec(line) || [""])[0];
  const date = (/\b\d{2}\/\d{2}\/\d{4}\b/.exec(line) || [""])[0];
  const kind = /งานขาย/.test(line) ? "งานขาย" : /งานซ่อม/.test(line) ? "งานซ่อม" : "";

  let group, todo;
  if (kind === "งานขาย") { group = "A · ขายจริง มีบิลขาย"; todo = "เปิดดีลย้อนหลัง → ปุ่ม \"ปิดการขายแทนฝ่ายขาย\""; }
  else if (kind === "งานซ่อม") { group = "B · บิลเป็นงานซ่อม/อะไหล่ ไม่ใช่ขายรถ"; todo = "ไม่ใช่การขาย — กด \"✓ ตรวจแล้ว\" (ถ้าเปิดดีลจะทำให้ยอดขาย/ค่าคอมเพี้ยน)"; }
  else if (h.length) { group = "B · มีบิลแต่ยังระบุประเภทไม่ได้"; todo = "เปิดดูบิลในคอลัมน์ขวาก่อนตัดสินใจ"; }
  else if (r.cost >= 15000 || r.pi) { group = "C · ไม่เจอบิล แต่เป็นรถใหญ่"; todo = "ต้องตามหาบิล — ถามเซลล์/บัญชี · ถ้าขายเดือน ต.ค. 69 จะยังไม่มีในไฟล์"; }
  else { group = "D · ของเล็ก ไม่เจอบิล"; todo = "น่าจะขายเงินสดไม่ผูก SN — กด \"✓ ตรวจแล้ว\""; }

  return {
    "SN": r.sn, "ยี่ห้อ": r.brand, "รุ่น": r.model, "ทุน": r.cost,
    "วันรับรถ": r.recv, "เลข PI": r.pi,
    "กลุ่ม": group, "ต้องทำ": todo,
    "เลขบิล": bill, "วันที่บิล": date, "ประเภทงาน": kind,
    "ค้นอัตโนมัติไม่ได้ (SN สั้น)": short ? "ใช่" : "",
    "ข้อความในบิล (ดิบ ไม่ตัดต่อ)": line.slice(0, 400),
    "ไฟล์ที่เจอ": best?.file ?? "",
  };
});

const order = { "A": 0, "B": 1, "C": 2, "D": 3 };
out.sort((a, b) => (order[a["กลุ่ม"][0]] - order[b["กลุ่ม"][0]]) || (b["ทุน"] - a["ทุน"]));

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(out);
ws["!cols"] = [{ wch: 15 }, { wch: 10 }, { wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 20 }, { wch: 34 }, { wch: 52 }, { wch: 14 }, { wch: 12 }, { wch: 11 }, { wch: 12 }, { wch: 80 }, { wch: 40 }];
XLSX.utils.book_append_sheet(wb, ws, "รถขายแล้วไม่มีใบขาย");
XLSX.writeFile(wb, OUT);

const tally = {};
out.forEach(r => { const g = r["กลุ่ม"]; tally[g] = (tally[g] || 0) + 1; });
console.log("เขียนไฟล์: " + OUT);
Object.entries(tally).sort().forEach(([g, n]) => console.log("  " + g + " … " + n + " คัน"));
