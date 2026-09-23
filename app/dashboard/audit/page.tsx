"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ShieldCheck, RefreshCw, Search, Package, ShoppingCart, Trash2, CheckCircle, X, Pencil } from "lucide-react";
import { fetchAuditApi, AuditEntry } from "@/lib/api";
import { DashboardGuard } from "@/components/DashboardGuard";
import { useApp } from "@/lib/AppContext";

const fmtTime = (s?: string) => { if (!s) return ""; try { return new Date(s).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }); } catch { return s; } };

// สรุป detail (jsonb) เป็นข้อความอ่านง่าย
function summarize(e: AuditEntry): string {
  const d = (e.detail ?? {}) as Record<string, unknown>;
  if (e.action?.includes("เปลี่ยนสถานะรถ") || e.action?.includes("แก้ไขข้อมูลรถ")) {
    const ch = (d.changes ?? {}) as Record<string, { from: unknown; to: unknown }>;
    const parts = Object.entries(ch).map(([k, v]) => `${k}: ${v.from || "—"} → ${v.to || "—"}`);
    return `${d.model ?? ""} · ${parts.join(" · ")}`;
  }
  if (e.action?.includes("นำเข้ารถ")) return `${d.count ?? ""} คัน${d.pi ? ` · PI ${d.pi}` : ""}`;
  if (e.action?.includes("ลบรถ")) return `${d.model ?? ""} · SN ${d.SN || "—"} · สถานะ ${d.status || "—"}`;
  if (e.entity === "sale") return `${d.model ?? ""} · ลูกค้า ${d.customer || "—"}${d.amount ? ` · ฿${Number(d.amount).toLocaleString("th-TH")}` : ""}${d.reason ? ` · เหตุผล: ${d.reason}` : ""}`;
  // fallback: แสดงเฉพาะค่าอ่านง่าย (ไม่โชว์ JSON ดิบ)
  return Object.entries(d)
    .filter(([, v]) => v != null && typeof v !== "object")
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ") || "—";
}

const actionStyle = (a?: string) => {
  if (a?.includes("ลบ")) return { c: "bg-red-100 text-red-700", i: <Trash2 className="w-3.5 h-3.5" /> };
  if (a?.includes("ปฏิเสธ")) return { c: "bg-red-100 text-red-700", i: <X className="w-3.5 h-3.5" /> };
  if (a?.includes("อนุมัติ")) return { c: "bg-emerald-100 text-emerald-700", i: <CheckCircle className="w-3.5 h-3.5" /> };
  if (a?.includes("นำเข้า")) return { c: "bg-blue-100 text-blue-700", i: <Package className="w-3.5 h-3.5" /> };
  if (a?.includes("ขาย") || a?.includes("จอง")) return { c: "bg-indigo-100 text-indigo-700", i: <ShoppingCart className="w-3.5 h-3.5" /> };
  return { c: "bg-slate-100 text-slate-600", i: <Pencil className="w-3.5 h-3.5" /> };
};

