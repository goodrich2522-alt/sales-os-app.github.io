"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import {
  ArrowLeft, DollarSign, Download, ChevronDown, ChevronRight,
  User, AlertCircle, Award, Calendar, Lock, Unlock, X, FileSpreadsheet,
} from "lucide-react";
import { useApp } from "@/lib/AppContext";
import { MoneyInput } from "@/components/ui/MoneyInput";
import {
  calcCommission, isClosedSale, closeMonth, closeDate,
  commissionMonth, isCommPending, dealProfit,
  COMMISSION_FIELD, COMMISSION_CATEGORIES, CommissionLock, warrantyFilled, isForkliftVehicle,
  COMMISSION_MANUAL_FIELD,
} from "@/lib/commission";
import { DEFAULT_WARRANTY, emptySvcRounds, parseSvc, defaultWarrantyTerms } from "@/lib/warranty";
import { DashboardGuard } from "@/components/DashboardGuard";
import { PaymentImport } from "@/components/PaymentImport";
import { staffLabel, canonicalStaff } from "@/lib/constants";
import { thaiDateShort } from "@/lib/format";
import { supabase } from "@/lib/supabaseClient";
import type { Sale, Forklift } from "@/lib/types";

const fmt = (n: number) => Number(n || 0).toLocaleString("th-TH");
const MONTHS_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const monthLabel = (ym: string) => { const [y, m] = ym.split("-"); return `${MONTHS_TH[Number(m) - 1] ?? m} ${Number(y) + 543}`; };
const WARRANTY_GATE_FROM = "2026-08"; // เริ่มบังคับลงรับประกันก่อนจ่ายค่าคอม ตั้งแต่ ส.ค. 2569 (ไม่ย้อนดีลเก่า)
// แยกงวดค่าคอมเป็น "รายเดือน" (ห้ามรวมสะสม) · ผู้ใช้เคาะ 20 ส.ค.
// ดีลเก่า (ปิด ≤ ก.ค. 69 · ไม่มีวันรับเงิน) → จัดงวดตาม "วันปิดการขาย" · ตั้งแต่ ส.ค. → ตาม "วันรับเงิน"
const HIST_CUTOFF = "2026-07";
// เริ่มจ่ายค่าคอมผ่านแอปตั้งแต่ ก.ค. 2569 เป็นต้นมา · เดือนก่อนหน้า = บันทึกไว้อ้างอิง (ไม่จ่ายผ่านแอป)
const APP_PAYOUT_FROM = "2026-07";
const tabLabel = (k: string) => monthLabel(k);
// วันจ่ายค่าคอม = 25 ของเดือนถัดไป
const payoutLabelOf = (k: string) => monthLabel(payoutDateHelper(k));
function payoutDateHelper(ym: string) { const [y, m] = ym.split("-").map(Number); if (!y || !m) return ym; return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; }
// ดีลเก่า (ปิด ≤ ก.ค. 69) — จัดตามวันปิดการขาย (ใช้คู่กับ isCommPending ที่แปลว่ายังไม่กรอกวันรับเงิน)
const inHistorical = (s: Sale) => { const c = closeMonth(s); return !!c && c <= HIST_CUTOFF; };

// ── ดีลยุคก่อนใช้แอป (ปิด ≤ มิ.ย. 69) = จ่ายค่าคอมด้วยมือไปแล้ว → คงอยู่เดือนที่ปิด (บันทึกอ้างอิง) ไม่ดึงเข้างวดแอป ──
// ⭐ กันดีลก่อนแอปที่มีวันรับเงิน ก.ค./ส.ค. (จาก backfill) โดนลากเข้ามาคิดจ่ายซ้ำในงวดแอป
const PREAPP_CUTOFF = "2026-06";
// ธง "ยกยอดจ่ายในแอป" — ดีลก่อนแอปที่ค่าคอม "ยังไม่จ่าย" ต้องการยกมาจ่ายในแอปตามเดือนรับเงิน (เช่น สุดเขต/จอยซุน)
// ── ตรวจเดือน/ปีที่ผิดปกติ (22 ก.ย. 2569) ──
// เจอจริง: แท็บเดือนขึ้น "ส.ค. 2526" = วันที่ในดีลพิมพ์ปี พ.ศ. ผิด (2526 แทน 2569)
// ระบบแปลง พ.ศ.→ค.ศ. ให้อยู่แล้ว (toGregorian) แต่ถ้าปีที่พิมพ์มาผิดตั้งแต่ต้น ก็ได้เดือนผิดตามไปด้วย
// → ไม่ซ่อนทิ้ง (ข้อมูลจะหาย) แต่ติดป้ายเตือนให้กดเข้าไปแก้ที่ต้นทาง
const MIN_MONTH = "2018-01";                    // เก่ากว่านี้ = ปีผิดแน่ๆ (บริษัทยังไม่ใช้ระบบ)
const monthPlus = (ym: string, n: number) => {  // เลื่อนเดือน — ใช้หาขอบบน (ล่วงหน้าได้ไม่เกิน 3 เดือน)
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, (m - 1) + n, 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
};
const thisMonth = () => new Date().toISOString().slice(0, 7);
/** เดือนนี้เป็นไปไม่ได้ไหม (เก่าเกิน 2561 หรือล่วงหน้าเกิน 3 เดือน) */
const isOddMonth = (ym: string) => !!ym && (ym < MIN_MONTH || ym > monthPlus(thisMonth(), 3));
/** เดือนล่วงหน้า (ยังมาไม่ถึง) — ไม่ถึงกับผิด แต่ควรเช็กว่าวันที่ถูก */
const isFutureMonth = (ym: string) => !!ym && !isOddMonth(ym) && ym > thisMonth();

const CARRY_FIELD = "ยกยอดจ่ายในแอป";
const isCarryOver = (s: Sale) => !!(s.custom_fields?.[CARRY_FIELD]);

// งวดของดีล (YYYY-MM):
// · ยุคก่อนแอป (ปิด ≤ มิ.ย.) → คงเดือนที่ปิด (อ้างอิง) เว้นแต่ติดธงยกยอด
// · ยุคแอป (ปิด ก.ค.+) หรือ ยกยอด → ยึดเดือนรับเงิน (ยกไปจ่ายงวดที่เงินเข้า) · ยังไม่กรอก: ปิด ≤ ก.ค. ตกเดือนปิด มิฉะนั้น "" (รอรับเงิน)
const periodOf = (s: Sale) => {
  const c = closeMonth(s);
  if (c && c <= PREAPP_CUTOFF && !isCarryOver(s)) return c;
  const pm = commissionMonth(s);
  if (pm) return pm;
  return c && c <= HIST_CUTOFF ? c : "";
};

