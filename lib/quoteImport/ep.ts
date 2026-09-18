// lib/quoteImport/ep.ts — อ่านใบเสนอราคา EP (EP Distribution Thailand)
//
// รองรับ 2 รูปแบบ:
//  (ก) SALES LIST  ← ใบที่ใช้จริงตอนนี้ (18 ก.ย. 2569)
//      หัวใบ: "P.I No.: GR260002" · "Date: 2026/8/28" · "SALES LIST-0002"
//      ตาราง: No. | Model | COMMODITY & SPECIFICATION | Q'ty (Unit) | THB price | Total
//      1 บรรทัดแรกของแต่ละรายการ = "3 3T Diesel Forklift/CPCD30T2 Capacity:3000kgs, 3 ฿283,000.00 ฿849,000.00"
//      บรรทัดถัดๆ ไป = สเปกของรายการนั้น (Mast/Fork/Battery/Charger) จนกว่าจะขึ้นรายการใหม่
//      ⭐ 1 ใบมีหลายรายการ · **รุ่นเดียวกันซ้ำได้** (DS3 เสา 2.5M กับ 3M คนละรายการ)
//         → ห้ามยุบรุ่นซ้ำ ต้องแตกตามจำนวนใน Q'ty ของแต่ละรายการ
//  (ข) Quote No. EPZL... (ใบเก่า) — ตาราง Pos | P.No | Description | QTY | U/P | Amount
//
// กติกาตรวจเอกสาร (QUOTE-IMPORT-RULES.md): อ่านจำนวน/ราคาจากใบแล้วต้อง **คูณกลับให้ตรง**
// (ราคาต่อคัน × จำนวน = ยอดรายการ) และผลรวมทุกรายการต้องตรงกับยอดท้ายใบ ไม่ตรง = ติดธงให้คนตรวจ

import { ParsedVehicle, QuoteParseResult, QuoteDocCheck } from "./types";

function toBaht(s?: string): number | undefined {
  if (!s) return undefined;
  const n = Number(s.replace(/[,\s฿]/g, ""));
  return isNaN(n) ? undefined : n;
}

/** พลังงานจากคำในชื่อรายการ */
function fuelOf(s: string): string | undefined {
  if (/semi[- ]?electric/i.test(s)) return "กึ่งไฟฟ้า";
  if (/diesel/i.test(s)) return "ดีเซล";
  if (/\b(lpg|gas|gasoline)\b/i.test(s)) return "แก๊ส";
  if (/electric|li-?ion|lithium|battery|battrery/i.test(s)) return "ไฟฟ้า";
  return undefined;
}

/** พิกัดยกจาก "Capacity: 1500kg" หรือจากชื่อรายการ "1.5T" */
function capacityOf(block: string, title: string): { text?: string; kg?: string } {
  const kg = block.match(/Capacity\s*:?\s*([\d,]+)\s*kgs?/i)?.[1]?.replace(/,/g, "");
  if (kg) return { text: `${(Number(kg) / 1000).toFixed(1)} ตัน`, kg };
  const t = title.match(/(\d+(?:\.\d+)?)\s*T\b/i)?.[1];
  if (t) return { text: `${Number(t).toFixed(1)} ตัน`, kg: String(Number(t) * 1000) };
  return {};
}

/** ความสูงยก: "3F4500mm" → 4.50 ม. · "2-standard mast 2.5M" → 2.50 ม. */
function heightOf(mast?: string): string | undefined {
  if (!mast) return undefined;
  const mm = mast.match(/(\d{3,5})\s*mm/i)?.[1];
  if (mm) return `${(Number(mm) / 1000).toFixed(2)} ม.`;
  const m = mast.match(/(\d(?:\.\d)?)\s*M\b/i)?.[1];
  return m ? `${Number(m).toFixed(2)} ม.` : undefined;
}

// แถวจำนวน/ราคาในรายการ: "<จำนวน> ฿<ราคาต่อคัน> ฿<ยอดรายการ>"
const ROW_RE = /(\d{1,3})\s*(?:฿|THB)?\s*([\d,]+\.\d{2})\s*(?:฿|THB)?\s*([\d,]+\.\d{2})/g;

/** อ่านจำนวน/ราคาจากรายการ — รับเฉพาะชุดที่ **คูณกลับแล้วตรง** (กันจับเลขสเปกมาเป็นราคา) */
function qtyRow(block: string): { qty: number; unit: number; total: number } | undefined {
  for (const m of block.matchAll(ROW_RE)) {
    const qty = Number(m[1]), unit = toBaht(m[2]) ?? 0, total = toBaht(m[3]) ?? 0;
    if (!qty || !unit || !total) continue;
    if (Math.abs(unit * qty - total) <= Math.max(1, qty * 0.01)) return { qty, unit, total };
  }
  return undefined;
}