function AuditPageInner() {
  const { sales, forklifts, updateSale } = useApp();
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [actFilter, setActFilter] = useState("all");
  const [syncConfirm, setSyncConfirm] = useState(false);
  const [syncDone, setSyncDone] = useState(0);

  // ── ตรวจความตรงกัน: ชื่อยี่ห้อ/รุ่นในใบขาย vs ทะเบียนรถ ──
  // ใบขายเก็บ "สำเนาข้อความ" ของยี่ห้อ/รุ่น ไม่ได้ join กับทะเบียนรถ
  // แก้ชื่อรุ่นที่รถก่อน 23 ก.ย. 2569 ใบขายจึงค้างชื่อเก่า → รายงานโชว์ชื่อผิดทั้งที่สต็อกแก้แล้ว
  // (ตั้งแต่ 23 ก.ย. 69 ระบบซิงก์ให้อัตโนมัติตอนแก้ — อันนี้ไว้เก็บกวาดของเก่า)
  const mismatches = useMemo(() => {
    const byId = new Map(forklifts.map(f => [f.id, f]));
    const t = (v: unknown) => String(v ?? "").trim();
    return sales
      .map(s => ({ s, f: byId.get(s.forklift_id) }))
      .filter((x): x is { s: typeof sales[number]; f: NonNullable<typeof x.f> } => !!x.f)
      .filter(({ s, f }) =>
        (t(s.forklift_model) && t(s.forklift_model) !== t(f.model)) ||
        (t(s.forklift_brand) && t(s.forklift_brand) !== t(f.brand)));
  }, [sales, forklifts]);

  const syncMismatches = () => {
    mismatches.forEach(({ s, f }) => updateSale({ ...s, forklift_brand: f.brand, forklift_model: f.model }));
    setSyncDone(mismatches.length);
    setSyncConfirm(false);
  };

  const load = async () => {
    setBusy(true); setErr("");
    try { setRows(await fetchAuditApi(1000)); }
    catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่ได้"); }
    setBusy(false);
  };
  useEffect(() => { load(); }, []);

  const actions = useMemo(() => [...new Set(rows.map(r => String(r.action ?? "").replace(/\s*\d+\s*คัน$/, "").trim()).filter(Boolean))], [rows]);
  const filtered = useMemo(() => rows.filter(r => {
    const okAct = actFilter === "all" || String(r.action ?? "").startsWith(actFilter);
    const s = q.trim().toLowerCase();
    const okQ = !s || [r.actor, r.action, r.entity_id, summarize(r)].some(v => String(v ?? "").toLowerCase().includes(s));
    return okAct && okQ;
  }), [rows, actFilter, q]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-all"><ArrowLeft className="w-5 h-5" /></Link>
            <div className="flex items-center gap-2.5">
              <div className="bg-gradient-to-br from-slate-600 to-slate-800 rounded-xl p-2"><ShieldCheck className="w-5 h-5 text-white" /></div>
              <div>
                <h1 className="text-base font-bold text-slate-800 leading-tight">ประวัติการแก้ไข (Audit Log)</h1>
                <p className="text-slate-500 text-xs">ใครทำอะไรเมื่อไหร่ — จุดสำคัญ</p>
              </div>
            </div>
          </div>
          <button onClick={load} disabled={busy} className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-2 transition-all disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} /><span className="hidden sm:inline">รีเฟรช</span>
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 flex flex-col gap-4">
        {/* ── ใบขายที่ชื่อยี่ห้อ/รุ่นไม่ตรงกับทะเบียนรถ (ของเก่าที่แก้ก่อนระบบซิงก์อัตโนมัติ) ── */}
        {mismatches.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-sm font-bold text-amber-800">⚠️ ใบขาย {mismatches.length} ใบ ชื่อยี่ห้อ/รุ่นไม่ตรงกับทะเบียนรถ</p>
            <p className="text-[11px] text-amber-700 mt-0.5 mb-2">
              ใบขายเก็บชื่อรุ่นเป็นสำเนาข้อความ — ถ้าแก้ชื่อรุ่นที่หน้าสต็อกก่อน 23 ก.ย. 2569 ใบขายจะยังค้างชื่อเดิม ทำให้รายงานโชว์ชื่อเก่า
            </p>
            <div className="flex flex-col gap-1.5 mb-2">
              {mismatches.slice(0, 8).map(({ s, f }) => (
                <div key={s.id} className="text-xs bg-white border border-amber-100 rounded-lg px-2.5 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-slate-500">{s.forklift_unit_no || s.forklift_id}</span>
                  <span className="text-red-600 line-through">{s.forklift_brand} {s.forklift_model}</span>
                  <span className="text-slate-400">→</span>
                  <span className="font-semibold text-emerald-700">{f.brand} {f.model}</span>
                  <span className="ml-auto text-slate-400">{s.customer_name || "—"}</span>
                </div>
              ))}
              {mismatches.length > 8 && <span className="text-[11px] text-amber-700">…และอีก {mismatches.length - 8} ใบ</span>}
            </div>
            {!syncConfirm
              ? <button onClick={() => setSyncConfirm(true)} className="text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-lg px-3 py-2 transition-colors">
                  ซิงก์ให้ตรงกับทะเบียนรถ ({mismatches.length} ใบ)
                </button>
              : <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-amber-800 font-semibold">ยืนยัน? จะเขียนชื่อยี่ห้อ/รุ่นจากทะเบียนรถลงใบขาย {mismatches.length} ใบ</span>
                  <button onClick={syncMismatches} className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-1.5">ยืนยันซิงก์</button>
                  <button onClick={() => setSyncConfirm(false)} className="text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg px-3 py-1.5">ยกเลิก</button>
                </div>}
          </div>
        )}
        {syncDone > 0 && mismatches.length === 0 && (
          <p className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl px-3 py-2">✓ ซิงก์ชื่อรุ่นในใบขายแล้ว {syncDone} ใบ — ข้อมูลตรงกับทะเบียนรถทั้งหมด</p>
        )}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา ผู้ทำ / รหัสรถ / รายละเอียด..."
              className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white text-slate-800" />
          </div>
          <select value={actFilter} onChange={e => setActFilter(e.target.value)} className="border border-slate-200 rounded-lg px-2.5 py-2 text-sm bg-white text-slate-700">
            <option value="all">ทุกการกระทำ</option>
            {actions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <span className="text-xs text-slate-400 ml-auto">{filtered.length} รายการ</span>
        </div>

        {err && <div className="text-xs bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2">โหลดไม่ได้: {err}</div>}

        <div className="flex flex-col gap-2">
          {!busy && filtered.length === 0 && <div className="text-center py-14 text-slate-400"><ShieldCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" /><p className="text-sm">ยังไม่มีประวัติการแก้ไข</p></div>}
          {filtered.map((e, i) => {
            const st = actionStyle(e.action);
            return (
              <div key={e.id ?? i} className="bg-white border border-slate-100 rounded-xl p-3.5 flex items-start gap-3 shadow-sm">
                <span className={`rounded-lg p-2 flex-shrink-0 ${st.c}`}>{st.i}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-800 text-sm">{e.action}</span>
                    {e.entity_id && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md">#{String(e.entity_id).replace(/#\d+$/, "")}</span>}
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5 break-words">{summarize(e)}</p>
                  <p className="text-[11px] text-slate-400 mt-1">โดย <span className="font-semibold text-slate-600">{e.actor || "—"}</span> · {fmtTime(e.at)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

export default function AuditPage() {
  return <DashboardGuard><AuditPageInner /></DashboardGuard>;
}