function CommissionPageInner() {
  const { sales, forklifts, updateSale, updateForklift, fieldConfig, setCommissionLock, toggleResignedStaff, setStaffAlias } = useApp();
  const [aliasFrom, setAliasFrom] = useState(""); // ชื่อที่จะรวม (alias)
  const [aliasTo, setAliasTo] = useState("");     // ชื่อจริง (canonical)
  const fkById = useMemo(() => new Map(forklifts.map(f => [f.id, f])), [forklifts]);
  const saleById = useMemo(() => new Map(sales.map(s => [s.id, s])), [sales]);
  // ดีลที่กำลังเปิดลงข้อมูลรับประกัน (คลิกจากแถวดีลในหน้าค่าคอม)
  const [warrantyDeal, setWarrantyDeal] = useState<{ saleId: string; sn: string; brand: string; model: string } | null>(null);
  const [showBooked, setShowBooked] = useState(false); // กาง/พับ ส่วนดีลจอง/มัดจำ รอปิดการขาย
  const [showPending, setShowPending] = useState(false); // กาง/พับ ส่วนดีลรอรับเงิน
  const [showPayImport, setShowPayImport] = useState(false); // หน้าต่างนำเข้าไฟล์ Excel รับเงิน
  const [detailSaleId, setDetailSaleId] = useState<string | null>(null); // ดีลที่เปิดดูรายละเอียด
  // ลงข้อมูลรับประกัน/บริการหลังการขาย → เขียนลง forklift.custom_fields["บริการหลังการขาย"] (ปลดล็อกค่าคอม)
  const saveWarranty = (sn: string, start: string, terms: string) => {
    const f = fkById.get(sn); if (!f) return;
    const svc = { start, terms, rounds: emptySvcRounds(), history: [{ by: "ฝ่ายสต็อก (หน้าค่าคอม)", at: new Date().toISOString().slice(0, 10) }] };
    updateForklift({ ...f, custom_fields: { ...(f.custom_fields || {}), "บริการหลังการขาย": JSON.stringify(svc) } });
    setWarrantyDeal(null);
  };

  // ประวัติซื้อทั้งหมด (รวมบิล GR) — ใช้ตรวจ "ลูกค้าเก่า" (เคยซื้อมาก่อน = ลูกค้าเก่าเสมอ)
  const historySales = useMemo(() => sales.filter(isClosedSale), [sales]);
  // ดีลที่นำมาคิดค่าคอม = ปิดจริง แต่ตัดดีลนำเข้าบิลภาษี GR ออก (ไม่จ่ายค่าคอม)
  // รวมดีลนำเข้าบิลภาษีมาคิดค่าคอมด้วย (ผู้ใช้เคาะ 20 ส.ค. — ใส่ชื่อเซลล์ให้ดีลนำเข้าแล้ว)
  const closedAll = useMemo(() => sales.filter(s => isClosedSale(s)), [sales]);
  // งวดค่าคอม: ดีลเก่า (ปิด ≤ ก.ค.) เข้างวดแรกตามวันปิด · ดีลใหม่ (ส.ค.+) ใช้วันรับเงิน · ยังไม่รับเงิน → "รอรับเงิน"
  const closedSales = useMemo(() => closedAll.filter(s => periodOf(s) !== ""), [closedAll]);
  // รอรับเงินจริง = ปิดหลัง ก.ค. + ยังไม่กรอกวันรับเงิน (ดีลเก่าเข้างวดแรกอัตโนมัติ ไม่ต้องกรอก)
  const pendingDeals = useMemo(() => closedAll.filter(s => !inHistorical(s) && isCommPending(s)), [closedAll]);
  // ดีลจอง/มัดจำ ที่ยังไม่ปิดการขาย (เช่น สั่งผลิต จ่ายมัดจำ 20%) — ยังไม่คิดค่าคอม แต่โชว์ให้เห็นว่ากำลังจะมา
  const bookedDeals = useMemo(() => sales.filter(s => {
    const st = String(s.sale_status || "");
    return !isClosedSale(s)
      && String(s.custom_fields?.["อนุมัติสต็อก"] ?? "") !== "ปฏิเสธ"
      && /จอง|มัดจำ|รอจัดส่ง|ไฟแนนซ์/.test(st)
      && String(s.sales_staff || "").trim() !== "";
  }), [sales]);

  // งวด = รายเดือน (ใหม่→เก่า) · แยกทุกเดือน ไม่รวมสะสม
  const months = useMemo(() => {
    const raw = [...new Set(closedSales.map(periodOf).filter(Boolean))];
    const lockKeys = Object.keys(fieldConfig.commissionLocks || {});
    return [...new Set([...raw, ...lockKeys])].sort().reverse();
  }, [closedSales, fieldConfig.commissionLocks]);
  // ดีลที่ตกอยู่ในเดือนที่เป็นไปไม่ได้ — ชี้เป้าให้ไปแก้วันที่ที่ต้นทาง (ไม่ซ่อนข้อมูล)
  // รวม "เดือนล่วงหน้าที่ยังมาไม่ถึง" เข้ามาด้วย (เช่น ปิด ธ.ค. 69 ทั้งที่ยังไม่ถึง = พิมพ์เดือนผิด)
  // แยกให้ชัดว่าเพี้ยนที่ช่องไหน — วันส่งมอบ (แก้ตรงนี้ได้) หรือวันรับเงิน (มาจากไฟล์รับเงิน ไม่แก้มือ)
  const oddDeals = useMemo(
    () => closedSales
      .map(s => {
        const cm = closeMonth(s), pm = commissionMonth(s);
        return {
          s, period: periodOf(s), odd: isOddMonth(periodOf(s)),
          badDelivery: !!cm && (isOddMonth(cm) || isFutureMonth(cm)),
          badPaid: !!pm && (isOddMonth(pm) || isFutureMonth(pm)),
        };
      })
      .filter(d => d.badDelivery || d.badPaid),
    [closedSales]);

  // แก้วันส่งมอบได้จากหน้าค่าคอมเลย — คนดูค่าคอมแก้เองเร็วกว่าให้ฝ่ายขายไล่แก้ทีละคน
  const [dateEdit, setDateEdit] = useState<Record<string, string>>({});
  const [editDateFor, setEditDateFor] = useState<string | null>(null);   // ดีลที่กำลังเปิดช่องแก้วันส่งมอบ (ใช้ saleById ด้านบน)
  const saveDeliveryDate = (sale: Sale) => {
    const v = String(dateEdit[sale.id] ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
    updateSale({ ...sale, delivery_date: v });
    setDateEdit(prev => { const next = { ...prev }; delete next[sale.id]; return next; });
  };

  const [month, setMonth] = useState<string>("");
  const activeMonth = month || months[0] || "";
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showWarrantyMissing, setShowWarrantyMissing] = useState(false);  // กางดูดีลที่ยังไม่ลงรับประกัน

  // ดีลของเดือนที่เลือก + คำนวณค่าคอมต่อดีล
  const rows = useMemo(() => {
    return closedSales
      .filter(s => periodOf(s) === activeMonth)
      .map(s => {
        const f = fkById.get(s.forklift_id);
        const comm0 = calcCommission(s, f, historySales);
        // กันจ่ายค่าคอม: ยังไม่ลงรับประกัน → ค่าคอม 0 · แต่บังคับเฉพาะดีลที่ปิดตั้งแต่ ส.ค. 2569 (ไม่ย้อนดีลเก่า)
        const gated = closeMonth(s) >= WARRANTY_GATE_FROM;
        const wf = !gated || warrantyFilled(f); // ดีลเก่า = ผ่านเสมอ
        const comm = wf ? comm0 : { ...comm0, amount: 0, note: (comm0.note ? comm0.note + " · " : "") + "ยังไม่ลงข้อมูลรับประกัน" };
        return { sale: s, forklift: f, comm, warranty: wf };
      })
      .sort((a, b) => String(a.sale.sales_staff || "").localeCompare(String(b.sale.sales_staff || "")) || closeDate(a.sale).localeCompare(closeDate(b.sale)));
  }, [closedSales, activeMonth, fkById]);

  // จัดกลุ่มรายบุคคล
  const byStaff = useMemo(() => {
    const m = new Map<string, { staff: string; deals: typeof rows; total: number; missing: number; warrantyMissing: number; noneCount: number; noneSaleTotal: number; noneComm: number }>();
    rows.forEach(r => {
      const staff = canonicalStaff(r.sale.sales_staff, fieldConfig.staffAliases) || "(ไม่ระบุเซลล์)";
      const g = m.get(staff) ?? { staff, deals: [] as typeof rows, total: 0, missing: 0, warrantyMissing: 0, noneCount: 0, noneSaleTotal: 0, noneComm: 0 };
      g.deals.push(r);
      if (r.comm.group !== "none") g.total += r.comm.amount; // รถกลุ่มอื่นคิดรวมทั้งเดือนทีหลัง (ไม่คิดทีละใบ)
      if (r.comm.group === "FORKLIFT" && !r.comm.category && r.warranty) g.missing += 1; // ยังไม่เลือกหมวด (แยกจากขาดรับประกัน)
      if (!r.warranty) g.warrantyMissing += 1;
      m.set(staff, g);
    });
    // รถกลุ่มอื่น (แฮนด์ลิฟท์/CBD/CNS) — รวมยอดขายทั้งเดือนก่อน คิด 1% ครั้งเดียว · เฉพาะดีลที่ลงรับประกันแล้ว
    m.forEach(g => {
      const none = g.deals.filter(r => r.comm.group === "none" && r.warranty);
      g.noneCount = none.length;
      g.noneSaleTotal = none.reduce((s, r) => s + (Number(r.sale.actual_sale) || 0), 0);
      // รถกลุ่มอื่น (1%) — ยอดรวมทั้งเดือนต้องถึง 100,000 ก่อน ถึงจ่าย · ต่ำกว่า = 0 (ผู้ใช้เคาะ 20 ส.ค.)
      g.noneComm = g.noneSaleTotal >= 100000 ? Math.round(g.noneSaleTotal * 0.01) : 0;
      g.total += g.noneComm;
    });
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [rows]);

  const grandTotal = byStaff.reduce((s, g) => s + g.total, 0);
  const totalDeals = rows.length;
  // นับเฉพาะดีลโฟล์คลิฟท์ที่ยังไม่เลือกหมวด (ไม่รวมดีลที่ไม่เข้าเงื่อนไขค่าคอม เช่น STAXX/แฮนด์ลิฟท์)
  const totalMissing = rows.filter(r => r.comm.group === "FORKLIFT" && !r.comm.category && r.warranty).length;
  const totalWarrantyMissing = rows.filter(r => !r.warranty).length; // ดีลที่ยังไม่ลงรับประกัน → ค่าคอม 0

  // ── ล็อก snapshot รายเดือน ── ถ้าเดือนนี้ถูกล็อก → แสดงตัวเลขจาก snapshot (คงที่)
  const lock = fieldConfig.commissionLocks?.[activeMonth] || null;
  const locked = !!lock;

  // กลุ่มแสดงผล (normalize ให้เหมือนกันทั้งสด/ล็อก) — ล็อก: จาก snapshot · สด: จาก byStaff
  const displayGroups = useMemo(() => {
    if (lock) {
      return lock.staff.map(s => ({
        staff: s.staff, total: s.total, dealCount: s.dealCount, missing: s.missing, carried: 0,
        noneCount: s.noneCount, noneSaleTotal: s.noneSaleTotal, noneComm: s.noneComm,
        deals: lock.deals.filter(d => d.staff === s.staff).map(d => ({
          key: d.saleId, saleId: d.saleId, sn: "", brand: d.brand, model: d.model, customer: d.customer,
          group: d.group, basis: d.basis, basisValue: d.basisValue, category: d.category,
          returning: d.returning, amount: d.amount, closeDate: d.closeDate, note: "", warranty: true,
          carried: false, carryFrom: "",
        })),
      }));
    }
    return byStaff.map(g => {
      const deals = g.deals.map(r => ({
        key: r.sale.id, saleId: r.sale.id, sn: r.sale.forklift_id, brand: r.sale.forklift_brand || "", model: r.sale.forklift_model || "",
        customer: r.sale.customer_name || "", group: r.comm.group, basis: r.comm.basis, basisValue: r.comm.basisValue,
        category: r.comm.category, returning: !!r.comm.returning, amount: r.comm.amount, closeDate: closeDate(r.sale), note: r.comm.note || "", warranty: r.warranty,
        // ยกยอดมาจากเดือนอื่น (ดีลก่อนแอปที่ยกมาจ่ายในงวดนี้ตามวันรับเงิน) — โชว์ป้ายบ่งชี้
        carried: isCarryOver(r.sale), carryFrom: monthLabel(closeMonth(r.sale)),
      }));
      return {
        staff: g.staff, total: g.total, dealCount: g.deals.length, missing: g.missing,
        carried: deals.filter(d => d.carried).length,
        noneCount: g.noneCount, noneSaleTotal: g.noneSaleTotal, noneComm: g.noneComm, deals,
      };
    });
  }, [lock, byStaff]);

  const dGrand = locked ? lock!.grandTotal : grandTotal;
  const dDeals = locked ? lock!.deals.length : totalDeals;
  const dMissing = locked ? lock!.staff.reduce((a, s) => a + s.missing, 0) : totalMissing;

  // ล็อกเดือน → เก็บ snapshot ตัวเลขปัจจุบัน · ปลดล็อก → กลับไปคำนวณสด
  const doLock = async () => {
    if (!activeMonth || byStaff.length === 0) return;
    if (!window.confirm(`ล็อกค่าคอม${tabLabel(activeMonth)}?\n\nตัวเลขจะถูกบันทึกคงที่ แม้แก้ไขดีลย้อนหลังก็จะไม่เปลี่ยน (ปลดล็อกได้ภายหลัง)`)) return;
    let by = "ฝ่ายสต็อก";
    try { const r = await supabase?.auth.getUser(); by = r?.data.user?.email || by; } catch {}
    const snap: CommissionLock = {
      month: activeMonth, lockedAt: new Date().toISOString(), lockedBy: by, grandTotal,
      staff: byStaff.map(g => ({ staff: g.staff, total: g.total, dealCount: g.deals.length, missing: g.missing, noneCount: g.noneCount, noneSaleTotal: g.noneSaleTotal, noneComm: g.noneComm })),
      deals: rows.map(r => ({
        saleId: r.sale.id, staff: r.sale.sales_staff || "(ไม่ระบุเซลล์)", brand: r.sale.forklift_brand || "", model: r.sale.forklift_model || "",
        customer: r.sale.customer_name || "", group: r.comm.group, basis: r.comm.basis, basisValue: r.comm.basisValue,
        category: r.comm.category, returning: !!r.comm.returning, amount: r.comm.amount, closeDate: closeDate(r.sale),
      })),
    };
    setCommissionLock(activeMonth, snap);
  };
  const doUnlock = () => {
    if (!activeMonth || !lock) return;
    if (!window.confirm(`ปลดล็อกค่าคอม${tabLabel(activeMonth)}?\n\nระบบจะกลับไปคำนวณสดจากดีลปัจจุบัน (ตัวเลขอาจเปลี่ยน)`)) return;
    setCommissionLock(activeMonth, null);
  };

  // แก้หมวดลูกค้าของดีล (สำหรับดีลเก่าที่ยังไม่ได้เลือก) → บันทึกลง custom_fields
  const setCategory = (saleId: string, cat: string) => {
    const sale = sales.find(x => x.id === saleId);
    if (!sale) return;
    const cf = { ...(sale.custom_fields || {}) };
    if (cat) cf[COMMISSION_FIELD] = cat; else delete cf[COMMISSION_FIELD];
    updateSale({ ...sale, custom_fields: cf });
  };

  /**
   * เติม "วันเริ่มรับประกัน = วันส่งมอบ" ให้ดีลที่ค้าง (25 ก.ย. 2569 · ผู้ใช้ยืนยันกติกา)
   * ระบบรู้วันส่งมอบอยู่แล้ว ไม่ควรให้คนพิมพ์ซ้ำ — เติมพร้อมเงื่อนไขรับประกันมาตรฐานของชนิดรถนั้น
   * ชนิดรถที่ยังไม่มีข้อความมาตรฐาน (เช่น รถลากไฟฟ้า) จะเติมแค่วันเริ่ม แล้วรายงานให้ไปกรอกเงื่อนไขเอง
   */
  const [backfillDone, setBackfillDone] = useState<string>("");
  const backfillWarranty = () => {
    const miss = rows.filter(r => !r.warranty && r.forklift);
    let filled = 0, needTerms = 0;
    miss.forEach(r => {
      const f = r.forklift!;
      const start = closeDate(r.sale);                       // วันส่งมอบของดีลนั้น
      if (!start) return;
      const cur = parseSvc(f);
      const isFork = isForkliftVehicle(f.brand, f.model);
      const terms = String(cur?.terms ?? "").trim() || defaultWarrantyTerms(isFork, f.vehicle_category);
      const svc = {
        start: String(cur?.start ?? "").trim() || start,
        terms,
        rounds: cur?.rounds?.length ? cur.rounds : emptySvcRounds(),
        history: [{ by: "ระบบ (เติมวันส่งมอบ)", at: new Date().toLocaleString("th-TH") }, ...(cur?.history ?? [])].slice(0, 10),
      };
      updateForklift({ ...f, custom_fields: { ...(f.custom_fields ?? {}), "บริการหลังการขาย": JSON.stringify(svc) } });
      if (terms) filled++; else needTerms++;
    });
    setBackfillDone(needTerms > 0
      ? `เติมวันเริ่มประกันให้ ${filled + needTerms} ดีลแล้ว · ${needTerms} ดีลยังต้องกรอก "เงื่อนไขรับประกัน" เอง (ชนิดรถนี้ยังไม่มีข้อความมาตรฐานในระบบ)`
      : `เติมวันเริ่มประกัน + เงื่อนไขให้ ${filled} ดีลแล้ว ✓`);
  };

  /** ส่งออกรายการดีลที่ยังไม่ลงรับประกัน (ค่าคอม 0) — ส่งให้เซลล์แต่ละคนไปไล่เติม */
  const exportWarrantyMissing = async () => {
    const miss = rows.filter(r => !r.warranty);
    if (miss.length === 0) return;
    const XLSX = await import("xlsx");
    const data = [...miss]
      .sort((a, b) => String(a.sale.sales_staff || "").localeCompare(String(b.sale.sales_staff || ""))
        || closeDate(a.sale).localeCompare(closeDate(b.sale)))
      .map(r => ({
        "เซลล์": canonicalStaff(r.sale.sales_staff, fieldConfig.staffAliases) || "(ไม่ระบุเซลล์)",
        "วันที่ปิด": closeDate(r.sale),
        "รหัสรถ": String(r.sale.forklift_unit_no || r.sale.forklift_id || "").replace(/#\d+$/, ""),
        "ยี่ห้อ": r.sale.forklift_brand ?? "",
        "รุ่น": r.sale.forklift_model ?? "",
        "ลูกค้า": r.sale.customer_name ?? "",
        "จังหวัด": r.sale.province ?? "",
        "ราคาขาย (บาท)": Math.round(Number(r.sale.actual_sale) || 0),
        "สถานะดีล": r.sale.sale_status ?? "",
        "ต้องกรอก": "บริการหลังการขาย/รับประกัน — วันเริ่มประกัน + เงื่อนไข (หน้าฝ่ายขาย → เปิดดีล)",
      }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [18, 12, 16, 12, 20, 28, 14, 16, 18, 52].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ดีลค้างรับประกัน");
    XLSX.writeFile(wb, `ดีลค้างข้อมูลรับประกัน_${activeMonth}.xlsx`);
  };

  const exportExcel = async () => {
    if (displayGroups.length === 0) return;
    const XLSX = await import("xlsx");
    // ชีต 1: สรุปรายคน (ใช้ตัวเลขที่แสดง — ล็อกแล้วก็ส่งออกตาม snapshot)
    const sumRows = displayGroups.map((g, i) => ({
      "อันดับ": i + 1, "เซลล์": g.staff, "จำนวนดีลปิด": g.dealCount,
      "รถกลุ่มอื่น: จำนวนใบ": g.noneCount, "รถกลุ่มอื่น: ยอดขายรวม": g.noneSaleTotal, "รถกลุ่มอื่น: ค่าคอม 1%": g.noneComm,
      "ค่าคอมรวม (บาท)": g.total, "ดีลที่ยังไม่เลือกหมวด": g.missing,
    }));
    const ws1 = XLSX.utils.json_to_sheet(sumRows);
    ws1["!cols"] = [8, 20, 14, 16, 18, 16, 18, 20].map(w => ({ wch: w }));
    // ชีต 2: รายดีล
    const detRows = displayGroups.flatMap(g => g.deals.map(d => ({
      "เซลล์": g.staff, "วันปิด": d.closeDate,
      "ยี่ห้อ/รุ่น": `${d.brand} ${d.model}`.trim(),
      "กลุ่ม": d.group === "STACKER" ? "STACKER" : d.group === "FORKLIFT" ? "FORKLIFT" : "อื่นๆ",
      "เกณฑ์": d.basis, "ยอด/กำไร (บาท)": Math.round(d.basisValue),
      "หมวดลูกค้า": d.category || "", "ลูกค้าเก่า(ประวัติ)": d.returning ? "ใช่" : "",
      "ลูกค้า": d.customer,
      // รถกลุ่มอื่นคิดรวมทั้งเดือน (ดูชีตสรุป) → ไม่ลงค่าคอมทีละใบ กันนับซ้ำ
      "ค่าคอม (บาท)": d.group === "none" ? "" : d.amount,
      "ยกยอดมาจาก": d.carried ? d.carryFrom : "",
      "หมายเหตุ": d.group === "none" ? "รวมคิด 1% ที่ยอดเดือน (ดูชีตสรุป)" : [d.note, d.carried ? `ยกยอดมาจาก ${d.carryFrom}` : ""].filter(Boolean).join(" · "),
    })));
    const ws2 = XLSX.utils.json_to_sheet(detRows);
    ws2["!cols"] = [18, 12, 22, 10, 8, 16, 18, 14, 20, 12, 14, 22].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, "สรุปรายคน");
    XLSX.utils.book_append_sheet(wb, ws2, "รายดีล");
    XLSX.writeFile(wb, `ค่าคอม_${activeMonth}${locked ? "_ล็อก" : ""}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-all"><ArrowLeft className="w-5 h-5" /></Link>
            <div className="flex items-center gap-2.5">
              <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl p-2"><DollarSign className="w-5 h-5 text-white" /></div>
              <div>
                <h1 className="text-base font-bold text-slate-800 leading-tight">ค่าคอมมิชชั่นรายเดือน</h1>
                <p className="text-slate-500 text-xs">คำนวณจากดีลที่ปิด/จัดส่งแล้วในเดือนนั้น</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeMonth && (locked ? (
              <button onClick={doUnlock}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg px-3 py-2 transition-all">
                <Unlock className="w-4 h-4" /><span className="hidden sm:inline">ปลดล็อก</span>
              </button>
            ) : (
              <button onClick={doLock} disabled={byStaff.length === 0}
                className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg px-3 py-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                <Lock className="w-4 h-4" /><span className="hidden sm:inline">ล็อกเดือนนี้</span>
              </button>
            ))}
            <button onClick={exportExcel} disabled={displayGroups.length === 0}
              className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-3 py-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
              <Download className="w-4 h-4" /><span className="hidden sm:inline">Export Excel</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-5">
        {/* ── ตัวเลือกเดือน ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 mr-1"><Calendar className="w-3.5 h-3.5" />เดือน</span>
          {months.length === 0 && <span className="text-sm text-slate-400">ยังไม่มีดีลปิดการขาย</span>}
          {months.map(m => {
            const odd = isOddMonth(m);            // เดือนที่เป็นไปไม่ได้ = วันที่ในดีลพิมพ์ผิด
            const future = isFutureMonth(m);      // เดือนที่ยังมาไม่ถึง — เตือนเบาๆ ให้เช็ก
            return (
            <button key={m} onClick={() => { setMonth(m); setExpanded(null); }}
              title={odd ? "เดือนนี้เป็นไปไม่ได้ — วันที่ในดีลน่าจะพิมพ์ปีผิด กดเพื่อดูดีลในเดือนนี้"
                : future ? "เดือนล่วงหน้า (ยังมาไม่ถึง) — กดดูว่าวันที่ในดีลถูกต้องไหม" : undefined}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-all ${
                activeMonth === m ? "bg-amber-500 text-white border-amber-500"
                : odd ? "bg-red-50 text-red-700 border-red-300 hover:border-red-400"
                : future ? "bg-amber-50 text-amber-700 border-amber-300 hover:border-amber-400"
                : "bg-white text-slate-600 border-slate-200 hover:border-amber-300"}`}>
              {odd ? "⚠️ " : future ? "🕐 " : ""}{tabLabel(m)}
            </button>
          );})}
          {/* จ่ายวันที่ 25 เดือนถัดไป · เดือนก่อน ก.ค.69 = บันทึกอ้างอิง (ยังไม่จ่ายผ่านแอป) */}
          {activeMonth && (activeMonth >= APP_PAYOUT_FROM
            ? <span className="ml-auto text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">💰 จ่ายให้ฝ่ายขาย {payoutLabelOf(activeMonth)}</span>
            : <span className="ml-auto text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5">📁 ก่อนเริ่มจ่ายผ่านแอป (บันทึกอ้างอิง)</span>)}
        </div>
        {/* ── เตือนเดือนที่เป็นไปไม่ได้ — วันที่ในดีลพิมพ์ปีผิด ── */}
        {oddDeals.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
            <p className="text-sm font-bold text-red-700 mb-1">⚠️ พบ {oddDeals.length} ดีลที่วันที่ผิดปกติ — ทำให้มีแท็บเดือนแปลกๆ ({[...new Set(oddDeals.map(d => tabLabel(d.period)))].join(" · ")})</p>
            <p className="text-[11px] text-red-600 mb-2"><b>แก้เฉพาะวันส่งมอบตรงนี้ได้เลย</b> — ดีลจะย้ายไปเดือนที่ถูกทันที · ส่วน<b>วันรับเงิน</b>มาจากไฟล์รับเงินที่อัปโหลด ไม่ต้องแก้มือ ระบบจะทับให้ตอนอัปโหลดรอบถัดไป</p>
            <div className="flex flex-col gap-1.5">
              {oddDeals.slice(0, 10).map(d => (
                <div key={d.s.id} className="text-xs bg-white border border-red-100 rounded-lg px-2.5 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold text-slate-800">{d.s.customer_name || "(ไม่มีชื่อลูกค้า)"}</span>
                  <span className="text-slate-500">{d.s.forklift_brand} {d.s.forklift_model}</span>
                  {d.s.forklift_unit_no && <span className="text-slate-400">{d.s.forklift_unit_no}</span>}
                  <span className="text-slate-500">เซลล์ {d.s.sales_staff || "—"}</span>
                  <span className="ml-auto flex items-center gap-2 flex-wrap">
                    <span className={d.badDelivery ? "font-semibold text-red-700" : "text-slate-500"}>ส่งมอบ {d.s.delivery_date || "—"}</span>
                    {d.badPaid && (
                      <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5"
                        title="วันรับเงินมาจากไฟล์รับเงินที่อัปโหลด — ไม่ต้องแก้มือ ระบบจะทับให้ตอนอัปโหลดรอบถัดไป">
                        วันรับเงิน {d.s.payment_received_date} · รอไฟล์รับเงินทับ
                      </span>
                    )}
                  </span>
                  {/* แก้ได้เฉพาะวันส่งมอบ — วันรับเงินมาจากไฟล์ ไม่แตะ */}
                  {d.badDelivery && (
                    <span className="flex items-center gap-1 w-full sm:w-auto">
                      <input type="date" value={dateEdit[d.s.id] ?? String(d.s.delivery_date ?? "").slice(0, 10)}
                        onChange={e => setDateEdit({ ...dateEdit, [d.s.id]: e.target.value })}
                        className="border border-slate-300 rounded-lg px-2 py-1 text-[11px] text-slate-800 bg-white" />
                      <button onClick={() => saveDeliveryDate(d.s)}
                        disabled={!dateEdit[d.s.id] || dateEdit[d.s.id] === String(d.s.delivery_date ?? "").slice(0, 10)}
                        className="text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg px-2.5 py-1">
                        บันทึกวันที่
                      </button>
                    </span>
                  )}
                </div>
              ))}
              {oddDeals.length > 10 && <span className="text-[11px] text-red-600">…และอีก {oddDeals.length - 10} ดีล</span>}
            </div>
          </div>
        )}
        <p className="text-[11px] text-slate-400 -mt-3 px-1">แยกรายเดือน · เริ่มจ่ายผ่านแอป <b className="text-slate-500">ก.ค. 69</b> เป็นต้นไป (จ่าย 25 เดือนถัดไป) · ดีลเก่า=เดือนที่<b className="text-slate-500">ปิดการขาย</b> · ดีลใหม่=เดือนที่<b className="text-slate-500">เงินเข้าบัญชี</b></p>

        {/* ⏳ ดีลรอรับเงิน — กดกางดู + กรอกวันรับเงินได้เลย */}
        {pendingDeals.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
            <button onClick={() => setShowPending(v => !v)} className="w-full flex items-start gap-2.5 px-4 py-3 text-left hover:bg-amber-100/40 transition-colors">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-700" />
              <div className="flex-1 min-w-0 text-sm text-amber-800">
                <span className="font-bold">⏳ รอรับเงิน {pendingDeals.length} ดีล</span> — ดีลใหม่ (ปิดตั้งแต่ ส.ค. 69) ที่ยังไม่กรอก &ldquo;วันที่รับเงิน&rdquo; → <b>ยังไม่เข้างวด ไม่คิดค่าคอม</b>
                <span className="block text-xs text-amber-600 mt-0.5">แตะเพื่อกางดูรายการ + กรอกวันรับเงินได้เลย · ดีลเก่า (ปิด ≤ ก.ค. 69) เข้าเดือนอัตโนมัติแล้ว ไม่ต้องกรอก</span>
              </div>
              {showPending ? <ChevronDown className="w-5 h-5 text-amber-400 flex-shrink-0" /> : <ChevronRight className="w-5 h-5 text-amber-400 flex-shrink-0" />}
            </button>
            {/* นำเข้าไฟล์ Excel รับเงินจากระบบบัญชี → จับคู่เติมวันรับเงินให้หลายดีลพร้อมกัน */}
            <div className="px-4 pb-3 -mt-1 flex items-center gap-2 flex-wrap">
              <button onClick={() => setShowPayImport(true)}
                className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-white hover:bg-emerald-50 border border-emerald-300 rounded-lg px-3 py-1.5 transition-colors">
                <FileSpreadsheet className="w-3.5 h-3.5" />นำเข้าไฟล์รับเงิน (Excel)
              </button>
              <span className="text-[11px] text-amber-600">ไฟล์ &ldquo;รายงานภาษีขาย ... -รับเงิน&rdquo; จากระบบบัญชี → ระบบจับคู่กับดีลและเติมวันรับเงินให้</span>
            </div>
            {showPending && (
              <div className="border-t border-amber-100 divide-y divide-amber-100/70 bg-white/50">
                {pendingDeals.map(s => (
                  <div key={s.id} className="px-4 py-3 flex items-center gap-3 text-sm flex-wrap">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800">{s.forklift_brand} {s.forklift_model}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{staffLabel(s.sales_staff || "(ไม่ระบุเซลล์)", fieldConfig.resignedStaff ?? [])} · {s.customer_name || "—"} · ปิด {closeDate(s)}</p>
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-slate-600">
                      วันรับเงิน:
                      <input type="date" defaultValue={s.payment_received_date || ""}
                        onChange={e => { if (e.target.value) updateSale({ ...s, payment_received_date: e.target.value }); }}
                        className="border border-amber-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400" />
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {showPayImport && <PaymentImport pending={pendingDeals} onClose={() => setShowPayImport(false)} />}

        {/* ── ดีลจอง/มัดจำ รอปิดการขาย (สั่งผลิต ฯลฯ) — ยังไม่คิดค่าคอม ── */}
        {bookedDeals.length > 0 && (
          <div className="bg-white rounded-2xl border border-violet-200 shadow-sm overflow-hidden">
            <button onClick={() => setShowBooked(v => !v)}
              className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-violet-50/50 transition-colors text-left">
              <span className="text-lg">🔖</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-violet-800">ดีลจอง/มัดจำ รอปิดการขาย ({bookedDeals.length})</p>
                <p className="text-[11px] text-violet-500">จองแล้ว/จ่ายมัดจำ/สั่งผลิต — <b>ยังไม่คิดค่าคอม</b> จนกว่าจะปิดการขายเต็มจำนวน</p>
              </div>
              {showBooked ? <ChevronDown className="w-5 h-5 text-violet-400" /> : <ChevronRight className="w-5 h-5 text-violet-400" />}
            </button>
            {showBooked && (
              <div className="border-t border-violet-100 divide-y divide-violet-50">
                {bookedDeals.map(s => (
                  <div key={s.id} className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800">{s.forklift_brand} {s.forklift_model}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 border border-violet-200">{s.sale_status}</span>
                      {Number(s.deposit) > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">มัดจำ ฿{fmt(Number(s.deposit))}</span>}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {staffLabel(s.sales_staff || "(ไม่ระบุเซลล์)", fieldConfig.resignedStaff ?? [])} · {s.customer_name || "—"}
                    </p>
                    {s.remark && <p className="text-[11px] text-violet-600 mt-0.5">📝 {s.remark}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── แบนเนอร์เมื่อเดือนนี้ถูกล็อก ── */}
        {locked && lock && (
          <div className="text-sm text-slate-700 bg-slate-800/[0.03] border border-slate-300 rounded-2xl px-4 py-3 flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-800">ค่าคอมเดือนนี้ถูกล็อกแล้ว</span> — ตัวเลขคงที่ แม้แก้ไขดีลย้อนหลังก็จะไม่เปลี่ยน
              <span className="block text-xs text-slate-500 mt-0.5">ล็อกโดย {lock.lockedBy} · เมื่อ {String(lock.lockedAt).slice(0, 10)} · กด &ldquo;ปลดล็อก&rdquo; เพื่อกลับไปคำนวณสด</span>
            </div>
          </div>
        )}

        {/* ── สรุปยอดรวม ── */}
        {activeMonth && (
          <div className="grid grid-cols-3 gap-3">
            <div className={`rounded-2xl border shadow-sm p-4 ${locked ? "bg-amber-50/60 border-amber-200" : "bg-white border-slate-100"}`}>
              <p className="text-xs text-slate-500 flex items-center gap-1">ค่าคอมรวมทั้งเดือน{locked && <Lock className="w-3 h-3 text-amber-500" />}</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">฿{fmt(dGrand)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <p className="text-xs text-slate-500">ดีลปิดการขาย</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{dDeals}</p>
            </div>
            <div className={`rounded-2xl border shadow-sm p-4 ${dMissing > 0 ? "bg-red-50 border-red-200" : "bg-white border-slate-100"}`}>
              <p className="text-xs text-slate-500">ยังไม่เลือกหมวด</p>
              <p className={`text-2xl font-bold mt-1 ${dMissing > 0 ? "text-red-600" : "text-slate-800"}`}>{dMissing}</p>
            </div>
          </div>
        )}

        {dMissing > 0 && !locked && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            มีดีลโฟล์คลิฟท์ <b>{dMissing}</b> รายการยังไม่ได้เลือก &ldquo;หมวดลูกค้า&rdquo; — กางดูรายดีลแล้วเลือกหมวดให้ครบ ค่าคอมถึงจะคำนวณถูก
          </div>
        )}
        {/* ── ดีลที่ยังไม่ลงรับประกัน → ค่าคอม 0 · กดเพื่อกางดูว่าเป็นดีลไหนบ้าง ── */}
        {totalWarrantyMissing > 0 && !locked && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
            <button onClick={() => setShowWarrantyMissing(v => !v)} className="w-full flex items-start gap-2 text-left">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                มี <b>{totalWarrantyMissing}</b> ดีล<b>ยังไม่ลงข้อมูลรับประกัน/บริการหลังการขาย → ค่าคอม 0</b> · ฝ่ายขายต้องลงข้อมูลรับประกันในหน้าขาย (กล่องรายละเอียดการขาย) ให้ครบก่อน
              </span>
              <span className="ml-auto flex-shrink-0 font-bold underline">{showWarrantyMissing ? "ซ่อน" : "ดูรายการ"}</span>
            </button>
            {showWarrantyMissing && (
              <div className="mt-2 overflow-x-auto">
                {/* สรุปว่าเป็นของเซลล์คนไหนบ้าง — ไล่ตามได้เร็วกว่าดูทีละแถว */}
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  <span className="text-[11px] font-semibold text-red-700/70">ของเซลล์:</span>
                  {(() => {
                    const m = new Map<string, number>();
                    rows.filter(r => !r.warranty).forEach(r => {
                      const k = canonicalStaff(r.sale.sales_staff, fieldConfig.staffAliases) || "(ไม่ระบุเซลล์)";
                      m.set(k, (m.get(k) ?? 0) + 1);
                    });
                    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([staff, n]) => (
                      <span key={staff} className="text-[11px] font-bold bg-white border border-red-200 text-red-700 rounded-full px-2 py-0.5">
                        {staffLabel(staff, fieldConfig.resignedStaff ?? [])} · {n} ดีล
                      </span>
                    ));
                  })()}
                </div>
                <table className="w-full text-[11px] min-w-[560px]">
                  <thead>
                    <tr className="text-red-700/70 border-b border-red-200">
                      <th className="text-left py-1.5 px-2 font-semibold whitespace-nowrap">วันที่ปิด</th>
                      <th className="text-left py-1.5 px-2 font-semibold whitespace-nowrap">รหัสรถ</th>
                      <th className="text-left py-1.5 px-2 font-semibold">ลูกค้า</th>
                      <th className="text-left py-1.5 px-2 font-semibold">รุ่น</th>
                      <th className="text-left py-1.5 px-2 font-semibold whitespace-nowrap">เซลล์</th>
                      <th className="text-right py-1.5 px-2 font-semibold whitespace-nowrap">ราคาขาย</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.filter(r => !r.warranty).map(r => (
                      <tr key={r.sale.id} className="border-b border-red-100 bg-white/60">
                        <td className="py-1.5 px-2 whitespace-nowrap">{thaiDateShort(closeDate(r.sale))}</td>
                        <td className="py-1.5 px-2 whitespace-nowrap font-semibold">{String(r.sale.forklift_unit_no || r.sale.forklift_id || "—").replace(/#\d+$/, "")}</td>
                        <td className="py-1.5 px-2 text-slate-700">{r.sale.customer_name || "(ไม่มีชื่อลูกค้า)"}</td>
                        <td className="py-1.5 px-2 text-slate-600">{r.sale.forklift_brand} {r.sale.forklift_model}</td>
                        <td className="py-1.5 px-2 whitespace-nowrap text-slate-600">{staffLabel(r.sale.sales_staff || "(ไม่ระบุเซลล์)", fieldConfig.resignedStaff ?? [])}</td>
                        <td className="py-1.5 px-2 text-right whitespace-nowrap text-slate-700">฿{Math.round(Number(r.sale.actual_sale) || 0).toLocaleString("th-TH")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <button onClick={backfillWarranty}
                    title="ใช้วันส่งมอบของแต่ละดีลเป็นวันเริ่มรับประกัน + เติมเงื่อนไขมาตรฐานตามชนิดรถ"
                    className="text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-lg px-3 py-2 flex items-center gap-1.5">
                    ⚡ เติมวันเริ่มประกัน = วันส่งมอบ ({rows.filter(r => !r.warranty).length} ดีล)
                  </button>
                  <button onClick={exportWarrantyMissing}
                    className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-2 flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5" />ส่งออก Excel ({rows.filter(r => !r.warranty).length} ดีล)
                  </button>
                  <span className="text-[11px] text-red-600">ไฟล์เรียงตามเซลล์ → ส่งให้แต่ละคนไล่เติมได้เลย</span>
                </div>
                <p className="mt-1.5 text-[11px] text-red-600">วิธีแก้: เปิดหน้าฝ่ายขาย → ค้นรหัสรถข้างบน → เปิดดีล → กรอกกล่อง &ldquo;รับประกัน / บริการหลังการขาย&rdquo; ให้ครบ แล้วค่าคอมจะคำนวณให้เอง</p>
              </div>
            )}
          </div>
        )}

        {/* ── รายบุคคล ── */}
        <div className="flex flex-col gap-3">
          {displayGroups.map((g, idx) => (
            <div key={g.staff} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <button onClick={() => setExpanded(expanded === g.staff ? null : g.staff)}
                className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors text-left">
                <div className={`rounded-xl p-2 flex-shrink-0 ${idx === 0 ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500"}`}>
                  {idx === 0 ? <Award className="w-5 h-5" /> : <User className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 text-sm">{staffLabel(g.staff, fieldConfig.resignedStaff ?? [])}</p>
                  <p className="text-xs text-slate-500">{g.dealCount} ดีล{g.missing > 0 && !locked && <span className="text-red-600 font-semibold"> · ยังไม่เลือกหมวด {g.missing}</span>}{g.carried > 0 && <span className="text-purple-600 font-semibold"> · 🔄 ยกมา {g.carried} ดีล</span>}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-bold text-amber-600 flex items-center gap-1 justify-end">{locked && <Lock className="w-3.5 h-3.5 text-amber-500" />}฿{fmt(g.total)}</p>
                </div>
                {expanded === g.staff ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
              </button>

              {expanded === g.staff && (
                <div className="border-t border-slate-100 divide-y divide-slate-50">
                  {/* ทำเครื่องหมายเซลล์ลาออก — โชว์ "(ลาออก)" ต่อท้ายทุกหน้า · ข้อมูล/ยอดเก่ายังอยู่ครบ */}
                  {g.staff !== "(ไม่ระบุเซลล์)" && (
                    <label className="flex items-center gap-2 p-3 bg-slate-50/60 cursor-pointer text-xs text-slate-600">
                      <input type="checkbox" checked={(fieldConfig.resignedStaff ?? []).includes(g.staff)}
                        onChange={e => toggleResignedStaff(g.staff, e.target.checked)} className="w-4 h-4 accent-slate-600" />
                      <span>ทำเครื่องหมายว่า <b>ลาออกแล้ว</b> — ชื่อจะขึ้น &ldquo;{g.staff} (ลาออก)&rdquo; ทุกหน้า (ยอด/ค่าคอมย้อนหลังยังอยู่ครบ)</span>
                    </label>
                  )}
                  {g.deals.filter(d => d.group !== "none").map(d => (
                    <div key={d.key} onClick={() => setDetailSaleId(d.saleId)}
                      className="p-3.5 flex items-center gap-3 text-sm cursor-pointer hover:bg-slate-50/70 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-800">{d.brand} {d.model}</span>
                          <span className="text-[10px] text-slate-400">#{d.sn}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${d.group === "STACKER" ? "bg-teal-100 text-teal-700" : d.group === "FORKLIFT" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"}`}>{d.group === "none" ? "อื่นๆ" : d.group}</span>
                          {d.warranty === false && (locked
                            ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">⚠️ ยังไม่ลงรับประกัน · คอม 0</span>
                            : <button onClick={(e) => { e.stopPropagation(); setWarrantyDeal({ saleId: d.saleId, sn: d.sn, brand: d.brand, model: d.model }); }}
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200 hover:bg-red-600 hover:text-white transition-colors">⚠️ ยังไม่ลงรับประกัน · แตะลงข้อมูล</button>)}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {d.customer || "—"} · {d.basis} ฿{fmt(Math.round(d.basisValue))} ·{" "}
                          {/* แก้วันส่งมอบได้จากหน้านี้เลย — คนดูค่าคอมแก้เองเร็วกว่าให้ฝ่ายขายไล่แก้ (25 ก.ย. 2569) */}
                          {locked ? <>ปิด {d.closeDate}</> : (
                            <button onClick={e => { e.stopPropagation(); setEditDateFor(editDateFor === d.saleId ? null : d.saleId); }}
                              title="แก้วันส่งมอบ (= วันที่ปิดการขาย)"
                              className="underline decoration-dotted hover:text-amber-700 font-semibold">ปิด {d.closeDate} ✎</button>
                          )}
                        </p>
                        {editDateFor === d.saleId && !locked && (
                          <div onClick={e => e.stopPropagation()} className="mt-1.5 flex items-center gap-1.5 flex-wrap bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                            <span className="text-[11px] font-semibold text-amber-800">วันส่งมอบ (วันปิดการขาย):</span>
                            <input type="date" value={dateEdit[d.saleId] ?? d.closeDate}
                              onChange={e => setDateEdit({ ...dateEdit, [d.saleId]: e.target.value })}
                              className="border border-amber-300 rounded-lg px-2 py-1 text-[11px] text-slate-800 bg-white" />
                            <button onClick={() => { const sale = saleById.get(d.saleId); if (sale) { saveDeliveryDate(sale); setEditDateFor(null); } }}
                              disabled={!dateEdit[d.saleId] || dateEdit[d.saleId] === d.closeDate}
                              className="text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg px-2.5 py-1">บันทึก</button>
                            <button onClick={() => setEditDateFor(null)} className="text-[11px] font-semibold text-slate-500 hover:bg-white rounded-lg px-2 py-1">ยกเลิก</button>
                            <span className="text-[10px] text-amber-700 w-full">เปลี่ยนแล้วดีลจะย้ายไปเดือนที่ถูกทันที · วันรับเงินไม่ถูกแตะ (มาจากไฟล์รับเงิน)</span>
                          </div>
                        )}
                        {d.carried && (
                          <span className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-bold text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-2 py-1">
                            🔄 ยกยอดมาจาก {d.carryFrom} (ยังไม่จ่ายก่อนใช้แอป → จ่ายในงวดนี้ตามวันรับเงิน)
                          </span>
                        )}
                        {/* หมวดลูกค้า: forklift · ลูกค้าเก่า(จากประวัติ)ล็อกอัตโนมัติ · อื่นๆ เลือกเองได้ (ล็อกแล้วดูอย่างเดียว) */}
                        {d.group === "FORKLIFT" && (
                          d.returning ? (
                            <span className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-2 py-1">
                              🔁 ลูกค้าเก่า (ตรวจจากประวัติซื้อ) — คิดเรตลูกค้าเก่าอัตโนมัติ
                            </span>
                          ) : locked ? (
                            <span className="inline-block mt-1.5 text-[11px] text-slate-500">หมวด: <b className="text-slate-700">{d.category || "— ไม่ได้เลือก —"}</b></span>
                          ) : (
                            <select value={d.category} onClick={e => e.stopPropagation()} onChange={e => setCategory(d.saleId, e.target.value)}
                              className={`mt-1.5 text-xs border rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-amber-400 ${d.category ? "bg-violet-50 border-violet-300 text-violet-700 font-bold" : d.note ? "border-red-300 text-red-700 bg-white" : "border-slate-200 text-slate-700 bg-white"}`}>
                              <option value="">-- เลือกหมวดลูกค้า --</option>
                              {COMMISSION_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          )
                        )}
                        {d.group === "STACKER" && <p className="text-[11px] text-teal-600 mt-0.5">สแตกเกอร์ — คิดตามยอดขายอัตโนมัติ</p>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`font-bold ${d.amount > 0 ? "text-amber-600" : "text-slate-400"}`}>฿{fmt(d.amount)}</p>
                        {d.note?.includes("แบ่งค่าคอม") && (
                          <span className="inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 whitespace-nowrap">แบ่ง 50% · รับช่วงต่อ</span>
                        )}
                        {d.note?.includes("กำหนดเอง") && (
                          <span className="inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 whitespace-nowrap">✋ กำหนดเอง (ตามรายงาน)</span>
                        )}
                      </div>
                    </div>
                  ))}
                  {/* รถกลุ่มอื่น (แฮนด์ลิฟท์/CBD/CNS) — รวมยอดขายทั้งเดือนแล้วคิด 1% ครั้งเดียว (ไม่แยกทีละใบ) */}
                  {g.noneCount > 0 && (
                    <div className="p-3.5 flex items-center gap-3 text-sm bg-blue-50/40">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-800">รถกลุ่มอื่น (แฮนด์ลิฟท์/CBD/CNS ฯลฯ)</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">อื่นๆ · รวมทั้งเดือน</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">{g.noneCount} ใบ · ยอดขายรวมทั้งเดือน ฿{fmt(g.noneSaleTotal)}</p>
                        {g.noneSaleTotal >= 100000
                          ? <p className="text-[11px] text-blue-600 mt-0.5">คิด 1% ของยอดรวม (ยอดถึง 100,000 แล้ว)</p>
                          : <p className="text-[11px] text-slate-400 mt-0.5">ยอดรวมยังไม่ถึง 100,000 (ขาดอีก ฿{fmt(100000 - g.noneSaleTotal)}) → ยังไม่จ่ายค่าคอม</p>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`font-bold ${g.noneComm > 0 ? "text-amber-600" : "text-slate-400"}`}>฿{fmt(g.noneComm)}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {activeMonth && displayGroups.length === 0 && (
            <div className="text-center py-14 text-slate-400"><DollarSign className="w-10 h-10 text-slate-300 mx-auto mb-2" /><p className="text-sm">ไม่มีดีลปิดการขายในเดือนนี้</p></div>
          )}
        </div>

        {/* ── จัดการชื่อพ้องเซลล์ (รวมเป็นคนเดียว) ── */}
        <details className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-sm text-slate-600">
          <summary className="font-bold text-slate-700 cursor-pointer">รวมชื่อเซลล์ที่ซ้ำ (คนเดียวกันแต่บันทึกคนละชื่อ)</summary>
          <div className="mt-3 flex flex-col gap-3">
            <p className="text-xs text-slate-500">ถ้าเซลล์คนเดียวกันมีดีลบันทึกไว้หลายชื่อ (เช่น ล็อกอิน &ldquo;เซลล์ดรีม&rdquo; แต่รายงานใช้ &ldquo;ธัญญา (ดรีม)&rdquo;) ให้รวมเป็นชื่อจริงชื่อเดียว — ดีล/ค่าคอม/ประวัติการขายจะนับรวมเป็นคนเดียว</p>
            {/* รายการชื่อพ้องปัจจุบัน */}
            {Object.entries(fieldConfig.staffAliases || {}).length > 0 && (
              <div className="flex flex-col gap-1.5">
                {Object.entries(fieldConfig.staffAliases || {}).map(([from, to]) => (
                  <div key={from} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs">
                    <span className="font-semibold text-slate-600">{from}</span>
                    <span className="text-slate-400">→</span>
                    <span className="font-bold text-emerald-700">{to}</span>
                    <button onClick={() => setStaffAlias(from, null)} className="ml-auto text-red-500 hover:text-red-700 font-bold">ลบ</button>
                  </div>
                ))}
              </div>
            )}
            {/* เพิ่มชื่อพ้องใหม่ */}
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
              <label className="flex-1 flex flex-col gap-1 text-xs text-slate-500">ชื่อที่จะรวม (เช่น เซลล์ดรีม)
                <input list="staff-names" value={aliasFrom} onChange={e => setAliasFrom(e.target.value)} placeholder="ชื่อรอง"
                  className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </label>
              <span className="text-slate-400 text-center sm:pb-2">→</span>
              <label className="flex-1 flex flex-col gap-1 text-xs text-slate-500">รวมเป็นชื่อจริง (เช่น ธัญญา (ดรีม))
                <input list="staff-names" value={aliasTo} onChange={e => setAliasTo(e.target.value)} placeholder="ชื่อจริง"
                  className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </label>
              <button onClick={() => { if (aliasFrom.trim() && aliasTo.trim() && aliasFrom.trim() !== aliasTo.trim()) { setStaffAlias(aliasFrom.trim(), aliasTo.trim()); setAliasFrom(""); setAliasTo(""); } }}
                disabled={!aliasFrom.trim() || !aliasTo.trim() || aliasFrom.trim() === aliasTo.trim()}
                className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-40">รวมชื่อ</button>
            </div>
            <datalist id="staff-names">{[...new Set(sales.map(s => s.sales_staff).filter(Boolean))].map(n => <option key={n} value={n} />)}</datalist>
            <p className="text-[11px] text-slate-400">* เปลี่ยนแล้วมีผลทันที · ประวัติการขายของเซลล์ + ยอดค่าคอมจะรวมกัน (ไม่แก้ข้อมูลดีลเดิม แค่ถือเป็นคนเดียว)</p>
          </div>
        </details>

        {/* ── เกณฑ์ค่าคอม (อ้างอิง) ── */}
        <details className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-sm text-slate-600">
          <summary className="font-bold text-slate-700 cursor-pointer">เกณฑ์การคำนวณค่าคอม (อ้างอิง)</summary>
          <div className="mt-3 flex flex-col gap-3 text-xs leading-relaxed">
            <div><b className="text-teal-700">STACKER (รุ่น RE/CDD/CBS)</b> — ตามยอดขาย · &gt;100,000 = 800/คัน · ต่ำกว่า = 500/คัน</div>
            <div><b className="text-indigo-700">FORKLIFT · ลูกค้าใหม่</b> — ตามกำไรสุทธิ · ≥100k=2,000 · 80k–99,999=1,500 · 50k–79,999=1,000 · 40k–49,999=800 · 30,001–40k=700 · 25k–30k=500 · ต่ำกว่า 25k=0</div>
            <div><b className="text-indigo-700">FORKLIFT · ลูกค้าใหม่+ออกพบเอง</b> — ≥100k=2,000 · 50k–99,999=1,200 · 40k–49,999=800 · ต่ำกว่า 40k=500</div>
            <div><b className="text-indigo-700">FORKLIFT · ลูกค้าเก่า/รับช่วงต่อ</b> — ≥100k=1,500 · 40k–99,999=800 · ต่ำกว่า 40k=500</div>
            <div><b className="text-blue-700">รถกลุ่มอื่น (แฮนด์ลิฟท์/CBD/CNS ฯลฯ)</b> — 1% ของยอดรวมทั้งเดือน · <b>ยอดรวมต้องถึง 100,000 ก่อนถึงจ่าย</b> (ต่ำกว่า = ไม่จ่าย)</div>
            <div className="text-slate-400">กำไรสุทธิ = ราคาขาย − ทุน − อุปกรณ์เสริม − ของแถม − ค่าขนส่ง · นับเฉพาะดีลปิด/จัดส่งแล้ว · <b>ไม่รวมดีลนำเข้าจากบิลภาษี GR</b> · ค่าคอมคำนวณอัตโนมัติ (แก้ไขไม่ได้)</div>
            <div className="text-slate-500 flex items-start gap-1.5"><Lock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-500" /><span><b>ล็อกเดือน:</b> กด &ldquo;ล็อกเดือนนี้&rdquo; หลังจ่ายค่าคอมแล้ว → ตัวเลขจะคงที่ (freeze) แม้แก้ไขดีลย้อนหลัง · ปลดล็อกเพื่อกลับไปคำนวณสด</span></div>
          </div>
        </details>
      </main>

      {/* ── ลงข้อมูลรับประกัน/บริการหลังการขาย (คลิกจากแถวดีล) ── */}
      {warrantyDeal && (
        <WarrantyQuickEdit
          deal={warrantyDeal}
          forklift={fkById.get(warrantyDeal.sn)}
          sale={saleById.get(warrantyDeal.saleId)}
          onSave={(start, terms) => saveWarranty(warrantyDeal.sn, start, terms)}
          onClose={() => setWarrantyDeal(null)}
        />
      )}

      {/* ── รายละเอียดดีล (คลิกจากแถว) ── */}
      {detailSaleId && saleById.get(detailSaleId) && (
        <DealDetailModal
          sale={saleById.get(detailSaleId)!}
          forklift={fkById.get(saleById.get(detailSaleId)!.forklift_id)}
          comm={calcCommission(saleById.get(detailSaleId)!, fkById.get(saleById.get(detailSaleId)!.forklift_id), historySales)}
          resigned={fieldConfig.resignedStaff ?? []}
          locked={locked}
          onSave={updateSale}
          onClose={() => setDetailSaleId(null)}
        />
      )}
    </div>
  );
}

// โมดัลลงข้อมูลรับประกันแบบเร็ว — ปลดล็อกค่าคอมของดีลที่ยังไม่ลงข้อมูล
function WarrantyQuickEdit({ deal, forklift, sale, onSave, onClose }: {
  deal: { sn: string; brand: string; model: string };
  forklift?: Forklift;
  sale?: Sale;
  onSave: (start: string, terms: string) => void;
  onClose: () => void;
}) {
  const isoOf = (v?: string) => /^\d{4}-\d{2}-\d{2}/.test(String(v || "")) ? String(v).slice(0, 10) : "";
  // แฮนด์ลิฟท์/สแตกเกอร์/รถลากไฟฟ้า → รับประกันไฮดรอลิค 1 ปี · อื่น (โฟล์คลิฟท์) → รับประกันเต็ม
  const cat = forklift?.vehicle_category || "";
  const isHydraulic = ["Handlift", "Stacker", "Electric Pallet Truck"].includes(cat)
    || /^(CDD|CBS|RE|BF|AC|PWH|WH|CBD|CNS|SDA|DG\d|PD\d|PTS|DYC|PS\d)/i.test(String(deal.model));
  const defStart = isoOf(forklift?.received_date) || isoOf(sale?.delivery_date) || isoOf(sale?.payment_received_date) || new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState(defStart);
  const [terms, setTerms] = useState(isHydraulic ? "รับประกันระบบไฮดรอลิค 1 ปี" : DEFAULT_WARRANTY);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
        <div>
          <h3 className="font-bold text-slate-800">ลงข้อมูลรับประกัน / บริการหลังการขาย</h3>
          <p className="text-xs text-slate-500 mt-0.5">{deal.brand} {deal.model} · SN {deal.sn}</p>
        </div>
        <label className="text-sm text-slate-600 flex flex-col gap-1">
          วันเริ่มรับประกัน (วันส่งมอบ/รับรถ)
          <input type="date" value={start} onChange={e => setStart(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
        </label>
        <label className="text-sm text-slate-600 flex flex-col gap-1">
          เงื่อนไขการรับประกัน
          <textarea value={terms} onChange={e => setTerms(e.target.value)} rows={3}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
        </label>
        <p className="text-[11px] text-slate-400">บันทึกแล้วรอบเช็คฟรี 4 รอบจะสร้างอัตโนมัติ (ทุก 3 เดือน) · ค่าคอมของดีลนี้จะถูกคำนวณทันที · แก้รายละเอียดเพิ่มได้ที่หน้าสต็อก</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-bold text-slate-600 border border-slate-200 hover:bg-slate-50">ยกเลิก</button>
          <button onClick={() => onSave(start, terms)} disabled={!start.trim() || !terms.trim()}
            className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-40">บันทึก</button>
        </div>
      </div>
    </div>
  );
}

// โมดัลรายละเอียดดีล — คลิกจากแถวค่าคอม โชว์ข้อมูลประกอบครบ + แก้ค่าคอมกำหนดเอง/ยกยอด
function DealDetailModal({ sale, forklift, comm, resigned, locked, onSave, onClose }: {
  sale: Sale; forklift?: Forklift; comm: ReturnType<typeof calcCommission>; resigned: string[];
  locked: boolean; onSave: (s: Sale) => void; onClose: () => void;
}) {
  const f = forklift;
  const cf = (f?.custom_fields || {}) as Record<string, string>;
  const scf = (sale.custom_fields || {}) as Record<string, string>;
  const n = (x: unknown) => Number(x || 0).toLocaleString();
  const profit = f ? dealProfit(sale, f) : 0;
  const hasSvc = !!f?.custom_fields?.["บริการหลังการขาย"];
  // แก้ค่าคอมกำหนดเอง (override) + ธงยกยอด
  const [manual, setManual] = useState<string>(String(scf[COMMISSION_MANUAL_FIELD] ?? ""));
  const [carry, setCarry] = useState<boolean>(!!scf["ยกยอดจ่ายในแอป"]);
  const [saved, setSaved] = useState(false);
  const saveEdits = () => {
    const nc = { ...(sale.custom_fields || {}) } as Record<string, string>;
    const m = manual.replace(/,/g, "").trim();
    if (m !== "" && Number.isFinite(Number(m))) nc[COMMISSION_MANUAL_FIELD] = m; else delete nc[COMMISSION_MANUAL_FIELD];
    if (carry) nc["ยกยอดจ่ายในแอป"] = "true"; else delete nc["ยกยอดจ่ายในแอป"];
    onSave({ ...sale, custom_fields: nc });
    setSaved(true); setTimeout(onClose, 500);
  };
  const dirty = manual.replace(/,/g, "").trim() !== String(scf[COMMISSION_MANUAL_FIELD] ?? "").trim() || carry !== !!scf["ยกยอดจ่ายในแอป"];
  const Row = ({ label, value }: { label: string; value?: string | number | null }) => (
    <div className="flex justify-between gap-3 py-1.5 border-b border-slate-50">
      <span className="text-slate-500 flex-shrink-0">{label}</span>
      <span className="text-slate-800 font-medium text-right break-words">{value === 0 || value ? value : "—"}</span>
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 flex flex-col gap-3 text-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-bold text-slate-800">{sale.forklift_brand} {sale.forklift_model}</h3>
            <p className="text-xs text-slate-500">SN {sale.forklift_id}{f?.pi_no ? ` · ${f.pi_no}` : ""}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1"><X className="w-5 h-5" /></button>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between">
          <div className="text-xs text-amber-700">ค่าคอมดีลนี้ · กลุ่ม {comm.group} ({comm.basis})</div>
          <div className="text-lg font-bold text-amber-600">฿{n(comm.amount)}</div>
        </div>
        <div>
          <p className="text-[11px] font-bold text-slate-400 mb-1">👤 ลูกค้า / เซลล์</p>
          <Row label="ลูกค้า" value={sale.customer_name} />
          <Row label="เบอร์" value={sale.customer_tel} />
          <Row label="จังหวัด" value={sale.province} />
          <Row label="ประเภทลูกค้า" value={sale.customer_type} />
          <Row label="เซลล์ผู้ขาย" value={staffLabel(sale.sales_staff || "—", resigned)} />
        </div>
        <div>
          <p className="text-[11px] font-bold text-slate-400 mb-1">💰 การเงิน</p>
          <Row label="ราคาขาย" value={"฿" + n(sale.actual_sale)} />
          <Row label="ราคาทุน" value={"฿" + n(f?.cost_price)} />
          {Number(sale.deposit) > 0 && <Row label="มัดจำ" value={"฿" + n(sale.deposit)} />}
          {comm.group === "FORKLIFT" && <Row label="กำไรสุทธิ" value={"฿" + n(profit)} />}
          <Row label="หมวดค่าคอม" value={comm.category} />
          <Row label="ประเภทชำระ" value={sale.payment_type} />
          <Row label="วันรับเงิน" value={sale.payment_received_date} />
        </div>
        <div>
          <p className="text-[11px] font-bold text-slate-400 mb-1">📅 วันที่ / เอกสาร</p>
          <Row label="ปิดการขาย" value={closeDate(sale)} />
          <Row label="วันส่งมอบ" value={sale.delivery_date} />
          <Row label="เลขที่ IV" value={cf["เลขที่ใบกำกับภาษี"]} />
          <Row label="สถานะดีล" value={sale.sale_status} />
        </div>
        <div>
          <p className="text-[11px] font-bold text-slate-400 mb-1">🔧 สเปก / รับประกัน</p>
          <Row label="พิกัดยก" value={f?.capacity} />
          <Row label="เสา (MAST)" value={cf["MAST"]} />
          <Row label="พลังงาน" value={f?.fuel} />
          <Row label="รับประกัน" value={hasSvc ? "✅ ลงข้อมูลแล้ว" : "⚠️ ยังไม่ลง"} />
        </div>
        {sale.remark && <p className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2">📝 {sale.remark}</p>}

        {/* ── ปรับค่าคอมกำหนดเอง / ยกยอด (สต็อก·แอดมิน · ล็อกเดือนแล้วแก้ไม่ได้) ── */}
        {locked ? (
          <p className="text-[11px] text-slate-400 text-center">เดือนนี้ถูกล็อกแล้ว — แก้ค่าคอมไม่ได้ (ปลดล็อกก่อน)</p>
        ) : (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-3">
            <p className="text-[11px] font-bold text-slate-500">⚙️ ปรับค่าคอมดีลนี้</p>
            <label className="text-xs text-slate-600 flex flex-col gap-1">
              ค่าคอมกำหนดเอง (บาท) — ใส่เมื่อสูตร/เรตพิเศษไม่ตรงที่บริษัทจ่ายจริง · เว้นว่าง = คิดตามสูตรอัตโนมัติ
              <MoneyInput value={manual} onChange={v => setManual(v)}
                placeholder={`อัตโนมัติ = ฿${n(comm.amount)}`}
                className="border border-amber-300 rounded-lg px-3 py-2 text-sm font-bold text-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </label>
            <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" checked={carry} onChange={e => setCarry(e.target.checked)} className="w-4 h-4 mt-0.5 accent-purple-600" />
              <span>🔄 <b>ยกยอดมาจ่ายในแอป</b> — ดีลก่อนเริ่มใช้แอป (ปิด ≤ มิ.ย.) ที่ค่าคอมยังไม่จ่าย → ยกเข้างวดตาม &ldquo;วันรับเงิน&rdquo; (ต้องกรอกวันรับเงินที่หน้าขาย/สต็อก)</span>
            </label>
            <button onClick={saveEdits} disabled={!dirty || saved}
              className="self-end px-4 py-2 rounded-lg text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-40">
              {saved ? "บันทึกแล้ว ✓" : "บันทึก"}
            </button>
          </div>
        )}
        <p className="text-[11px] text-slate-400 text-center">แก้ไขราคา/ต้นทุน/วันรับเงินได้ที่หน้าขาย/สต็อก</p>
      </div>
    </div>
  );
}

export default function CommissionPage() {
  return <DashboardGuard><CommissionPageInner /></DashboardGuard>;
}
