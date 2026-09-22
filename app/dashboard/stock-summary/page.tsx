"use client";

// หน้าสรุปสต็อกพร้อมขาย — แยกตามหมวดหมู่ + แบรนด์ + มูลค่าทุน (คำนวณสดจากข้อมูลจริง)
import Link from "next/link";
import { useMemo } from "react";
import { ArrowLeft, Package, Download, AlertTriangle } from "lucide-react";
import { useApp } from "@/lib/AppContext";
import { DashboardGuard } from "@/components/DashboardGuard";
import { normBrand } from "@/lib/brands";
import type { Forklift } from "@/lib/types";

const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString("th-TH");
const READY = "พร้อมขาย";

// จำแนกหมวดจาก "รุ่น" (vehicle_category ใน DB มักผิด) — ให้ตรงกับ lib/commission.ts
type CatKey = "forklift" | "stacker" | "handlift" | "warehouse" | "other";
const CATS: { key: CatKey; label: string; theme: string; bar: string; head: string }[] = [
  { key: "forklift",  label: "โฟล์คลิฟท์",              theme: "text-indigo-700", bar: "bg-indigo-500", head: "bg-indigo-50 border-indigo-100" },
  { key: "stacker",   label: "สแตกเกอร์ (Stacker)",      theme: "text-teal-700",   bar: "bg-teal-500",   head: "bg-teal-50 border-teal-100" },
  { key: "handlift",  label: "แฮนด์ลิฟท์ / รถลากพาเลท",  theme: "text-amber-700",  bar: "bg-amber-500",  head: "bg-amber-50 border-amber-100" },
  { key: "warehouse", label: "รถยกไฟฟ้า / อุปกรณ์คลัง",  theme: "text-blue-700",   bar: "bg-blue-500",   head: "bg-blue-50 border-blue-100" },
  { key: "other",     label: "อื่นๆ / ไม่จัดกลุ่ม",       theme: "text-slate-600",  bar: "bg-slate-400",  head: "bg-slate-50 border-slate-100" },
];
const catOf = (model?: string): CatKey => {
  const m = String(model ?? "").toUpperCase().trim();
  if (/^(CPCD|CPD|CQD|CPC|FD|FG|FB|H2000)/.test(m)) return "forklift";
  if (/^(CDD|CBS|RE)/.test(m)) return "stacker";
  if (/^(BF|AC|PWH|HPT|WP)/.test(m) || /HAND|PALLET/.test(m)) return "handlift";
  if (/^(CBD|CNS|SDA|DYC|PD\d|PTS|WH|WS|CBY|DG\d|EPS|PS\d|WMS)/.test(m)) return "warehouse";
  return "other";
};
// รุ่นฐาน (ตัดท้าย MAST/ZSM/M-suffix) เพื่อจับกลุ่มรุ่นเดียวกัน
const baseModel = (model?: string) =>
  String(model ?? "").toUpperCase().replace(/[-\s]*(M\d+|ZSM\d+|WS\d\w*).*$/i, "").trim() || "(ไม่ระบุรุ่น)";

interface ModelRow { model: string; brand: string; count: number }
interface CatData {
  key: CatKey; units: number; cost: number; withCost: number;
  brands: Record<string, number>; models: ModelRow[];
}