// หัวรายการ: ขึ้นต้นด้วยลำดับ แล้วมีชื่อชนิดรถ + "/" + รหัสรุ่น (มีช่องว่างหลัง "/" ได้ เช่น "Reach Truck/ CQD18S2-20")
const ITEM_RE = /^\s*(\d{1,2})\s+(.*?)\/\s*([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*)\b/;
// ท้ายใบ — หยุดอ่านสเปกเมื่อถึงบรรทัดสรุปยอด
const FOOT_RE = /%\s*VAT|Total\s*Cost|BANK\s*INFORMATION/i;

export function parseEp(rawText: string): QuoteParseResult {
  const lines = rawText.split(/\r?\n/);
  const flat = rawText.replace(/\s+/g, " ").trim();

  // ⭐ EP: "P.I No." คือเลข PI ของใบนี้ (ใบเก่าใช้ "Quote No." เช่น EPZL260808)
  const piNo = flat.match(/P\.?\s*I\s*No\.?\s*:?\s*([A-Z]{1,4}\d{4,}[A-Z0-9-]*)/i)?.[1]
    ?? flat.match(/Quote\s*No\.?\s*:?\s*([A-Z]{2,}[A-Z0-9-]+)/i)?.[1];
  const date = flat.match(/Date\s*:?\s*(\d{4}\/\d{1,2}\/\d{1,2})/i)?.[1];
  const salesList = flat.match(/SALES\s*LIST\s*-\s*(\d{2,6})/i)?.[1];
  const importRef = salesList ? `SALES LIST-${salesList}` : piNo;

  // ── หาหัวรายการทุกอัน แล้วตัดเป็นบล็อก (หัวรายการนี้ → ก่อนหัวรายการถัดไป) ──
  const heads: number[] = [];
  let footAt = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (FOOT_RE.test(lines[i])) { footAt = Math.min(footAt, i); continue; }
    if (i < footAt && ITEM_RE.test(lines[i])) heads.push(i);
  }

  if (heads.length === 0) return parseEpLegacy(rawText, flat, piNo, date);

  const vehicles: ParsedVehicle[] = [];
  const byModel: QuoteDocCheck["byModel"] = [];
  const noRow: string[] = [];              // รายการที่อ่านจำนวน/ราคาไม่ได้ — ต้องให้คนตรวจ

  for (let k = 0; k < heads.length; k++) {
    const from = heads[k];
    const to = k + 1 < heads.length ? heads[k + 1] : footAt;
    const head = lines[from];
    const block = lines.slice(from, to).join(" ");

    const hm = head.match(ITEM_RE)!;
    const title = hm[2];                                  // "3T Diesel Forklift" (ก่อน "/")
    const model = hm[3].toUpperCase();

    const row = qtyRow(block);
    const cap = capacityOf(block, title);
    const fuel = fuelOf(title) ?? fuelOf(block);
    // สเปกเสา: "Mast:Triplex 3F4500mm" · "Mast: 2-standard mast 2.5M" (ตัวแยกรายการ DS3 สองแถว)
    const mast = block.match(/Mast\s*:\s*([A-Za-z0-9 .\-]+?)(?=\s{2,}|\s*(?:Fork|Engine|Side|Solid|Lithium|Lead|Charger|Battrery|Battery|$))/i)?.[1]?.trim();
    const fork = block.match(/Fork\s*(?:length|Dimensions)\s*:?\s*([\d,]+)\s*[*x]/i)?.[1]?.replace(/,/g, "");

    if (row) byModel.push({ model, qty: row.qty, subtotal: row.total });
    else noRow.push(`${hm[1]}. ${model}`);

    const flags: string[] = [];
    if (!row) flags.push("อ่านจำนวน/ราคาจากใบไม่ได้ — กรอกเอง");
    if (!cap.kg) flags.push("ไม่พบพิกัดยก");

    const build = (): ParsedVehicle => ({
      brand: "EP", model,
      capacity: cap.text,
      capacity_kg: cap.kg,
      fork_length: fork || undefined,
      height: heightOf(mast),
      mast: mast || undefined,
      fuel,
      cost_price: row?.unit,
      pi_no: piNo,
      import_ref: importRef,
      vendor: "EP",
      flags: flags.length ? flags : undefined,
    });
    for (let q = 0; q < (row?.qty ?? 1); q++) vehicles.push(build());
  }

  // ── ตรวจยอดรวมกับท้ายใบ (7% VAT + Total Cost) ──
  const vat = toBaht(flat.match(/%\s*VAT\s*฿?\s*([\d,]+\.\d{2})/i)?.[1]);
  const totalCost = toBaht(flat.match(/Total\s*Cost\s*:?\s*฿?\s*([\d,]+\.\d{2})/i)?.[1]);
  const sum = byModel.reduce((n, b) => n + (b.subtotal ?? 0), 0);
  const warn: string[] = [];
  if (vat && totalCost) {
    const docPreVat = Math.round((totalCost - vat) * 100) / 100;
    if (Math.abs(docPreVat - sum) > Math.max(1, docPreVat * 0.005)) {
      warn.push(`ยอดท้ายใบก่อน VAT ${docPreVat.toLocaleString("th-TH")} ไม่ตรงกับผลรวมรายการ ${sum.toLocaleString("th-TH")} — ตรวจกับใบจริง`);
    }
  }
  if (noRow.length) warn.push(`รายการที่อ่านตัวเลขไม่ได้: ${noRow.join(", ")}`);
  if (warn.length) vehicles.forEach((v) => (v.flags = [...(v.flags ?? []), ...warn]));

  const docCheck: QuoteDocCheck | undefined = byModel.length
    ? { byModel, totalQty: byModel.reduce((n, b) => n + b.qty, 0), totalAmount: sum || undefined }
    : undefined;

  return { vendor: "EP", pi_no: piNo, quote_date: date, vehicles, rawText, docCheck };
}

