"use client";

// components/SalesBackfillImport.tsx — นำเข้า "ใบขายย้อนหลัง" จากไฟล์รายงานภาษีขาย/บิลเงินสด
//
// ที่มา (25 ก.ย. 2569 · ผู้ใช้สั่ง): รถหลายร้อยคันสถานะ "ขายแล้ว" แต่ไม่มีใบขายผูกอยู่
// → ไม่มีชื่อเซลล์/ลูกค้า ยอดขายและค่าคอมไม่ถูกนับ  เปิดดีลย้อนหลังทีละคันไม่ไหว
//
// กติกาที่ยึด:
//   • จับคู่รถด้วย SN ที่เขียนในเอกสารเท่านั้น — ไม่เดาจากรุ่น/ราคา
//   • ใบที่ "ยกเลิก/ร่าง" และงานเช่า/งานซ่อม ไม่นำเข้า
//   • รถที่มีใบขายอยู่แล้ว ข้ามทั้งใบ — ไม่ทับของเดิม
//   • วันที่ในเอกสาร = วันส่งมอบ = วันเริ่มประกัน (กติกาข้อ 8) · อ่านวันที่ไม่ออกจะเตือน ไม่เดา
//   • ค่าคอม: ดีลที่นำเข้าจากบิลภาษีไม่ถูกนับ (ผู้ใช้ยืนยันไว้ 29 ก.ค. 2569) — เลือกได้ในหน้านี้

import { useState } from "react";
import { X, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, Download } from "lucide-react";
import { useApp } from "@/lib/AppContext";
import { readInvoiceFile, InvoiceDoc, SALE_KINDS, isLiveDoc } from "@/lib/salesImport";
import type { Forklift, Sale } from "@/lib/types";

const key = (v: unknown) => String(v ?? "").trim().toUpperCase().replace(/\s+/g, "");

interface Row {
  doc: InvoiceDoc;
  sn: string;
  fk?: Forklift;
  existing?: Sale;
  amount: number;
  flags: string[];
}

