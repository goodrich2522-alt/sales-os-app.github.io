import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import * as SI from "./_si.mjs";
const X0 = await import("xlsx"); const XLSX = X0.default ?? X0;
const SN = (process.argv[2] || "010253T1376").toUpperCase();
const walk = d => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : (/\.xlsx$/i.test(n) && !n.startsWith("~$") ? [p] : []); });
const dirs = ["data", "D:/ai-agent/agents/ค่าคอม/GOOD & RICH POWERPLUS 2569", "D:/ai-agent/agents/ค่าคอม"];
const seen = new Set();
for (const d of dirs) {
  let files = []; try { files = walk(d); } catch { continue; }
  for (const f of files) {
    const wb = XLSX.read(readFileSync(f), { type: "buffer" });
    for (const n of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: "" });
      for (const r of rows) {
        if (!r.some(c => String(c).toUpperCase().includes(SN))) continue;
        const k = JSON.stringify(r.slice(0, 12));
        if (seen.has(k)) continue; seen.add(k);
        console.log(f.split(/[\/]/).pop().slice(0, 40) + " | " + n + "\n   " + JSON.stringify(r.filter(x => String(x).trim()).slice(0, 12)) + "\n");
      }
    }
  }
}
if (!seen.size) console.log("ไม่เจอ SN นี้ในไฟล์บัญชีเลย");
