"use client";
// components/PaymentImport.tsx — นำเข้าไฟล์ Excel รับเงิน แล้วเติม "วันรับเงิน" ให้ดีลที่รอรับเงิน (หน้าค่าคอม)
// อ่านไฟล์ในเครื่อง 100% → จับคู่กับดีล → คนตรวจ/ติ๊กเลือก → บันทึก
// ตัวอ่าน + กติกาจับคู่อยู่ที่ lib/paymentImport.ts

import { useMemo, useState } from "react";
import { X, Upload, FileSpreadsheet, CheckCircle, AlertTriangle, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { useApp } from "@/lib/AppContext";
import { readPaymentWorkbook, matchPayments, type PaymentDoc, type MatchResult, type MatchLevel } from "@/lib/paymentImport";
import { closeDate } from "@/lib/commission";
import { staffLabel } from "@/lib/constants";
import { thaiDate } from "@/lib/format";
import type { Sale } from "@/lib/types";

const fmt = (n: number) => Number(n || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const LEVEL_STYLE: Record<MatchLevel, string> = {
  "สูง": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "กลาง": "bg-sky-100 text-sky-700 border-sky-200",
  "ต่ำ": "bg-amber-100 text-amber-700 border-amber-200",
};

export function PaymentImport({ pending, onClose }: { pending: Sale[]; onClose: () => void }) {
  const { updateSale, fieldConfig } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [docs, setDocs] = useState<PaymentDoc[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());   // saleId ที่ติ๊กจะบันทึก
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);

  const locks = fieldConfig.commissionLocks || {};
  const isLocked = (iso: string) => !!locks[iso.slice(0, 7)];

  const result: MatchResult | null = useMemo(() => (docs.length ? matchPayments(pending, docs) : null), [docs, pending]);

  const handleFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true); setErr(""); setSaved(null);
    const all: PaymentDoc[] = [];
    const names: string[] = [];
    const warns: string[] = [];
    for (const f of Array.from(list)) {
      if (!/\.(xlsx|xls)$/i.test(f.name)) { warns.push(`"${f.name}" ไม่ใช่ไฟล์ Excel`); continue; }
      try {
        const r = await readPaymentWorkbook(f);
        r.warnings.forEach((w) => warns.push(`"${f.name}": ${w}`));
        all.push(...r.docs);
        names.push(f.name);
      } catch (e) {
        warns.push(`อ่าน "${f.name}" ไม่ได้: ${e instanceof Error ? e.message : "ผิดพลาด"}`);
      }
    }
    // หลายไฟล์มีเลขที่เอกสารซ้ำ (เช่นใบผ่อนข้ามเดือน) → รวมวันรับเงินทุกงวด เอางวดล่าสุด
    const merged = new Map<string, PaymentDoc>();
    for (const d of all) {
      const prev = merged.get(d.docNo);
      if (!prev) { merged.set(d.docNo, d); continue; }
      const dates = [...new Set([...prev.paidDates, ...d.paidDates])].sort();
      merged.set(d.docNo, { ...prev, paidDates: dates, paidDate: dates[dates.length - 1] ?? "", sns: prev.sns.length ? prev.sns : d.sns });
    }
    const docList = [...merged.values()];
    setDocs(docList);
    setFiles(names);
    setErr(warns.join(" · "));
    // ติ๊กให้อัตโนมัติ: ความมั่นใจสูง/กลาง และงวดยังไม่ล็อก · ต่ำ/งวดล็อก ให้คนตัดสินเอง
    const r = matchPayments(pending, docList);
    setPicked(new Set(r.matches.filter((m) => m.level !== "ต่ำ" && !isLocked(m.doc.paidDate)).map((m) => m.sale.id)));
    setBusy(false);
  };

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const save = () => {
    if (!result) return;
    let n = 0;
    for (const m of result.matches) {
      if (!picked.has(m.sale.id)) continue;
      const cf = { ...(m.sale.custom_fields || {}) };
      // เลขที่ใบกำกับว่าง + จับคู่ด้วยหลักฐานแน่น → เติมให้ (รอบหน้าจับคู่ด้วยเลขเอกสารได้ทันที)
      if (m.level === "สูง" && !String(cf["เลขที่ใบกำกับภาษี"] || "").trim()) cf["เลขที่ใบกำกับภาษี"] = m.doc.docNo;
      cf["อ้างอิงรับเงิน"] = [m.doc.docNo, m.doc.channel].filter(Boolean).join(" · ");
      updateSale({ ...m.sale, payment_received_date: m.doc.paidDate, custom_fields: cf });
      n++;
    }
    setSaved(n);
  };

  const pickedCount = result ? result.matches.filter((m) => picked.has(m.sale.id)).length : 0;
  const byLevel = (lv: MatchLevel) => result?.matches.filter((m) => m.level === lv).length ?? 0;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-3xl w-full max-w-5xl max-h-[88vh] flex flex-col shadow-2xl">
        {/* header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-emerald-600" />นำเข้าไฟล์รับเงิน → เติมวันรับเงินให้ดีล</h3>
            <p className="text-xs text-slate-500 mt-0.5">ไฟล์ &ldquo;รายงานภาษีขาย ... -รับเงิน&rdquo; จากระบบบัญชี · อ่านในเครื่อง 100% · ดีลรอรับเงิน {pending.length} ดีล</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0 p-5 flex flex-col gap-4">
          {saved !== null ? (
            <div className="text-center py-10 text-emerald-700">
              <CheckCircle className="w-12 h-12 mx-auto mb-3" />
              <p className="font-bold">บันทึกวันรับเงินแล้ว {saved} ดีล</p>
              <p className="text-sm text-slate-500 mt-1">ดีลเหล่านี้จะย้ายเข้างวดค่าคอมตามเดือนที่รับเงิน</p>
              <button onClick={onClose} className="mt-5 px-5 py-2 rounded-xl text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700">เสร็จสิ้น</button>
            </div>
          ) : (
            <>
              {/* dropzone */}
              <label className="border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/40 transition-all">
                <input type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
                {busy ? <Loader2 className="w-8 h-8 mx-auto text-emerald-600 animate-spin" /> : <Upload className="w-8 h-8 mx-auto text-slate-400" />}
                <p className="text-sm font-semibold text-slate-600 mt-2">{busy ? "กำลังอ่าน..." : files.length ? `อ่านแล้ว: ${files.join(", ")}` : "ลากไฟล์ Excel รับเงินมาวาง หรือกดเลือก"}</p>
                <p className="text-xs text-slate-400 mt-0.5">เลือกหลายเดือนพร้อมกันได้ · ใช้ชีต ใบเสร็จรับเงิน / ใบแจ้งหนี้ · ข้ามใบรับมัดจำ (ยังไม่ใช่รับเงินครบ)</p>
              </label>

              {err && <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{err}</div>}

              {result && (
                <>
                  {/* สรุป */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5"><p className="text-lg font-bold text-slate-700">{result.matches.length}/{pending.length}</p><p className="text-[11px] text-slate-500">จับคู่ได้</p></div>
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-2.5"><p className="text-lg font-bold text-emerald-700">{byLevel("สูง")}</p><p className="text-[11px] text-emerald-600">มั่นใจสูง (เลขเอกสาร/SN)</p></div>
                    <div className="rounded-xl bg-sky-50 border border-sky-200 p-2.5"><p className="text-lg font-bold text-sky-700">{byLevel("กลาง")}</p><p className="text-[11px] text-sky-600">กลาง (ชื่อ+ยอด)</p></div>
                    <div className="rounded-xl bg-amber-50 border border-amber-200 p-2.5"><p className="text-lg font-bold text-amber-700">{byLevel("ต่ำ")}</p><p className="text-[11px] text-amber-600">ต่ำ (ชื่ออย่างเดียว) — ตรวจก่อน</p></div>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    ข้ามเอกสาร: ใบรับมัดจำ {result.skipped.deposit} · งานเช่า/ซ่อม {result.skipped.otherKind} · ยังไม่มีวันรับเงิน {result.skipped.noDate}
                    {" · "}ผ่อนหลายงวดใช้ <b>วันรับเงินงวดล่าสุด</b> (= รับเงินครบ)
                  </p>

                  {/* รายการที่จับคู่ได้ */}
                  {result.matches.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {result.matches.map((m) => {
                        const locked = isLocked(m.doc.paidDate);
                        const on = picked.has(m.sale.id);
                        return (
                          <label key={m.sale.id}
                            className={`rounded-2xl border p-3 flex items-start gap-3 cursor-pointer transition-colors ${on ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                            <input type="checkbox" checked={on} onChange={() => toggle(m.sale.id)} className="w-4 h-4 mt-1 accent-emerald-600 flex-shrink-0" />
                            <div className="flex-1 min-w-0 grid sm:grid-cols-2 gap-x-4 gap-y-1">
                              {/* ดีลในแอป */}
                              <div className="min-w-0">
                                <p className="text-[10px] font-bold text-slate-400 uppercase">ดีลในแอป</p>
                                <p className="text-sm font-semibold text-slate-800 truncate">{m.sale.forklift_brand} {m.sale.forklift_model}</p>
                                <p className="text-[11px] text-slate-500 truncate">
                                  {staffLabel(m.sale.sales_staff || "(ไม่ระบุเซลล์)", fieldConfig.resignedStaff ?? [])} · {m.sale.customer_name || "—"}
                                </p>
                                <p className="text-[11px] text-slate-500">ปิด {thaiDate(closeDate(m.sale))} · ยอด {fmt(m.sale.actual_sale)}{m.sale.forklift_unit_no ? ` · SN ${m.sale.forklift_unit_no}` : ""}</p>
                              </div>
                              {/* เอกสารในไฟล์ */}
                              <div className="min-w-0">
                                <p className="text-[10px] font-bold text-slate-400 uppercase">เอกสารในไฟล์</p>
                                <p className="text-sm font-semibold text-slate-800">
                                  {m.doc.docNo} → รับเงิน <span className="text-emerald-700">{thaiDate(m.doc.paidDate)}</span>
                                </p>
                                <p className="text-[11px] text-slate-500 truncate">{m.doc.customer} · ก่อน VAT {fmt(m.doc.net)} · รวม {fmt(m.doc.total)}</p>
                                {m.doc.paidDates.length > 1 && <p className="text-[11px] text-slate-400">ผ่อน {m.doc.paidDates.length} งวด: {m.doc.paidDates.map(thaiDate).join(", ")}</p>}
                                {m.doc.channel && <p className="text-[11px] text-slate-400 truncate">{m.doc.channel}</p>}
                              </div>
                              <div className="sm:col-span-2 flex items-center gap-1.5 flex-wrap mt-0.5">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${LEVEL_STYLE[m.level]}`}>มั่นใจ{m.level}</span>
                                <span className="text-[11px] text-slate-500">{m.reason}</span>
                                {locked && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-red-100 text-red-700 border-red-200">🔒 งวด {m.doc.paidDate.slice(0, 7)} ล็อก (จ่ายค่าคอมแล้ว) — ติ๊กเองถ้าแน่ใจ</span>}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {/* ดีลที่หาไม่เจอ */}
                  {result.unmatched.length > 0 && (
                    <div className="rounded-2xl border border-slate-200 overflow-hidden">
                      <button onClick={() => setShowUnmatched((v) => !v)} className="w-full px-4 py-2.5 flex items-center gap-2 text-left text-sm font-semibold text-slate-600 hover:bg-slate-50">
                        {showUnmatched ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        ยังหาในไฟล์ไม่เจอ {result.unmatched.length} ดีล — กรอกวันรับเงินเองในหน้าค่าคอม หรือนำเข้าไฟล์เดือนอื่นเพิ่ม
                      </button>
                      {showUnmatched && (
                        <div className="border-t border-slate-100 divide-y divide-slate-100">
                          {result.unmatched.map((s) => (
                            <p key={s.id} className="px-4 py-2 text-xs text-slate-600">
                              {s.forklift_brand} {s.forklift_model} · {s.customer_name || "—"} · ปิด {thaiDate(closeDate(s))} · ยอด {fmt(s.actual_sale)}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* footer */}
        {saved === null && result && result.matches.length > 0 && (
          <div className="px-6 py-3 border-t border-slate-100 flex-shrink-0 flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-slate-500">ติ๊กแล้ว {pickedCount} ดีล · ช่องที่ติ๊กให้อัตโนมัติ = มั่นใจสูง/กลาง และงวดยังไม่ล็อก</p>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100">ยกเลิก</button>
              <button onClick={save} disabled={pickedCount === 0}
                className={`px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 ${pickedCount ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}>
                <CheckCircle className="w-4 h-4" />บันทึกวันรับเงิน {pickedCount} ดีล
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
