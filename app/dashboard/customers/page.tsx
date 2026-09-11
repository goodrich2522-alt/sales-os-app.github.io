"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { ArrowLeft, Users, Search, Plus, Pencil, Trash2, X, Phone, MapPin, FileText, User, TrendingUp, Repeat, ChevronRight, Calendar } from "lucide-react";
import { useApp } from "@/lib/AppContext";
import { DashboardGuard } from "@/components/DashboardGuard";
import { PROVINCES } from "@/lib/mockData";
import { purchaseKey } from "@/lib/commission";
import type { Customer, Sale } from "@/lib/types";

const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString("th-TH");
const fmtM = (n: number) => Math.abs(n) >= 1_000_000 ? (n / 1_000_000).toFixed(1) + " ล." : fmt(n);
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
// "การซื้อ 1 ครั้ง" = 1 ใบเอกสาร (ซื้อหลายคันในใบเดียว = ครั้งเดียว) · deals = จำนวนใบเอกสารไม่ซ้ำ · units = จำนวนคัน
type CustStat = { deals: number; units: number; revenue: number; lastAt: string; cars: Sale[] };
type SortKey = "name" | "spend" | "deals" | "recent";

const blank = (): Customer => ({
  id: "", name: "", tax_id: "", tel: "", address: "",
  customer_type: "", province: "", contact_person: "", note: "",
});

