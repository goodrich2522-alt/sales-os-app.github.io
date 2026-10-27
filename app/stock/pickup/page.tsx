"use client";

// app/stock/pickup/page.tsx — รายงาน "รถที่ต้องไปรับ"
//
// ที่มา (27 ต.ค. 2569 · เจ้าของขอ): รถค้างไม่เข้าคลัง 43 คัน 18 ล็อต ยังไม่ถ่ายรูปรับสักคัน
// บางล็อตค้างมา 129 วัน และ 13 จาก 18 ล็อตไม่มีวันรับระบุไว้เลย
// ของเดิมดูได้แค่ทีละคันในหน้าสต็อก มองไม่ออกว่าค้างทั้งล็อตมานานแค่ไหน
//
// จัดกลุ่ม "ตามล็อต" เพราะไปรับทีเดียวทั้งล็อต ไม่ได้ไปทีละคัน
// แยก "ไปรับได้แล้ว" กับ "รอผลิต" ออกจากกัน — รอผลิตคือโรงงานยังทำไม่เสร็จ ยังไปรับไม่ได้
// ไม่มีการมอบหมายคน (เจ้าของบอกว่าใครไปก็ได้)
//
// วันนัดรับ/สถานที่รับ/หมายเหตุ เก็บใน custom_fields — ไม่ต้องแก้โครงฐานข้อมูล

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useMemo, useEffect } from "react";
import { ArrowLeft, Truck, Factory, Download, Printer, Copy, Calendar, MapPin, Check, Camera } from "lucide-react";
import { useApp } from "@/lib/AppContext";
import type { Forklift } from "@/lib/types";

/** สถานะที่ยังไม่เข้าคลัง — แยก 2 กลุ่มตามที่เจ้าของขอ */
const READY = ["รอรับ", "รอยืนยันนำเข้าสต็อก"];   // ของถึงแล้ว ไปรับได้
const MAKING = ["สั่งผลิต"];                       // โรงงานยังผลิตอยู่ ยังไปรับไม่ได้

const F_DATE = "วันนัดรับ";
const F_PLACE = "สถานที่รับ";
const F_NOTE = "หมายเหตุการรับรถ";

const cf = (f: Forklift, k: string) => String((f.custom_fields as Record<string, unknown> | undefined)?.[k] ?? "").trim();
const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (iso: string) => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.round((Date.now() - t) / 86_400_000);
};
const thaiDate = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
};

interface Lot {
  pi: string;
  brand: string;
  cars: Forklift[];
  models: string[];
  due: string;          // วันนัดรับที่กรอกไว้
  place: string;
  note: string;
  since: string;        // วันที่ใช้นับอายุ (นัดรับ > วันรับที่ระบุ > วันสร้าง)
  days: number | null;  // ค้างมากี่วัน
  shot: number;         // ถ่ายรูปรับแล้วกี่คัน
}

