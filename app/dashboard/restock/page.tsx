"use client";

import Link from "next/link";
import { useState, useMemo, useCallback } from "react";
import {
  ArrowLeft, Boxes, Download, ChevronDown, ChevronRight,
  Calendar, ShoppingCart, TrendingUp, AlertTriangle, Package,
} from "lucide-react";
import { useApp } from "@/lib/AppContext";
import { isClosedSale, closeMonth } from "@/lib/commission";
import { DashboardGuard } from "@/components/DashboardGuard";
import { Forklift } from "@/lib/types";
import { normBrand } from "@/lib/brands";

const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString("th-TH"); // จำนวนเต็ม ไม่มีทศนิยม
// อัตรา/จำนวนเดือน: ปัดเป็นจำนวนเต็ม แต่ถ้ามากกว่า 0 แต่ไม่ถึง 0.5 โชว์ "<1" (กันแสดงเป็น 0 ทั้งที่ยังขายได้)
const wrate = (n: number) => (n > 0 && n < 0.5 ? "<1" : String(Math.round(Number(n) || 0)));
const MONTHS_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const monthLabel = (ym: string) => { const [y, m] = ym.split("-"); return `${MONTHS_TH[Number(m) - 1] ?? m} ${Number(y) + 543}`; };

// ช่วงเวลาให้เลือก (จำนวนเดือนล่าสุด · null = ทั้งหมด)
const WINDOWS: { label: string; months: number | null }[] = [
  { label: "3 เดือน", months: 3 },
  { label: "6 เดือน", months: 6 },
  { label: "12 เดือน", months: 12 },
  { label: "ทั้งหมด", months: null },
];
const TARGETS = [2, 3, 4]; // เป้าหมายสต็อกพอขาย (เดือน)
const SORTS: { key: "units" | "totalProfit" | "avgProfit"; label: string }[] = [
  { key: "units", label: "ขายดี (คัน)" },
  { key: "totalProfit", label: "กำไรรวม" },
  { key: "avgProfit", label: "กำไร/คัน" },
];

interface ModelRow {
  brand: string; model: string;
  mast: string;           // ความสูงเสา — รุ่นเดียวกันคนละเสา = คนละสินค้า คนละราคา ต้องสั่งแยก
  capacity: string;       // พิกัดยก (เช่น "2.5 ตัน") — โชว์ให้เห็นน้ำหนักชัดๆ
  units: number; revenue: number;
  avgMonth: number;       // เฉลี่ยขายต่อเดือน
  available: number;      // คงเหลือพร้อมขาย
  incoming: number;       // กำลังผลิต/รอรับ
  avgCost: number;        // ทุนเฉลี่ย/คัน
  coverage: number;       // พอขายอีกกี่เดือน (available / avgMonth)
  needQty: number;        // แนะนำสั่งเพิ่ม (คัน)
  needCost: number;       // งบสั่งเพิ่มโดยประมาณ
  avgProfit: number;      // กำไรเฉลี่ย/คัน (คิดจากทุนจริงเท่านั้น)
  totalProfit: number;    // กำไรรวมในช่วง (คิดจากทุนจริงเท่านั้น)
  hasCost: boolean;       // ทุนครบทุกคันไหม — ไม่ครบ = ไม่โชว์กำไร (ไม่เดาแทน)
  noCostUnits: number;    // จำนวนคันที่ขายแล้วแต่ยังไม่มีราคาทุน
  isUsed: boolean;        // รถมือสอง — หาทีละคันตามงานขาย ไม่ต้องสั่งเข้าสต็อก
}

/** รุ่นที่ยังกรอกราคาทุนไม่ครบ — เอาไว้ไล่กรอกให้จบ กำไรถึงจะคำนวณได้ */
interface NoCostRow {
  brand: string; model: string; mast: string;
  sold: number;        // ขายแล้ว แต่รถคันนั้นในทะเบียนยังไม่มีทุน
  stock: number;       // รถในทะเบียนที่ยังไม่มีทุน (ทุกสถานะ)
  unlinked: number;    // ดีลที่หารถในทะเบียนไม่เจอเลย (ส่วนใหญ่คือบิลภาษีนำเข้า)
}