function CustomersPageInner() {
  const { customers, sales, fieldConfig, addCustomer, updateCustomer, deleteCustomer } = useApp();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [filter, setFilter] = useState<"all" | "repeat">("all"); // กรองจากการ์ดสถิติ: ทั้งหมด / เฉพาะซื้อซ้ำ
  const [edit, setEdit] = useState<Customer | null>(null); // ฟอร์มเพิ่ม/แก้ไข (id ว่าง = เพิ่มใหม่)
  const [delId, setDelId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Customer | null>(null); // โมดัลประวัติการซื้อ

  // สถิติต่อลูกค้า (จับชื่อตรง) — deals=จำนวนวันที่ซื้อไม่ซ้ำ (ซื้อหลายคันวันเดียว=1ครั้ง) · units=จำนวนคัน
  const statMap = useMemo(() => {
    const m = new Map<string, { units: number; revenue: number; lastAt: string; cars: Sale[]; days: Set<string> }>();
    sales.forEach(s => {
      const k = norm(s.customer_name || ""); if (!k) return;
      const g = m.get(k) ?? { units: 0, revenue: 0, lastAt: "", cars: [], days: new Set<string>() };
      g.units++; g.revenue += Number(s.actual_sale) || 0;
      const at = String(s.created_at || ""); if (at.localeCompare(g.lastAt) > 0) g.lastAt = at;
      g.cars.push(s); g.days.add(purchaseKey(s)); // ใบเอกสารเดียวกัน = ครั้งเดียว (แม้หลายคัน)
      m.set(k, g);
    });
    return m;
  }, [sales]);
  const statOf = (name: string): CustStat => {
    const g = statMap.get(norm(name));
    return g ? { deals: g.days.size, units: g.units, revenue: g.revenue, lastAt: g.lastAt, cars: g.cars }
             : { deals: 0, units: 0, revenue: 0, lastAt: "", cars: [] };
  };

  // สรุปภาพรวม
  const summary = useMemo(() => {
    let repeat = 0, revenue = 0;
    customers.forEach(c => { const st = statOf(c.name); if (st.deals >= 2) repeat++; });
    statMap.forEach(st => { revenue += st.revenue; });
    return { total: customers.length, repeat, revenue };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, statMap]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    let arr = s
      ? customers.filter(c => [c.name, c.tel, c.province, c.tax_id, c.contact_person].some(v => String(v ?? "").toLowerCase().includes(s)))
      : customers;
    if (filter === "repeat") arr = arr.filter(c => statOf(c.name).deals >= 2); // เฉพาะลูกค้าซื้อซ้ำ (≥2 ครั้ง)
    const withStat = arr.map(c => ({ c, st: statOf(c.name) }));
    withStat.sort((a, b) =>
      sort === "spend"  ? b.st.revenue - a.st.revenue :
      sort === "deals"  ? b.st.deals - a.st.deals :
      sort === "recent" ? b.st.lastAt.localeCompare(a.st.lastAt) :
      a.c.name.localeCompare(b.c.name, "th"));
    return withStat.map(x => x.c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, q, sort, statMap, filter]);

  const save = () => {
    if (!edit || !edit.name.trim()) return;
    if (edit.id) updateCustomer({ ...edit, name: edit.name.trim() });
    else addCustomer({ ...edit, id: (globalThis.crypto?.randomUUID?.() ?? String(Math.random()).slice(2)), name: edit.name.trim(), created_at: new Date().toISOString() });
    setEdit(null);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-all"><ArrowLeft className="w-5 h-5" /></Link>
            <div className="flex items-center gap-2.5">
              <div className="bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl p-2"><Users className="w-5 h-5 text-white" /></div>
              <div>
                <h1 className="text-base font-bold text-slate-800 leading-tight">ทะเบียนลูกค้า</h1>
                <p className="text-slate-500 text-xs">{customers.length} ราย · ใช้เติมข้อมูลอัตโนมัติตอนปิดการขาย</p>
              </div>
            </div>
          </div>
          <button onClick={() => setEdit(blank())}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg px-3 py-2 transition-all">
            <Plus className="w-4 h-4" /><span className="hidden sm:inline">เพิ่มลูกค้า</span>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-4">
        {/* สรุปภาพรวม (CRM) — กดการ์ดเพื่อกรอง/เรียงดูข้อมูล */}
        <div className="grid grid-cols-3 gap-3">
          {(() => {
            const allActive = filter === "all" && sort !== "spend";
            const repeatActive = filter === "repeat";
            const spendActive = filter === "all" && sort === "spend";
            const card = "bg-white rounded-2xl border shadow-sm p-3.5 flex flex-col gap-0.5 text-left transition-all hover:shadow-md active:scale-[0.98]";
            return (<>
              <button onClick={() => { setFilter("all"); setSort("name"); }}
                className={`${card} ${allActive ? "border-slate-400 ring-2 ring-slate-200" : "border-slate-100 hover:border-slate-300"}`}>
                <span className="text-[11px] text-slate-400 font-semibold flex items-center gap-1"><Users className="w-3.5 h-3.5" />ลูกค้าทั้งหมด</span>
                <span className="text-xl font-bold text-slate-800">{fmt(summary.total)}</span>
              </button>
              <button onClick={() => setFilter("repeat")}
                className={`${card} ${repeatActive ? "border-emerald-400 ring-2 ring-emerald-200" : "border-slate-100 hover:border-emerald-300"}`}>
                <span className="text-[11px] text-slate-400 font-semibold flex items-center gap-1"><Repeat className="w-3.5 h-3.5" />ลูกค้าซื้อซ้ำ</span>
                <span className="text-xl font-bold text-emerald-600">{fmt(summary.repeat)}</span>
              </button>
              <button onClick={() => { setFilter("all"); setSort("spend"); }}
                className={`${card} ${spendActive ? "border-indigo-400 ring-2 ring-indigo-200" : "border-slate-100 hover:border-indigo-300"}`}>
                <span className="text-[11px] text-slate-400 font-semibold flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" />ยอดซื้อรวม</span>
                <span className="text-xl font-bold text-indigo-700">฿{fmtM(summary.revenue)}</span>
              </button>
            </>);
          })()}
        </div>
        {/* ป้ายบอกมุมมองที่กรองอยู่ */}
        {(filter === "repeat" || sort === "spend") && (
          <div className="flex items-center gap-2 -mt-1">
            <span className="text-xs font-semibold text-slate-500">
              {filter === "repeat" ? `🔁 แสดงเฉพาะลูกค้าซื้อซ้ำ (${list.length} ราย)` : "📈 เรียงตามยอดซื้อรวม (รายใหญ่อยู่บน)"}
            </span>
            <button onClick={() => { setFilter("all"); setSort("name"); }} className="text-xs text-indigo-600 hover:underline font-semibold">ล้าง</button>
          </div>
        )}

        {/* ค้นหา + เรียง */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา ชื่อ / เบอร์ / จังหวัด / เลขภาษี / ผู้ติดต่อ..."
              className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <select value={sort} onChange={e => setSort(e.target.value as SortKey)}
            className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400">
            <option value="name">เรียง: ชื่อ (ก-ฮ)</option>
            <option value="spend">เรียง: ยอดซื้อรวม</option>
            <option value="deals">เรียง: จำนวนครั้ง</option>
            <option value="recent">เรียง: ซื้อล่าสุด</option>
          </select>
        </div>

        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Users className="w-12 h-12 mb-3 opacity-40" />
            <p className="text-sm">{q ? "ไม่พบลูกค้าตามที่ค้นหา" : "ยังไม่มีข้อมูลลูกค้า"}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {list.map(c => {
              const st = statOf(c.name);
              return (
              <div key={c.id} onClick={() => st.deals > 0 && setDetail(c)}
                className={`bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col gap-1.5 ${st.deals > 0 ? "cursor-pointer hover:border-indigo-200" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-slate-800 leading-snug">{c.name}</p>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={e => { e.stopPropagation(); setEdit(c); }} className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg p-1.5" title="แก้ไข"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={e => { e.stopPropagation(); setDelId(c.id); }} className="text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg p-1.5" title="ลบ"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div className="text-xs text-slate-500 flex flex-col gap-0.5">
                  {c.tel && <span className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-slate-400" />{c.tel}</span>}
                  {(c.province || c.customer_type) && <span className="flex items-center gap-1.5"><MapPin className="w-3 h-3 text-slate-400" />{[c.customer_type, c.province].filter(Boolean).join(" · ")}</span>}
                  {c.tax_id && <span className="flex items-center gap-1.5"><FileText className="w-3 h-3 text-slate-400" />เลขภาษี {c.tax_id}</span>}
                  {c.contact_person && <span className="flex items-center gap-1.5"><User className="w-3 h-3 text-slate-400" />{c.contact_person}</span>}
                  {c.address && <span className="text-slate-400 leading-snug">{c.address}</span>}
                  {c.note && <span className="text-amber-600 leading-snug">📝 {c.note}</span>}
                </div>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${st.deals >= 2 ? "bg-emerald-50 text-emerald-600" : "bg-indigo-50 text-indigo-600"}`}>ซื้อ {st.deals} ครั้ง{st.units > st.deals ? ` · ${st.units} คัน` : ""}</span>
                  {st.revenue > 0 && <span className="text-[11px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">฿{fmt(st.revenue)}</span>}
                  {st.lastAt && <span className="text-[11px] text-slate-400 flex items-center gap-1"><Calendar className="w-3 h-3" />ล่าสุด {st.lastAt.slice(0, 10)}</span>}
                  {st.deals > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-300 ml-auto" />}
                </div>
              </div>
            ); })}
          </div>
        )}
      </main>

      {/* ── ฟอร์มเพิ่ม/แก้ไข ── */}
      {edit && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setEdit(null)}>
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[88vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <h3 className="text-base font-bold text-slate-800">{edit.id ? "แก้ไขข้อมูลลูกค้า" : "เพิ่มลูกค้าใหม่"}</h3>
              <button onClick={() => setEdit(null)} className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0 p-5 flex flex-col gap-3">
              <Field label="ชื่อลูกค้า / บริษัท *">
                <input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} placeholder="ชื่อ-นามสกุล / ชื่อบริษัท" className={inp} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="เบอร์โทร"><input value={edit.tel ?? ""} onChange={e => setEdit({ ...edit, tel: e.target.value })} placeholder="0XX-XXX-XXXX" className={inp} /></Field>
                <Field label="เลขผู้เสียภาษี"><input value={edit.tax_id ?? ""} onChange={e => setEdit({ ...edit, tax_id: e.target.value })} placeholder="13 หลัก" className={inp} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="ประเภทลูกค้า">
                  <select value={edit.customer_type ?? ""} onChange={e => setEdit({ ...edit, customer_type: e.target.value })} className={inp}>
                    <option value="">— เลือก —</option>
                    {fieldConfig.customerTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="จังหวัด">
                  <select value={edit.province ?? ""} onChange={e => setEdit({ ...edit, province: e.target.value })} className={inp}>
                    <option value="">— เลือก —</option>
                    {[...new Set([...PROVINCES, ...(edit.province && !PROVINCES.includes(edit.province) ? [edit.province] : [])])].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="ผู้ติดต่อ"><input value={edit.contact_person ?? ""} onChange={e => setEdit({ ...edit, contact_person: e.target.value })} placeholder="ชื่อผู้ติดต่อ / ฝ่ายจัดซื้อ" className={inp} /></Field>
              <Field label="ที่อยู่"><textarea value={edit.address ?? ""} onChange={e => setEdit({ ...edit, address: e.target.value })} rows={2} placeholder="ที่อยู่จัดส่ง / ออกบิล" className={`${inp} resize-none`} /></Field>
              <Field label="หมายเหตุ"><textarea value={edit.note ?? ""} onChange={e => setEdit({ ...edit, note: e.target.value })} rows={2} placeholder="เช่น เงื่อนไขเครดิต / ข้อควรรู้" className={`${inp} resize-none`} /></Field>
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2 flex-shrink-0">
              <button onClick={() => setEdit(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100">ยกเลิก</button>
              <button onClick={save} disabled={!edit.name.trim()}
                className="px-5 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed">
                {edit.id ? "บันทึกการแก้ไข" : "เพิ่มลูกค้า"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ยืนยันลบ ── */}
      {delId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setDelId(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl">
            <p className="font-bold text-slate-800 mb-1">ลบลูกค้ารายนี้?</p>
            <p className="text-sm text-slate-500 mb-4">{customers.find(c => c.id === delId)?.name} — ลบเฉพาะทะเบียนลูกค้า (ดีลการขายเดิมไม่ถูกลบ)</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDelId(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100">ยกเลิก</button>
              <button onClick={() => { deleteCustomer(delId); setDelId(null); }} className="px-4 py-2 rounded-xl text-sm font-bold bg-red-600 text-white hover:bg-red-700">ยืนยันลบ</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ประวัติการซื้อของลูกค้า (CRM) ── */}
      {detail && (() => {
        const st = statOf(detail.name);
        const cars = [...st.cars].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        return (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-4"
            onClick={e => e.target === e.currentTarget && setDetail(null)}>
            <div className="bg-white rounded-3xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl">
              <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-blue-700 flex items-center justify-between flex-shrink-0">
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-white truncate">{detail.name}</h3>
                  <p className="text-xs text-indigo-200">ซื้อ {st.deals} ครั้ง · {st.units} คัน · รวม ฿{fmt(st.revenue)}{detail.tel ? ` · ☎ ${detail.tel}` : ""}</p>
                </div>
                <button onClick={() => setDetail(null)} className="text-white/70 hover:text-white hover:bg-white/20 rounded-xl p-2 flex-shrink-0"><X className="w-5 h-5" /></button>
              </div>
              <div className="overflow-y-auto flex-1 min-h-0 p-4 flex flex-col gap-2">
                {cars.map(s => (
                  <div key={s.id} className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800">{s.forklift_brand} {s.forklift_model} <span className="text-slate-400 font-normal">· {s.forklift_unit_no}</span></p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{String(s.created_at).slice(0, 10)} · {s.sales_staff || "—"} · {s.sale_status ?? "ขายแล้ว"}</p>
                    </div>
                    <span className="text-sm font-bold text-indigo-700 whitespace-nowrap">฿{fmt(Number(s.actual_sale) || 0)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

const inp = "w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1"><span className="text-xs font-semibold text-slate-500">{label}</span>{children}</label>;
}

export default function CustomersPage() {
  return <DashboardGuard><CustomersPageInner /></DashboardGuard>;
}