export default function PickupReportPage() {
  const router = useRouter();
  const { forklifts, inspections, updateForkliftsBulk } = useApp();
  const [edit, setEdit] = useState<null | { pi: string; due: string; place: string; note: string }>(null);
  const [toast, setToast] = useState("");
  const [tab, setTab] = useState<"ready" | "making">("ready");

  useEffect(() => {
    if (!localStorage.getItem("stock_user")) router.push("/stock/login");
  }, [router]);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2600); };

  /** SN ที่มีใบตรวจรับแล้ว — ใช้บอกความคืบหน้าโดยไม่ต้องกรอกอะไรเพิ่ม */
  const shotSet = useMemo(() => new Set(
    (inspections ?? []).map(i => String((i as { unit_no?: string }).unit_no ?? "").trim().toUpperCase()).filter(Boolean)
  ), [inspections]);

  const lotsOf = (statuses: string[]): Lot[] => {
    const g = new Map<string, Forklift[]>();
    forklifts.filter(f => statuses.includes(String(f.status ?? "").trim())).forEach(f => {
      const k = String(f.pi_no ?? "").trim() || "(ไม่ระบุล็อต)";
      if (!g.has(k)) g.set(k, []);
      g.get(k)!.push(f);
    });
    return [...g.entries()].map(([pi, cars]) => {
      const first = cars[0];
      const due = cf(first, F_DATE);
      const since = due || String(first.received_date ?? "").trim() || String(first.created_at ?? "").slice(0, 10);
      return {
        pi, brand: String(first.brand ?? "").trim() || "—", cars,
        models: [...new Set(cars.map(c => String(c.model ?? "").trim()).filter(Boolean))],
        due, place: cf(first, F_PLACE), note: cf(first, F_NOTE),
        since, days: since ? daysBetween(since) : null,
        shot: cars.filter(c => shotSet.has(String(c.SN || c.id).trim().toUpperCase())).length,
      };
    }).sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
  };

  const ready = useMemo(() => lotsOf(READY), [forklifts, shotSet]);   // eslint-disable-line react-hooks/exhaustive-deps
  const making = useMemo(() => lotsOf(MAKING), [forklifts, shotSet]); // eslint-disable-line react-hooks/exhaustive-deps
  const lots = tab === "ready" ? ready : making;
  const totalCars = (l: Lot[]) => l.reduce((n, x) => n + x.cars.length, 0);

  /** ไฟเตือนตามอายุ — ไม่ระบุวันถือว่าน่าห่วงเหมือนกัน เพราะไม่มีใครตามได้ */
  const tone = (l: Lot) =>
    l.days === null ? { bg: "bg-slate-50 border-slate-200", chip: "bg-slate-200 text-slate-700", label: "ไม่ระบุวัน" }
      : l.days >= 30 ? { bg: "bg-red-50 border-red-200", chip: "bg-red-100 text-red-700", label: `ค้าง ${l.days} วัน` }
        : l.days >= 15 ? { bg: "bg-amber-50 border-amber-200", chip: "bg-amber-100 text-amber-800", label: `ค้าง ${l.days} วัน` }
          : { bg: "bg-white border-slate-200", chip: "bg-emerald-100 text-emerald-700", label: `${l.days} วัน` };

  const saveLot = () => {
    if (!edit) return;
    const lot = lots.find(l => l.pi === edit.pi);
    if (!lot) return;
    // เขียนลงทุกคันในล็อต — ทั้งล็อตไปรับพร้อมกัน ข้อมูลจึงต้องตรงกัน
    updateForkliftsBulk(lot.cars.map(c => ({
      ...c,
      custom_fields: {
        ...(c.custom_fields || {}),
        [F_DATE]: edit.due.trim(),
        [F_PLACE]: edit.place.trim(),
        [F_NOTE]: edit.note.trim(),
      },
    })));
    say(`บันทึกล็อต ${edit.pi} แล้ว ✓ (${lot.cars.length} คัน)`);
    setEdit(null);
  };

  const lineText = (l: Lot) => [
    `🚚 ไปรับรถ ${l.pi}`,
    `${l.brand} · ${l.cars.length} คัน`,
    `รุ่น: ${l.models.join(", ") || "-"}`,
    l.due ? `นัดรับ: ${thaiDate(l.due)}` : "นัดรับ: ยังไม่กำหนด",
    l.place ? `สถานที่: ${l.place}` : "",
    l.note ? `หมายเหตุ: ${l.note}` : "",
    "",
    "SN / รหัสรถ:",
    ...l.cars.map((c, i) => `${i + 1}. ${c.SN || c.id}  ${c.model ?? ""}`),
  ].filter(Boolean).join("\n");

  const copyLot = async (l: Lot) => {
    try { await navigator.clipboard.writeText(lineText(l)); say("คัดลอกแล้ว — วางใน Line ได้เลย ✓"); }
    catch { say("คัดลอกไม่สำเร็จ — เบราว์เซอร์ไม่อนุญาต"); }
  };

  const exportCsv = () => {
    const esc = (s: unknown) => { const t = String(s ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const head = ["กลุ่ม", "ล็อต", "ผู้ผลิต", "จำนวนคัน", "รุ่น", "วันนัดรับ", "ค้าง (วัน)", "สถานที่รับ", "ถ่ายรูปแล้ว", "หมายเหตุ", "SN"];
    const rows = [...ready.map(l => ["ไปรับได้แล้ว", l] as const), ...making.map(l => ["รอผลิต", l] as const)]
      .map(([g, l]) => [g, l.pi, l.brand, l.cars.length, l.models.join(" / "), l.due, l.days ?? "", l.place,
        `${l.shot}/${l.cars.length}`, l.note, l.cars.map(c => c.SN || c.id).join(" ")]);
    const blob = new Blob(["﻿" + [head, ...rows].map(r => r.map(esc).join(",")).join("\n") + "\n"], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `รถที่ต้องไปรับ-${today()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-20 print:hidden">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <Link href="/stock/main" className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 text-sm font-medium">
            <ArrowLeft className="w-4 h-4" />กลับหน้าสต็อก
          </Link>
          <div className="flex items-center gap-2 ml-1">
            <Truck className="w-5 h-5 text-sky-600" />
            <h1 className="text-base font-bold text-slate-800">รถที่ต้องไปรับ</h1>
          </div>
          <div className="flex-1" />
          <button onClick={exportCsv} className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-emerald-700 border border-slate-200 hover:border-emerald-300 rounded-lg px-3 py-1.5">
            <Download className="w-4 h-4" />Export Excel
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-indigo-700 border border-slate-200 hover:border-indigo-300 rounded-lg px-3 py-1.5">
            <Printer className="w-4 h-4" />พิมพ์
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-5">
        {/* แท็บ 2 กลุ่ม — รอผลิตยังไปรับไม่ได้ จึงไม่ปนกัน */}
        <div className="flex items-center gap-2 mb-4 print:hidden">
          <button onClick={() => setTab("ready")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold border transition-all ${tab === "ready" ? "bg-sky-600 text-white border-sky-600" : "bg-white text-slate-600 border-slate-200 hover:border-sky-300"}`}>
            <Truck className="w-4 h-4" />ไปรับได้แล้ว ({totalCars(ready)} คัน · {ready.length} ล็อต)
          </button>
          <button onClick={() => setTab("making")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold border transition-all ${tab === "making" ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"}`}>
            <Factory className="w-4 h-4" />รอผลิต ({totalCars(making)} คัน · {making.length} ล็อต)
          </button>
        </div>

        {tab === "making" && (
          <p className="text-[12px] text-violet-800 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2.5 mb-3">
            🏭 ล็อตพวกนี้โรงงานยังผลิตไม่เสร็จ (ใบสั่งซื้อลงท้าย KD) <b>ยังไปรับไม่ได้</b> — ดูไว้เพื่อรู้ว่ากำลังจะเข้ามาเมื่อไหร่
          </p>
        )}

        {lots.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400 text-sm">
            <Check className="w-8 h-8 mx-auto mb-2 text-emerald-500" />ไม่มีรถค้างในกลุ่มนี้
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {lots.map(l => {
              const t = tone(l);
              return (
                <div key={l.pi} className={`rounded-2xl border p-4 ${t.bg}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-800">{l.pi}</span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-white">{l.brand}</span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">{l.cars.length} คัน</span>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${t.chip}`}>{t.label}</span>
                        {l.shot > 0 && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1">
                            <Camera className="w-3 h-3" />ถ่ายแล้ว {l.shot}/{l.cars.length}
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-slate-600 mt-1">{l.models.join(" · ") || "—"}</p>
                      <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{l.due ? `นัดรับ ${thaiDate(l.due)}` : "ยังไม่กำหนดวันนัดรับ"}</span>
                        {l.place && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{l.place}</span>}
                      </p>
                      {l.note && <p className="text-[11px] text-slate-500 mt-0.5">📝 {l.note}</p>}
                      <p className="text-[10px] text-slate-400 mt-1 font-mono">{l.cars.map(c => c.SN || c.id).join(" · ").slice(0, 160)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 print:hidden">
                      <button onClick={() => copyLot(l)} title="คัดลอกข้อความไปวางใน Line"
                        className="flex items-center gap-1 text-[12px] font-bold text-slate-600 hover:text-emerald-700 border border-slate-200 hover:border-emerald-300 bg-white rounded-lg px-2.5 py-1.5">
                        <Copy className="w-3.5 h-3.5" />ส่ง Line
                      </button>
                      <button onClick={() => setEdit({ pi: l.pi, due: l.due, place: l.place, note: l.note })}
                        className="text-[12px] font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-lg px-3 py-1.5">
                        ตั้งวันนัดรับ
                      </button>
                      <Link href="/transporter/main"
                        className="text-[12px] font-bold text-slate-600 hover:text-sky-700 border border-slate-200 hover:border-sky-300 bg-white rounded-lg px-2.5 py-1.5">
                        หน้ารับรถ
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ตั้งวันนัดรับ/สถานที่ — บันทึกลงทุกคันในล็อต */}
      {edit && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setEdit(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-5">
            <p className="text-lg font-bold text-slate-800">ล็อต {edit.pi}</p>
            <p className="text-[12px] text-slate-500 mb-4">บันทึกให้ทุกคันในล็อตนี้พร้อมกัน</p>
            <label className="block mb-3">
              <span className="text-[11px] text-slate-500 font-semibold">วันนัดรับ</span>
              <input type="date" value={edit.due} onChange={e => setEdit({ ...edit, due: e.target.value })}
                className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
            </label>
            <label className="block mb-3">
              <span className="text-[11px] text-slate-500 font-semibold">สถานที่รับ</span>
              <input value={edit.place} onChange={e => setEdit({ ...edit, place: e.target.value })}
                placeholder="เช่น ท่าเรือแหลมฉบัง / คลังผู้ผลิต"
                className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
            </label>
            <label className="block mb-4">
              <span className="text-[11px] text-slate-500 font-semibold">หมายเหตุ</span>
              <input value={edit.note} onChange={e => setEdit({ ...edit, note: e.target.value })}
                placeholder="เช่น ต้องใช้รถเทรลเลอร์ / ติดต่อคุณ..."
                className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
            </label>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setEdit(null)} className="text-sm font-semibold text-slate-500 px-4 py-2.5">ยกเลิก</button>
              <button onClick={saveLot} className="text-sm font-bold bg-sky-600 hover:bg-sky-700 text-white px-5 py-2.5 rounded-xl">บันทึก</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] bg-emerald-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl shadow-2xl print:hidden">{toast}</div>
      )}
    </div>
  );
}