function RestockPageInner() {
  const { sales, forklifts } = useApp();
  const fkById = useMemo(() => new Map(forklifts.map(f => [f.id, f])), [forklifts]);

  const [winIdx, setWinIdx] = useState(1);       // ค่าเริ่มต้น 6 เดือน
  const [target, setTarget] = useState(3);       // เป้าหมาย 3 เดือน
  const [sortBy, setSortBy] = useState<"units" | "totalProfit" | "avgProfit">("units");
  const [expandedBrand, setExpandedBrand] = useState<string | null>(null);
  const [showAllNoCost, setShowAllNoCost] = useState(false);   // รายการรุ่นที่ไม่มีทุน — ย่อ/ขยาย

  // ดีลปิดจริงทั้งหมด (รวมบิล GR เพราะสะท้อน "ดีมานด์จริง" ที่ต้องเตรียมสต็อก)
  const closed = useMemo(() => sales.filter(isClosedSale), [sales]);
  const allMonths = useMemo(() => [...new Set(closed.map(closeMonth).filter(Boolean))].sort(), [closed]);

  // เดือนในช่วงที่เลือก (เอาเดือนล่าสุดย้อนหลัง N เดือน)
  const win = WINDOWS[winIdx].months;
  const windowMonths = useMemo(() => (win === null ? allMonths : allMonths.slice(-win)), [allMonths, win]);
  const winSet = useMemo(() => new Set(windowMonths), [windowMonths]);
  const denom = Math.max(1, windowMonths.length); // จำนวนเดือนที่ใช้หารเฉลี่ย

  // ── แยกสินค้าตาม "รุ่น + ความสูงเสา" ──
  // ⭐ (22 ก.ย. 2569) รุ่นเดียวกันคนละเสาคือคนละสินค้า ทุนคนละราคา (CPCD25-Q22K2 เสา M400
  //    221,000 · เสา M300 216,000) เดิมรวมเป็นแถวเดียว ตัวเลข "ควรสั่งเพิ่ม" จึงไม่บอกว่าสั่งเสาไหน
  const mastOf = (f: Forklift) => String((f.custom_fields as Record<string, unknown> | undefined)?.["MAST"] ?? "").trim();

  // สเปกประจำรุ่น — "รุ่นนี้เสาเป็นตัวแยกไหม" (มีคันที่กรอก MAST) + พิกัดยกประจำรุ่น
  const modelSpec = useMemo(() => {
    const m = new Map<string, { hasMast: boolean; caps: Set<string> }>();
    forklifts.forEach(f => {
      const model = String(f.model ?? "").trim().toUpperCase();
      if (!model) return;
      const g = m.get(model) ?? { hasMast: false, caps: new Set<string>() };
      if (mastOf(f)) g.hasMast = true;
      const cap = String(f.capacity ?? "").trim();
      if (cap) g.caps.add(cap);
      m.set(model, g);
    });
    return m;
  }, [forklifts]);

  /** เสาที่ใช้เป็นตัวแยกของคันนี้ — รุ่นที่ไม่มีเสา (รถลากพาเลท ฯลฯ) คืนค่าว่าง */
  const mastKeyOf = useCallback((model: string, mast: string) =>
    modelSpec.get(model.trim().toUpperCase())?.hasMast ? (mast || "ไม่ระบุ") : "", [modelSpec]);
  /** พิกัดยกประจำรุ่น — ใช้เมื่อทุกคันของรุ่นนั้นตรงกัน ไม่งั้นไม่เดา */
  const capOf = useCallback((model: string) => {
    const caps = modelSpec.get(model.trim().toUpperCase())?.caps;
    return caps && caps.size === 1 ? [...caps][0] : "";
  }, [modelSpec]);

  // สต็อกปัจจุบันต่อรุ่น+เสา: พร้อมขาย / กำลังผลิต-รอรับ / ทุนเฉลี่ย
  const stockByModel = useMemo(() => {
    const m = new Map<string, { available: number; incoming: number; costSum: number; costN: number }>();
    forklifts.forEach(f => {
      const model = String(f.model ?? "");
      const key = `${normBrand(f.brand)}|${model}|${mastKeyOf(model, mastOf(f))}`;
      const g = m.get(key) ?? { available: 0, incoming: 0, costSum: 0, costN: 0 };
      const st = String(f.status ?? "").trim();
      if (st === "พร้อมขาย") g.available += 1;
      else if (st === "สั่งผลิต" || st === "รอรับ" || st === "รอยืนยันนำเข้าสต็อก") g.incoming += 1;
      const c = Number(f.cost_price) || 0;
      if (c > 0) { g.costSum += c; g.costN += 1; }
      m.set(key, g);
    });
    return m;
  }, [forklifts, mastKeyOf]);

  // ยี่ห้อของแต่ละรุ่นจากทะเบียนรถ — ใช้เติมให้ใบขายที่ไม่ได้กรอกยี่ห้อไว้
  // เก็บเฉพาะรุ่นที่มียี่ห้อเดียวชัดเจน (รุ่นที่ซ้ำข้ามยี่ห้อ เช่น PS400-1500 มีทั้ง STAXX และ CNC → ไม่เดา)
  const brandByModel = useMemo(() => {
    const seen = new Map<string, Set<string>>();
    forklifts.forEach(f => {
      const model = String(f.model ?? "").trim().toUpperCase();
      const brand = normBrand(f.brand);
      if (!model || !brand) return;
      if (!seen.has(model)) seen.set(model, new Set());
      seen.get(model)!.add(brand);
    });
    const m = new Map<string, string>();
    seen.forEach((brands, model) => { if (brands.size === 1) m.set(model, [...brands][0]); });
    return m;
  }, [forklifts]);

  // จัดกลุ่มยอดขายในช่วง → รุ่น → คำนวณตัวชี้วัดสั่งสต็อก
  const rows = useMemo(() => {
    const m = new Map<string, { brand: string; model: string; mast: string; units: number; revenue: number; sales: typeof closed }>();
    closed.filter(s => winSet.has(closeMonth(s))).forEach(s => {
      const model = s.forklift_model || "";
      if (!model) return;
      // ⭐ ยี่ห้อ: ใบขายก่อน → ทะเบียนรถของคันนั้น → รุ่นนั้นเป็นของยี่ห้อไหน
      //    (22 ก.ย. 2569) ใบขายเก่า/บิล GR หลายใบไม่ได้กรอกยี่ห้อ เดิมจึงตกไปอยู่กลุ่ม "ไม่ระบุ"
      //    ซึ่งไม่ใช่แค่ชื่อกลุ่มผิด — คีย์จับคู่สต็อกคือ "ยี่ห้อ|รุ่น" พอยี่ห้อว่างเลยหาสต็อกไม่เจอ
      //    คงเหลือขึ้น 0 · ทุนขึ้น "—" · ติดป้าย "ควรสั่งด่วน" ทั้งที่ของมีในคลัง
      const brand = normBrand(s.forklift_brand)
        || normBrand(fkById.get(s.forklift_id)?.brand)
        || brandByModel.get(model.trim().toUpperCase())
        || "ไม่ระบุ";
      // ⭐ แยกตามความสูงเสาด้วย — รุ่นเดียวกันคนละเสา สั่งของคนละอย่าง ทุนคนละราคา
      const mast = mastKeyOf(model, mastOf(fkById.get(s.forklift_id) ?? ({} as Forklift)));
      const key = `${brand}|${model}|${mast}`;
      const g = m.get(key) ?? { brand, model, mast, units: 0, revenue: 0, sales: [] as typeof closed };
      g.units += 1;
      g.revenue += Number(s.actual_sale) || 0;
      g.sales.push(s);
      m.set(key, g);
    });
    const out: ModelRow[] = [];
    m.forEach((g, key) => {
      const st = stockByModel.get(key) ?? { available: 0, incoming: 0, costSum: 0, costN: 0 };
      const avgMonth = g.units / denom;
      const avgCost = st.costN > 0 ? Math.round(st.costSum / st.costN) : 0;
      const coverage = avgMonth > 0 ? st.available / avgMonth : Infinity;
      const needQty = Math.max(0, Math.ceil(avgMonth * target) - st.available - st.incoming);
      // กำไร = ราคาขาย − ทุนจริงของคันนั้น − อุปกรณ์เสริม − ของแถม − ค่าขนส่ง
      // ⚠️ (22 ก.ย. 2569) **ไม่เดาทุนแทนแล้ว** — เดิมคันไหนไม่มีทุน (บิลภาษีนำเข้า ทุน=0)
      //    จะเอา "ทุนเฉลี่ยของรุ่น" มาใส่ให้ ทำให้กำไรที่เห็นเป็นตัวเลขปลอมปนกับของจริง
      //    ตอนนี้: ทุนไม่ครบทุกคัน = ไม่โชว์กำไรเลย แล้วไปขึ้นในรายการ "รุ่นที่ยังไม่มีต้นทุน" ให้ไปกรอก
      let profitSum = 0, noCostUnits = 0;
      g.sales.forEach(s => {
        const cost = Number(fkById.get(s.forklift_id)?.cost_price) || 0;
        if (cost <= 0) { noCostUnits += 1; return; }
        const addOns = (s.add_ons ?? []).reduce((t, a) => t + (Number(a.price) || 0), 0);
        const free = s.freebie ? 2800 : 0;
        const ship = Number(s.shipping_cost) || 0;
        profitSum += (Number(s.actual_sale) || 0) - cost - addOns - free - ship;
      });
      const hasCost = noCostUnits === 0;
      // ⭐ กติกา (22 ก.ย. 2569 · ผู้ใช้ยืนยัน): **รถมือสองไม่สั่งเข้าสต็อก** — รับมาทีละคันตามงานขายที่ปิดได้
      //    จึงไม่ต้องคิด "ควรสั่งเพิ่ม/งบสั่ง" และไม่ติดป้ายควรสั่งด่วน (ของไม่มีในคลังเป็นเรื่องปกติ)
      const usedN = g.sales.filter(s2 => /มือสอง/.test(String(s2.sale_type ?? ""))).length;
      const isUsed = /มือสอง/.test(g.model) || (usedN > 0 && usedN === g.units);
      out.push({
        brand: g.brand, model: g.model, mast: g.mast, capacity: capOf(g.model),
        units: g.units, revenue: g.revenue,
        avgMonth, available: st.available, incoming: st.incoming, avgCost,
        coverage: isUsed ? Infinity : coverage,
        needQty: isUsed ? 0 : needQty,
        needCost: isUsed ? 0 : needQty * avgCost,
        isUsed,
        avgProfit: hasCost ? Math.round(profitSum / g.units) : 0,
        totalProfit: hasCost ? Math.round(profitSum) : 0,
        hasCost, noCostUnits,
      });
    });
    const cmp = (a: ModelRow, b: ModelRow) => sortBy === "units" ? b.units - a.units : sortBy === "avgProfit" ? b.avgProfit - a.avgProfit : b.totalProfit - a.totalProfit;
    return out.sort(cmp);
  }, [closed, winSet, stockByModel, denom, target, sortBy, fkById, brandByModel, mastKeyOf, capOf]);

  // จัดกลุ่มตามแบรนด์ (เรียงแบรนด์ตามยอดขายรวม)
  const byBrand = useMemo(() => {
    const m = new Map<string, { brand: string; models: ModelRow[]; units: number; revenue: number; profit: number; needCost: number; urgent: number }>();
    rows.forEach(r => {
      const g = m.get(r.brand) ?? { brand: r.brand, models: [], units: 0, revenue: 0, profit: 0, needCost: 0, urgent: 0 };
      g.models.push(r);
      g.units += r.units; g.revenue += r.revenue; g.profit += r.totalProfit; g.needCost += r.needCost;
      if (!r.isUsed && r.coverage < 1) g.urgent += 1;
      m.set(r.brand, g);
    });
    return [...m.values()].sort((a, b) => b.revenue - a.revenue);
  }, [rows]);

  // ── รุ่นที่ยังไม่มีต้นทุน — กรอกให้ครบแล้วกำไรถึงจะคำนวณได้ ──
  // ดู "ดีลที่ปิดแล้วทุกช่วงเวลา" (ไม่อิงช่วงที่เลือก เพราะเป็นงานกรอกข้อมูล ไม่ใช่การวิเคราะห์)
  // + "รถในทะเบียนที่ราคาทุนยังเป็น 0"
  const noCostRows = useMemo(() => {
    const m = new Map<string, NoCostRow>();
    const take = (brand: string, model: string, mast: string) => {
      const key = `${brand}|${model}|${mast}`;
      const g = m.get(key) ?? { brand, model, mast, sold: 0, stock: 0, unlinked: 0 };
      m.set(key, g);
      return g;
    };
    const brandOf = (model: string, fallback?: string) =>
      normBrand(fallback) || brandByModel.get(model.trim().toUpperCase()) || "ไม่ระบุ";

    forklifts.forEach(f => {
      if ((Number(f.cost_price) || 0) > 0) return;
      const model = String(f.model ?? "").trim();
      if (!model) return;
      take(brandOf(model, f.brand), model, mastKeyOf(model, mastOf(f))).stock += 1;
    });
    closed.forEach(s => {
      const model = String(s.forklift_model ?? "").trim();
      if (!model) return;
      const f = fkById.get(s.forklift_id);
      // ดีลที่หารถในทะเบียนไม่เจอ = ไม่มีที่ให้กรอกทุน (ต้องผูกรถหรือเพิ่มคันนั้นเข้าทะเบียนก่อน)
      if (!f) { take(brandOf(model, s.forklift_brand), model, mastKeyOf(model, "")).unlinked += 1; return; }
      if ((Number(f.cost_price) || 0) > 0) return;
      take(brandOf(model, f.brand || s.forklift_brand), model, mastKeyOf(model, mastOf(f))).sold += 1;
    });
    const total = (r: NoCostRow) => r.sold + r.stock + r.unlinked;
    return [...m.values()].sort((a, b) => total(b) - total(a));
  }, [forklifts, closed, fkById, brandByModel, mastKeyOf]);

  const noCostUnits = noCostRows.reduce((n, r) => n + r.sold + r.stock + r.unlinked, 0);

  const totalUnits = rows.reduce((s, r) => s + r.units, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalProfit = rows.reduce((s, r) => s + r.totalProfit, 0);
  const totalNeedCost = rows.reduce((s, r) => s + r.needCost, 0);
  const urgentRows = rows.filter(r => !r.isUsed && r.coverage < 1).sort((a, b) => b.avgMonth - a.avgMonth);

  /** ป้ายชื่อสินค้า = รุ่น · พิกัดยก · เสา (รุ่นเดียวกันคนละเสาคือคนละสินค้า) */
  const variantLabel = (r: { model: string; mast: string; capacity?: string }) =>
    [r.model, r.capacity ?? capOf(r.model), r.mast ? `เสา ${r.mast}` : ""].filter(Boolean).join(" · ");

  // ป้ายสถานะสั่งสต็อก
  const statusOf = (r: ModelRow) =>
    r.isUsed ? { t: "♻️ มือสอง · หาตามงานขาย", c: "bg-slate-100 text-slate-600 border-slate-200" }
    : r.coverage < 1 ? { t: "🔴 ควรสั่งด่วน", c: "bg-red-100 text-red-700 border-red-200" }
      : r.coverage < target ? { t: "🟡 ควรเติม", c: "bg-amber-100 text-amber-700 border-amber-200" }
      : { t: "🟢 เพียงพอ", c: "bg-emerald-100 text-emerald-700 border-emerald-200" };

  const exportExcel = async () => {
    if (rows.length === 0) return;
    const XLSX = await import("xlsx");
    const detRows = rows.map(r => ({
      "ยี่ห้อ": r.brand, "รุ่น": r.model, "พิกัดยก": r.capacity, "เสา": r.mast,
      "ขายในช่วง (คัน)": r.units, "ยอดขายรวม (บาท)": Math.round(r.revenue),
      "กำไรเฉลี่ย/คัน (บาท)": r.hasCost ? r.avgProfit : "", "กำไรรวม (บาท)": r.hasCost ? r.totalProfit : "",
      "เฉลี่ย/เดือน (คัน)": Math.round(r.avgMonth),
      "คงเหลือพร้อมขาย": r.available, "กำลังผลิต/รอรับ": r.incoming,
      "พอขายอีก (เดือน)": r.coverage === Infinity ? "" : Math.round(r.coverage),
      "ทุนเฉลี่ย/คัน (บาท)": r.avgCost,
      "แนะนำสั่งเพิ่ม (คัน)": r.isUsed ? "" : r.needQty, "งบสั่งเพิ่มโดยประมาณ (บาท)": r.isUsed ? "" : r.needCost,
      "หมายเหตุ": r.isUsed ? "รถมือสอง — หาทีละคันตามงานขาย ไม่สั่งเข้าสต็อก" : "",
    }));
    const ws = XLSX.utils.json_to_sheet(detRows);
    ws["!cols"] = [12, 20, 10, 10, 14, 18, 16, 16, 14, 14, 14, 14, 16, 16, 20, 40].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "วางแผนสั่งสต็อก");
    // ชีตที่ 2 — รายการที่ต้องไปกรอกราคาทุน (ไม่งั้นกำไรคำนวณไม่ได้)
    if (noCostRows.length > 0) {
      const ws2 = XLSX.utils.json_to_sheet(noCostRows.map(r => ({
        "ยี่ห้อ": r.brand, "รุ่น": r.model, "เสา": r.mast,
        "ขายแล้ว—รถไม่มีทุน (คัน)": r.sold,
        "ในทะเบียนไม่มีทุน (คัน)": r.stock,
        "ดีลที่ไม่มีรถผูก (คัน)": r.unlinked,
        "รวม (คัน)": r.sold + r.stock + r.unlinked,
        "แก้ที่ไหน": r.stock > 0 || r.sold > 0 ? "หน้าสต็อก → แก้หลายคัน → ช่องราคาทุน" : "ผูกรถกับดีล หรือเพิ่มคันนั้นเข้าทะเบียนก่อน",
      })));
      ws2["!cols"] = [12, 20, 10, 22, 20, 20, 12, 40].map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws2, "รุ่นที่ยังไม่มีต้นทุน");
    }
    XLSX.writeFile(wb, `วางแผนสั่งสต็อก_${WINDOWS[winIdx].label}.xlsx`);
  };

  const rangeLabel = windowMonths.length > 0
    ? `${monthLabel(windowMonths[0])} – ${monthLabel(windowMonths[windowMonths.length - 1])}`
    : "—";

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-all"><ArrowLeft className="w-5 h-5" /></Link>
            <div className="flex items-center gap-2.5">
              <div className="bg-gradient-to-br from-sky-500 to-blue-600 rounded-xl p-2"><Boxes className="w-5 h-5 text-white" /></div>
              <div>
                <h1 className="text-base font-bold text-slate-800 leading-tight">วางแผนสั่งสต็อก</h1>
                <p className="text-slate-500 text-xs">รถขายดีแต่ละแบรนด์ + คงเหลือ → วางแผนงบสั่งซื้อล่วงหน้า</p>
              </div>
            </div>
          </div>
          <button onClick={exportExcel} disabled={rows.length === 0}
            className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-3 py-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            <Download className="w-4 h-4" /><span className="hidden sm:inline">Export Excel</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 flex flex-col gap-5">
        {/* ── ตัวเลือกช่วงเวลา + เป้าหมายสต็อก ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />ช่วงยอดขาย</span>
            {WINDOWS.map((w, i) => (
              <button key={w.label} onClick={() => setWinIdx(i)}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-all ${winIdx === i ? "bg-sky-600 text-white border-sky-600" : "bg-white text-slate-600 border-slate-200 hover:border-sky-300"}`}>
                {w.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">อยากมีสต็อกพอขาย</span>
            {TARGETS.map(t => (
              <button key={t} onClick={() => setTarget(t)}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-all ${target === t ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"}`}>
                {t} เดือน
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">เรียงตาม</span>
            {SORTS.map(so => (
              <button key={so.key} onClick={() => setSortBy(so.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-all ${sortBy === so.key ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300"}`}>
                {so.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-400 ml-auto">ข้อมูล {rangeLabel}</span>
        </div>

        {/* ── สรุปยอดรวม ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-xs text-slate-500 flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5 text-sky-500" />ขายในช่วง</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{fmt(totalUnits)} <span className="text-sm font-medium text-slate-400">คัน</span></p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-xs text-slate-500">ยอดขายรวม</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">฿{fmt(totalRevenue)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-xs text-slate-500">กำไรรวม <span className="text-slate-400">(เฉพาะรุ่นที่มีทุนครบ)</span></p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">฿{fmt(totalProfit)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-xs text-slate-500 flex items-center gap-1"><ShoppingCart className="w-3.5 h-3.5 text-indigo-500" />งบสั่งเพิ่ม (ประมาณ)</p>
            <p className="text-2xl font-bold text-indigo-600 mt-1">฿{fmt(totalNeedCost)}</p>
          </div>
          <div className={`rounded-2xl border shadow-sm p-4 ${urgentRows.length > 0 ? "bg-red-50 border-red-200" : "bg-white border-slate-100"}`}>
            <p className="text-xs text-slate-500 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-red-500" />รุ่นควรสั่งด่วน</p>
            <p className={`text-2xl font-bold mt-1 ${urgentRows.length > 0 ? "text-red-600" : "text-slate-800"}`}>{urgentRows.length}</p>
          </div>
        </div>

        {/* ── รุ่นที่ควรสั่งด่วน (คงเหลือ < 1 เดือน) ── */}
        {urgentRows.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
            <p className="text-sm font-bold text-red-700 flex items-center gap-1.5 mb-2"><AlertTriangle className="w-4 h-4" />ควรสั่งเพิ่มด่วน — ของใกล้หมด (พอขายไม่ถึง 1 เดือน)</p>
            <div className="flex flex-col gap-1.5">
              {urgentRows.slice(0, 8).map(r => (
                <div key={`${r.brand}|${r.model}|${r.mast}`} className="flex items-center gap-2 text-sm flex-wrap">
                  <span className="font-semibold text-slate-800">{r.brand} {variantLabel(r)}</span>
                  <span className="text-xs text-slate-500">ขายเฉลี่ย {wrate(r.avgMonth)} คัน/เดือน · เหลือ {fmt(r.available)} คัน{r.incoming > 0 ? ` (+${fmt(r.incoming)} กำลังมา)` : ""}</span>
                  <span className="ml-auto text-xs font-bold text-red-700 bg-white border border-red-200 rounded-lg px-2 py-0.5">สั่งเพิ่ม {fmt(r.needQty)} คัน ≈ ฿{fmt(r.needCost)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── รุ่นที่ยังไม่มีราคาทุน — กรอกให้ครบ กำไรถึงจะคำนวณได้ (ระบบไม่เดาทุนแทน) ── */}
        {noCostRows.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <p className="text-sm font-bold text-amber-800 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />รุ่นที่ยังไม่มีราคาทุน — {noCostRows.length} รุ่น · {fmt(noCostUnits)} คัน
              </p>
              <span className="text-xs text-amber-700">กรอกทุนครบเมื่อไหร่ กำไรของรุ่นนั้นจะคำนวณให้ทันที · นับจากดีลที่ปิดแล้วทุกช่วงเวลา ไม่ใช่เฉพาะช่วงที่เลือก</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="text-xs text-amber-800/70 border-b border-amber-200">
                    <th className="text-left py-1.5 px-2 font-semibold">ยี่ห้อ / รุ่น</th>
                    <th className="text-right py-1.5 px-2 font-semibold">ขายแล้ว · รถไม่มีทุน</th>
                    <th className="text-right py-1.5 px-2 font-semibold">ในทะเบียนไม่มีทุน</th>
                    <th className="text-right py-1.5 px-2 font-semibold">ดีลไม่มีรถผูก</th>
                    <th className="text-left py-1.5 px-2 font-semibold">กรอกที่ไหน</th>
                  </tr>
                </thead>
                <tbody>
                  {(showAllNoCost ? noCostRows : noCostRows.slice(0, 15)).map(r => (
                    <tr key={`${r.brand}|${r.model}|${r.mast}`} className="border-b border-amber-100">
                      <td className="py-1.5 px-2 font-semibold text-slate-800">{r.brand} {variantLabel(r)}</td>
                      <td className="py-1.5 px-2 text-right text-slate-700">{r.sold || "—"}</td>
                      <td className="py-1.5 px-2 text-right text-slate-700">{r.stock || "—"}</td>
                      <td className="py-1.5 px-2 text-right text-slate-700">{r.unlinked || "—"}</td>
                      <td className="py-1.5 px-2 text-xs text-slate-600">
                        {r.stock + r.sold > 0
                          ? <Link href="/stock/main" className="text-sky-700 font-semibold hover:underline">หน้าสต็อก → แก้หลายคัน → ราคาทุน</Link>
                          : "ดีลนี้ยังไม่ได้ผูกกับรถในทะเบียน — ผูกรถก่อนจึงกรอกทุนได้"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {noCostRows.length > 15 && (
              <button onClick={() => setShowAllNoCost(v => !v)} className="mt-2 text-xs font-bold text-amber-800 hover:underline">
                {showAllNoCost ? "ย่อรายการ" : `ดูทั้งหมด ${noCostRows.length} รุ่น`}
              </button>
            )}
          </div>
        )}

        {/* ── รายแบรนด์ ── */}
        <div className="flex flex-col gap-3">
          {byBrand.map(b => (
            <div key={b.brand} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <button onClick={() => setExpandedBrand(expandedBrand === b.brand ? null : b.brand)}
                className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors text-left">
                <div className="rounded-xl p-2 flex-shrink-0 bg-sky-100 text-sky-600"><Package className="w-5 h-5" /></div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 text-sm">{b.brand}</p>
                  <p className="text-xs text-slate-500">{b.models.length} รุ่น · ขาย {b.units} คัน{b.urgent > 0 && <span className="text-red-600 font-semibold"> · ควรสั่งด่วน {b.urgent}</span>}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-slate-700">฿{fmt(b.revenue)} <span className="text-[11px] font-semibold text-emerald-600">· กำไร ฿{fmt(b.profit)}</span></p>
                  {b.needCost > 0 && <p className="text-[11px] text-indigo-600 font-semibold">งบสั่งเพิ่ม ฿{fmt(b.needCost)}</p>}
                </div>
                {expandedBrand === b.brand ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
              </button>

              {expandedBrand === b.brand && (
                <div className="border-t border-slate-100 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] text-slate-400 border-b border-slate-100 bg-slate-50/50">
                        {["#", "รุ่น", "ขาย", "ยอดขาย", "กำไร/คัน", "กำไรรวม", "เฉลี่ย/เดือน", "คงเหลือ", "กำลังมา", "พอขาย", "สั่งเพิ่ม", "งบสั่ง", "สถานะ"].map((h, i) => (
                          <th key={i} className="px-3 py-2 font-semibold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {b.models.map((r, i) => {
                        const s = statusOf(r);
                        return (
                          <tr key={`${r.brand}|${r.model}|${r.mast}`} className="border-b border-slate-50 hover:bg-sky-50/40">
                            <td className="px-3 py-2.5 text-slate-400 font-bold">{i + 1}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-800 whitespace-nowrap">
                              {r.model}
                              {(r.capacity || r.mast) && (
                                <span className="text-[11px] font-normal text-slate-400"> · {[r.capacity, r.mast ? `เสา ${r.mast}` : ""].filter(Boolean).join(" · ")}</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap"><span className="text-slate-700 font-bold">{fmt(r.units)}</span> <span className="text-[11px] text-slate-400">คัน</span></td>
                            <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">฿{fmt(r.revenue)}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap">{r.hasCost ? <span className={`font-semibold ${r.avgProfit >= 0 ? "text-emerald-700" : "text-red-600"}`}>฿{fmt(r.avgProfit)}</span> : <span className="text-amber-600 text-xs" title="ยังไม่มีราคาทุนบางคัน — ระบบไม่เดาให้">ยังไม่มีทุน {r.noCostUnits} คัน</span>}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap">{r.hasCost ? <span className={`font-semibold ${r.totalProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>฿{fmt(r.totalProfit)}</span> : <span className="text-slate-300">—</span>}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap"><span className="text-slate-600">{wrate(r.avgMonth)}</span> <span className="text-[11px] text-slate-400">คัน/ด.</span></td>
                            <td className="px-3 py-2.5 whitespace-nowrap"><span className={`font-bold ${r.available === 0 ? "text-red-600" : "text-slate-700"}`}>{fmt(r.available)}</span> <span className="text-[11px] text-slate-400">คัน</span></td>
                            <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{r.incoming > 0 ? <>+{fmt(r.incoming)} <span className="text-[11px] text-slate-400">คัน</span></> : "—"}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap">{r.coverage === Infinity ? "—" : <><span className="text-slate-600">{wrate(r.coverage)}</span> <span className="text-[11px] text-slate-400">เดือน</span></>}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap">{r.needQty > 0 ? <><span className="font-bold text-indigo-700">{fmt(r.needQty)}</span> <span className="text-[11px] text-slate-400">คัน</span></> : <span className="text-slate-300">—</span>}</td>
                            <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{r.needCost > 0 ? `฿${fmt(r.needCost)}` : "—"}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${s.c}`}>{s.t}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
          {rows.length === 0 && (
            <div className="text-center py-14 text-slate-400"><Boxes className="w-10 h-10 text-slate-300 mx-auto mb-2" /><p className="text-sm">ยังไม่มีข้อมูลการขายในช่วงที่เลือก</p></div>
          )}
        </div>

        {/* ── วิธีอ่าน ── */}
        <details className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-sm text-slate-600">
          <summary className="font-bold text-slate-700 cursor-pointer">วิธีอ่าน / การคำนวณ</summary>
          <div className="mt-3 flex flex-col gap-2 text-xs leading-relaxed">
            <div><b>เฉลี่ย/เดือน</b> = จำนวนที่ขายในช่วง ÷ จำนวนเดือนในช่วง (สะท้อนความเร็วขาย)</div>
            <div><b>พอขาย (เดือน)</b> = คงเหลือพร้อมขาย ÷ เฉลี่ย/เดือน — น้อย = ของใกล้หมด</div>
            <div><b>แนะนำสั่งเพิ่ม</b> = (เฉลี่ย/เดือน × เป้าหมาย {target} เดือน) − คงเหลือ − กำลังมา (ปัดขึ้น)</div>
            <div><b>งบสั่งเพิ่ม</b> = แนะนำสั่งเพิ่ม × ทุนเฉลี่ย/คัน (ประมาณการงบซื้อสต็อก)</div>
            <div><b>กำไร/คัน · กำไรรวม</b> (ประมาณ) = ราคาขาย − ทุน − อุปกรณ์เสริม − ของแถม − ค่าขนส่ง · ถ้าดีลไม่มีทุน (บิล GR) ใช้ทุนเฉลี่ยรุ่นแทน · เรียงตาม &ldquo;กำไรรวม/กำไรต่อคัน&rdquo; เพื่อดูรุ่นคุ้มสุด</div>
            <div className="text-slate-400">🔴 ควรสั่งด่วน (พอขาย &lt; 1 ด.) · 🟡 ควรเติม (&lt; {target} ด.) · 🟢 เพียงพอ · นับดีลปิด/จัดส่งแล้วทั้งหมด (รวมบิลย้อนหลัง) · คงเหลือ = สถานะ &ldquo;พร้อมขาย&rdquo; · กำลังมา = สั่งผลิต/รอรับ</div>
          </div>
        </details>
      </main>
    </div>
  );
}

export default function RestockPage() {
  return <DashboardGuard><RestockPageInner /></DashboardGuard>;
}