/** ใบ EP แบบเก่า (Quote No. EPZL...) — 1 ใบ 1 รุ่น ไม่มีตารางจำนวนแบบ SALES LIST */
function parseEpLegacy(rawText: string, text: string, piNo?: string, date?: string): QuoteParseResult {
  const models = [...new Set(
    [...text.matchAll(/(?:Forklift|Truck|Stacker|Pallet|Tractor)\s*\/\s*([A-Z]{2,}[A-Z0-9-]*\d[A-Z0-9-]*)/gi)].map((m) => m[1].toUpperCase()),
  )];
  if (models.length === 0) {
    const m = text.match(/\b(E[A-Z]{1,3}\d{2,4}[A-Z0-9]*)\b/);
    if (m) models.push(m[1].toUpperCase());
  }

  const capKg = text.match(/Capacity\s*:?\s*([\d,]+)\s*kg/i)?.[1]?.replace(/,/g, "");
  const fork = text.match(/fork\s*length\s*:?\s*([\d,]+)\s*mm/i)?.[1]?.replace(/,/g, "");
  const mastType = text.match(/Mast\s*:?\s*((?:Triplex|Duplex|Simplex|Standard|Full[- ]?Free|Free)[A-Za-z0-9 .\-]*?)(?=\s*(?:实|Solid|tire|Pneumatic|$))/i)?.[1]?.trim();
  const mastH = text.match(/Mast[^]*?(\d(?:\.\d)?)\s*M\b/i)?.[1];
  const fuel = fuelOf(text);
  const cost = toBaht(text.match(/([\d,]{4,}\.\d{2})/)?.[1]);

  const vehicles: ParsedVehicle[] = models.map((model) => {
    const flags: string[] = [];
    if (!cost) flags.push("ไม่พบราคาทุน");
    if (!capKg) flags.push("ไม่พบพิกัดยก");
    return {
      brand: "EP", model,
      capacity: capKg ? `${(Number(capKg) / 1000).toFixed(1)} ตัน` : undefined,
      capacity_kg: capKg || undefined,
      fork_length: fork || undefined,
      height: mastH ? `${Number(mastH).toFixed(2)} ม.` : undefined,
      mast: mastType || (mastH ? `${mastH}M` : undefined),
      fuel,
      cost_price: cost,
      pi_no: piNo,
      import_ref: piNo,
      vendor: "EP",
      flags: flags.length ? flags : undefined,
    };
  });

  if (vehicles.length > 1) {
    vehicles.forEach((v) => (v.flags = [...(v.flags ?? []), "ใบนี้มีหลายรุ่น — ตรวจสเปกแต่ละคัน"]));
  }

  return { vendor: "EP", pi_no: piNo, quote_date: date, vehicles, rawText };
}