export function SalesBackfillImport({ onClose }: { onClose: () => void }) {
  const { forklifts, sales, addSalesBulk } = useApp();
  const [busy, setBusy] = useState("");
  const [docs, setDocs] = useState<InvoiceDoc[]>([]);
  const [err, setErr] = useState("");
  const [countCommission, setCountCommission] = useState(false);
  const [saved, setSaved] = useState(0);
  const [showAll, setShowAll] = useState(false);

  const read = async (files: FileList | null) => {
    if (!files?.length) return;
    setErr(""); setSaved(0);
    const out: InvoiceDoc[] = [];
    let bad = "";
    for (const f of Array.from(files)) {
      setBusy(`กำลังอ่าน ${f.name}…`);
      try { out.push(...(await readInvoiceFile(f))); }
      catch (e) { bad = `อ่านไฟล์ ${f.name} ไม่ได้ — ${e instanceof Error ? e.message : "ไฟล์อาจเสียหาย"}`; }
    }
    setBusy("");
    // ใบเดียวกันมาจากหลายไฟล์ได้ (ใบแจ้งหนี้ + ใบเสร็จ) → เก็บใบเดียว
    const m = new Map(docs.map(d => [d.doc, d]));
    out.forEach(d => m.set(d.doc, d));
    setDocs([...m.values()]);
    setErr(bad || (out.length ? "" : "ไม่พบชีตเอกสารขายในไฟล์นี้ — ต้องมีชีตชื่อ รายงานใบเสร็จรับเงิน · รายงานใบแจ้งหนี้ · บิลเงินสด"));
  };

  // ── จับคู่เอกสาร → รถในระบบ ──
  const fkBySn = new Map<string, Forklift>();
  forklifts.forEach(f => { if (key(f.SN)) fkBySn.set(key(f.SN), f); });
  const fkById = new Map(forklifts.map(f => [key(f.id), f]));
  const saleByFk = new Map<string, Sale>();
  sales.forEach(s => { [s.forklift_id, s.forklift_unit_no].forEach(k => { if (key(k)) saleByFk.set(key(k), s); }); });

  const dead = docs.filter(d => d.sns.length && SALE_KINDS.includes(d.kind) && !isLiveDoc(d));
  const live = docs.filter(d => d.sns.length && SALE_KINDS.includes(d.kind) && isLiveDoc(d));

  const rows: Row[] = live.flatMap(d => {
    const share = d.sns.length;                       // ใบเดียวขายหลายคัน → เฉลี่ยยอดเท่ากัน
    const base = d.net || d.total;
    return d.sns.map(sn => {
      const fk = fkBySn.get(key(sn)) ?? fkById.get(key(sn));
      const existing = fk ? (saleByFk.get(key(fk.id)) ?? saleByFk.get(key(fk.SN))) : saleByFk.get(key(sn));
      const flags: string[] = [];
      if (!d.date) flags.push("เอกสารไม่มีวันที่ — วันเริ่มประกันจะว่าง ต้องกรอกเอง");
      if (!base) flags.push("เอกสารยอดเป็น 0");
      if (share > 1) flags.push(`ใบนี้ขาย ${share} คัน — เฉลี่ยยอดเท่ากัน`);
      if (fk && String(fk.status ?? "").trim() === "พร้อมขาย") flags.push("สต็อกยังขึ้นพร้อมขาย ทั้งที่มีบิลขายแล้ว — จะปรับเป็นปิดการขาย");
      return { doc: d, sn, fk, existing, amount: Math.round((base / share) * 100) / 100, flags };
    });
  });

  const toAdd = rows.filter(r => r.fk && !r.existing);
  const already = rows.filter(r => r.existing);
  const noFk = rows.filter(r => !r.fk);

  const save = () => {
    const list: Sale[] = toAdd.map(r => ({
      id: `sale_bf_${r.doc.doc}_${r.sn}`,
      forklift_id: r.fk!.id,
      forklift_unit_no: r.fk!.SN || r.fk!.id,
      forklift_brand: r.fk!.brand ?? "",
      forklift_model: r.fk!.model ?? "",
      sales_staff: r.doc.staff || "",
      customer_name: r.doc.customer || "",
      customer_tel: "",
      customer_type: "นิติบุคคล" as const,
      province: "",
      payment_type: (/^CH/i.test(r.doc.doc) ? "บิลเงินสด" : "เครดิต") as Sale["payment_type"],
      actual_sale: r.amount,
      deposit: 0,
      delivery_date: r.doc.date,          // วันที่ในเอกสาร = วันส่งมอบ = วันเริ่มประกัน
      sale_status: "ปิดการขาย/จัดส่งแล้ว" as const,
      sale_type: "รถขายเต็มคัน" as const,
      created_at: r.doc.date ? `${r.doc.date}T00:00:00.000Z` : new Date().toISOString(),
      remark: "",
      custom_fields: {
        // ไม่ติดมาร์ก "นำเข้าบิลภาษี" = ให้นับค่าคอมตามปกติ (ดู isImportedSale ใน lib/commission.ts)
        ...(countCommission ? {} : { "ที่มา": "นำเข้าบิลภาษี" }),
        "เลขที่เอกสาร": r.doc.doc,
        "ยอดรวม VAT": String(r.doc.total || ""),
        "ไฟล์ต้นทาง": r.doc.source,
        "นำเข้าเมื่อ": new Date().toISOString().slice(0, 10),
      },
    }));
    addSalesBulk(list);
    setSaved(list.length);
  };

  const exportUnmatched = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(noFk.map(r => ({
      SN: r.sn, "เลขที่เอกสาร": r.doc.doc, "วันที่": r.doc.date, "ลูกค้า": r.doc.customer,
      "เซลล์": r.doc.staff, "รายการ": r.doc.item, "ยอด": r.amount, "ไฟล์": r.doc.source,
    })));
    ws["!cols"] = [16, 16, 12, 34, 18, 46, 12, 30].map(wch => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "หารถไม่เจอ");
    XLSX.writeFile(wb, `ใบขายที่หารถไม่เจอ-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const shown = showAll ? toAdd : toAdd.slice(0, 40);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-3 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-4xl my-6 shadow-xl">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
          <div className="flex-1">
            <p className="font-bold text-slate-800">นำเข้าใบขายย้อนหลัง</p>
            <p className="text-[11px] text-slate-500">ไฟล์รายงานภาษีขายรายเดือน / สรุปยอดขายบิลเงินสด (.xlsx) — เติมชื่อเซลล์ · ลูกค้า · ยอดขาย ให้รถที่ขายไปแล้ว</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4 text-slate-500" /></button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <label className="border-2 border-dashed border-slate-200 hover:border-indigo-300 rounded-xl px-4 py-6 text-center cursor-pointer">
            <input type="file" accept=".xlsx" multiple className="hidden" onChange={e => read(e.target.files)} />
            <Upload className="w-6 h-6 text-slate-400 mx-auto" />
            <p className="text-sm font-semibold text-slate-700 mt-1">เลือกไฟล์ (เลือกหลายไฟล์พร้อมกันได้)</p>
            <p className="text-[11px] text-slate-500">อ่านชีต รายงานใบเสร็จรับเงิน · รายงานใบแจ้งหนี้ · บิลเงินสด</p>
          </label>

          {busy && <p className="text-xs text-slate-500">{busy}</p>}
          {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

          {docs.length > 0 && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Stat n={toAdd.length} label="จะเพิ่มใบขายใหม่" tone="emerald" />
                <Stat n={already.length} label="มีใบขายแล้ว (ข้าม)" tone="slate" />
                <Stat n={noFk.length} label="หารถจาก SN ไม่เจอ" tone="amber" />
                <Stat n={dead.length} label="ใบยกเลิก/ร่าง (ไม่นำเข้า)" tone="slate" />
              </div>

              <label className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                <input type="checkbox" checked={countCommission} onChange={e => setCountCommission(e.target.checked)} className="mt-0.5" />
                <span className="text-slate-700">
                  <b>นับดีลชุดนี้เข้าค่าคอมด้วย</b> — ปกติดีลที่นำเข้าจากบิลภาษีจะไม่ถูกนับ (ตกลงกันไว้ 29 ก.ค. 2569)
                  <br /><span className="text-amber-700">ถ้าค่าคอมของเดือนที่นำเข้าจ่ายไปแล้ว อย่าติ๊กช่องนี้ — ยอดย้อนหลังจะเปลี่ยน</span>
                </span>
              </label>

              {noFk.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex flex-wrap items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span className="text-xs text-amber-800 flex-1">มี {noFk.length} SN ในเอกสารที่ไม่มีรถคันนั้นในระบบ — ไม่นำเข้าให้ (อาจเป็นรถที่ยังไม่ได้บันทึก หรือ SN พิมพ์ต่างกัน)</span>
                  <button onClick={exportUnmatched} className="flex items-center gap-1 text-[11px] font-bold bg-white border border-amber-300 rounded-lg px-2 py-1 text-amber-800">
                    <Download className="w-3 h-3" />ส่งออกดูรายการ
                  </button>
                </div>
              )}

              {toAdd.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-[11px]">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr><th className="px-2 py-1.5 text-left">SN</th><th className="px-2 py-1.5 text-left">รถ</th>
                        <th className="px-2 py-1.5 text-left">ลูกค้า</th><th className="px-2 py-1.5 text-left">เซลล์</th>
                        <th className="px-2 py-1.5 text-right">ยอด</th><th className="px-2 py-1.5 text-left">วันส่งมอบ</th></tr>
                    </thead>
                    <tbody>
                      {shown.map(r => (
                        <tr key={`${r.doc.doc}_${r.sn}`} className="border-t border-slate-100 align-top">
                          <td className="px-2 py-1.5 font-mono text-slate-700">{r.sn}</td>
                          <td className="px-2 py-1.5 text-slate-700">{r.fk!.brand} {r.fk!.model}
                            {r.flags.length > 0 && <div className="text-[10px] text-amber-700">⚠ {r.flags.join(" · ")}</div>}</td>
                          <td className="px-2 py-1.5 text-slate-600">{r.doc.customer || "—"}</td>
                          <td className="px-2 py-1.5 text-slate-600">{r.doc.staff || "—"}</td>
                          <td className="px-2 py-1.5 text-right text-slate-700">{r.amount ? r.amount.toLocaleString("th-TH") : "—"}</td>
                          <td className="px-2 py-1.5 text-slate-600">{r.doc.date || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {toAdd.length > 40 && (
                    <button onClick={() => setShowAll(v => !v)} className="w-full text-[11px] font-semibold text-slate-600 hover:bg-slate-50 py-1.5">
                      {showAll ? "ย่อรายการ" : `ดูทั้งหมด (อีก ${toAdd.length - 40} รายการ)`}
                    </button>
                  )}
                </div>
              )}

              {saved > 0 ? (
                <p className="text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />เพิ่มใบขายย้อนหลังแล้ว {saved} ใบ — เปิดหน้าค่าคอม/รับประกันดูได้เลย
                </p>
              ) : (
                <button onClick={save} disabled={toAdd.length === 0}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-xl px-4 py-2.5 text-sm">
                  บันทึกใบขาย {toAdd.length} ใบ
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone: "emerald" | "amber" | "slate" }) {
  const c = tone === "emerald" ? "bg-emerald-50 border-emerald-200 text-emerald-700"
    : tone === "amber" ? "bg-amber-50 border-amber-200 text-amber-700"
    : "bg-slate-50 border-slate-200 text-slate-600";
  return (
    <div className={`border rounded-xl px-3 py-2 ${c}`}>
      <p className="text-lg font-bold leading-none">{n}</p>
      <p className="text-[11px] mt-0.5">{label}</p>
    </div>
  );
}
