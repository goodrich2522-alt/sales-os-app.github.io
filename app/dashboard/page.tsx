"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import {
  ArrowLeft, TrendingUp, Package, Users, BarChart3, DollarSign, Award,
  ChevronRight, ChevronDown, User, X, Calendar, MapPin, Clock, ShieldCheck, Boxes,
} from "lucide-react";
import { useApp } from "@/lib/AppContext";
import { getRegion } from "@/lib/mockData";
import { displayCode } from "@/lib/productId";
import { buildStaffMonthly, buildStaffWeekly, buildAllMonthlyWeekly } from "@/components/charts/Charts";
import { CONTACT_SOURCE_COLORS, paymentBadgeClass, staffLabel } from "@/lib/constants";
import { parseSvc, nextDue, daysUntil, SVC_SOON_DAYS } from "@/lib/warranty";
import { isForkliftVehicle, closeDate } from "@/lib/commission";
import { thaiDateShort } from "@/lib/format";
import { Sale, Forklift, isVoidSale } from "@/lib/types";
import GoogleLoginButton, { type GoogleUser } from "@/components/GoogleLoginButton";
import { checkAccess, hasActiveSession } from "@/lib/auth";
import { apiEnabled } from "@/lib/api";

const SalesRevenueChart = dynamic(
  () => import("@/components/charts/Charts").then((m) => ({ default: m.SalesRevenueChart })),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
const BrandShareChart = dynamic(
  () => import("@/components/charts/Charts").then((m) => ({ default: m.BrandShareChart })),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
const StockStatusChart = dynamic(
  () => import("@/components/charts/Charts").then((m) => ({ default: m.StockStatusChart })),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
const PaymentTypeChart = dynamic(
  () => import("@/components/charts/Charts").then((m) => ({ default: m.PaymentTypeChart })),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
const StaffRevenueChart = dynamic(
  () => import("@/components/charts/Charts").then((m) => ({ default: m.StaffRevenueChart })),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
const WeeklyBreakdownChart = dynamic(
  () => import("@/components/charts/Charts").then((m) => ({ default: m.WeeklyBreakdownChart })),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

const MONTHS_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function fmt(n: number)  { return Number(n).toLocaleString("th-TH"); }
// แสดงยอดแบบปรับอัตโนมัติ — ยอดน้อยโชว์เลขจริงเต็ม (ไม่ปัดเป็น 0.00 ล.) · ยอดหลักล้านโชว์ย่อ "ล."
function fmtM(n: number) {
  const v = Number(n) || 0;
  return Math.abs(v) >= 1_000_000 ? (v / 1_000_000).toFixed(2) + " ล." : v.toLocaleString("th-TH");
}

function ChartSkeleton() {
  return <div className="w-full h-full bg-slate-100 rounded-xl animate-pulse" />;
}


const REGION_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  "เหนือ":  { bg: "bg-blue-50",   border: "border-blue-200",   text: "text-blue-700",   dot: "#3B82F6" },
  "กลาง":   { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "#10B981" },
  "อีสาน":  { bg: "bg-amber-50",  border: "border-amber-200",  text: "text-amber-700",  dot: "#F59E0B" },
  "ใต้":    { bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-700", dot: "#8B5CF6" },
};

export default function Dashboard() {
  const [dashAuth, setDashAuth] = useState(false);
  const [dashChecking, setDashChecking] = useState(false);
  const [dashNotice, setDashNotice] = useState(""); // แจ้งเหตุที่เข้าไม่ได้ (รออนุมัติ/ถูกระงับ/ยังไม่ลงทะเบียน)

  const { sales: rawSales, forklifts, fieldConfig } = useApp();
  const [dashEmail, setDashEmail] = useState("");
  useEffect(() => { const du = typeof window !== "undefined" ? localStorage.getItem("dash_user") : null; if (du) try { setDashEmail(String(JSON.parse(du).email || "").toLowerCase()); } catch {} }, [dashAuth]);
  const isDashAdmin = (fieldConfig.adminEmails ?? []).some(e => e.toLowerCase() === dashEmail);
  // ตัดดีลที่ถูกปฏิเสธจากสต็อก (ไม่ใช่ดีลจริง) ออกจากยอด/รายงานทั้งแดชบอร์ด
  const allSales = useMemo(() => rawSales.filter((s) => !isVoidSale(s)), [rawSales]);
  const staffNames = useMemo(() => Array.from(new Set(allSales.map((s) => s.sales_staff).filter(Boolean))), [allSales]);
  const resigned = fieldConfig.resignedStaff ?? []; // เซลล์ลาออก → เติม "(ลาออก)" เวลาแสดงผล
  const [selectedStaff, setSelectedStaff] = useState("");
  // เลือกเซลล์จริงคนแรกเสมอ — รีเซ็ตถ้าค่าปัจจุบันไม่มีในรายชื่อ (กัน mock "สมชาย ใจดี" ค้างตอนข้อมูลจริงโหลดมา)
  useEffect(() => {
    if (staffNames.length && !staffNames.includes(selectedStaff)) setSelectedStaff(staffNames[0]);
  }, [staffNames, selectedStaff]);
  const [drillMonth, setDrillMonth] = useState<string | null>(null);
  const [globalDrillMonth, setGlobalDrillMonth] = useState<string | null>(null);
  const [regionModal, setRegionModal] = useState<string | null>(null);

  // ── ตัวกรองปี + แบรนด์ (กรองทั้งแดชบอร์ด) ──────────────────────────────────────
  // แก้บั๊กเดิม: กราฟรายเดือนรวมยอดคนละปีเข้าเดือนเดียวกัน (ใช้ getMonth ล้วน) → กรองปีก่อน เดือนเลยไม่ปนปี
  const [dashYear, setDashYear] = useState("");        // "" = ยังไม่ตั้ง → effect เลือกปีล่าสุดให้
  const [dashBrand, setDashBrand] = useState("all");
  const years = useMemo(() => {
    const ys = new Set<string>();
    allSales.forEach((s) => { const d = new Date(s.created_at); if (!isNaN(d.getTime())) ys.add(String(d.getFullYear())); });
    return [...ys].sort((a, b) => b.localeCompare(a)); // ใหม่ → เก่า
  }, [allSales]);
  // ค่าเริ่มต้น = ปีที่มีดีลมากสุด · รีเซ็ตถ้าปีที่เลือกไม่มีในข้อมูลจริง (กัน mock ปี 2024 ค้างตอนข้อมูลจริงโหลดมา)
  useEffect(() => {
    if (allSales.length === 0) return;
    if (dashYear && years.includes(dashYear)) return; // ปีที่เลือกยังมีข้อมูลจริง — คงไว้
    const cnt: Record<string, number> = {};
    allSales.forEach((s) => { const d = new Date(s.created_at); if (!isNaN(d.getTime())) { const y = String(d.getFullYear()); cnt[y] = (cnt[y] ?? 0) + 1; } });
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (top && top !== dashYear) setDashYear(top);
  }, [allSales, dashYear, years]);
  const brandOptions = useMemo(() => [...new Set(allSales.map((s) => s.forklift_brand || "อื่นๆ"))].sort(), [allSales]);
  // กรองตามปี (ใช้กับกราฟสัดส่วนแบรนด์ — ให้เห็นทุกแบรนด์ในปีนั้น ไม่ถูก brand filter บีบเหลือ 1)
  const yearSales = useMemo(() => dashYear
    ? allSales.filter((s) => { const d = new Date(s.created_at); return !isNaN(d.getTime()) && String(d.getFullYear()) === dashYear; })
    : allSales, [allSales, dashYear]);
  // กรองปี + แบรนด์ → ใช้กับ aggregation ที่เหลือทั้งหมด (ชื่อ sales เดิม เพื่อไม่ต้องแก้โค้ดด้านล่าง)
  const sales = useMemo(() => dashBrand === "all" ? yearSales : yearSales.filter((s) => (s.forklift_brand || "อื่นๆ") === dashBrand), [yearSales, dashBrand]);

  useEffect(() => {
    // เข้าค้างไว้ได้เฉพาะเมื่อ session Supabase ยังไม่หมดอายุ — ไม่งั้นให้ล็อกอินใหม่
    (async () => {
      if (localStorage.getItem("dash_auth") !== "1") return;
      if (apiEnabled) {
        if (!(await hasActiveSession())) { localStorage.removeItem("dash_auth"); return; }
        // ตรวจ role ซ้ำ — แดชบอร์ดเฉพาะแอดมิน/สต็อก (กัน session เซลล์เก่าที่เคยเข้าได้)
        const du = localStorage.getItem("dash_user");
        const email = du ? (JSON.parse(du).email as string) : "";
        const acc = await checkAccess(email, "stock");
        if (!acc.ok) { localStorage.removeItem("dash_auth"); return; }
      }
      setDashAuth(true);
    })();
  }, []);

  // ── All hooks must be called before any early return ──────────────────────────
  const regionData = useMemo(() => {
    const regions: Record<string, Sale[]> = { "เหนือ": [], "กลาง": [], "อีสาน": [], "ใต้": [] };
    sales.forEach(s => {
      const r = getRegion(s.province);
      regions[r].push(s);
    });
    const total = sales.length || 1;
    return (["กลาง", "อีสาน", "เหนือ", "ใต้"] as const).map(region => ({
      region,
      count: regions[region].length,
      pct: Math.round((regions[region].length / total) * 100),
      sales: regions[region],
    })).sort((a, b) => b.count - a.count);
  }, [sales]);

  // ข้อมูลรถต่อคัน (เสา/ชนิด) — ใช้แยกรุ่นขายดีของ forklift ตามความสูงเสา (MAST)
  const fkMeta = useMemo(() => {
    const m = new Map<string, { mast: string; cat: string }>();
    forklifts.forEach(f => m.set(f.id, {
      mast: String((f.custom_fields as Record<string, unknown> | undefined)?.["MAST"] ?? "").trim(),
      cat: f.vehicle_category ?? "Forklift",
    }));
    return m;
  }, [forklifts]);

  // กรอง "รุ่นขายดี" ตามแบรนด์ ("" = ทุกแบรนด์) — คลิกยี่ห้อที่ legend ใต้โดนัท
  const [modelBrand, setModelBrand] = useState<string>("");
  const [expandedModel, setExpandedModel] = useState<string | null>(null);  // รุ่นที่กดขยายดูรายการขาย
  const modelSales = useMemo(
    () => (modelBrand ? sales.filter(s => (s.forklift_brand || "อื่นๆ") === modelBrand) : sales),
    [sales, modelBrand]
  );
  const liveTopModels = useMemo(() => {
    // เก็บ "รายการขายจริง" ของแต่ละรุ่นไว้ด้วย — กดที่แถวแล้วขยายดูได้ว่าขายให้ใคร คันไหน เมื่อไหร่
    const map = new Map<string, Sale[]>();
    modelSales.forEach(s => {
      const meta = fkMeta.get(s.forklift_id);
      const isForklift = (meta?.cat ?? s.vehicle_type) === "Forklift";
      const mast = meta?.mast ?? "";
      // กรองแบรนด์แล้ว → ตัดชื่อแบรนด์ออกจากป้าย (ไม่ต้องซ้ำ) · forklift แยกตามความสูงเสา
      const label = modelBrand ? (s.forklift_model || "") : `${s.forklift_brand} ${s.forklift_model}`;
      const key = isForklift && mast ? `${label} · เสา ${mast}` : `${label}`;
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    });
    const total = modelSales.length || 1; // สัดส่วนเทียบ "ภายในแบรนด์" เมื่อกรอง
    return [...map.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, modelBrand ? 8 : 6)
      .map(([model, list]) => ({
        model, count: list.length, pct: Math.round((list.length / total) * 100),
        sales: [...list].sort((a, b) => closeDate(b).localeCompare(closeDate(a))),   // ปิดล่าสุดขึ้นก่อน
      }));
  }, [modelSales, fkMeta, modelBrand]);

  // ── FIFO เฟส 5: สุขภาพสต็อก (อายุค้าง) — จากรถ "พร้อมขาย" ปัจจุบัน (ไม่ขึ้นกับตัวกรองปี) ──
  const agingMetrics = useMemo(() => {
    const ready = forklifts.filter((f) => String(f.status).trim() === "พร้อมขาย");
    const rows = ready.map((f) => {
      const d = String(f.received_date || "").slice(0, 10);
      const days = /^\d{4}-\d{2}-\d{2}$/.test(d) ? Math.max(0, Math.floor((Date.now() - new Date(d + "T00:00:00").getTime()) / 86400000)) : null;
      return { f, cost: Number(f.cost_price) || 0, days };
    });
    const dated = rows.filter((r) => r.days != null);
    const avg = dated.length ? Math.round(dated.reduce((s, r) => s + (r.days ?? 0), 0) / dated.length) : 0;
    const over90 = rows.filter((r) => (r.days ?? 0) > 90);
    const over180 = rows.filter((r) => (r.days ?? 0) > 180);
    const stuckCost = over90.reduce((s, r) => s + r.cost, 0);
    const byAge = [...rows].sort((a, b) => (b.days ?? -1) - (a.days ?? -1)); // ค้างนานสุดก่อน
    return { readyCount: ready.length, avg, over90: over90.length, over180: over180.length,
      pctOver90: ready.length ? Math.round((over90.length / ready.length) * 100) : 0, stuckCost,
      lists: { ready: byAge, over90: over90.sort((a, b) => (b.days ?? 0) - (a.days ?? 0)) } };
  }, [forklifts]);
  // แจ้งเตือนรอบเช็ครับประกัน — นับรถที่เกิน/ใกล้ถึงกำหนด (โชว์ badge บนปุ่มลิงก์)
  const warrantyDueCount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    let n = 0;
    forklifts.forEach(f => { if (!isForkliftVehicle(f.brand, f.model)) return; const svc = parseSvc(f); if (!svc) return; const nd = nextDue(svc); if (!nd) return; const d = daysUntil(nd.due, today); if (d != null && d <= SVC_SOON_DAYS) n++; });
    return n;
  }, [forklifts]);

  // Modal ดูรายการรถของการ์ด FIFO (คลิกการ์ด → เปิดรายการนั้น)
  const [agingModal, setAgingModal] = useState<null | { title: string; rows: { f: Forklift; cost: number; days: number | null }[]; showCost?: boolean }>(null);

  const contactSourceData = useMemo(() => {
    const ALL_SOURCES = ["Line", "Facebook", "TikTok", "โทร", "Google", "คนอื่นบอกต่อ"];
    const map: Record<string, number> = {};
    ALL_SOURCES.forEach(s => { map[s] = 0; });
    sales.forEach(s => {
      if (s.contact_source) map[s.contact_source] = (map[s.contact_source] ?? 0) + 1;
    });
    const total = sales.length || 1;
    return ALL_SOURCES.map(src => ({
      source: src,
      count: map[src] ?? 0,
      pct: Math.round(((map[src] ?? 0) / total) * 100),
    })).sort((a, b) => b.count - a.count);
  }, [sales]);

  // ── สรุปจากข้อมูลจริง (sales) ────────────────────────────────────────────────
  const realMonthly = useMemo(() => {
    const m = MONTHS_TH.map((mn) => ({ month: mn, revenue: 0, units: 0 }));
    sales.forEach((s) => { const d = new Date(s.created_at); if (!isNaN(d.getTime())) { const i = d.getMonth(); m[i].revenue += s.actual_sale || 0; m[i].units += 1; } });
    return m;
  }, [sales]);
  const realPaymentMonthly = useMemo(() => {
    const m = MONTHS_TH.map((mn) => ({ month: mn, cash: 0, finance: 0 }));
    sales.forEach((s) => { const d = new Date(s.created_at); if (isNaN(d.getTime())) return; const i = d.getMonth(); if (s.payment_type === "ไฟแนนซ์") m[i].finance += 1; else m[i].cash += 1; });
    return m;
  }, [sales]);
  const realLeaderboard = useMemo(() => {
    const map: Record<string, { name: string; sales: number; revenue: number }> = {};
    // นับเฉพาะดีลที่มีชื่อเซลล์จริง — ตัดดีลนำเข้าเก่าที่ไม่มีเซลล์ (บิลภาษี GR/ไฟล์นำเข้า) ออกจากอันดับ
    sales.forEach((s) => { const n = (s.sales_staff || "").trim(); if (!n) return; if (!map[n]) map[n] = { name: n, sales: 0, revenue: 0 }; map[n].sales += 1; map[n].revenue += s.actual_sale || 0; });
    const badges = ["🥇", "🥈", "🥉"];
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).map((x, i) => ({ rank: i + 1, ...x, badge: badges[i] ?? "" }));
  }, [sales]);
  const realBrandShare = useMemo(() => {
    const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4", "#EC4899", "#64748B"];
    const map: Record<string, number> = {};
    yearSales.forEach((s) => { const b = s.forklift_brand || "อื่นๆ"; map[b] = (map[b] ?? 0) + 1; }); // ใช้ทั้งปี ไม่ถูก brand filter บีบ
    const total = yearSales.length || 1;
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([name, count], i) => ({ name, value: count, pct: Math.round((count / total) * 100), color: COLORS[i % COLORS.length] }));
  }, [yearSales]);
  const totalRevenue = sales.reduce((a, s) => a + (s.actual_sale || 0), 0);
  const totalUnits = sales.length;
  const monthsWithData = realMonthly.filter((m) => m.units > 0).length || 1;
  const avgRevenue = Math.round(totalRevenue / monthsWithData);

  // แดชบอร์ดเห็นข้อมูลรวมทั้งบริษัท (ต้นทุน/กำไร/ค่าคอม) — เข้าได้เฉพาะแอดมิน + ฝ่ายสต็อกเท่านั้น (ทีมขายเข้าไม่ได้)
  const handleDashGoogle = async (u: GoogleUser) => {
    setDashChecking(true); setDashNotice("");
    const access = await checkAccess(u.email, "stock");
    setDashChecking(false);
    if (!access.ok) {
      setDashNotice(
        access.reason === "blocked" ? "บัญชีนี้ถูกระงับการใช้งาน — ติดต่อแอดมิน"
        : access.reason === "pending" ? "บัญชีของคุณรอแอดมินอนุมัติอยู่ — ยังเข้าแดชบอร์ดไม่ได้"
        : access.reason === "role_mismatch" ? "หน้าแดชบอร์ดสำหรับฝ่ายสต็อก/แอดมินเท่านั้น — ทีมขายเข้าไม่ได้"
        : "บัญชีนี้ยังไม่ได้ลงทะเบียนในระบบ — ลงทะเบียนผ่านหน้าทีมขาย/ฝ่ายสต็อก แล้วรอแอดมินอนุมัติ"
      );
      return;
    }
    localStorage.setItem("dash_auth", "1");
    localStorage.setItem("dash_user", JSON.stringify({ email: u.email, name: u.name }));
    setDashAuth(true);
  };

  if (!dashAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-violet-500 to-purple-700" />
            <div className="p-8">
              <div className="flex flex-col items-center mb-8">
                <div className="bg-gradient-to-br from-violet-500 to-purple-700 rounded-2xl p-4 mb-4 shadow-lg shadow-violet-200">
                  <BarChart3 className="w-10 h-10 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-slate-800">แดชบอร์ด</h1>
                <p className="text-slate-500 text-sm mt-1 text-center">ข้อมูลภายในบริษัท — เข้าสู่ระบบด้วย Google</p>
              </div>
              <div className="flex flex-col items-center gap-3">
                {dashNotice && (
                  <div className="w-full bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 leading-relaxed">
                    {dashNotice}
                  </div>
                )}
                {dashChecking ? (
                  <div className="flex items-center gap-2 text-slate-500 text-sm py-2">กำลังตรวจสอบสิทธิ์...</div>
                ) : (
                  <GoogleLoginButton onSuccess={handleDashGoogle} onError={setDashNotice} />
                )}
                <p className="text-xs text-slate-400 text-center">เฉพาะผู้ใช้ที่แอดมินอนุมัติแล้วเท่านั้น</p>
              </div>
              <Link href="/" className="flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 mt-5 transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" />กลับหน้าหลัก
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Derived values ────────────────────────────────────────────────────────────
  const staffSales   = sales.filter((s) => s.sales_staff === selectedStaff);
  const staffRevenue = staffSales.reduce((sum, s) => sum + s.actual_sale, 0);
  const staffUnits   = staffSales.length;
  const staffMonthly = buildStaffMonthly(sales, selectedStaff);

  const staffModelMap: Record<string, number> = {};
  staffSales.forEach((s) => {
    const key = `${s.forklift_brand} ${s.forklift_model}`;
    staffModelMap[key] = (staffModelMap[key] ?? 0) + 1;
  });
  const staffModels = Object.entries(staffModelMap).sort((a, b) => b[1] - a[1]);

  const liveStockStatus = [
    { name: "พร้อมขาย",        value: forklifts.filter((f) => f.status === "พร้อมขาย").length,                                 color: "#10B981" },
    { name: "จอง",            value: forklifts.filter((f) => f.status === "จอง" || f.status === "จองแล้ว").length,             color: "#F59E0B" },
    { name: "รอผ่านไฟแนนซ์",  value: forklifts.filter((f) => f.status === "รอผ่านไฟแนนซ์").length,                            color: "#EF4444" },
    { name: "ปิดการขายแล้ว",  value: forklifts.filter((f) => ["ปิดการขายแล้ว", "ส่งมอบแล้ว", "ขายแล้ว"].includes(String(f.status))).length, color: "#6366F1" },
  ];

  // Drill-down data for staff
  const drillData = drillMonth ? buildStaffWeekly(sales, selectedStaff, drillMonth) : null;
  const drillModelMap: Record<string, number> = {};
  drillData?.allSales.forEach((s) => {
    const key = `${s.forklift_brand} ${s.forklift_model}`;
    drillModelMap[key] = (drillModelMap[key] ?? 0) + 1;
  });
  const drillModels = Object.entries(drillModelMap).sort((a, b) => b[1] - a[1]);

  // Global monthly weekly drill-down
  const globalDrillData = globalDrillMonth ? buildAllMonthlyWeekly(sales, globalDrillMonth) : null;

  const topRegion = regionData[0];
  const modalSales = regionModal ? regionData.find(r => r.region === regionModal)?.sales ?? [] : [];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-all">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2.5">
              <div className="bg-gradient-to-br from-violet-500 to-purple-700 rounded-xl p-2">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-800 leading-tight">แดชบอร์ดวิเคราะห์</h1>
                <p className="text-slate-500 text-xs">ข้อมูลสถิติการขายและสินค้าคงคลัง</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/stock-summary" className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-3 py-1.5 transition-all">
              <Package className="w-4 h-4" /><span className="hidden sm:inline">สรุปสต็อก</span>
            </Link>
            <Link href="/dashboard/restock" className="flex items-center gap-1.5 text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg px-3 py-1.5 transition-all">
              <Boxes className="w-4 h-4" /><span className="hidden sm:inline">วางแผนสั่งสต็อก</span>
            </Link>
            <Link href="/dashboard/warranty" className="relative flex items-center gap-1.5 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg px-3 py-1.5 transition-all">
              <ShieldCheck className="w-4 h-4" /><span className="hidden sm:inline">รับประกัน/รอบเช็ค</span>
              {warrantyDueCount > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{warrantyDueCount}</span>}
            </Link>
            <Link href="/dashboard/commission" className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg px-3 py-1.5 transition-all">
              <DollarSign className="w-4 h-4" /><span className="hidden sm:inline">ค่าคอมรายเดือน</span>
            </Link>
            <Link href="/dashboard/customers" className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg px-3 py-1.5 transition-all">
              <Users className="w-4 h-4" /><span className="hidden sm:inline">ทะเบียนลูกค้า</span>
            </Link>
            <Link href="/dashboard/audit" className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg px-3 py-1.5 transition-all">
              <ShieldCheck className="w-4 h-4" /><span className="hidden sm:inline">ประวัติแก้ไข</span>
            </Link>
            {isDashAdmin && (
              <Link href="/admin/users" className="flex items-center gap-1.5 text-xs font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-lg px-3 py-1.5 transition-all">
                <Users className="w-4 h-4" /><span className="hidden sm:inline">จัดการผู้ใช้</span>
              </Link>
            )}
            {dashYear && <span className="text-xs font-medium bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full hidden sm:block">ปี {Number(dashYear) + 543}</span>}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-5">
        {/* ── ตัวกรอง: ปี + แบรนด์ (มีผลทั้งแดชบอร์ด) ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 mr-1"><Calendar className="w-3.5 h-3.5" />ปี</span>
          {years.map((y) => (
            <button key={y} onClick={() => setDashYear(y)}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-all ${dashYear === y ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"}`}>
              {Number(y) + 543}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <span className="text-xs font-semibold text-slate-500 mr-1">แบรนด์</span>
          <select value={dashBrand} onChange={(e) => setDashBrand(e.target.value)}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400">
            <option value="all">ทุกแบรนด์</option>
            {brandOptions.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <span className="ml-auto text-xs text-slate-400">{totalUnits} ดีล · ฿{fmtM(totalRevenue)}</span>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard icon={<DollarSign className="w-5 h-5" />} label="รายได้รวม"    value={`฿${fmtM(totalRevenue)}`} sub="จากดีลจริง"   color="text-blue-700"    iconBg="bg-blue-600"    accent="border-l-blue-500" />
          <KPICard icon={<Package className="w-5 h-5" />}    label="ขายได้"        value={`${totalUnits} คัน`}       sub="ดีลทั้งหมด"   color="text-emerald-700" iconBg="bg-emerald-500" accent="border-l-emerald-500" />
          <KPICard icon={<TrendingUp className="w-5 h-5" />}  label="เฉลี่ย/เดือน" value={`฿${fmtM(avgRevenue)}`}   sub="เฉพาะเดือนมียอด" color="text-violet-700"  iconBg="bg-violet-600"  accent="border-l-violet-500" />
          <KPICard icon={<Users className="w-5 h-5" />}       label="พนักงานขาย"   value={`${staffNames.length} คน`}  sub="active staff"  color="text-orange-700"  iconBg="bg-orange-500"  accent="border-l-orange-500" />
        </div>

        {/* Row 1: Sales Performance — clickable monthly chart */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <div className="flex items-center justify-between mb-1">
              <SectionHeader icon={<TrendingUp className="w-4 h-4 text-blue-600" />} title="ยอดขายรายเดือน" sub="คลิกแท่งกราฟเพื่อดูรายสัปดาห์" iconBg="bg-blue-50" />
              {globalDrillMonth && (
                <button onClick={() => setGlobalDrillMonth(null)} className="text-xs text-slate-500 hover:text-red-600 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-50 transition-all">
                  <X className="w-3.5 h-3.5" />ปิด
                </button>
              )}
            </div>
            <div className="h-60 mt-5">
              <SalesRevenueChart
                data={realMonthly}
                onBarClick={(month) => setGlobalDrillMonth(globalDrillMonth === month ? null : month)}
                activeMonth={globalDrillMonth ?? undefined}
              />
            </div>
            {/* Global monthly drill-down */}
            {globalDrillMonth && globalDrillData && (
              <div className="mt-4 border-t border-blue-100 pt-4">
                <p className="text-xs font-bold text-slate-700 mb-3">ยอดขายรายสัปดาห์ — เดือน{globalDrillMonth} (ทุกเซลล์)</p>
                <div className="h-40 bg-blue-50 rounded-xl border border-blue-100 p-3">
                  <WeeklyBreakdownChart data={globalDrillData.weeks.map((w) => ({ week: w.week.split("\n")[0], revenue: w.revenue, units: w.units }))} />
                </div>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {globalDrillData.weeks.map((w, i) => (
                    <div key={i} className="bg-white border border-slate-100 rounded-xl p-2.5 text-center">
                      <p className="text-xs font-semibold text-slate-700">{w.week.split("\n")[0]}</p>
                      <p className="text-sm font-bold text-blue-700 mt-0.5">{w.units} คัน</p>
                      <p className="text-xs text-slate-500">฿{fmt(w.revenue)}</p>
                    </div>
                  ))}
                </div>
                {globalDrillData.allSales.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">ไม่มีข้อมูลในเดือนนี้</p>
                )}
              </div>
            )}
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <SectionHeader icon={<Award className="w-4 h-4 text-amber-500" />} title="อันดับยอดขาย" sub="Top Sales Reps" iconBg="bg-amber-50" />
            <div className="flex flex-col gap-2 mt-5">
              {realLeaderboard.length === 0 && <p className="text-xs text-slate-400 text-center py-4">ยังไม่มีข้อมูลการขาย</p>}
              {realLeaderboard.slice(0, 8).map((s) => (
                <div key={s.name} className={`flex items-center gap-3 rounded-xl p-3 border ${s.rank <= 3 ? "bg-amber-50/60 border-amber-100" : "bg-slate-50 border-slate-100"}`}>
                  <span className="text-base w-7 text-center flex-shrink-0">{s.badge || <span className="text-xs font-bold text-slate-400">#{s.rank}</span>}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{staffLabel(s.name, resigned)}</p>
                    <p className="text-xs text-slate-500">{s.sales} คัน</p>
                  </div>
                  <p className="text-sm font-bold text-indigo-700 flex-shrink-0">฿{fmtM(s.revenue)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Row 2: Regional Analysis (Part 6) ─────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <SectionHeader icon={<MapPin className="w-4 h-4 text-teal-600" />} title="วิเคราะห์ลูกค้าตามภาค" sub="คลิกที่จำนวนลูกค้าเพื่อดูรายชื่อ" iconBg="bg-teal-50" />
          <div className="mt-5 grid grid-cols-1 lg:grid-cols-5 gap-5">
            {/* Top region highlight */}
            <div className="lg:col-span-2 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-2xl p-5 text-white flex flex-col justify-between">
              <div>
                <p className="text-teal-100 text-sm font-medium">ภาคที่ซื้อมากสุด</p>
                <p className="text-4xl font-bold mt-1">ภาค{topRegion?.region}</p>
                <p className="text-teal-100 text-sm mt-1">{topRegion?.pct}% จากทั้งหมด</p>
              </div>
              <p className="text-2xl font-bold mt-3">{topRegion?.count} <span className="text-lg text-teal-200">ราย</span></p>
            </div>

            {/* All 4 regions */}
            <div className="lg:col-span-3 grid grid-cols-2 gap-3">
              {regionData.map(({ region, count, pct }) => {
                const c = REGION_COLORS[region];
                return (
                  <div key={region} className={`${c.bg} border ${c.border} rounded-2xl p-4`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-sm font-bold ${c.text}`}>ภาค{region}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.bg} ${c.text} border ${c.border}`}>{pct}%</span>
                    </div>
                    <button
                      onClick={() => setRegionModal(region)}
                      className={`text-2xl font-bold ${c.text} hover:underline cursor-pointer`}>
                      {count}
                    </button>
                    <p className={`text-xs ${c.text} opacity-70 mt-0.5`}>ลูกค้า</p>
                    {/* Progress bar */}
                    <div className="mt-3 h-1.5 bg-white/60 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: REGION_COLORS[region].dot }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Summary row */}
          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {regionData.map(({ region, count }) => {
              const c = REGION_COLORS[region];
              return (
                <div key={region} className="flex items-center gap-2 text-sm">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: REGION_COLORS[region].dot }} />
                  <span className="text-slate-600">ภาค{region}</span>
                  <button onClick={() => setRegionModal(region)}
                    className={`font-bold ${c.text} hover:underline ml-auto`}>{count} คน</button>
                </div>
              );
            })}
          </div>

          {/* Contact source breakdown */}
          <div className="mt-5 pt-5 border-t border-slate-100">
            <div className="flex items-center gap-2 mb-4">
              <div className="bg-pink-50 rounded-xl p-1.5"><span className="text-pink-500 text-sm">📲</span></div>
              <div>
                <p className="text-sm font-bold text-slate-800">ช่องทางที่ลูกค้าติดต่อ</p>
                <p className="text-xs text-slate-400">รวมทั้งหมด {sales.length} ราย</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {contactSourceData.map(({ source, count, pct }) => (
                <div key={source} className={`rounded-2xl p-3.5 border text-center ${CONTACT_SOURCE_COLORS[source]?.replace("text-", "border-").replace("100", "200").split(" ")[0] ?? "border-slate-200"} bg-white`}>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${CONTACT_SOURCE_COLORS[source] ?? "bg-slate-100 text-slate-600"}`}>{source}</span>
                  <p className="text-2xl font-bold text-slate-800 mt-2">{count}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{pct}% · คน</p>
                  <div className="mt-2.5 h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-current opacity-30 transition-all duration-500"
                      style={{ width: `${pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Row 3: Product Popularity — Model with percentages */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <SectionHeader icon={<Package className="w-4 h-4 text-indigo-600" />} title="สัดส่วนยี่ห้อ" sub="Brand Market Share" iconBg="bg-indigo-50" />
            <div className="h-48 mt-2"><BrandShareChart data={realBrandShare} /></div>
            <p className="text-[11px] text-slate-400 text-center mt-1">👆 คลิกยี่ห้อเพื่อดูรุ่นขายดีของแบรนด์นั้น</p>
            <div className="grid grid-cols-2 gap-1.5 mt-2">
              {realBrandShare.map((b) => {
                const active = modelBrand === b.name;
                return (
                  <button key={b.name} onClick={() => setModelBrand(active ? "" : b.name)}
                    className={`flex items-center gap-1.5 text-xs rounded-lg px-1.5 py-1 text-left transition-all ${active ? "bg-indigo-50 ring-1 ring-indigo-200 text-indigo-700 font-semibold" : "text-slate-600 hover:bg-slate-50"}`}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: b.color }} />
                    <span className="truncate">{b.name} <span className={active ? "text-indigo-400" : "text-slate-400"}>{b.value} คัน ({b.pct}%)</span></span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <SectionHeader icon={<BarChart3 className="w-4 h-4 text-indigo-600" />} title="รุ่นขายดี" sub="Top Selling Models — คลิกยี่ห้อด้านซ้ายเพื่อดูเฉพาะแบรนด์" iconBg="bg-indigo-50" />
              {modelBrand && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full">เฉพาะ {modelBrand}</span>
                  <button onClick={() => setModelBrand("")} className="text-slate-400 hover:text-slate-700 font-medium underline">ดูทุกยี่ห้อ</button>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-3.5 mt-5">
              {liveTopModels.length === 0 && <p className="text-xs text-slate-400 text-center py-4">ยังไม่มีข้อมูลการขาย</p>}
              {liveTopModels.map((m, i) => {
                const open = expandedModel === m.model;
                return (
                <div key={m.model}>
                  {/* กดที่แถว = ขยายดูรายการขายของรุ่นนั้น (ขายให้ใคร คันไหน เมื่อไหร่ ราคาเท่าไร) */}
                  <button onClick={() => setExpandedModel(open ? null : m.model)}
                    className="flex items-center gap-3 w-full text-left group" title="กดเพื่อดูรายการขายของรุ่นนี้">
                    <span className={`text-xs font-bold w-6 text-center flex-shrink-0 ${i === 0 ? "text-amber-500" : "text-slate-400"}`}>#{i + 1}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1.5 gap-2">
                        <p className="text-sm font-semibold text-slate-800 group-hover:text-indigo-700 flex items-center gap-1 min-w-0">
                          {open ? <ChevronDown className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                                : <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-400 flex-shrink-0" />}
                          <span className="truncate">{m.model}</span>
                        </p>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">{m.pct}%</span>
                          <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">{m.count} คัน</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-blue-500"
                          style={{ width: `${m.pct}%` }} />
                      </div>
                    </div>
                  </button>
                  {open && (
                    <div className="ml-9 mt-2.5 border border-slate-100 rounded-xl overflow-hidden">
                      <div className="max-h-72 overflow-y-auto overflow-x-auto">
                        <table className="w-full text-xs min-w-[460px]">
                          <thead className="bg-slate-50 sticky top-0">
                            <tr className="text-slate-500">
                              <th className="text-left px-2.5 py-1.5 font-semibold whitespace-nowrap">วันที่ปิด</th>
                              <th className="text-left px-2.5 py-1.5 font-semibold whitespace-nowrap">รหัสรถ</th>
                              <th className="text-left px-2.5 py-1.5 font-semibold">ลูกค้า</th>
                              <th className="text-left px-2.5 py-1.5 font-semibold whitespace-nowrap">เซลล์</th>
                              <th className="text-right px-2.5 py-1.5 font-semibold whitespace-nowrap">ราคาขาย</th>
                            </tr>
                          </thead>
                          <tbody>
                            {m.sales.map(s => (
                              <tr key={s.id} className="border-t border-slate-50 hover:bg-indigo-50/40">
                                <td className="px-2.5 py-1.5 text-slate-600 whitespace-nowrap">{thaiDateShort(closeDate(s)) || "—"}</td>
                                <td className="px-2.5 py-1.5 text-slate-700 whitespace-nowrap">{String(s.forklift_unit_no || "").replace(/#\d+$/, "") || "—"}</td>
                                <td className="px-2.5 py-1.5 text-slate-700">
                                  {s.customer_name || "—"}
                                  {s.province ? <span className="text-slate-400"> · {s.province}</span> : null}
                                </td>
                                <td className="px-2.5 py-1.5 text-slate-600 whitespace-nowrap">{staffLabel(s.sales_staff) || "—"}</td>
                                <td className="px-2.5 py-1.5 text-right font-semibold text-slate-800 whitespace-nowrap">฿{fmt(Math.round(s.actual_sale || 0))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );})}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500">{modelBrand ? `รวมยี่ห้อ ${modelBrand}` : "รวมทั้งหมด"}</span>
                <span className="text-sm font-bold text-slate-700">{modelSales.length} คัน</span>
              </div>
            </div>
          </div>
        </div>

        {/* Row FIFO: สุขภาพสต็อก / อายุค้าง (FIFO) */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <SectionHeader icon={<Clock className="w-4 h-4 text-amber-500" />} title="สุขภาพสต็อก (FIFO)" sub="อายุค้างสต็อกของรถพร้อมขาย — ยิ่งค้างนาน ต้นทุนยิ่งจม" iconBg="bg-amber-50" />
          <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <button onClick={() => setAgingModal({ title: "รถพร้อมขายทั้งหมด (เรียงตามอายุค้าง)", rows: agingMetrics.lists.ready })}
              className="text-left bg-slate-50 border border-slate-100 rounded-2xl p-4 hover:bg-slate-100 hover:border-slate-200 transition-all active:scale-[0.98] group">
              <p className="text-xs text-slate-500 font-medium flex items-center justify-between">พร้อมขายทั้งหมด <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" /></p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{agingMetrics.readyCount} <span className="text-sm font-semibold text-slate-400">คัน</span></p>
            </button>
            <button onClick={() => setAgingModal({ title: "อายุสต็อก — เรียงจากค้างนานสุด", rows: agingMetrics.lists.ready })}
              className="text-left bg-indigo-50 border border-indigo-100 rounded-2xl p-4 hover:bg-indigo-100 hover:border-indigo-200 transition-all active:scale-[0.98] group">
              <p className="text-xs text-indigo-500 font-medium flex items-center justify-between">อายุสต็อกเฉลี่ย <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" /></p>
              <p className="text-2xl font-bold text-indigo-700 mt-1">{agingMetrics.avg} <span className="text-sm font-semibold text-indigo-400">วัน</span></p>
            </button>
            <button onClick={() => setAgingModal({ title: "รถค้าง > 90 วัน", rows: agingMetrics.lists.over90 })}
              className="text-left bg-amber-50 border border-amber-100 rounded-2xl p-4 hover:bg-amber-100 hover:border-amber-200 transition-all active:scale-[0.98] group">
              <p className="text-xs text-amber-600 font-medium flex items-center justify-between">ค้าง &gt; 90 วัน <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" /></p>
              <p className="text-2xl font-bold text-amber-700 mt-1">{agingMetrics.over90} <span className="text-sm font-semibold text-amber-500">คัน · {agingMetrics.pctOver90}%</span></p>
              <p className="text-[11px] text-red-500 mt-0.5">ในนั้นค้าง &gt; 180 วัน: {agingMetrics.over180} คัน</p>
            </button>
            <button onClick={() => setAgingModal({ title: "ต้นทุนจม — รถค้าง > 90 วัน", rows: agingMetrics.lists.over90, showCost: true })}
              className="text-left bg-rose-50 border border-rose-100 rounded-2xl p-4 hover:bg-rose-100 hover:border-rose-200 transition-all active:scale-[0.98] group">
              <p className="text-xs text-rose-500 font-medium flex items-center justify-between">ต้นทุนจม (ค้าง &gt; 90 วัน) <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" /></p>
              <p className="text-2xl font-bold text-rose-700 mt-1">฿{fmtM(agingMetrics.stuckCost)}</p>
            </button>
          </div>
        </div>

        {/* Row 4: Inventory Health + Payment */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <SectionHeader icon={<Package className="w-4 h-4 text-emerald-600" />} title="สถานะสินค้าคงคลัง (Live)" sub="Inventory Health — real-time" iconBg="bg-emerald-50" />
            <div className="flex items-center gap-6 mt-4">
              <div className="h-44 w-44 flex-shrink-0"><StockStatusChart data={liveStockStatus} /></div>
              <div className="flex flex-col gap-3 flex-1">
                {liveStockStatus.map((s) => (
                  <div key={s.name} className="flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                      <p className="text-xs text-slate-500">{s.value} คัน</p>
                    </div>
                    <span className="text-sm font-bold text-slate-700">
                      {liveStockStatus.reduce((a, b) => a + b.value, 0) > 0
                        ? Math.round((s.value / liveStockStatus.reduce((a, b) => a + b.value, 0)) * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <SectionHeader icon={<DollarSign className="w-4 h-4 text-orange-600" />} title="เปรียบเทียบประเภทชำระ" sub="Cash vs Finance" iconBg="bg-orange-50" />
            <div className="h-52 mt-5"><PaymentTypeChart data={realPaymentMonthly} /></div>
          </div>
        </div>

        {/* Row 5: Individual Staff Performance + Drill-down */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <SectionHeader icon={<User className="w-4 h-4 text-violet-600" />} title="ผลงานรายบุคคล" sub="คลิกแท่งกราฟเพื่อดูรายละเอียดรายเดือน" iconBg="bg-violet-50" />
            <select value={selectedStaff} onChange={(e) => { setSelectedStaff(e.target.value); setDrillMonth(null); }}
              className="border border-slate-200 hover:border-violet-300 rounded-xl px-3.5 py-2 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500 sm:w-56">
              {staffNames.map((n) => <option key={n} value={n}>{staffLabel(n, resigned)}</option>)}
            </select>
          </div>

          <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* KPI mini-cards */}
            <div className="flex flex-col gap-3">
              <div className="bg-violet-50 border border-violet-100 rounded-xl p-4">
                <p className="text-xs text-violet-500 font-medium">รายได้รวม</p>
                <p className="text-2xl font-bold text-violet-700 mt-0.5">฿{fmtM(staffRevenue)}</p>
                <p className="text-xs text-slate-500 mt-1">{staffRevenue > 0 ? `฿${fmt(staffRevenue)}` : "ยังไม่มีข้อมูล"}</p>
              </div>
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                <p className="text-xs text-indigo-500 font-medium">จำนวนที่ขายได้</p>
                <p className="text-2xl font-bold text-indigo-700 mt-0.5">{staffUnits} <span className="text-base font-semibold">คัน</span></p>
                <p className="text-xs text-slate-500 mt-1">{staffUnits > 0 ? `เฉลี่ย ฿${fmt(Math.round(staffRevenue / staffUnits))} / คัน` : "ยังไม่มีข้อมูล"}</p>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex-1">
                <p className="text-xs text-slate-500 font-medium mb-2">รุ่นที่ขาย</p>
                {staffModels.length === 0 ? <p className="text-xs text-slate-400">ยังไม่มีข้อมูล</p> : (
                  <div className="flex flex-col gap-1.5">
                    {staffModels.slice(0, 5).map(([model, count]) => (
                      <div key={model} className="flex items-center justify-between">
                        <span className="text-xs text-slate-700 truncate flex-1">{model}</span>
                        <span className="text-xs font-bold text-slate-600 ml-2 bg-white border border-slate-200 px-1.5 py-0.5 rounded-md flex-shrink-0">{count} คัน</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Monthly chart — clickable */}
            <div className="lg:col-span-2">
              <p className="text-xs font-semibold text-slate-600 mb-1">รายได้รายเดือน — {staffLabel(selectedStaff, resigned)}</p>
              <p className="text-xs text-slate-400 mb-3 flex items-center gap-1">
                <Calendar className="w-3 h-3" />คลิกที่แท่งกราฟเดือนใดเพื่อดูรายละเอียด
              </p>
              <div className="h-56">
                <StaffRevenueChart
                  data={staffMonthly}
                  onBarClick={(month) => setDrillMonth(drillMonth === month ? null : month)}
                  activeMonth={drillMonth ?? undefined}
                />
              </div>
            </div>
          </div>

          {/* ── Drill-down panel ── */}
          {drillMonth && drillData && (
            <div className="border-t border-amber-100 bg-amber-50/40 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="font-bold text-slate-800">
                    {staffLabel(selectedStaff, resigned)} — เดือน {drillMonth}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    ขายทั้งหมด {drillData.allSales.length} คัน · รายได้ ฿{fmt(drillData.allSales.reduce((s, a) => s + a.actual_sale, 0))}
                  </p>
                </div>
                <button onClick={() => setDrillMonth(null)}
                  className="text-slate-400 hover:text-slate-700 hover:bg-white rounded-xl p-2 transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {drillData.allSales.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <Calendar className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">ไม่มีข้อมูลการขายในเดือนนี้</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <p className="text-xs font-semibold text-slate-600 mb-3">ยอดขายรายสัปดาห์</p>
                    <div className="h-44 bg-white rounded-xl border border-amber-100 p-3">
                      <WeeklyBreakdownChart data={drillData.weeks.map((w) => ({ week: w.week.split("\n")[0], revenue: w.revenue, units: w.units }))} />
                    </div>
                    <div className="mt-4 flex flex-col gap-2">
                      {drillData.weeks.map((week, wi) => week.sales.length > 0 && (
                        <div key={wi} className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                          <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-700">{week.week.split("\n")[0]}</span>
                            <span className="text-xs text-slate-500">฿{fmt(week.revenue)} · {week.units} คัน</span>
                          </div>
                          {week.sales.map((s) => (
                            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-50 last:border-0">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-slate-800">{s.forklift_unit_no} — {s.forklift_brand} {s.forklift_model}</p>
                                <p className="text-xs text-slate-500 truncate">{s.customer_name} · {s.province}</p>
                              </div>
                              <p className="text-xs font-bold text-indigo-700 flex-shrink-0">฿{fmt(s.actual_sale)}</p>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-3">รุ่นที่ขายในเดือนนี้ (มากไปน้อย)</p>
                    <div className="bg-white rounded-xl border border-slate-100 p-4 flex flex-col gap-3">
                      {drillModels.length === 0 ? (
                        <p className="text-xs text-slate-400">ไม่มีข้อมูล</p>
                      ) : (
                        drillModels.map(([model, count], i) => (
                          <div key={model} className="flex items-center gap-3">
                            <span className={`text-xs font-bold w-5 text-center flex-shrink-0 ${i === 0 ? "text-amber-500" : "text-slate-400"}`}>#{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-800 truncate">{model}</p>
                              <div className="h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                                <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500"
                                  style={{ width: `${(count / drillModels[0][1]) * 100}%` }} />
                              </div>
                            </div>
                            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-lg flex-shrink-0">{count} คัน</span>
                          </div>
                        ))
                      )}
                      <div className="mt-2 pt-3 border-t border-slate-100">
                        <p className="text-xs font-semibold text-slate-600 mb-1">สรุปเดือน {drillMonth}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-amber-50 border border-amber-100 rounded-lg p-2.5">
                            <p className="text-xs text-amber-600">รวมขาย</p>
                            <p className="text-base font-bold text-amber-700">{drillData.allSales.length} คัน</p>
                          </div>
                          <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-2.5">
                            <p className="text-xs text-indigo-600">รายได้รวม</p>
                            <p className="text-base font-bold text-indigo-700">{fmtM(drillData.allSales.reduce((s, a) => s + a.actual_sale, 0))}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sales detail table */}
          {staffSales.length > 0 && !drillMonth && (
            <div className="border-t border-slate-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500">รถ</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500">ลูกค้า</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500">จังหวัด</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500">ชำระ</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-right">ราคาขาย</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500">วันที่</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {staffSales.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800 text-xs">{s.forklift_unit_no}</p>
                        <p className="text-slate-500 text-xs">{s.forklift_brand} {s.forklift_model}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700 max-w-[140px] truncate">{s.customer_name}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{s.province}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${paymentBadgeClass(s.payment_type)}`}>
                          {s.payment_type || "ไม่ระบุ"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-indigo-700 text-sm">฿{fmt(s.actual_sale)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{s.created_at}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-indigo-50 border-t border-indigo-100">
                    <td colSpan={4} className="px-4 py-2.5 text-xs font-bold text-indigo-700">รวมทั้งหมด</td>
                    <td className="px-4 py-2.5 text-right font-bold text-indigo-800">฿{fmt(staffRevenue)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* ── Regional Customer Modal ── */}
      {regionModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setRegionModal(null)}>
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[84vh] flex flex-col shadow-2xl overflow-hidden">
            <div className={`px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0 ${REGION_COLORS[regionModal]?.bg}`}>
              <div>
                <h3 className={`text-base font-bold ${REGION_COLORS[regionModal]?.text}`}>ลูกค้าภาค{regionModal}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{modalSales.length} ราย</p>
              </div>
              <button onClick={() => setRegionModal(null)} className="text-slate-400 hover:text-slate-700 hover:bg-white/60 rounded-xl p-2 transition-all"><X className="w-5 h-5" /></button>
            </div>
            {modalSales.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <Users className="w-10 h-10 mb-2 text-slate-300" />
                <p className="text-sm">ยังไม่มีลูกค้าในภาคนี้</p>
              </div>
            ) : (
              <div className="overflow-y-auto flex-1 min-h-0 p-4 flex flex-col gap-2">
                {modalSales.map((s) => (
                  <div key={s.id} className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="font-bold text-slate-800 text-sm">{s.customer_name}</p>
                          {s.contact_source && (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CONTACT_SOURCE_COLORS[s.contact_source] ?? "bg-slate-100 text-slate-600"}`}>{s.contact_source}</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 flex items-center gap-1"><span>📞</span>{s.customer_tel}</p>
                        <p className="text-xs text-slate-500 mt-0.5">📍 {s.province}</p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {s.customer_type && <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">{s.customer_type}</span>}
                          {s.sale_type && <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">{s.sale_type}</span>}
                          <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">{s.forklift_brand} {s.forklift_model}</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-indigo-700 text-sm">฿{fmt(s.actual_sale)}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{s.created_at}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal รายการรถของการ์ด FIFO (คลิกการ์ด → ดูรถจริงในกลุ่มนั้น) ── */}
      {agingModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setAgingModal(null)}>
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0 bg-amber-50">
              <div>
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><Clock className="w-4 h-4 text-amber-500" />{agingModal.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{agingModal.rows.length} คัน{agingModal.showCost && ` · ต้นทุนรวม ฿${fmt(agingModal.rows.reduce((s, r) => s + r.cost, 0))}`}</p>
              </div>
              <button onClick={() => setAgingModal(null)} className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-all"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0 p-4 flex flex-col gap-2">
              {agingModal.rows.length === 0 && <div className="text-center py-14 text-slate-400 text-sm">ไม่มีรถในกลุ่มนี้</div>}
              {agingModal.rows.map(({ f, cost, days }) => {
                const badge = days == null ? "bg-slate-100 text-slate-500" : days > 180 ? "bg-red-100 text-red-700" : days > 90 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700";
                return (
                  <div key={f.id} className="flex items-center gap-3 border border-slate-100 rounded-xl p-3 bg-slate-50/60">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md flex-shrink-0">#{displayCode(f)}</span>
                        <span className="font-semibold text-slate-800 text-sm">{f.SN ? `${f.SN} — ` : ""}{f.brand} {f.model}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {[f.pi_no ? `PI ${f.pi_no}` : "", f.received_date ? `รับ ${String(f.received_date).slice(0, 10)}` : "", f.location].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${badge}`}>{days == null ? "ไม่มีวันรับ" : `ค้าง ${days} วัน`}</span>
                      {agingModal.showCost && <span className="text-xs font-bold text-rose-600">฿{fmt(cost)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <footer className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between border-t border-slate-200 mt-2">
        <p className="text-slate-400 text-xs">SalesOS Dashboard — ข้อมูลจริงจากระบบ</p>
        <Link href="/" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 font-medium transition-colors">
          กลับหน้าหลัก <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </footer>
    </div>
  );
}

function KPICard({ icon, label, value, sub, color, iconBg, accent }: {
  icon: React.ReactNode; label: string; value: string; sub: string;
  color: string; iconBg: string; accent: string;
}) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-slate-100 border-l-4 ${accent} p-5 hover:shadow-md transition-shadow`}>
      <div className={`${iconBg} rounded-xl p-2 w-fit mb-3 text-white`}>{icon}</div>
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className={`text-xl font-bold ${color} leading-tight mt-0.5`}>{value}</p>
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
    </div>
  );
}

function SectionHeader({ icon, title, sub, iconBg }: { icon: React.ReactNode; title: string; sub: string; iconBg: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={`${iconBg} rounded-xl p-2`}>{icon}</div>
      <div>
        <h3 className="font-bold text-slate-800 text-sm">{title}</h3>
        <p className="text-xs text-slate-500">{sub}</p>
      </div>
    </div>
  );
}