function StockSummaryInner() {
  const { forklifts } = useApp();

  const { cats, brandTotals, total, knownCost, missingCost } = useMemo(() => {
    const ready = forklifts.filter(f => (f.status ?? "") === READY);
    const cats: Record<CatKey, CatData> = {} as Record<CatKey, CatData>;
    CATS.forEach(c => { cats[c.key] = { key: c.key, units: 0, cost: 0, withCost: 0, brands: {}, models: [] }; });
    const brandTotals: Record<string, number> = {};
    const modelMap: Record<string, ModelRow> = {}; // key = cat|base|brand

    for (const f of ready) {
      const ck = catOf(f.model);
      const brand = normBrand(f.brand) || "(ไม่ระบุแบรนด์)";
      const cost = Number(f.cost_price) || 0;
      const c = cats[ck];
      c.units += 1;
      c.cost += cost;
      if (cost > 0) c.withCost += 1;
      c.brands[brand] = (c.brands[brand] ?? 0) + 1;
      brandTotals[brand] = (brandTotals[brand] ?? 0) + 1;
      const bm = baseModel(f.model);
      const mk = `${ck}|${bm}|${brand}`;
      if (!modelMap[mk]) { modelMap[mk] = { model: bm, brand, count: 0 }; c.models.push(modelMap[mk]); }
      modelMap[mk].count += 1;
    }
    CATS.forEach(c => cats[c.key].models.sort((a, b) => b.count - a.count));
    const total = ready.length;
    const knownCost = Object.values(cats).reduce((s, c) => s + c.cost, 0);
    const missingCost = total - Object.values(cats).reduce((s, c) => s + c.withCost, 0);
    return { cats, brandTotals, total, knownCost, missingCost };
  }, [forklifts]);

  const activeCats = CATS.filter(c => cats[c.key].units > 0);
  const brandRows = Object.entries(brandTotals).sort((a, b) => b[1] - a[1]);

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const rows: Record<string, string | number>[] = [];
    for (const c of activeCats) {
      const d = cats[c.key];
      for (const m of d.models) rows.push({ "หมวด": c.label, "รุ่น": m.model, "แบรนด์": m.brand, "จำนวน (คัน)": m.count });
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [24, 22, 16, 12].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "สรุปสต็อก");
    XLSX.writeFile(wb, `สรุปสต็อกพร้อมขาย_${total}คัน.xlsx`);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-all"><ArrowLeft className="w-5 h-5" /></Link>
            <div className="flex items-center gap-2.5">
              <div className="bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl p-2"><Package className="w-5 h-5 text-white" /></div>
              <div>
                <h1 className="text-base font-bold text-slate-800 leading-tight">สรุปสต็อก (พร้อมขาย)</h1>
                <p className="text-slate-500 text-xs">แยกตามหมวดหมู่ · แบรนด์ · มูลค่าทุน — คำนวณสดจากข้อมูลจริง</p>
              </div>
            </div>
          </div>
          <button onClick={exportExcel} disabled={total === 0}
            className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-3 py-2 transition-all disabled:opacity-40">
            <Download className="w-4 h-4" /><span className="hidden sm:inline">Export Excel</span>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-5">
        {/* ยอดรวม */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-end justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">รถพร้อมขายทั้งหมด</p>
            <p className="text-4xl font-bold text-emerald-600 leading-tight tabular-nums">{fmt(total)} <span className="text-base font-medium text-slate-400">คัน</span></p>
          </div>
          <p className="text-xs text-slate-500">มูลค่าทุน (เท่าที่ลงข้อมูล) <b className="text-slate-700">฿{fmt(knownCost)}</b></p>
        </div>

        {/* การ์ดหมวดหมู่ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {activeCats.map(c => {
            const d = cats[c.key];
            return (
              <div key={c.key} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col gap-1">
                <p className="text-xs font-semibold text-slate-600 leading-snug min-h-[2.4em]">{c.label}</p>
                <p className={`text-2xl font-bold tabular-nums ${c.theme}`}>{fmt(d.units)}<span className="text-xs text-slate-400 font-medium ml-1">คัน</span></p>
                <p className="text-[11px] text-slate-400 border-t border-slate-100 pt-1.5 mt-1 tabular-nums">{((d.units / total) * 100).toFixed(1)}% ของสต็อก</p>
              </div>
            );
          })}
        </div>

        {/* แบรนด์ */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">รวมตามแบรนด์</p>
          <div className="flex flex-wrap gap-2.5">
            {brandRows.map(([b, n]) => (
              <div key={b} className="flex items-baseline gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <span className="font-semibold text-sm text-slate-700">{b}</span>
                <span className="font-bold text-emerald-600 tabular-nums">{fmt(n)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* มูลค่าทุน */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-800 text-sm">มูลค่าทุนสต็อก (เท่าที่ลงข้อมูล)</h2>
            <span className="font-bold text-amber-600 tabular-nums">฿{fmt(knownCost)}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="px-5 py-2 font-semibold">หมวด</th>
                <th className="px-5 py-2 font-semibold">ลงราคาทุนแล้ว</th>
                <th className="px-5 py-2 font-semibold text-right">มูลค่าทุนรวม</th>
                <th className="px-5 py-2 font-semibold text-right">เฉลี่ย/คัน</th>
              </tr></thead>
              <tbody>
                {activeCats.map(c => {
                  const d = cats[c.key];
                  const full = d.withCost === d.units;
                  return (
                    <tr key={c.key} className="border-b border-slate-50 last:border-0">
                      <td className="px-5 py-2.5 font-semibold text-slate-700">{c.label}</td>
                      <td className={`px-5 py-2.5 tabular-nums ${full ? "text-slate-500" : "text-amber-600 font-semibold"}`}>{d.withCost}/{d.units}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-slate-800">{d.cost > 0 ? "฿" + fmt(d.cost) : "—"}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-slate-600">{d.withCost > 0 ? "฿" + fmt(d.cost / d.withCost) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {missingCost > 0 && (
            <div className="m-4 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-slate-700 leading-relaxed">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <span><b className="text-amber-700">มูลค่ายังไม่ครบ</b> — มีอีก <b>{fmt(missingCost)} คัน</b> ยังไม่ได้ลงราคาทุน (ส่วนใหญ่เป็นแฮนด์ลิฟท์) มูลค่าสต็อกจริงสูงกว่านี้</span>
            </div>
          )}
        </div>

        {/* รายละเอียดรายรุ่นแต่ละหมวด */}
        {activeCats.map(c => {
          const d = cats[c.key];
          const max = Math.max(...d.models.map(m => m.count), 1);
          return (
            <section key={c.key} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className={`flex items-center gap-2.5 px-5 py-3 border-b ${c.head}`}>
                <span className={`w-2.5 h-2.5 rounded-full ${c.bar}`}></span>
                <h2 className="font-bold text-slate-800 text-sm">{c.label}</h2>
                <span className={`ml-auto font-bold tabular-nums ${c.theme}`}>{fmt(d.units)}<span className="text-[11px] text-slate-400 font-medium ml-1">คัน</span></span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                    <th className="px-5 py-2 font-semibold">รุ่น</th>
                    <th className="px-5 py-2 font-semibold hidden sm:table-cell">แบรนด์</th>
                    <th className="px-5 py-2 font-semibold w-2/5">จำนวน</th>
                  </tr></thead>
                  <tbody>
                    {d.models.map((m, i) => (
                      <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                        <td className="px-5 py-2.5 font-semibold text-slate-700">{m.model}</td>
                        <td className="px-5 py-2.5 text-slate-500 text-xs hidden sm:table-cell">{m.brand}</td>
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${Math.max((m.count / max) * 100, 4)}%` }}></div>
                            </div>
                            <span className="tabular-nums font-semibold text-slate-700 min-w-[28px] text-right">{m.count}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
        <p className="text-center text-xs text-slate-400">คำนวณสดจากรถสถานะ &ldquo;พร้อมขาย&rdquo; · จำแนกหมวดจากรุ่นรถ</p>
      </main>
    </div>
  );
}

export default function StockSummaryPage() {
  return <DashboardGuard><StockSummaryInner /></DashboardGuard>;
}
