"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useApp } from "@/lib/AppContext";
import { driveImg } from "@/lib/img";
import { mockTransporterData } from "@/lib/mockData";
import { InspectionRecord, DeletedInspectionRecord, Forklift } from "@/lib/types";
import { displayCode } from "@/lib/productId";
import { DashboardGuard } from "@/components/DashboardGuard";
import { normBrand } from "@/lib/brands";
import {
  ArrowLeft, Camera, ImageOff, Calendar, Truck, User,
  Trash2, RotateCcw, AlertTriangle, X, ZoomIn, ChevronLeft, ChevronRight, Info, Download, Search
} from "lucide-react";

function daysLeft(deletedAt: string) {
  const ms = 7 * 24 * 60 * 60 * 1000 - (Date.now() - new Date(deletedAt).getTime());
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function InspectionsPageInner() {
  const { inspections, deletedInspections, deleteInspection, restoreInspection, purgeInspection, forklifts } = useApp();

  const [detail, setDetail]         = useState<InspectionRecord | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [showBin, setShowBin]       = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [purgeConfirm, setPurgeConfirm]   = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [view, setView] = useState<"list" | "daily">("list"); // มุมมอง: แกลเลอรีรายคัน / สรุปรับรถรายวัน
  const [fromDate, setFromDate] = useState(""); // ช่วงวันที่ของรายงานรายวัน (เว้นว่าง = ทั้งหมด)
  const [toDate, setToDate] = useState("");

  const openDetail = (rec: InspectionRecord) => { setDetail(rec); setLightboxIdx(null); };
  const closeDetail = () => { setDetail(null); setLightboxIdx(null); };

  // ค้นหาย้อนหลังง่ายๆ: SN/รหัสรถ · รุ่น/ยี่ห้อ · ผู้ขนส่ง · วันที่ · บทบาท (รับ/ส่ง)
  const fkByUnit = useMemo(() => {
    const m = new Map<string, Forklift>();
    forklifts.forEach(f => { if (f.SN) m.set(String(f.SN).toUpperCase(), f); m.set(String(f.id).toUpperCase(), f); });
    return m;
  }, [forklifts]);
  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const base = !kw ? inspections : inspections.filter(r => {
      const f = fkByUnit.get(String(r.unit_no ?? "").toUpperCase());
      return [r.unit_no, f?.model, f?.brand, f?.pi_no, r.transporter_name, r.date, r.role, r.delivery_company]
        .some(v => String(v ?? "").toLowerCase().includes(kw));
    });
    // เรียงรับรถล่าสุดอยู่บนสุด — วันที่มากไปน้อย · วันเดียวกันใช้ id (ins_<เวลา>) ตัดสิน
    return [...base].sort((a, b) =>
      String(b.date ?? "").localeCompare(String(a.date ?? "")) || String(b.id ?? "").localeCompare(String(a.id ?? "")));
  }, [inspections, fkByUnit, q]);

  // ── สรุปการรับรถเข้าคลังรายวัน (เฉพาะ role "ผู้รับรถ") + สรุปช่วงเวลา ──
  const daily = useMemo(() => {
    const recv = inspections.filter(r => (r.role ?? "ผู้รับรถ") === "ผู้รับรถ");
    const inRange = recv.filter(r => {
      const d = String(r.date ?? "").slice(0, 10);
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });
    const fkOf = (r: InspectionRecord) => fkByUnit.get(String(r.unit_no ?? "").toUpperCase());
    // จัดกลุ่มตามวัน
    const dayMap = new Map<string, InspectionRecord[]>();
    inRange.forEach(r => { const d = String(r.date ?? "—").slice(0, 10) || "—"; if (!dayMap.has(d)) dayMap.set(d, []); dayMap.get(d)!.push(r); });
    const days = [...dayMap.entries()].map(([date, recs]) => {
      const brands = new Map<string, number>();
      const receivers = new Set<string>();
      const pis = new Set<string>();
      let withPhotos = 0;
      recs.forEach(r => {
        const fk = fkOf(r);
        const b = normBrand(fk?.brand) || "—"; brands.set(b, (brands.get(b) ?? 0) + 1);
        if (r.transporter_name) receivers.add(r.transporter_name);
        if (fk?.pi_no) pis.add(fk.pi_no);
        if ((r.images?.length ?? 0) > 0) withPhotos++;
      });
      return { date, count: recs.length, withPhotos,
        brands: [...brands.entries()].sort((a, b) => b[1] - a[1]),
        receivers: [...receivers], pis: [...pis], recs };
    }).sort((a, b) => b.date.localeCompare(a.date)); // วันล่าสุดบนสุด
    // สรุปช่วงเวลา
    const brandTotals = new Map<string, number>(), receiverTotals = new Map<string, number>(), piTotals = new Map<string, number>();
    inRange.forEach(r => {
      const fk = fkOf(r);
      const bt = normBrand(fk?.brand) || "—";
      brandTotals.set(bt, (brandTotals.get(bt) ?? 0) + 1);
      receiverTotals.set(r.transporter_name || "—", (receiverTotals.get(r.transporter_name || "—") ?? 0) + 1);
      if (fk?.pi_no) piTotals.set(fk.pi_no, (piTotals.get(fk.pi_no) ?? 0) + 1);
    });
    const busiest = days.reduce<{ date: string; count: number } | null>((m, d) => !m || d.count > m.count ? { date: d.date, count: d.count } : m, null);
    return {
      days, total: inRange.length, dayCount: days.length,
      avg: days.length ? inRange.length / days.length : 0, busiest,
      brandTotals: [...brandTotals.entries()].sort((a, b) => b[1] - a[1]),
      receiverTotals: [...receiverTotals.entries()].sort((a, b) => b[1] - a[1]),
      piTotals: [...piTotals.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [inspections, fkByUnit, fromDate, toDate]);

  // ── รายการค้างรับ (รถสถานะ "รอรับ" — ผู้ขนส่งยังไม่ได้ไปรับ) จัดกลุ่มตาม PI ──
  const pending = useMemo(() => {
    const daysWait = (f: Forklift): number | null => {
      const c = String(f.created_at ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(c)) return null;
      return Math.floor((Date.now() - new Date(c).getTime()) / 86400000);
    };
    const list = forklifts.filter(f => String(f.status ?? "").trim() === "รอรับ")
      .map(f => ({ f, wait: daysWait(f) }))
      .sort((a, b) => (b.wait ?? -1) - (a.wait ?? -1)); // ค้างนานสุดบนสุด
    const byPi = new Map<string, typeof list>();
    list.forEach(x => { const pi = x.f.pi_no || "— ไม่ระบุ PI"; if (!byPi.has(pi)) byPi.set(pi, []); byPi.get(pi)!.push(x); });
    return { total: list.length, byPi: [...byPi.entries()].sort((a, b) => b[1].length - a[1].length) };
  }, [forklifts]);

  const handleDelete = (id: string) => { deleteInspection(id); setDeleteConfirm(null); if (detail?.id === id) closeDetail(); };
  const handlePurge  = (id: string) => { purgeInspection(id); setPurgeConfirm(null); };

  // ── Export ประวัติรับ-ส่งรถทุกคัน → Excel (สำรองข้อมูล + ส่งต่อตำแหน่งอื่น) · 2 ชีต: สรุปรายคัน + รายเรคคอร์ด + ลิงก์รูป ──
  const exportHistoryExcel = async () => {
    if (inspections.length === 0) return;
    const XLSX = await import("xlsx");
    const fkByKey = new Map<string, Forklift>();
    forklifts.forEach(f => { if (f.SN) fkByKey.set(String(f.SN).toUpperCase(), f); fkByKey.set(String(f.id).toUpperCase(), f); });
    const findFk = (unit?: string) => unit ? (fkByKey.get(String(unit).toUpperCase()) || null) : null;

    const recRows = inspections.map((r, i) => {
      const f = findFk(r.unit_no);
      const slots = (r.image_slots ?? {}) as Record<string, string>;
      const slotUrl = (k: string) => slots[k] ? driveImg(slots[k]) : "";
      const slotVals = new Set(Object.values(slots).filter(Boolean));
      const extras = (r.images ?? []).filter(u => !slotVals.has(u)).map(driveImg);
      return {
        "ลำดับ": i + 1, "วันที่": r.date ?? "", "บทบาท": r.role ?? "ผู้รับรถ",
        "รหัสรถ": f?.id ?? "", "SN": r.unit_no ?? "", "ยี่ห้อ": f?.brand ?? "", "รุ่น": f?.model ?? "",
        "สถานะรถ": f?.status ?? "", "PI": f?.pi_no ?? "", "ผู้ขนส่ง": r.transporter_name ?? "", "เบอร์": r.transporter_phone ?? "",
        "บริษัทที่ไปส่ง": r.delivery_company ?? "", "ลิงก์โลเคชั่น": r.location_link ?? "", "จำนวนรูป": (r.images ?? []).length,
        "รูป Name Plate": slotUrl("name_plate"), "รูปเอกสาร PI": slotUrl("pi_doc"), "รูปรถด้านหน้า": slotUrl("front"),
        "รูปรถด้านหลัง": slotUrl("back"), "รูปรถด้านซ้าย": slotUrl("left"), "รูปรถด้านขวา": slotUrl("right"),
        "รูปกล่องเครื่องมือ": slotUrl("toolbox"), "รูปตู้ชาร์จ": slotUrl("charger"),
        "รูปเพิ่มเติม (ลิงก์)": extras.join("\n"),
      };
    });
    const ws1 = XLSX.utils.json_to_sheet(recRows);
    ws1["!cols"] = [6, 12, 12, 16, 16, 12, 18, 14, 10, 16, 12, 20, 26, 8, 30, 30, 30, 30, 30, 30, 30, 30, 42].map(w => ({ wch: w }));

    const byCar = new Map<string, { f: Forklift | null; unit: string; recv: InspectionRecord[]; send: InspectionRecord[] }>();
    inspections.forEach(r => {
      const key = String(r.unit_no ?? "").toUpperCase();
      if (!key) return;
      if (!byCar.has(key)) byCar.set(key, { f: findFk(r.unit_no), unit: r.unit_no, recv: [], send: [] });
      const g = byCar.get(key)!;
      ((r.role ?? "ผู้รับรถ") === "ผู้รับรถ" ? g.recv : g.send).push(r);
    });
    const latest = (arr: InspectionRecord[]) => [...arr].sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")))[0];
    const carRows = [...byCar.values()].map(g => {
      const lr = latest(g.recv), ls = latest(g.send);
      return {
        "รหัสรถ": g.f?.id ?? "", "SN": g.unit, "ยี่ห้อ": g.f?.brand ?? "", "รุ่น": g.f?.model ?? "", "สถานะรถ": g.f?.status ?? "", "PI": g.f?.pi_no ?? "",
        "ครั้งที่รับ": g.recv.length, "ครั้งที่ส่ง": g.send.length, "วันรับล่าสุด": lr?.date ?? "", "วันส่งล่าสุด": ls?.date ?? "",
        "บริษัทปลายทางล่าสุด": ls?.delivery_company ?? "", "รวมรูปทั้งหมด": [...g.recv, ...g.send].reduce((s, r) => s + (r.images?.length ?? 0), 0),
      };
    }).sort((a, b) => String(a["ยี่ห้อ"]).localeCompare(String(b["ยี่ห้อ"])) || String(a["รุ่น"]).localeCompare(String(b["รุ่น"])));
    const ws2 = XLSX.utils.json_to_sheet(carRows);
    ws2["!cols"] = [16, 16, 12, 18, 14, 10, 10, 10, 14, 14, 26, 12].map(w => ({ wch: w }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws2, "สรุปรายคัน");
    XLSX.utils.book_append_sheet(wb, ws1, "ประวัติรับ-ส่งรถ");
    XLSX.writeFile(wb, `ประวัติรับ-ส่งรถ_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // ── Export รายงานรับรถรายวัน → Excel (3 ชีต: รายวัน · รายคัน · สรุปตามแบรนด์/ผู้รับ) ──
  const exportDailyExcel = async () => {
    if (daily.total === 0) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    // ชีต 1: สรุปรายวัน
    const dayRows = daily.days.map(d => ({
      "วันที่": d.date, "รับเข้ากี่คัน": d.count, "รูปครบ": d.withPhotos, "ขาดรูป": d.count - d.withPhotos,
      "แบรนด์": d.brands.map(([b, n]) => `${b} ${n}`).join(", "),
      "ผู้รับรถ": d.receivers.join(", "), "PI": d.pis.join(", "),
    }));
    const ws1 = XLSX.utils.json_to_sheet(dayRows.length ? dayRows : [{ "วันที่": "-", "รับเข้ากี่คัน": 0 }]);
    ws1["!cols"] = [12, 12, 8, 8, 28, 22, 20].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws1, "สรุปรายวัน");
    // ชีต 2: รายคัน (เรียงวันล่าสุด)
    const carRows = daily.days.flatMap(d => d.recs.map(r => {
      const fk = fkByUnit.get(String(r.unit_no ?? "").toUpperCase());
      return {
        "วันที่": d.date, "SN": r.unit_no ?? "", "ยี่ห้อ": fk?.brand ?? "", "รุ่น": fk?.model ?? "",
        "PI": fk?.pi_no ?? "", "ผู้รับรถ": r.transporter_name ?? "", "จำนวนรูป": r.images?.length ?? 0,
      };
    }));
    const ws2 = XLSX.utils.json_to_sheet(carRows);
    ws2["!cols"] = [12, 16, 12, 18, 12, 20, 8].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws2, "รายคัน");
    // ชีต 3: สรุปตามแบรนด์ / ผู้รับ
    const sumRows = [
      { "หัวข้อ": "— รวมทั้งช่วง —", "รายการ": "", "จำนวน (คัน)": daily.total },
      { "หัวข้อ": "จำนวนวันที่มีรับรถ", "รายการ": "", "จำนวน (คัน)": daily.dayCount },
      { "หัวข้อ": "เฉลี่ยต่อวัน", "รายการ": "", "จำนวน (คัน)": Math.round(daily.avg * 10) / 10 },
      ...daily.brandTotals.map(([b, n]) => ({ "หัวข้อ": "ตามแบรนด์", "รายการ": b, "จำนวน (คัน)": n })),
      ...daily.receiverTotals.map(([r, n]) => ({ "หัวข้อ": "ตามผู้รับรถ", "รายการ": r, "จำนวน (คัน)": n })),
    ];
    const ws3 = XLSX.utils.json_to_sheet(sumRows);
    ws3["!cols"] = [18, 24, 12].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws3, "สรุปแบรนด์-ผู้รับ");
    // ชีต 4: รายการค้างรับ (รอรับ)
    const pendRows = pending.byPi.flatMap(([pi, cars]) => cars.map(({ f, wait }) => ({
      "PI": pi, "รหัส/SN": f.SN || f.id, "ยี่ห้อ": f.brand ?? "", "รุ่น": f.model ?? "", "ค้างมา (วัน)": wait ?? "",
    })));
    const ws4 = XLSX.utils.json_to_sheet(pendRows.length ? pendRows : [{ "PI": "-", "รหัส/SN": "ไม่มีรถค้างรับ" }]);
    ws4["!cols"] = [14, 16, 12, 18, 12].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws4, "ค้างรับ");
    const range = fromDate || toDate ? `_${fromDate || "เริ่ม"}_ถึง_${toDate || "ล่าสุด"}` : "";
    XLSX.writeFile(wb, `รายงานรับรถรายวัน${range}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-all duration-200">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2.5">
              <div className="bg-gradient-to-br from-indigo-500 to-blue-700 rounded-xl p-2">
                <Camera className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-800 leading-tight">แกลเลอรีตรวจรับรถ</h1>
                <p className="text-slate-500 text-xs">คลิกการ์ดเพื่อดูรายละเอียด</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportHistoryExcel}
              disabled={inspections.length === 0}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
              title="ส่งออกประวัติรถทุกคันเป็น Excel"
            >
              <Download className="w-3.5 h-3.5" />
              Excel
            </button>
            <button
              onClick={() => setShowBin(!showBin)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all duration-200 ${showBin ? "bg-red-600 text-white border-red-600" : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              ถังขยะ {deletedInspections.length > 0 && `(${deletedInspections.length})`}
            </button>
            <span className="text-xs font-semibold bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-full">
              {inspections.length} รายการ
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-6">
        {/* ── สลับมุมมอง: แกลเลอรีรายคัน / สรุปรับรถรายวัน ── */}
        {inspections.length > 0 && !showBin && (
          <div className="flex bg-slate-100 rounded-xl p-1 self-start">
            <button onClick={() => setView("list")}
              className={`text-xs font-bold px-4 py-1.5 rounded-lg transition-all ${view === "list" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>แกลเลอรีรายคัน</button>
            <button onClick={() => setView("daily")}
              className={`text-xs font-bold px-4 py-1.5 rounded-lg transition-all ${view === "daily" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>📅 สรุปรับรถรายวัน</button>
          </div>
        )}
        {/* ── ค้นหาย้อนหลัง (เฉพาะมุมมองรายคัน) ── */}
        {inspections.length > 0 && view === "list" && !showBin && (
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={e => setQ(e.target.value)}
              placeholder="ค้นหา SN / รุ่น / PI / ผู้ขนส่ง / วันที่..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            {q && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{filtered.length} รายการ</span>}
          </div>
        )}
        {/* ── มุมมองสรุปรายวัน ── */}
        {inspections.length > 0 && view === "daily" && !showBin && (
          <DailyReport daily={daily} pending={pending} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} onExport={exportDailyExcel} />
        )}
        {/* ── Active Inspections Grid (มุมมองรายคัน) ── */}
        {view === "daily" && !showBin ? null : inspections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <div className="bg-slate-100 rounded-2xl p-6 mb-4"><Camera className="w-12 h-12 text-slate-300" /></div>
            <p className="font-semibold text-slate-500 text-lg">ยังไม่มีรูปตรวจรับ</p>
            <p className="text-sm mt-1">เมื่อผู้ขนส่งบันทึกการรับมอบรถ รายการจะแสดงที่นี่</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">ไม่พบรายการที่ตรงกับ &ldquo;{q}&rdquo;</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((rec) => (
              <InspectionCard
                key={rec.id}
                rec={rec}
                fk={fkByUnit.get(String(rec.unit_no ?? "").toUpperCase())}
                onOpen={() => openDetail(rec)}
                onDelete={() => setDeleteConfirm(rec.id)}
                deleteConfirm={deleteConfirm === rec.id}
                onDeleteConfirm={() => handleDelete(rec.id)}
                onDeleteCancel={() => setDeleteConfirm(null)}
              />
            ))}
          </div>
        )}

        {/* ── Recycle Bin ── */}
        {showBin && (
          <div className="bg-white rounded-2xl shadow-sm border border-red-100 overflow-hidden">
            <div className="px-5 py-4 bg-red-50 border-b border-red-100 flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-red-500" />
              <h3 className="font-bold text-red-700 text-sm">ถังขยะ — รายการที่ถูกลบ</h3>
              <span className="ml-auto text-xs text-red-500">ลบอัตโนมัติหลัง 7 วัน</span>
            </div>
            {deletedInspections.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">ถังขยะว่างเปล่า</div>
            ) : (
              <div className="p-4 flex flex-col gap-2">
                {deletedInspections.map((rec) => (
                  <div key={rec.id} className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl p-3.5">
                    <div className="bg-red-100 rounded-xl p-2 flex-shrink-0">
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-700 text-sm">{rec.unit_no}</p>
                      <p className="text-xs text-slate-500">{rec.transporter_name} · {rec.date}</p>
                      <p className={`text-xs mt-0.5 font-medium ${daysLeft(rec.deletedAt) <= 1 ? "text-red-600" : "text-amber-600"}`}>
                        เหลือ {daysLeft(rec.deletedAt)} วันก่อนลบถาวร
                      </p>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => restoreInspection(rec.id)}
                        className="flex items-center gap-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />กู้คืน
                      </button>
                      {purgeConfirm === rec.id ? (
                        <div className="flex gap-1">
                          <button onClick={() => handlePurge(rec.id)} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors">ลบถาวร</button>
                          <button onClick={() => setPurgeConfirm(null)} className="bg-slate-200 text-slate-700 text-xs font-bold px-2 py-1.5 rounded-lg">ยกเลิก</button>
                        </div>
                      ) : (
                        <button onClick={() => setPurgeConfirm(rec.id)} className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-all">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Detail Modal ── */}
      {detail && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && closeDetail()}>
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-blue-700 px-6 py-4 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-lg font-bold text-white">{detail.unit_no}</h2>
                <p className="text-indigo-200 text-sm">{detail.transporter_name} · {detail.date}</p>
              </div>
              <button onClick={closeDetail} className="text-white/70 hover:text-white hover:bg-white/20 rounded-xl p-2 transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {/* Specs */}
              {(() => {
                const specs = mockTransporterData[detail.unit_no];
                return specs ? (
                  <div className="px-6 pt-5 pb-4 border-b border-slate-100">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5" />ข้อมูลรถ
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {[
                        ["ยี่ห้อ", specs.brand],
                        ["รุ่น", specs.model],
                        ["พิกัดยก", specs.capacity],
                        ["เชื้อเพลิง", specs.fuel],
                        ["สีรถ", specs.color],
                      ].map(([label, value]) => (
                        <div key={label} className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                          <p className="text-xs text-slate-500 mb-1">{label}</p>
                          {label === "สีรถ" ? (
                            <div className="flex items-center gap-2">
                              <span className="w-3.5 h-3.5 rounded-full border border-slate-200 flex-shrink-0" style={{ backgroundColor: value }} />
                              <span className="text-sm font-bold text-slate-800">{value}</span>
                            </div>
                          ) : (
                            <p className="text-sm font-bold text-slate-800">{value}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="px-6 pt-4 pb-3 border-b border-slate-100">
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-center gap-2 text-sm text-amber-700">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      ไม่พบข้อมูลสเปคสำหรับ {detail.unit_no}
                    </div>
                  </div>
                );
              })()}

              {/* Images */}
              <div className="px-6 py-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5" />รูปภาพ ({detail.images.length} รูป)
                  </p>
                </div>
                {detail.images.length === 0 ? (
                  <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl py-10 flex flex-col items-center gap-2 text-slate-400">
                    <ImageOff className="w-8 h-8 text-slate-300" />
                    <p className="text-sm">ไม่มีรูปภาพในรายการนี้</p>
                    <p className="text-xs text-slate-400">รูปภาพจะหายหลังรีเฟรชหน้าเว็บ (เก็บเฉพาะ session)</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {detail.images.map((img, i) => (
                      <button
                        key={i}
                        onClick={() => setLightboxIdx(i)}
                        className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 group hover:ring-2 hover:ring-indigo-400 transition-all"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={driveImg(img)} alt={`รูป ${i + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                          <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <span className="absolute bottom-1 left-1 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded">{i + 1}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer with delete */}
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between flex-shrink-0 bg-slate-50">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Calendar className="w-3.5 h-3.5" />
                <span>รับมอบวันที่ {detail.date}</span>
              </div>
              {deleteConfirm === detail.id ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-600 font-medium">ยืนยันลบ?</span>
                  <button onClick={() => handleDelete(detail.id)} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors">
                    ลบ → ถังขยะ
                  </button>
                  <button onClick={() => setDeleteConfirm(null)} className="bg-slate-200 text-slate-700 text-xs font-bold px-3 py-1.5 rounded-lg">ยกเลิก</button>
                </div>
              ) : (
                <button
                  onClick={() => setDeleteConfirm(detail.id)}
                  className="flex items-center gap-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 text-sm font-medium px-3 py-1.5 rounded-lg transition-all"
                >
                  <Trash2 className="w-4 h-4" />ลบรายการ
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Lightbox ── */}
      {detail && lightboxIdx !== null && detail.images.length > 0 && (
        <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4" onClick={() => setLightboxIdx(null)}>
          <button onClick={() => setLightboxIdx(null)} className="absolute top-4 right-4 text-white/70 hover:text-white bg-white/10 rounded-full p-2">
            <X className="w-6 h-6" />
          </button>
          {/* prev */}
          {lightboxIdx > 0 && (
            <button onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white bg-white/10 hover:bg-white/20 rounded-full p-3 transition-all">
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          {/* image */}
          <div className="max-w-3xl max-h-[80vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={driveImg(detail.images[lightboxIdx])} alt={`รูป ${lightboxIdx + 1}`} className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl" />
          </div>
          {/* next */}
          {lightboxIdx < detail.images.length - 1 && (
            <button onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white bg-white/10 hover:bg-white/20 rounded-full p-3 transition-all">
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">
            {lightboxIdx + 1} / {detail.images.length}
          </p>
        </div>
      )}
    </div>
  );
}

// ── รายงานสรุปรับรถรายวัน ──────────────────────────────────────────────────────
type DailyData = {
  days: { date: string; count: number; withPhotos: number; brands: [string, number][]; receivers: string[]; pis: string[] }[];
  total: number; dayCount: number; avg: number; busiest: { date: string; count: number } | null;
  brandTotals: [string, number][]; receiverTotals: [string, number][]; piTotals: [string, number][];
};
type PendingData = { total: number; byPi: [string, { f: Forklift; wait: number | null }[]][] };
function DailyReport({ daily, pending, fromDate, toDate, setFromDate, setToDate, onExport }: {
  daily: DailyData; pending: PendingData; fromDate: string; toDate: string;
  setFromDate: (v: string) => void; setToDate: (v: string) => void; onExport: () => void;
}) {
  const [openPis, setOpenPis] = useState<Set<string>>(new Set()); // PI ที่กางดูรายคันในรายการค้างรับ
  const thisMonth = () => { const d = new Date(); const m = d.toISOString().slice(0, 7); setFromDate(`${m}-01`); setToDate(new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)); };
  const inp = "border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white";
  return (
    <div className="flex flex-col gap-4">
      {/* ตัวกรองช่วงวัน + export */}
      <div className="flex items-center gap-2 flex-wrap bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
        <span className="text-xs font-semibold text-slate-500">ช่วงวันที่:</span>
        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className={inp} />
        <span className="text-slate-400 text-xs">ถึง</span>
        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className={inp} />
        <button onClick={thisMonth} className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-lg px-2.5 py-1.5">เดือนนี้</button>
        {(fromDate || toDate) && <button onClick={() => { setFromDate(""); setToDate(""); }} className="text-xs text-slate-400 hover:text-red-500">ล้าง (ดูทั้งหมด)</button>}
        <button onClick={onExport} disabled={daily.total === 0}
          className="ml-auto flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40">
          <Download className="w-3.5 h-3.5" />Export รายงาน
        </button>
      </div>

      {/* รายการค้างรับ — รถสถานะ "รอรับ" ที่ผู้ขนส่งยังไม่ได้ไปรับ (ไม่ผูกกับช่วงวันที่) */}
      <div className={`rounded-xl border p-3.5 shadow-sm ${pending.total > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-slate-100"}`}>
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <Truck className={`w-4 h-4 flex-shrink-0 ${pending.total > 0 ? "text-amber-600" : "text-slate-400"}`} />
          <p className="text-sm font-bold text-slate-700">รายการค้างรับ (รอผู้ขนส่งไปรับ)</p>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${pending.total > 0 ? "bg-amber-500 text-white" : "bg-slate-200 text-slate-500"}`}>{pending.total} คัน</span>
        </div>
        {pending.total === 0 ? (
          <p className="text-xs text-slate-400 mt-1">✅ ไม่มีรถค้างรับ — รับเข้าครบทุกคันแล้ว</p>
        ) : (
          <>
            <p className="text-[11px] text-amber-700 mb-2">รวม {pending.total} คัน · {pending.byPi.length} PI — แตะแต่ละแถวเพื่อดูรายคัน</p>
            <div className="flex flex-col gap-1.5">
              {pending.byPi.map(([pi, cars]) => {
                const open = openPis.has(pi);
                const maxWait = cars.reduce((m, c) => Math.max(m, c.wait ?? 0), 0);
                const models = [...new Set(cars.map(c => c.f.model).filter(Boolean))];
                const brand = cars[0]?.f.brand || "";
                return (
                  <div key={pi} className="bg-white border border-amber-100 rounded-lg overflow-hidden">
                    {/* แถวสรุป PI — กดพับ/กาง */}
                    <button onClick={() => setOpenPis(p => { const n = new Set(p); n.has(pi) ? n.delete(pi) : n.add(pi); return n; })}
                      className="w-full flex items-center gap-2 p-2.5 text-left hover:bg-amber-50/60">
                      <ChevronRight className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
                      <span className="text-[11px] font-bold text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-full flex-shrink-0">PI {pi}</span>
                      <span className="text-xs font-bold text-slate-700 flex-shrink-0">{cars.length} คัน</span>
                      <span className="text-[11px] text-slate-500 truncate">{brand} {models.join(", ")}</span>
                      <span className={`ml-auto text-[11px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${maxWait > 30 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"}`}>ค้างสุด {maxWait} วัน</span>
                    </button>
                    {/* รายคัน (กางแล้ว) */}
                    {open && (
                      <div className="px-2.5 pb-2.5 pt-0.5 flex flex-col gap-1 border-t border-amber-50">
                        {cars.map(({ f, wait }) => (
                          <div key={f.id} className="flex items-center gap-2 text-[11px] flex-wrap pl-6">
                            <span className="font-bold text-slate-700">{f.SN ? f.SN : `#${displayCode(f)}`}</span>
                            <span className="text-slate-500">{f.brand} {f.model}</span>
                            {wait != null && <span className={`ml-auto font-semibold ${wait > 30 ? "text-red-600" : "text-slate-400"}`}>ค้างมา {wait} วัน</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* การ์ดสรุปช่วงเวลา (รับเข้าจริง ตามช่วงวันที่) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "รับเข้าทั้งหมด", value: `${daily.total} คัน`, c: "text-indigo-700 bg-indigo-50 border-indigo-100" },
          { label: "จำนวนวัน", value: `${daily.dayCount} วัน`, c: "text-slate-700 bg-slate-50 border-slate-200" },
          { label: "เฉลี่ยต่อวัน", value: `${Math.round(daily.avg * 10) / 10} คัน`, c: "text-teal-700 bg-teal-50 border-teal-100" },
          { label: "วันรับมากสุด", value: daily.busiest ? `${daily.busiest.count} คัน` : "—", sub: daily.busiest?.date, c: "text-amber-700 bg-amber-50 border-amber-100" },
        ].map((s, i) => (
          <div key={i} className={`rounded-xl border p-3 ${s.c}`}>
            <p className="text-[11px] font-semibold opacity-70">{s.label}</p>
            <p className="text-lg font-bold leading-tight mt-0.5">{s.value}</p>
            {s.sub && <p className="text-[10px] opacity-60 mt-0.5">{s.sub}</p>}
          </div>
        ))}
      </div>

      {/* แยกตามแบรนด์ / ผู้รับ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
          <p className="text-xs font-bold text-slate-600 mb-2">📦 แยกตามแบรนด์</p>
          {daily.brandTotals.length === 0 ? <p className="text-xs text-slate-400">— ไม่มีข้อมูล</p> : (
            <div className="flex flex-col gap-1.5">
              {daily.brandTotals.map(([b, n]) => (
                <div key={b} className="flex items-center gap-2">
                  <span className="text-xs text-slate-600 w-24 truncate">{b}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden"><div className="bg-indigo-400 h-full" style={{ width: `${(n / daily.total) * 100}%` }} /></div>
                  <span className="text-xs font-bold text-slate-700 w-10 text-right">{n} คัน</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
          <p className="text-xs font-bold text-slate-600 mb-2">🚚 แยกตามผู้รับรถ</p>
          {daily.receiverTotals.length === 0 ? <p className="text-xs text-slate-400">— ไม่มีข้อมูล</p> : (
            <div className="flex flex-col gap-1.5">
              {daily.receiverTotals.map(([r, n]) => (
                <div key={r} className="flex items-center gap-2">
                  <span className="text-xs text-slate-600 flex-1 truncate">{r}</span>
                  <span className="text-xs font-bold text-slate-700">{n} คัน</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* รายการรายวัน */}
      {daily.days.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">ไม่มีการรับรถในช่วงที่เลือก</div>
      ) : (
        <div className="flex flex-col gap-2">
          {daily.days.map(d => (
            <div key={d.date} className="bg-white border border-slate-100 rounded-xl p-3.5 shadow-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <Calendar className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                <span className="font-bold text-slate-800 text-sm">{d.date}</span>
                <span className="text-xs font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">รับเข้า {d.count} คัน</span>
                {d.withPhotos < d.count && <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">ขาดรูป {d.count - d.withPhotos}</span>}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {d.brands.map(([b, n]) => <span key={b} className="text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded-full">{b} × {n}</span>)}
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                {d.receivers.length > 0 && <>ผู้รับ: <b className="text-slate-600">{d.receivers.join(", ")}</b></>}
                {d.pis.length > 0 && <> · PI: {d.pis.join(", ")}</>}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Inspection Card Component ──────────────────────────────────────────────────
function InspectionCard({
  rec, fk, onOpen, onDelete, deleteConfirm, onDeleteConfirm, onDeleteCancel
}: {
  rec: InspectionRecord;
  fk?: Forklift;   // รถจริงจากสต็อก (เอา PI/ยี่ห้อ/รุ่นจริงมาโชว์)
  onOpen: () => void;
  onDelete: () => void;
  deleteConfirm: boolean;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
}) {
  const specs = mockTransporterData[rec.unit_no];
  const brand = fk?.brand ?? specs?.brand;
  const model = fk?.model ?? specs?.model;
  const pi = fk?.pi_no;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-shadow duration-200 group">
      {/* Thumbnail area — clickable */}
      <button onClick={onOpen} className="w-full text-left">
        {rec.images.length > 0 ? (
          <div className="grid grid-cols-3 gap-0.5 bg-slate-100 aspect-[3/1.8] overflow-hidden">
            {rec.images.slice(0, 3).map((img, i) => (
              <div key={i} className="relative overflow-hidden bg-slate-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={driveImg(img)} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                {i === 2 && rec.images.length > 3 && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <span className="text-white text-sm font-bold">+{rec.images.length - 3}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gradient-to-br from-slate-100 to-slate-50 h-28 flex flex-col items-center justify-center gap-1.5 border-b border-slate-100 group-hover:from-indigo-50 group-hover:to-slate-50 transition-colors">
            <Camera className="w-7 h-7 text-slate-300 group-hover:text-indigo-300 transition-colors" />
            <span className="text-xs text-slate-400">แตะเพื่อดูรายละเอียด</span>
          </div>
        )}
      </button>

      <div className="p-4 flex flex-col gap-2">
        {/* Unit + specs line */}
        <button onClick={onOpen} className="text-left">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="bg-amber-100 rounded-lg p-1"><Truck className="w-3.5 h-3.5 text-amber-600" /></div>
                <span className="font-bold text-slate-800">{rec.unit_no}</span>
                {pi && <span className="text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-100 px-1.5 py-0.5 rounded-full">PI {pi}</span>}
              </div>
              {(brand || model) && <p className="text-xs text-slate-500 mt-1">{brand} {model}{specs?.capacity ? ` · ${specs.capacity}` : ""}</p>}
            </div>
            <span className="text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full flex-shrink-0">
              {rec.images.length} รูป
            </span>
          </div>
        </button>

        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><User className="w-3 h-3" />{rec.transporter_name}</span>
          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{rec.date}</span>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-1">
          <button onClick={onOpen}
            className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold py-1.5 rounded-lg transition-colors">
            ดูรายละเอียด
          </button>
          {deleteConfirm ? (
            <div className="flex gap-1">
              <button onClick={onDeleteConfirm} className="bg-red-600 text-white text-xs font-bold px-2 py-1.5 rounded-lg">ยืนยัน</button>
              <button onClick={onDeleteCancel} className="bg-slate-200 text-slate-700 text-xs px-2 py-1.5 rounded-lg">ยกเลิก</button>
            </div>
          ) : (
            <button onClick={onDelete} className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-all">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function InspectionsPage() {
  return <DashboardGuard><InspectionsPageInner /></DashboardGuard>;
}
