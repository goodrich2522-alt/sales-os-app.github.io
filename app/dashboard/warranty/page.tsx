"use client";

import Link from "next/link";
import { useState, useMemo, useEffect } from "react";
import {
  ArrowLeft, ShieldCheck, Download, AlertTriangle, Clock, CheckCircle, Wrench, ChevronDown,
} from "lucide-react";
import { useApp } from "@/lib/AppContext";
import { parseSvc, nextDue, daysUntil, SVC_SOON_DAYS, SVC_ROUNDS } from "@/lib/warranty";
import { isForkliftVehicle } from "@/lib/commission";
import { displayCode } from "@/lib/productId";
import { WarrantyBlock } from "@/components/WarrantyBlock";
import { DashboardGuard } from "@/components/DashboardGuard";

function WarrantyPageInner() {
  const { forklifts, sales } = useApp();
  const today = new Date().toISOString().slice(0, 10);
  const [filter, setFilter] = useState<"due" | "overdue" | "soon" | "all">("due");
  const [openId, setOpenId] = useState<string | null>(null); // การ์ดที่กางดู/แก้รอบเช็ค
  const [actor, setActor] = useState("แดชบอร์ด");
  useEffect(() => {
    try { const du = localStorage.getItem("dash_user"); if (du) { const p = JSON.parse(du); setActor(p.name || p.email || "แดชบอร์ด"); } } catch {}
  }, []);

  // ── ลูกค้า/เซลล์ล่าสุดต่อรถ (จากดีล) ──
  // ⭐ (24 ก.ย. 2569) จับคู่ด้วย **ทั้งรหัสรถและ SN** — ดีลเก่าบางใบผูกไว้กับรหัสชั่วคราว
  //    (เช่น PI124#20) ตั้งแต่ตอนรถยังไม่มี SN พอได้ SN จริงรหัสรถเปลี่ยน ดีลเลยชี้ไม่ถึงคันนั้น
  //    → หน้านี้เคยขึ้นชื่อลูกค้า/เซลล์เป็น "—" ทั้งที่ขายไปแล้ว (เจอจริง 2 คัน)
  const { custByFk, sellerByFk } = useMemo(() => {
    const cust = new Map<string, string>(), seller = new Map<string, string>();
    const put = (m: Map<string, string>, k: string, v: string) => { const key = k.trim().toUpperCase(); if (key && v) m.set(key, v); };
    [...sales].sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")))
      .forEach(s => {
        [s.forklift_id, s.forklift_unit_no].forEach(k => {
          put(cust, String(k ?? ""), String(s.customer_name ?? ""));
          put(seller, String(k ?? ""), String(s.sales_staff ?? ""));
        });
      });
    return { custByFk: cust, sellerByFk: seller };
  }, [sales]);
  /** หาค่าจากดีล — ลองรหัสรถก่อน ไม่เจอค่อยลอง SN */
  const fromSale = (m: Map<string, string>, f: { id: string; SN?: string }) =>
    m.get(String(f.id ?? "").trim().toUpperCase()) || m.get(String(f.SN ?? "").trim().toUpperCase()) || "";

  // รถที่มีข้อมูลบริการหลังการขาย → คำนวณรอบถัดไป + จำนวนวันถึงกำหนด
  const rows = useMemo(() => {
    return forklifts.flatMap(f => {
      const svc = parseSvc(f);
      if (!svc) return [];
      if (!isForkliftVehicle(f.brand, f.model)) return []; // รถประเภทอื่น (แฮนด์ลิฟท์/สแตกเกอร์/STAXX) ไม่มีรอบเซอร์วิส — แค่รับประกัน 1 ปี
      const nd = nextDue(svc);
      const doneCount = svc.rounds.filter(r => r.done).length;
      const days = nd ? daysUntil(nd.due, today) : null;
      return [{
        fk: f, svc, customer: fromSale(custByFk, f), seller: fromSale(sellerByFk, f),
        nextIndex: nd?.index ?? null, due: nd?.due ?? "", days,
        doneCount, complete: !nd,
      }];
    }).sort((a, b) => {
      if (a.complete !== b.complete) return a.complete ? 1 : -1; // ยังไม่ครบก่อน
      return (a.days ?? 9999) - (b.days ?? 9999);                // ใกล้/เกินกำหนดก่อน
    });
  }, [forklifts, custByFk, sellerByFk, today]);

  const overdue = rows.filter(r => !r.complete && r.days != null && r.days < 0);
  const soon = rows.filter(r => !r.complete && r.days != null && r.days >= 0 && r.days <= SVC_SOON_DAYS);
  const active = rows.filter(r => !r.complete);
  const shown = filter === "overdue" ? overdue : filter === "soon" ? soon : filter === "all" ? rows : [...overdue, ...soon];

  const badgeOf = (r: typeof rows[number]) => {
    if (r.complete) return { t: "✅ ครบทุกรอบ", c: "bg-slate-100 text-slate-500 border-slate-200" };
    if (r.days == null) return { t: "ยังไม่ระบุวันเริ่ม", c: "bg-slate-100 text-slate-500 border-slate-200" };
    if (r.days < 0) return { t: `🔴 เกินกำหนด ${Math.abs(r.days)} วัน`, c: "bg-red-100 text-red-700 border-red-200" };
    if (r.days <= SVC_SOON_DAYS) return { t: `🟡 อีก ${r.days} วัน`, c: "bg-amber-100 text-amber-700 border-amber-200" };
    return { t: `🟢 อีก ${r.days} วัน`, c: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  };

  const exportExcel = async () => {
    if (rows.length === 0) return;
    const XLSX = await import("xlsx");
    const data = rows.map(r => ({
      "SN": r.fk.SN || r.fk.id, "ยี่ห้อ/รุ่น": `${r.fk.brand ?? ""} ${r.fk.model ?? ""}`.trim(),
      "ลูกค้า": r.customer, "เซลล์ผู้ขาย": r.seller, "วันเริ่มรับประกัน": r.svc.start,
      "เช็คแล้ว (รอบ)": r.doneCount, "รอบถัดไป": r.complete ? "ครบแล้ว" : `รอบที่ ${(r.nextIndex ?? 0) + 1}`,
      "กำหนดรอบถัดไป": r.due, "สถานะ": r.complete ? "ครบทุกรอบ" : r.days == null ? "-" : r.days < 0 ? `เกิน ${Math.abs(r.days)} วัน` : `อีก ${r.days} วัน`,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [16, 22, 22, 16, 14, 12, 12, 14, 14].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "รอบเช็ครับประกัน");
    XLSX.writeFile(wb, `รับประกัน_รอบเช็ค_${today}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-all"><ArrowLeft className="w-5 h-5" /></Link>
            <div className="flex items-center gap-2.5">
              <div className="bg-gradient-to-br from-teal-500 to-emerald-600 rounded-xl p-2"><ShieldCheck className="w-5 h-5 text-white" /></div>
              <div>
                <h1 className="text-base font-bold text-slate-800 leading-tight">รับประกัน / รอบเช็ค</h1>
                <p className="text-slate-500 text-xs">รถในประกัน + รอบเข้าเช็คใกล้ถึงกำหนด (คิดเป็นเดือน)</p>
              </div>
            </div>
          </div>
          <button onClick={exportExcel} disabled={rows.length === 0}
            className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-3 py-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            <Download className="w-4 h-4" /><span className="hidden sm:inline">Export Excel</span>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-5">
        {/* สรุป */}
        <div className="grid grid-cols-3 gap-3">
          <div className={`rounded-2xl border shadow-sm p-4 ${overdue.length > 0 ? "bg-red-50 border-red-200" : "bg-white border-slate-100"}`}>
            <p className="text-xs text-slate-500 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-red-500" />เกินกำหนด</p>
            <p className={`text-2xl font-bold mt-1 ${overdue.length > 0 ? "text-red-600" : "text-slate-800"}`}>{overdue.length} <span className="text-sm font-medium text-slate-400">คัน</span></p>
          </div>
          <div className={`rounded-2xl border shadow-sm p-4 ${soon.length > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-slate-100"}`}>
            <p className="text-xs text-slate-500 flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-amber-500" />ใกล้ถึง (≤{SVC_SOON_DAYS} วัน)</p>
            <p className={`text-2xl font-bold mt-1 ${soon.length > 0 ? "text-amber-600" : "text-slate-800"}`}>{soon.length} <span className="text-sm font-medium text-slate-400">คัน</span></p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-xs text-slate-500 flex items-center gap-1"><Wrench className="w-3.5 h-3.5 text-teal-500" />รถในประกัน (ยังไม่ครบรอบ)</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{active.length} <span className="text-sm font-medium text-slate-400">/ {rows.length} คัน</span></p>
          </div>
        </div>

        {/* ตัวกรอง */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3 flex flex-wrap items-center gap-2">
          {([["due", `ต้องตาม (${overdue.length + soon.length})`], ["overdue", `เกินกำหนด (${overdue.length})`], ["soon", `ใกล้ถึง (${soon.length})`], ["all", `ทั้งหมด (${rows.length})`]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-all ${filter === k ? "bg-teal-600 text-white border-teal-600" : "bg-white text-slate-600 border-slate-200 hover:border-teal-300"}`}>
              {label}
            </button>
          ))}
        </div>

        {/* รายการ */}
        <div className="flex flex-col gap-2.5">
          {shown.length === 0 && (
            <div className="text-center py-14 text-slate-400"><CheckCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" /><p className="text-sm">ไม่มีรถที่ต้องตามรอบเช็คในหมวดนี้</p></div>
          )}
          {shown.map(r => {
            const b = badgeOf(r);
            const open = openId === r.fk.id;
            return (
              <div key={r.fk.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                {/* หัวการ์ด — กดเพื่อกาง/พับ รายละเอียด + แก้รอบเช็ค */}
                <button onClick={() => setOpenId(open ? null : r.fk.id)}
                  className="w-full p-4 flex items-center gap-3 flex-wrap text-left hover:bg-slate-50 transition-all">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md text-slate-500 bg-slate-100 border border-slate-200">#{displayCode(r.fk)}</span>
                      <span className="font-bold text-slate-800 text-sm">{r.fk.brand} {r.fk.model}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {r.customer || "—"}{r.seller ? ` · เซลล์ ${r.seller}` : ""} · เริ่มรับประกัน {r.svc.start || "—"} · เช็คแล้ว {r.doneCount}/{SVC_ROUNDS} รอบ
                    </p>
                    {!r.complete && (
                      <p className="text-[11px] text-teal-700 mt-0.5 font-semibold">รอบถัดไป: รอบที่ {(r.nextIndex ?? 0) + 1} · กำหนด {r.due || "— (ยังไม่ระบุวันเริ่ม)"}</p>
                    )}
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full border flex-shrink-0 ${b.c}`}>{b.t}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
                </button>
                {/* กางแล้ว → แก้/บันทึกรอบเช็คได้เลย (WarrantyBlock เดียวกับหน้าสต็อก) */}
                {open && (
                  <div className="px-4 pb-4 border-t border-slate-100 pt-3">
                    <WarrantyBlock forklift={r.fk} actor={actor} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <details className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-sm text-slate-600">
          <summary className="font-bold text-slate-700 cursor-pointer">วิธีคิดรอบเช็ค</summary>
          <div className="mt-3 flex flex-col gap-2 text-xs leading-relaxed">
            <div>คิดเป็น <b>เดือน</b> ไม่ผูกกับชั่วโมงใช้งาน (แต่ละคันใช้งานต่างกัน) · ฟรี {SVC_ROUNDS} รอบ</div>
            <div><b>รอบแรก</b> = วันเริ่มรับประกัน (วันส่งมอบ) + 3 เดือน · <b>รอบถัดไป</b> = วันเข้าเช็คจริงครั้งก่อน + 3 เดือน</div>
            <div className="text-slate-400">🔴 เกินกำหนด · 🟡 ใกล้ถึง (≤{SVC_SOON_DAYS} วัน) · 🟢 ยังไม่ถึง · <b>กดที่การ์ดรถ</b>เพื่อกางบันทึกรอบเช็ค/แก้เงื่อนไขรับประกันได้ที่หน้านี้เลย</div>
          </div>
        </details>
      </main>
    </div>
  );
}

export default function WarrantyPage() {
  return <DashboardGuard><WarrantyPageInner /></DashboardGuard>;
}
