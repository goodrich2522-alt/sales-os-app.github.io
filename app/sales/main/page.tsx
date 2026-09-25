"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  TrendingUp, LogOut, X, CheckCircle, AlertCircle,
  Search, Fuel, Zap, Filter, ChevronRight, Target,
  Package, Trash2, History, RotateCcw, Pencil, Check, Camera,
  SlidersHorizontal, ImageOff, ZoomIn, ChevronLeft, Plus, ClipboardList,
  Settings, ChevronDown, Type, ListOrdered, ArrowLeft, Bell, Eye, ChevronUp, RefreshCw,
  LayoutGrid, Table as TableIcon, Users, Download, MapPin, Loader2,
} from "lucide-react";
import { PROVINCES, CONTACT_SOURCES } from "@/lib/mockData";
import { Forklift, PaymentType, CustomerType, Sale, SaleStatus, VehicleType, ContactSource, SaleType, InspectionRecord, SLOT_LABELS, STOCK_APPROVAL_FIELD } from "@/lib/types";
import { useApp } from "@/lib/AppContext";
import { driveImg } from "@/lib/img";
import { isPendingId, displayCode, piLabel } from "@/lib/productId";
import { STATUS_BADGE, SALE_STATUS_BADGE, CONTACT_SOURCE_COLORS, VEHICLE_CATS, paymentBadgeClass, sameStaff, canonicalStaff } from "@/lib/constants";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { WarrantyBlock } from "@/components/WarrantyBlock";
import { SVC_ROUNDS } from "@/lib/warranty";
import { CLOSE_SALE_ALERT_DAYS } from "@/lib/dataHealth";
import { parseSvc, nextDue, SVC_SOON_DAYS } from "@/lib/warranty";
import { formatBaht, toIsoDate } from "@/lib/format";
import { hasActiveSession, signOutSupabase, OWNER_EMAILS } from "@/lib/auth";
import { COMMISSION_FIELD, COMMISSION_CATEGORIES, isStackerModel, isOtherGroup, priorPurchaseByCustomer, toGregorian, isClosedSale, closeMonth, warrantyFilled, isForkliftVehicle } from "@/lib/commission";
import { apiEnabled, uploadImageApi } from "@/lib/api";
import AiAssistant from "@/components/AiAssistant";

// ── ตรรกะว่ารถคันไหน "ยังขายได้" (โชว์ให้เซลล์) ──────────────────────────────
// ใช้ blocklist แทน whitelist: ซ่อนเฉพาะรถที่ "ชัดเจนว่าไม่ว่าง" (ขายแล้ว/เช่า/รอรับ/ส่งมอบ)
// ที่เหลือโชว์หมด — กันรถว่างหายจากจอเพราะสถานะพิมพ์ไม่ตรง (ข้อมูลใน DB มีหลายสะกด เช่น
// "ขายแล้ว/ไฟแนนซ์", "ขายแล้วเงินสด", "รถเช่า GR-197") · "รอผ่านไฟแนนซ์" = ยังตามได้ ไม่ซ่อน
// คืนข้อความเหตุผลถ้าถูกซ่อน · คืน null ถ้ายังขายได้
function notSellableReason(status: unknown): string | null {
  const s = (status == null ? "" : String(status)).trim();
  if (s === "") return null; // ไม่มีสถานะ = ให้โชว์ไว้ก่อน (ดีกว่าซ่อนรถจริง)
  // ── สถานะที่ถูกจับจอง/ขายแล้ว → กันสต็อก ไม่ให้เปิดขายซ้ำ (รวม 4 สถานะใหม่) ──
  if (s === "พร้อมขาย") return null; // ขายได้เฉพาะ "พร้อมขาย"
  if (s.includes("ขายแล้ว") || s.includes("ขายเงินสด") || s.includes("ปิดการขาย")) return "ปิดการขายแล้ว";
  if (s.includes("ส่งมอบ") || s.includes("จัดส่งแล้ว")) return "ส่งมอบแล้ว";
  if (s.includes("รอจัดส่ง")) return "รอจัดส่ง";
  if (s.includes("มัดจำ")) return s.includes("ไฟแนนซ์") ? "มัดจำแล้ว/ไฟแนนซ์" : "มัดจำแล้ว";
  if (s.includes("จอง")) return "ติดจอง (รอโอนมัดจำ)";
  if (s.includes("ไฟแนนซ์")) return "มัดจำแล้ว/ไฟแนนซ์";
  if (s.includes("เช่า")) return "เป็นรถเช่า";
  if (s.includes("รอรับ") || s.includes("รอตรวจสอบ") || s.includes("รอยืนยัน") || s.includes("รออนุมัติ")) return "รอรับ (รอตรวจรับเข้าคลัง)";
  if (s.includes("เคลม") || s.includes("รับกลับ")) return "เคลม/รับกลับ";
  return null; // อื่นๆ (เช่น สั่งผลิต) → ขายล่วงหน้าได้ คงพฤติกรรมเดิม
}
const isSellable = (f: { status?: unknown }) => notSellableReason(f?.status) === null;

// แถบความคืบหน้าดีล — 4 สเต็ป: จอง → มัดจำ → รอส่ง/ไฟแนนซ์ → ปิดการขาย (ไฮไลต์สเต็ปปัจจุบันจากสถานะ)
function DealProgress({ status }: { status?: string }) {
  const s = String(status ?? "").trim();
  const STAGES = [
    { label: "จอง", re: /จอง|รอโอน/ },
    { label: "มัดจำ", re: /มัดจำ/ },
    { label: "รอส่ง", re: /รอจัดส่ง|ไฟแนนซ์/ },
    { label: "ปิดการขาย", re: /ปิดการขาย|จัดส่งแล้ว|ส่งมอบ|ขายแล้ว/ },
  ];
  let cur = -1;
  for (let i = STAGES.length - 1; i >= 0; i--) { if (STAGES[i].re.test(s)) { cur = i; break; } }
  const isFinance = /ไฟแนนซ์/.test(s);
  return (
    <div className="flex items-start bg-slate-50 border border-slate-100 rounded-xl px-2 py-2.5">
      {STAGES.map((st, i) => {
        const done = i < cur, active = i === cur;
        const label = i === 2 && isFinance ? "รอไฟแนนซ์" : st.label;
        return (
          <div key={i} className="flex-1 flex flex-col items-center">
            <div className="flex items-center w-full">
              <div className={`h-0.5 flex-1 ${i === 0 ? "invisible" : i <= cur ? "bg-emerald-400" : "bg-slate-200"}`} />
              <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${done ? "bg-emerald-500 text-white" : active ? "bg-indigo-600 text-white ring-2 ring-indigo-200" : "bg-slate-200 text-slate-400"}`}>
                {done ? "✓" : i + 1}
              </div>
              <div className={`h-0.5 flex-1 ${i === STAGES.length - 1 ? "invisible" : i < cur ? "bg-emerald-400" : "bg-slate-200"}`} />
            </div>
            <span className={`mt-1 text-[10px] font-semibold text-center leading-tight ${active ? "text-indigo-700" : done ? "text-emerald-600" : "text-slate-400"}`}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
// จับคู่รูป inspection กับรถ — เทียบทั้ง SN และ id (รถสั่งผลิตแนบรูปตอนยังไม่มี SN จะผูกด้วย id เช่น EPZL260808#1)
const insMatches = (unitNo: unknown, sn?: unknown, id?: unknown) => {
  const u = String(unitNo ?? "").trim().toUpperCase();
  return !!u && (u === String(sn ?? "").trim().toUpperCase() || u === String(id ?? "").trim().toUpperCase());
};

// ข้อมูลลูกค้าเก่า (รวมจากดีลทั้งหมด) — ใช้ autofill + ประวัติ + เริ่มดีลใหม่
type CustEntry = { name: string; tel: string; customer_type: string; province: string; contact_source: string; count: number; lastAt: string; lastCar: string };

// ป้ายเดือนไทยจากคีย์ YYYY-MM → "พ.ค. 2569"
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return `${TH_MONTHS[m - 1]} ${y + 543}`;
};

const emptyCheckout = {
  customer_name: "", customer_tel: "",
  customer_type: "" as CustomerType | "",
  province: "", payment_type: "" as PaymentType | "",
  finance_company: "", actual_sale: "", deposit: "",
  delivery_date: "", payment_received_date: "", remark: "",
  warranty_expiry: "", parts_schedule: "",
  contact_source: "" as ContactSource | "",
  sale_type: "" as SaleType | "",
  bill_note_no: "", // เลขใบวางบิล (เฉพาะลูกค้าเครดิต)
};

type SaleInlineStep = "name" | "type" | "options" | null;

const SALE_FIELD_LABELS: Record<string, string> = {
  saleTypes: "ประเภทการขาย",
  paymentTypes: "ประเภทการชำระ",
  customerTypes: "ประเภทลูกค้า",
  financeCompanies: "บริษัทไฟแนนซ์",
};
type SaleDropdown = "saleTypes" | "paymentTypes" | "customerTypes" | "financeCompanies";

const HISTORY_TABS: { key: SaleStatus | "all"; label: string }[] = [
  { key: "all",                    label: "ทั้งหมด" },
  { key: "จอง/รอโอน",             label: "จอง/รอโอน" },
  { key: "จอง/โอนมัดจำแล้ว",       label: "จอง/มัดจำ" },
  { key: "รอจัดส่ง",               label: "รอจัดส่ง" },
  { key: "รอไฟแนนซ์",             label: "รอไฟแนนซ์" },
  { key: "ปิดการขาย/จัดส่งแล้ว",   label: "ปิด/ส่งแล้ว" },
];
// "จอง/โอนมัดจำแล้ว" รวมดีลเก่าที่ยังเป็น "มัดจำแล้ว" ด้วย (backward compat)
const saleMatchesTab = (st: string, key: string) =>
  key === "จอง/โอนมัดจำแล้ว" ? (st === key || st === "มัดจำแล้ว") : st === key;

// อุปกรณ์เสริมติดตั้ง (Add-On) — ราคาเติมเอง (เฟส 4)
const ADDON_OPTIONS = ["Side Shifter", "Fork Positioner", "Bale Clamp", "Rotator", "Boom", "Carpet Ram", "Paper Roll Clamp", "Brick Clamp", "Hingfork", "Bucket"];

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// รูปพร้อมป้ายกำกับช่อง (Name Plate / เอกสาร PI / รถ 4 มุม) — รูปเก่าไม่มีช่อง = ป้ายว่าง
type LabeledPhoto = { url: string; label: string };
function labeledPhotos(recs: InspectionRecord[]): LabeledPhoto[] {
  return recs.flatMap(r => {
    const urlToLabel = new Map(
      Object.entries(r.image_slots ?? {}).map(([k, v]) => [v as string, SLOT_LABELS[k] ?? k])
    );
    return (r.images ?? []).map(url => ({ url, label: urlToLabel.get(url) ?? "" }));
  });
}

export default function SalesMain() {
  const router = useRouter();
  const {
    forklifts, sales, customers, addSale, updateSale, deleteSale, updateForklift, inspections, fieldConfig, refresh, setActor,
    updateFieldOptions,
    addSaleExtraFieldDef, removeSaleExtraFieldDef, renameSaleExtraFieldDef,
    addSaleExtraFieldOption, removeSaleExtraFieldOption, editSaleExtraFieldOption,
    addSalesFilterRequest, removeSalesFilterRequest,
  } = useApp();

  const [salesUser, setSalesUser] = useState<{ name: string; target_monthly: number; email?: string; role?: string } | null>(null);
  const [viewAllDeals, setViewAllDeals] = useState(false);   // โหมดแอดมิน: ดูดีลของทุกเซลล์
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => { setRefreshing(true); await refresh(); setTimeout(() => setRefreshing(false), 400); };
  const [search, setSearch]       = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest"); // เรียงตามวันที่เข้าสต็อก
  const [viewMode, setViewMode]   = useState<"card" | "table" | "byModel">("card"); // มุมมอง: การ์ด/ตาราง/ตามรุ่น
  const [selected, setSelected]   = useState<Forklift | null>(null);
  const [editingSale, setEditingSale] = useState<Sale | null>(null); // ไม่ null = กำลังแก้ไขดีลเดิม
  const [form, setForm]           = useState(emptyCheckout);
  const [errors, setErrors]       = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [showHistory, setShowHistory]     = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [undoToast, setUndoToast]         = useState<string | null>(null);
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput]     = useState("");
  const [historyTab, setHistoryTab]       = useState<SaleStatus | "all">("all");
  const [dealSearch, setDealSearch]       = useState(""); // ค้นหาในดีลของฉัน (ชื่อลูกค้า/SN/รุ่น)
  const [historyView, setHistoryView]     = useState<"deals" | "customers" | "monthly">("deals"); // ดีลของฉัน / ลูกค้าของฉัน / สรุปรายเดือน
  const [histMonth, setHistMonth]         = useState(""); // เดือนที่เลือกในสรุปรายเดือน (YYYY-MM)
  const [detailSale, setDetailSale]       = useState<Sale | null>(null);
  const [showBooked, setShowBooked]       = useState(false); // โมดัลรายการรถติดจอง (กดจาก stat banner)
  const [cancelBox, setCancelBox]         = useState(false);   // กล่องยกเลิกการจอง
  const [cancelReason, setCancelReason]   = useState("");      // เหตุผลการยกเลิก
  const [addOns, setAddOns]               = useState<{ name: string; price: number }[]>([]); // อุปกรณ์เสริม (เฟส 4)
  const [newAddon, setNewAddon]           = useState({ name: "", price: "" });
  const [freebie, setFreebie]             = useState(false);   // ของแถมเซ็ท 2,800 (เฟส 5)
  const [shippingCost, setShippingCost]   = useState("");      // ค่าขนส่งจากซัพพลายเออร์
  const [shipSupplier, setShipSupplier]   = useState("");      // ผู้ให้บริการขนส่ง (เลือกจาก dropdown)
  const [shipSupplierOther, setShipSupplierOther] = useState(""); // กรณีเลือก "อื่นๆ (ระบุเอง)"
  const [showNotif, setShowNotif]         = useState(true);
  const [detailLightboxIdx, setDetailLightboxIdx] = useState<number | null>(null);

  // Vehicle category tabs (main product separator)
  const [activeCategory, setActiveCategory] = useState<"all" | VehicleType>("all");

  // Test notification demo
  const [testNotifActive, setTestNotifActive] = useState(false);
  // แจ้งเตือนผลอนุมัติจองจากฝ่ายสต็อก (กระดิ่ง)
  const [bookingAcks, setBookingAcks]         = useState<Set<string>>(new Set());
  const [bookingAckReady, setBookingAckReady] = useState(false);
  const [showBookingNotif, setShowBookingNotif] = useState(false);

  // Vehicle type selector in checkout (auto-set from product category)
  const [vehicleType, setVehicleType] = useState<VehicleType>("Forklift");
  const [commCategory, setCommCategory] = useState(""); // หมวดค่าคอม (โฟล์คลิฟท์) — เลือกตอนปิดการขาย
  const [rentCarNo, setRentCarNo]       = useState(""); // รถเช่า: เบอร์รถเช่า
  const [rentBy, setRentBy]             = useState(""); // รถเช่า: ผู้เบิกรถเช่า
  const [custFocus, setCustFocus]       = useState(false); // เฟส 1: โฟกัสช่องชื่อลูกค้า → โชว์รายการลูกค้าเก่า
  const [draftRestored, setDraftRestored] = useState(false); // กู้ข้อมูลฟอร์มที่กรอกค้างไว้ (เด้งออกก่อนบันทึก)
  const [custSearch, setCustSearch]     = useState(""); // เฟส 2: ค้นหาในแท็บลูกค้าของฉัน
  const [pendingCustomer, setPendingCustomer] = useState<CustEntry | null>(null); // เฟส 2: ลูกค้าที่จะเปิดดีลใหม่ (เติมข้อมูลไว้)
  const [showCustHist, setShowCustHist] = useState(true); // เฟส 2: เปิด/ปิดพาเนลประวัติการซื้อในฟอร์ม

  // Custom notification items in checkout
  const [showCustomNotifs, setShowCustomNotifs] = useState(false);
  const [customNotifItems, setCustomNotifItems] = useState<{ label: string; date: string }[]>([]);
  const [newNotifLabel, setNewNotifLabel] = useState("");
  const [newNotifDate, setNewNotifDate] = useState("");

  // Cascade filter
  const [showFilter, setShowFilter] = useState(false);
  const [fBrand, setFBrand]       = useState("");
  const [fModel, setFModel]       = useState("");
  const [fFuel, setFFuel]         = useState("");
  const [fCapacity, setFCapacity] = useState("");
  const [fHeight, setFHeight]     = useState("");
  const [fMast, setFMast]         = useState(""); // กรองความสูงเสา (MAST) — ใช้ตอนคลิกการ์ดตามรุ่น
  const [fStatus, setFStatus]     = useState(""); // กรองสถานะ ("" = ขายได้ทั้งหมด · ระบุ = ทุกสถานะรวมปิดการขาย)
  const [extraFilterVals, setExtraFilterVals] = useState<Record<string, string>>({});
  const [showAddFilter, setShowAddFilter] = useState(false);
  const [newFilterName, setNewFilterName] = useState("");

  // Category-specific spec filters (shown below category tabs)
  const [fSpecModel, setFSpecModel]   = useState("");
  const [fSpecSN, setFSpecSN]         = useState("");
  const [fForkLength, setFForkLength] = useState("");
  const [fForkWidth, setFForkWidth]   = useState("");

  // Checkout custom fields
  const [saleCustomVals, setSaleCustomVals]   = useState<Record<string, string>>({});
  const [lightboxIdx, setLightboxIdx]         = useState<number | null>(null);
  const [paymentProofs, setPaymentProofs]     = useState<string[]>([]); // หลักฐานการชำระ (หลายรูป · URL หลังอัป)
  const [paymentBusy, setPaymentBusy]         = useState(false);        // กำลังย่อ/อัปโหลดรูป
  const paymentInputRef = useRef<HTMLInputElement>(null);

  // อ่านไฟล์เป็น dataURL
  const readAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = ev => ev.target?.result ? resolve(ev.target.result as string) : reject(new Error("read fail"));
      reader.onerror = () => reject(new Error("read fail"));
      reader.readAsDataURL(file);
    });
  // ย่อรูป (ยาวสุด 1000px, jpeg 78%) — ถ้าถอดรหัสรูปไม่ได้ (เช่น HEIC จาก iPhone) ใช้ไฟล์ต้นฉบับแทน (ไม่บล็อกการปิดการขาย)
  const resizeDataUrl = (dataUrl: string): Promise<string> =>
    new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        try {
          const MAX = 1000;
          const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * ratio);
          canvas.height = Math.round(img.height * ratio);
          canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.78));
        } catch { resolve(dataUrl); }
      };
      img.onerror = () => resolve(dataUrl); // ถอดรหัสไม่ได้ → ส่งต้นฉบับไปเลย
      img.src = dataUrl;
    });
  // แนบหลายรูป: ย่อ → อัปขึ้น Drive ทันที (เก็บ URL ให้ row เบา ปิดการขายชัวร์) · อัปไม่ได้เก็บ base64 ไว้ก่อน
  const handlePaymentProof = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []); e.target.value = "";
    if (!files.length) return;
    setPaymentBusy(true);
    try {
      for (const file of files) {
        let val = "";
        try {
          const resized = await resizeDataUrl(await readAsDataUrl(file));
          if (apiEnabled) {
            try {
              const mime = /^data:(.*?);base64,/.exec(resized)?.[1] || "image/jpeg";
              val = (await uploadImageApi(resized, mime, `payment_${Date.now()}_${file.name}`)).url;
            } catch { val = resized; } // อัปไม่ได้ → เก็บ base64 (AppContext จะอัปให้ตอนบันทึก)
          } else { val = resized; }
        } catch { continue; } // อ่านไฟล์ไม่ได้ → ข้ามรูปนี้
        if (val) setPaymentProofs(prev => [...prev, val]);
      }
    } finally { setPaymentBusy(false); }
  };

  // ── Settings modal state ───────────────────────────────────────────────────
  const [showSettings, setShowSettings]         = useState(false);
  const [editingSaleField, setEditingSaleField] = useState<SaleDropdown | null>(null);
  const [sNewOpt, setSNewOpt]                   = useState("");
  const [sEditOpt, setSEditOpt]                 = useState<{ idx: number; val: string } | null>(null);
  const [expandedSefId, setExpandedSefId] = useState<string | null>(null);
  const [editingSefId, setEditingSefId]   = useState<string | null>(null);
  const [editingSefVal, setEditingSefVal] = useState("");
  const [sefNewOpt, setSefNewOpt]         = useState("");
  const [sefEditOpt, setSefEditOpt]       = useState<{ idx: number; val: string } | null>(null);
  const [sefStep, setSefStep]         = useState<SaleInlineStep>(null);
  const [sefName, setSefName]         = useState("");
  const [sefType, setSefType]         = useState<"text" | "select">("text");
  const [sefOptions, setSefOptions]   = useState<string[]>([]);
  const [sefOptInput, setSefOptInput] = useState("");

  useEffect(() => {
    const u = localStorage.getItem("sales_user");
    if (!u) { router.push("/sales/login"); return; }
    const su = JSON.parse(u); setSalesUser(su); setActor(`${su.name} (เซลล์)`);
    // มีข้อมูลค้างแต่ session Supabase หมดอายุ/ไม่มี → บังคับล็อกอินใหม่ (กันเซฟไม่เข้าแบบเงียบๆ)
    (async () => {
      if (apiEnabled && !(await hasActiveSession())) {
        localStorage.removeItem("sales_user");
        router.push("/sales/login");
      }
    })();
  }, [router]);

  // อ่านค่าความสูงเสา (MAST) จาก custom_fields อย่างปลอดภัย
  const mastOf = (f: typeof forklifts[number]) => String((f.custom_fields as Record<string, unknown> | undefined)?.["MAST"] ?? "").trim();

  const available = forklifts.filter(isSellable);
  const readyCount = available.filter(f => String(f.status).trim() === "พร้อมขาย").length;
  // รถติดจอง = ขายได้แต่ยังไม่ใช่ "พร้อมขาย" (จอง/มัดจำ/รอไฟแนนซ์) — โชว์ทีละยอดในโมดัล
  const bookedCars = available.filter(f => String(f.status).trim() !== "พร้อมขาย");
  const latestSaleFor = (fid: string) => [...sales].filter(s => s.forklift_id === fid)
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];
  // ฐานรายการ: ปกติ = รถขายได้ · เลือกสถานะ = ทุกสถานะที่ตรง · "รับมาล่าสุด" = รถขายได้ (เรียงวันรับทีหลัง)
  const listBase   = (fStatus && fStatus !== "__recent__") ? forklifts.filter(f => String(f.status).trim() === fStatus) : available;
  const brands     = [...new Set(forklifts.map(f => f.brand).filter(Boolean))].sort(); // ทุกยี่ห้อในระบบ (CNC ฯลฯ)
  // ตัวกรองสถานะ = ชุดเดียวกับหน้าสต็อก (จาก fieldConfig.stockStatuses + สถานะที่มีในข้อมูล)
  const statuses   = [...new Set([...fieldConfig.stockStatuses, ...forklifts.map(f => String(f.status).trim()).filter(Boolean)])];
  const models     = [...new Set(listBase.filter(f => !fBrand || f.brand === fBrand).map(f => f.model).filter(Boolean))].sort();
  const fuels      = [...new Set(forklifts.map(f => f.fuel).filter(Boolean))].sort();
  const masts      = [...new Set(listBase.filter(f => (!fBrand || f.brand === fBrand) && (!fModel || f.model === fModel)).map(mastOf).filter(Boolean))].sort();
  const capacities = [...new Set(listBase.filter(f => (!fBrand || f.brand === fBrand) && (!fModel || f.model === fModel)).map(f => f.capacity).filter(Boolean))].sort();
  const heights    = [...new Set(listBase.filter(f => (!fBrand || f.brand === fBrand) && (!fModel || f.model === fModel)).map(f => f.height).filter(Boolean))].sort();
  const hasFilter  = !!(fBrand || fModel || fMast || fFuel || fStatus || fCapacity || fHeight || search || fSpecModel || fSpecSN || fForkLength || fForkWidth);

  // แปลงค่าใดๆ เป็น string ตัวพิมพ์เล็กอย่างปลอดภัย (กัน .toLowerCase บน undefined → จอเด้ง)
  const hay = (v: unknown) => (v == null ? "" : String(v)).toLowerCase();

  // แปลงความสูงเป็น "เมตร" — รับได้ทั้ง "4" (เมตร) และ "3000 MM" (มม.) · รหัสเสา (M400) ไม่เดา ให้สต๊อกกรอกจริง
  const toMeters = (v: unknown): number | null => {
    const s = (v == null ? "" : String(v)).trim().toLowerCase();
    const m = s.match(/^([0-9]+(?:\.[0-9]+)?)\s*(mm|ม)?/);
    if (!m || !m[1]) return null;
    let n = Number(m[1]);
    if (!isFinite(n) || n <= 0) return null;
    if (m[2] === "mm" || n > 100) n = n / 1000; // ตัวเลขใหญ่ = มม.
    return n;
  };

  const filtered = listBase.filter(f => {
    const q = search.trim().toLowerCase();
    const base =
      (!q || hay(f.id).includes(q) || hay(f.SN).includes(q) || hay(f.brand).includes(q) || hay(f.model).includes(q)) &&
      (!fBrand    || f.brand === fBrand) &&
      (!fModel    || f.model === fModel) &&
      (!fMast     || mastOf(f) === fMast) &&
      (!fFuel     || hay(f.fuel) === fFuel.toLowerCase()) &&
      (!fCapacity || Number(f.capacity_kg) === Number(fCapacity)) &&
      (!fHeight   || toMeters(f.height) === Number(fHeight));
    const cat = activeCategory === "all" || (f.vehicle_category ?? "Forklift") === activeCategory;
    const spec =
      (!fSpecModel  || hay(f.model).includes(fSpecModel.toLowerCase())) &&
      (!fSpecSN     || hay(f.SN).includes(fSpecSN.toLowerCase())) &&
      (!fForkLength || hay(f.fork_length).includes(fForkLength.toLowerCase())) &&
      (!fForkWidth  || hay([f.fork_length, f.attachments, JSON.stringify(f.custom_fields ?? {})].join(" ")).includes(fForkWidth.toLowerCase()));
    return base && cat && spec;
  });

  // เรียง: "รับมาล่าสุด" = ตามวันรับรถ (received_date) ใหม่สุดก่อน · ปกติ = วันเข้าสต็อก (created_at) ล่าสุด/เก่าสุด
  const sorted = [...filtered].sort((a, b) => {
    if (fStatus === "__recent__") {
      const ra = String(a.received_date || ""), rb = String(b.received_date || "");
      if (ra && rb) return rb.localeCompare(ra);   // มีวันรับทั้งคู่ → ใหม่สุดก่อน
      if (ra !== rb) return ra ? -1 : 1;            // คันที่มีวันรับมาก่อนคันที่ไม่มี
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    }
    const ta = String(a.created_at || ""), tb = String(b.created_at || "");
    const cmp = ta < tb ? -1 : ta > tb ? 1 : 0;
    return sortOrder === "newest" ? -cmp : cmp;
  });

  // ── เฟส B: สรุปคงเหลือตามรุ่น (จากรายการที่กรองแล้ว) — เห็นว่ารุ่นไหนเหลือเยอะ/ใกล้หมด ──
  const byModel = useMemo(() => {
    const m = new Map<string, { brand: string; model: string; mast: string; ready: number; capacity: string; fuel: string }>();
    // นับเฉพาะรถ "พร้อมขาย" จริง (พร้อมปิดการขายได้) — ไม่รวมจอง/ขายแล้ว/สั่งผลิต
    sorted.filter((f) => String(f.status).trim() === "พร้อมขาย").forEach((f) => {
      const mast = String((f.custom_fields as Record<string, unknown> | undefined)?.["MAST"] ?? "").trim();
      const key = `${f.brand}|${f.model}|${mast}`;
      const g = m.get(key) ?? { brand: f.brand, model: f.model, mast, ready: 0, capacity: f.capacity || (f.capacity_kg ? `${f.capacity_kg} kg` : ""), fuel: f.fuel || "" };
      g.ready++;
      m.set(key, g);
    });
    return [...m.values()].sort((a, b) => b.ready - a.ready);
  }, [sorted]);

  // ── FIFO: หาคัน "เข้าคลังก่อนสุด" ในแต่ละกลุ่ม (ยี่ห้อ|รุ่น|เสา) ที่ยังพร้อมขาย = ควรขายก่อน ──
  // อิงวันรับรถ (received_date) · ไม่มีวันรับรถ = ถือว่าใหม่สุด (ต่อท้าย)
  const fifoKeyOf = (f: Forklift) => `${f.brand}|${f.model}|${String((f.custom_fields as Record<string, unknown> | undefined)?.["MAST"] ?? "").trim()}`;
  const fifoOldestByKey = useMemo(() => {
    const acc = new Map<string, { f: Forklift; dkey: string }>();
    forklifts.filter((f) => String(f.status).trim() === "พร้อมขาย").forEach((f) => {
      const key = fifoKeyOf(f);
      const dkey = String(f.received_date || "").slice(0, 10) || "9999-99-99"; // ไม่มีวันรับ → ใหม่สุด
      const cur = acc.get(key);
      if (!cur || dkey < cur.dkey) acc.set(key, { f, dkey });
    });
    const m = new Map<string, Forklift>();
    acc.forEach((v, k) => m.set(k, v.f));
    return m;
  }, [forklifts]);
  const fifoOldestIds = useMemo(() => new Set([...fifoOldestByKey.values()].map((f) => f.id)), [fifoOldestByKey]);

  // จำนวนวันที่รถค้างสต็อก (นับจากวันรับรถถึงวันนี้) — null ถ้าไม่มีวันรับรถ
  const daysInStock = (f: Forklift): number | null => {
    // ⭐ (25 ก.ย. 2569) วันรับรถบางคันเก็บเป็นข้อความไทย "5 ก.ย. 2569" ไม่ใช่ ISO (เจอจริง 66 คัน)
    //    เดิมเช็ครูปแบบ ISO ตรงๆ → คืน null ทั้งที่มีวันรับรถ รถ 31 คันจึงหายจากรายงานค้างสต็อก
    //    toIsoDate() อ่านได้ทั้ง ISO · 18/09/2569 · "5 ก.ย. 2569" และแปลง พ.ศ. → ค.ศ. ให้ด้วย
    const d = toIsoDate(f.received_date);
    if (!d) return null;
    const ms = Date.now() - new Date(d + "T00:00:00").getTime();
    return ms > 0 ? Math.floor(ms / 86400000) : 0;
  };

  // ── งาน 4: ถ้าค้นด้วยรหัส/SN แล้วไม่เจอในรายการขาย แต่รถมีอยู่จริง (สถานะขายแล้ว/เช่า ฯลฯ)
  //    → บอกเซลล์ว่าเจอรถแต่ถูกซ่อนเพราะอะไร (กันเข้าใจผิดว่า "ข้อมูลหาย") ──
  const searchHiddenHit = (() => {
    const q = search.trim().toLowerCase();
    if (!q || sorted.length > 0) return null;
    const hit = forklifts.find(f =>
      (hay(f.id) === q || hay(f.SN) === q || hay(f.id).includes(q) || hay(f.SN).includes(q)) &&
      notSellableReason(f.status) !== null
    );
    return hit ? { f: hit, reason: notSellableReason(hit.status)! } : null;
  })();

  const clearFilters = () => {
    setFBrand(""); setFModel(""); setFMast(""); setFFuel(""); setFStatus(""); setFCapacity(""); setFHeight("");
    setSearch(""); setExtraFilterVals({});
    setFSpecModel(""); setFSpecSN(""); setFForkLength(""); setFForkWidth("");
  };
  // จับคู่ดีลของฉันแบบ alias-aware (ล็อกอินคนละชื่อกับที่บันทึกดีลก็ยังเจอ เช่น เซลล์ดรีม = ธัญญา (ดรีม)) · alias แก้ได้ที่หน้าค่าคอม
  // ── สิทธิ์แอดมิน (เจ้าของระบบ) — ดูดีลของทุกเซลล์ได้ ──
  // (24 ก.ย. 2569) เดิมหน้านี้กรองเฉพาะ "ดีลของฉัน" แอดมินจึงเปิดดีลของเซลล์คนอื่นไม่ได้
  // ทำให้ตามแก้ข้อมูล (เช่น เติมข้อมูลรับประกันที่ค้าง) แทนทีมไม่ได้เลย
  const myEmail = String(salesUser?.email ?? "").trim().toLowerCase();
  const isAdminUser = !!myEmail && (
    OWNER_EMAILS.some(e => e.trim().toLowerCase() === myEmail)          // เจ้าของระบบ — เห็นได้เสมอ
    || (fieldConfig.adminEmails ?? []).some(e => String(e).trim().toLowerCase() === myEmail)
    || String(fieldConfig.knownUsers?.[myEmail]?.role ?? "") === "admin"
  );
  const seeAll = isAdminUser && viewAllDeals;
  const mySales = seeAll ? sales : (salesUser ? sales.filter(s => sameStaff(s.sales_staff, salesUser.name, fieldConfig.staffAliases)) : []);

  // ── รถถึงคลังแล้วแต่ดีลยังไม่ปิด — เตือนให้ฝ่ายขายกดปิดการขายให้จบ ──
  const toCloseDeals = useMemo(() => {
    const now = Date.now();
    return mySales.flatMap(s => {
      if (isClosedSale(s)) return [];
      const key = (v: unknown) => String(v ?? "").trim().toUpperCase();
      const f = forklifts.find(x => key(x.id) === key(s.forklift_id) || (x.SN && key(x.SN) === key(s.forklift_unit_no)));
      if (!f) return [];
      const iso = toIsoDate(f.received_date);
      if (!iso) return [];
      const days = Math.floor((now - new Date(iso + "T00:00:00").getTime()) / 86400000);
      return days >= CLOSE_SALE_ALERT_DAYS ? [{ s, f, days }] : [];
    }).sort((a, b) => b.days - a.days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mySales, forklifts]);

  // ── ดีลที่ปิดแล้วแต่ยังไม่ลงข้อมูลรับประกัน → ค่าคอมยังไม่ออก (บังคับตั้งแต่ ส.ค. 69) ──
  const WARRANTY_GATE_FROM = "2026-08";
  const blockedDeals = useMemo(() => mySales.filter(s => {
    if (!isClosedSale(s) || closeMonth(s) < WARRANTY_GATE_FROM) return false;
    const fk = forklifts.find(f => f.id === s.forklift_id);
    return !warrantyFilled(fk);
  }), [mySales, forklifts]);
  const [warnDismissed, setWarnDismissed] = useState(false);
  const showWarnPopup = !warnDismissed && blockedDeals.length > 0;

  // ส่งออกรายงานการขายของเซลล์คนนี้เป็นไฟล์ Excel (.xlsx) — โหลด xlsx ตอนกดเท่านั้น
  const exportMySalesExcel = async () => {
    if (mySales.length === 0) return;
    const XLSX = await import("xlsx");
    const rows = mySales.map(s => ({
      "วันที่": s.created_at ?? "",
      "สถานะ": s.sale_status ?? "ขายแล้ว",
      "SN": s.forklift_unit_no ?? "",
      "ยี่ห้อ/รุ่น": `${s.forklift_brand ?? ""} ${s.forklift_model ?? ""}`.trim(),
      "ลูกค้า": s.customer_name ?? "",
      "เบอร์โทร": s.customer_tel ?? "",
      "จังหวัด": s.province ?? "",
      "ประเภทลูกค้า": s.customer_type ?? "",
      "การชำระ": s.payment_type ?? "",
      "บริษัทไฟแนนซ์": s.finance_company ?? "",
      "ราคาขาย": Number(s.actual_sale) || 0,
      "มัดจำ": Number(s.deposit) || 0,
      "อุปกรณ์เสริม": (s.add_ons ?? []).map(a => `${a.name} (${Number(a.price).toLocaleString()})`).join(", "),
      "มูลค่าอุปกรณ์เสริม": (s.add_ons ?? []).reduce((t, a) => t + (Number(a.price) || 0), 0),
      "ของแถม": s.freebie ? "มี" : "",
      "ค่าขนส่ง": Number(s.shipping_cost) || 0,
      "วันส่งมอบ": s.delivery_date ?? "",
      "หมายเหตุ": s.remark ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [10, 16, 14, 20, 18, 12, 10, 12, 12, 14, 12, 10, 24, 14, 8, 10, 12, 20].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "การขาย");
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `รายงานการขาย_${salesUser?.name ?? "เซลล์"}_${stamp}.xlsx`);
  };

  // ลูกค้าของฉัน — รวมดีลตามลูกค้า (ชื่อ+เบอร์) เห็นว่าลูกค้าแต่ละคนซื้ออะไรบ้าง
  const myCustomers = useMemo(() => {
    const m = new Map<string, { name: string; tel: string; province: string; deals: Sale[] }>();
    mySales.forEach(s => {
      const key = `${s.customer_name}|${s.customer_tel}`;
      const g = m.get(key) ?? { name: s.customer_name || "ไม่ระบุชื่อ", tel: s.customer_tel || "", province: s.province || "", deals: [] };
      g.deals.push(s);
      m.set(key, g);
    });
    return [...m.values()].sort((a, b) => b.deals.length - a.deals.length);
  }, [mySales]);

  // เฟส 2: ค้นหาในแท็บลูกค้าของฉัน (ชื่อ/เบอร์/จังหวัด)
  const myCustomersFiltered = useMemo(() => {
    const q = custSearch.trim().toLowerCase();
    if (!q) return myCustomers;
    return myCustomers.filter(c => c.name.toLowerCase().includes(q) || (c.tel || "").toLowerCase().includes(q) || (c.province || "").toLowerCase().includes(q));
  }, [myCustomers, custSearch]);

  // ── สรุปยอดขายของฉันรายเดือน (แดชบอร์ดตามรูป) — เดือน → ยอดรวม + กราฟรายสัปดาห์ + รายการต่อสัปดาห์ ──
  const monthKeyOf = (s: Sale) => String(s.created_at || "").slice(0, 7); // YYYY-MM
  const myMonths = useMemo(() => {
    const set = new Set<string>();
    mySales.forEach(s => { const k = monthKeyOf(s); if (k.length === 7) set.add(k); });
    return [...set].sort((a, b) => b.localeCompare(a)); // ใหม่สุดก่อน
  }, [mySales]);
  // ตั้งเดือนเริ่มต้น = เดือนล่าสุดที่มีการขาย
  useEffect(() => { if (!histMonth && myMonths.length) setHistMonth(myMonths[0]); }, [myMonths, histMonth]);
  const monthly = useMemo(() => {
    if (!histMonth) return null;
    const deals = mySales.filter(s => monthKeyOf(s) === histMonth)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const revenue = deals.reduce((a, s) => a + (Number(s.actual_sale) || 0), 0);
    // แบ่งสัปดาห์ตามวันในเดือน (1-7 = สัปดาห์ 1, 8-14 = สัปดาห์ 2, ...)
    const weeks: { deals: Sale[]; total: number }[] = [];
    deals.forEach(s => {
      const day = Number(String(s.created_at).slice(8, 10)) || 1;
      const w = Math.min(Math.ceil(day / 7), 5) - 1;
      if (!weeks[w]) weeks[w] = { deals: [], total: 0 };
      weeks[w].deals.push(s); weeks[w].total += Number(s.actual_sale) || 0;
    });
    const nWeeks = Math.max(4, weeks.length);
    const wk = Array.from({ length: nWeeks }, (_, i) => weeks[i] ?? { deals: [], total: 0 });
    return { deals, revenue, count: deals.length, weeks: wk };
  }, [histMonth, mySales]);

  // Notifications — sales with warranty/parts approaching
  const notifications = useMemo(() => {
    const result: { sale: Sale; type: "warranty" | "parts" | "custom" | "service"; days: number; label?: string }[] = [];
    mySales.forEach(s => {
      if (s.warranty_expiry) {
        const d = daysUntil(s.warranty_expiry);
        if (d != null && d >= 0 && d <= 7) result.push({ sale: s, type: "warranty", days: d });
      }
      if (s.parts_schedule) {
        const d = daysUntil(s.parts_schedule);
        if (d != null && d >= 0 && d <= 7) result.push({ sale: s, type: "parts", days: d });
      }
      (s.custom_notifications ?? []).forEach(n => {
        const d = daysUntil(n.date);
        if (d != null && d >= 0 && d <= 7) result.push({ sale: s, type: "custom", days: d, label: n.label });
      });
      // รอบเช็ครับประกัน (บริการหลังการขาย) — เฉพาะโฟล์คลิฟท์ · รถอื่น (แฮนด์ลิฟท์/สแตกเกอร์) ไม่มีรอบเซอร์วิส
      const fk = forklifts.find(f => f.id === s.forklift_id);
      const svc = fk && isForkliftVehicle(fk.brand, fk.model) ? parseSvc(fk) : undefined;
      const nd = svc ? nextDue(svc) : undefined;
      if (nd?.due) {
        const d = daysUntil(nd.due);
        if (d != null && d <= SVC_SOON_DAYS) result.push({ sale: s, type: "service", days: d, label: `รอบเช็คที่ ${nd.index + 1}` });
      }
    });
    if (testNotifActive) {
      result.unshift({
        sale: { id: "__test__", forklift_unit_no: "TEST-001", customer_name: "ลูกค้าทดสอบ" } as Sale,
        type: "warranty", days: 3, label: "การแจ้งเตือนทดสอบ",
      });
    }
    return result;
  }, [mySales, testNotifActive, forklifts]);

  // ── แจ้งเตือนผลอนุมัติจอง — ครั้งแรกตั้ง baseline (ผลเก่าถือว่ารับทราบแล้ว กันสแปม) ──
  useEffect(() => {
    if (bookingAckReady) return;
    const raw = localStorage.getItem("sales_booking_acks");
    if (raw) { setBookingAcks(new Set(JSON.parse(raw) as string[])); setBookingAckReady(true); return; }
    if (sales.length === 0) return;
    const decided = sales.filter(s => ["อนุมัติแล้ว", "ปฏิเสธ"].includes(String(s.custom_fields?.[STOCK_APPROVAL_FIELD] ?? ""))).map(s => s.id);
    localStorage.setItem("sales_booking_acks", JSON.stringify(decided));
    setBookingAcks(new Set(decided)); setBookingAckReady(true);
  }, [sales, bookingAckReady]);
  // จองของฉันที่สต็อก "อนุมัติแล้ว/ปฏิเสธ" แต่ยังไม่รับทราบ
  const bookingNotifs = useMemo(() => {
    if (!bookingAckReady || !salesUser) return [] as Sale[];
    return mySales.filter(s => {
      const a = String(s.custom_fields?.[STOCK_APPROVAL_FIELD] ?? "");
      return (a === "อนุมัติแล้ว" || a === "ปฏิเสธ") && !bookingAcks.has(s.id);
    });
  }, [mySales, bookingAcks, bookingAckReady, salesUser]);
  const ackBooking = (id: string) => setBookingAcks(prev => {
    const n = new Set(prev); n.add(id); localStorage.setItem("sales_booking_acks", JSON.stringify([...n])); return n;
  });
  const ackAllBookings = () => setBookingAcks(prev => {
    const n = new Set(prev); bookingNotifs.forEach(s => n.add(s.id)); localStorage.setItem("sales_booking_acks", JSON.stringify([...n])); return n;
  });

  const detailInspPhotos = useMemo(() => {
    if (!detailSale) return { receiver: [] as LabeledPhoto[], deliverer: [] as LabeledPhoto[], all: [] as LabeledPhoto[], receiverNames: "", delivererNames: "" };
    const recs = inspections.filter(r => insMatches(r.unit_no, detailSale.forklift_unit_no, detailSale.forklift_id));
    const recvRecs = recs.filter(r => r.role === "ผู้รับรถ" || !r.role);
    const delivRecs = recs.filter(r => r.role === "ผู้ส่งมอบรถ");
    const receiver  = labeledPhotos(recvRecs);
    const deliverer = labeledPhotos(delivRecs);
    const names = (rs: typeof recs) => [...new Set(rs.map(r => r.transporter_name).filter(Boolean))].join(", ");
    return { receiver, deliverer, all: [...receiver, ...deliverer], receiverNames: names(recvRecs), delivererNames: names(delivRecs) };
  }, [detailSale, inspections]);

  // ตรวจฟอร์มตามสถานะ — บางสถานะยังไม่ต้องมีสลิป/วันส่งมอบ (เช่น รอไฟแนนซ์ ยังไม่จ่าย)
  const validate = (status: SaleStatus) => {
    const e: Record<string, string> = {};
    if (!String(salesUser?.name ?? "").trim())
      e.staff = "ไม่พบชื่อเซลล์ผู้บันทึก — ออกจากระบบแล้วเข้าใหม่ก่อนบันทึก (ดีลต้องมีชื่อเจ้าของงานเสมอ)";
    if (!form.customer_name.trim()) e.customer_name = "กรุณากรอกชื่อลูกค้า";
    if (!form.customer_tel.trim()) e.customer_tel = "กรุณากรอกเบอร์โทร";
    if (!form.customer_type) e.customer_type = "กรุณาเลือกประเภทลูกค้า";
    if (!form.province) e.province = "กรุณาเลือกจังหวัด";
    if (!form.payment_type) e.payment_type = "กรุณาเลือกประเภทการชำระ";
    if (form.payment_type === "ไฟแนนซ์" && !form.finance_company) e.finance_company = "กรุณาเลือกบริษัทไฟแนนซ์";
    if (!form.actual_sale || isNaN(Number(form.actual_sale))) e.actual_sale = "กรุณากรอกราคาขาย";
    // วันส่งมอบ + สลิป: บังคับเฉพาะตอนเงินเข้าแล้ว · "จอง/โอนมัดจำแล้ว"+มัดจำเก่าต้องมีสลิป · "จอง/รอโอน"+รอไฟแนนซ์ ยังไม่ต้อง (จองได้เลย)
    const needDelivery = status === "ปิดการขาย/จัดส่งแล้ว" || status === "รอจัดส่ง";
    // ลูกค้าเครดิต: ไม่ต้องแนบสลิป — จบแค่กรอกเลขใบวางบิล
    const isCredit = form.payment_type === "เครดิต";
    const needProof    = !isCredit && (status === "ปิดการขาย/จัดส่งแล้ว" || status === "รอจัดส่ง" || status === "จอง/โอนมัดจำแล้ว" || status === "มัดจำแล้ว");
    if (needDelivery && !form.delivery_date) e.delivery_date = "กรุณาระบุวันส่งมอบ";
    if (needProof && paymentProofs.length === 0) e.payment_proof = "กรุณาแนบรูปหลักฐานการชำระเงิน (บังคับ)";
    if (isCredit && !form.bill_note_no.trim()) e.bill_note_no = "กรุณากรอกเลขใบวางบิล";
    // ⭐ ปิดการขาย/จัดส่งแล้ว = รถถึงมือลูกค้า → ต้องลงข้อมูลรับประกัน + รอบเช็คให้ครบก่อน
    //    (ไม่บังคับตอนจอง/รอโอน/รอไฟแนนซ์ เพราะยังไม่ส่งมอบ ยังไม่รู้วันเริ่มประกัน)
    if (status === "ปิดการขาย/จัดส่งแล้ว" && needWarranty && !warrantyFilled(selected!))
      e.warranty = "กรุณากรอก \"บริการหลังการขาย / รับประกัน\" (วันเริ่มประกัน + เงื่อนไข) แล้วกดบันทึกในกล่องนั้นก่อน";
    return e;
  };

  // เคลียร์ error ทันทีเมื่อกรอกช่องนั้นครบ (เดิม error ค้างจนกดปิดการขายใหม่ เช่น วันส่งมอบกรอกแล้วยังแดง)
  useEffect(() => {
    setErrors(prev => {
      if (!Object.keys(prev).length) return prev;
      const next = { ...prev }; let changed = false;
      const clear = (k: string, ok: boolean) => { if (ok && next[k]) { delete next[k]; changed = true; } };
      clear("customer_name", !!form.customer_name.trim());
      clear("customer_tel", !!form.customer_tel.trim());
      clear("customer_type", !!form.customer_type);
      clear("province", !!form.province);
      clear("payment_type", !!form.payment_type);
      clear("finance_company", !!form.finance_company);
      clear("actual_sale", !!String(form.actual_sale).trim());
      clear("delivery_date", !!form.delivery_date);
      clear("bill_note_no", !!form.bill_note_no.trim());
      clear("payment_proof", paymentProofs.length > 0);
      clear("warranty", !needWarranty || warrantyFilled(selected!));
      return changed ? next : prev;
    });
  }, [form, paymentProofs]);

  // ตรวจ "ลูกค้าเก่า" อัตโนมัติจากประวัติซื้อทั้งหมด (ชื่อ/เบอร์ตรงกัน ไม่ว่าเซลล์ไหน/บิลแบบไหน)
  const custReturning = useMemo(() => {
    const nm = form.customer_name.trim(), tel = form.customer_tel.trim();
    if (!nm && !tel) return 0;
    const pool = editingSale ? sales.filter(s => s.id !== editingSale.id) : sales;
    return priorPurchaseByCustomer(nm, tel, pool);
  }, [form.customer_name, form.customer_tel, sales, editingSale]);

  // ── ทะเบียนลูกค้า (เฟส 1): รวมข้อมูลลูกค้าจากดีลเก่าทุกใบ → เลือกเติมอัตโนมัติ ──
  // ไม่ต้องมีตารางใหม่ — ดึงจาก sales ที่มีอยู่ · ค่าล่าสุด (created_at ใหม่สุด) ชนะ · เติมช่องว่างจากดีลเก่ากว่า
  const customerDirectory = useMemo(() => {
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
    const m = new Map<string, CustEntry>();
    for (const s of sales) {
      const nm = (s.customer_name || "").trim();
      if (!nm) continue;
      const key = norm(nm);
      const at = String(s.created_at || "");
      const car = `${s.forklift_brand || ""} ${s.forklift_model || ""}`.trim();
      const g = m.get(key);
      if (!g) {
        m.set(key, { name: nm, tel: s.customer_tel || "", customer_type: s.customer_type || "", province: s.province || "", contact_source: s.contact_source || "", count: 1, lastAt: at, lastCar: car });
      } else {
        g.count++;
        if (at.localeCompare(g.lastAt) >= 0) { // ดีลใหม่กว่า → อัปเดตค่าหลัก + ชื่อ/รถล่าสุด
          g.lastAt = at; g.name = nm; g.lastCar = car;
          if (s.customer_tel) g.tel = s.customer_tel;
          if (s.customer_type) g.customer_type = s.customer_type;
          if (s.province) g.province = s.province;
          if (s.contact_source) g.contact_source = s.contact_source;
        } else { // ดีลเก่ากว่า → เติมเฉพาะช่องที่ยังว่าง
          if (!g.tel && s.customer_tel) g.tel = s.customer_tel;
          if (!g.customer_type && s.customer_type) g.customer_type = s.customer_type;
          if (!g.province && s.province) g.province = s.province;
          if (!g.contact_source && s.contact_source) g.contact_source = s.contact_source;
        }
      }
    }
    // เฟส 3: รวมทะเบียนลูกค้าจริง (แหล่งกลาง) — ค่าที่แก้ในทะเบียนชนะ + ลูกค้าใหม่ที่ยังไม่มีดีลก็เลือกได้
    for (const c of customers) {
      const nm = (c.name || "").trim();
      if (!nm) continue;
      const key = norm(nm);
      const g = m.get(key);
      if (g) {
        g.name = nm;
        if (c.tel) g.tel = c.tel;
        if (c.customer_type) g.customer_type = c.customer_type;
        if (c.province) g.province = c.province;
      } else {
        m.set(key, { name: nm, tel: c.tel || "", customer_type: c.customer_type || "", province: c.province || "", contact_source: "", count: 0, lastAt: "", lastCar: "" });
      }
    }
    return [...m.values()];
  }, [sales, customers]);

  // รายการลูกค้าเก่าที่ชื่อตรงกับที่กำลังพิมพ์ (โชว์เป็นดรอปดาวน์)
  const custMatches = useMemo(() => {
    const q = form.customer_name.trim().toLowerCase();
    if (q.length < 2) return [] as CustEntry[];
    const list = customerDirectory
      .filter(c => c.name.toLowerCase().includes(q))
      .sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt))
      .slice(0, 8);
    // พิมพ์ตรงเป๊ะกับรายการเดียว = เลือกแล้ว ไม่ต้องโชว์
    if (list.length === 1 && list[0].name.trim().toLowerCase() === q) return [];
    return list;
  }, [form.customer_name, customerDirectory]);

  // กดเลือกลูกค้าเก่า → เติมข้อมูลระบุตัวตน (ไม่แตะราคา/การชำระ ซึ่งเปลี่ยนได้ทุกครั้ง)
  const applyCustomer = (c: CustEntry) => {
    setForm(f => ({
      ...f,
      customer_name: c.name,
      customer_tel: c.tel || f.customer_tel,
      customer_type: (c.customer_type || f.customer_type) as CustomerType | "",
      province: c.province || f.province,
      contact_source: (c.contact_source || f.contact_source) as ContactSource | "",
    }));
    setCustFocus(false);
  };

  // เฟส 2: ประวัติการซื้อของลูกค้าที่กำลังกรอก (ชื่อ/เบอร์ตรงกัน ทุกเซลล์) → โชว์พาเนลระหว่างปิดการขาย
  const custHistory = useMemo(() => {
    const nm = form.customer_name.trim().toLowerCase();
    const tel = form.customer_tel.trim();
    if (nm.length < 2 && !tel) return [] as Sale[];
    const pool = editingSale ? sales.filter(s => s.id !== editingSale.id) : sales;
    return pool
      .filter(s => {
        const n = (s.customer_name || "").trim().toLowerCase();
        return (nm.length >= 2 && n === nm) || (tel && (s.customer_tel || "").trim() === tel);
      })
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }, [form.customer_name, form.customer_tel, sales, editingSale]);

  // เฟส 2: เริ่มดีลใหม่ให้ลูกค้าเก่า — เก็บข้อมูลลูกค้าไว้ แล้วปิดโมดัลให้ไปเลือกรถ (openCheckout จะเติมให้)
  const sellToCustomer = (name: string, tel: string) => {
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
    const entry = customerDirectory.find(c => norm(c.name) === norm(name))
      ?? { name, tel, customer_type: "", province: "", contact_source: "", count: 0, lastAt: "", lastCar: "" };
    setPendingCustomer(entry);
    setShowHistory(false);
    setUndoToast(`เลือกรถที่จะขายให้ “${name}” — ข้อมูลลูกค้าเติมให้แล้ว`);
    setTimeout(() => setUndoToast(null), 4000);
  };

  const buildSale = (status: SaleStatus): Sale => {
    const customFields: Record<string, string> = {};
    fieldConfig.saleExtraFieldDefs.forEach(def => {
      if (saleCustomVals[def.id]?.trim()) customFields[def.name] = saleCustomVals[def.id].trim();
    });
    // หมวดค่าคอม (เฉพาะโฟล์คลิฟท์) — ลูกค้าเก่า(จากประวัติ)บังคับอัตโนมัติ · สแตกเกอร์/รถกลุ่มอื่นไม่ต้องใช้
    if (!isStackerModel(selected?.model) && !isOtherGroup(selected?.brand, selected?.model)) {
      const cat = custReturning > 0 ? "ลูกค้าเก่า/รับช่วงต่อ" : commCategory;
      if (cat) customFields[COMMISSION_FIELD] = cat;
    }
    // ผู้ให้บริการขนส่ง (รถสไลด์) — เลือกจาก dropdown หรือระบุเอง
    const supplier = shipSupplier === "อื่นๆ (ระบุเอง)" ? shipSupplierOther.trim() : shipSupplier.trim();
    if (supplier) customFields["ผู้ให้บริการขนส่ง"] = supplier;
    // ลูกค้าเครดิต — เก็บเลขใบวางบิล
    if (form.payment_type === "เครดิต" && form.bill_note_no.trim()) customFields["เลขใบวางบิล"] = form.bill_note_no.trim();
    // ข้อมูลรถจากสต็อก — เติมให้อัตโนมัติ ไม่ต้องให้เซลล์กรอกเอง
    if (selected) {
      const auto: Record<string, string> = {
        "รหัสสินค้า": selected.id !== selected.SN ? String(selected.id) : "",
        PI: selected.pi_no ?? "", MODEL: selected.model ?? "",
        Valve: selected.control_type ?? "", SN: selected.SN ?? "",
        "วันรับรถ": selected.received_date ?? "",
      };
      Object.entries(auto).forEach(([k, v]) => { if (v) customFields[k] = String(v); });
    }
    return {
      // แก้ไข = คง id/วันที่เดิม · ทำใหม่ = ออก id ใหม่
      id: editingSale ? editingSale.id : `sale_${Date.now()}`,
      forklift_id: selected!.id, forklift_unit_no: selected!.SN,
      forklift_brand: selected!.brand, forklift_model: selected!.model,
      sales_staff: canonicalStaff(salesUser?.name, fieldConfig.staffAliases), // บันทึกด้วยชื่อจริง (canonical) กันดีลแตกเป็นคนละคน
      customer_name: form.customer_name, customer_tel: form.customer_tel,
      customer_type: form.customer_type as CustomerType, province: form.province,
      payment_type: form.payment_type as PaymentType,
      finance_company: form.finance_company || undefined,
      actual_sale: Number(form.actual_sale), deposit: Number(form.deposit) || 0,
      delivery_date: toGregorian(form.delivery_date), remark: form.remark || undefined, // กันปีไทย (พ.ศ.) → แปลงเป็น ค.ศ.
      payment_received_date: toGregorian(form.payment_received_date) || undefined, // วันรับเงิน → งวดค่าคอม
      custom_fields: Object.keys(customFields).length > 0 ? customFields : undefined,
      sale_status: status,
      vehicle_type: vehicleType,
      warranty_expiry: form.warranty_expiry || undefined,
      parts_schedule: form.parts_schedule || undefined,
      custom_notifications: customNotifItems.length > 0 ? customNotifItems : undefined,
      contact_source: (form.contact_source as ContactSource) || undefined,
      sale_type: (form.sale_type as SaleType) || undefined,
      payment_proof: paymentProofs[0] || undefined,
      payment_proofs: paymentProofs.length ? paymentProofs : undefined,
      add_ons: addOns.length ? addOns : undefined,
      freebie: freebie || undefined,
      shipping_cost: shippingCost ? Number(shippingCost) : undefined,
      created_at: editingSale ? editingSale.created_at : new Date().toISOString().slice(0, 10),
    };
  };

  // บันทึกดีล — ทำใหม่ = addSale · แก้ไขของเดิม = updateSale
  const commitSale = (status: SaleStatus) => {
    const s = buildSale(status);
    if (editingSale) updateSale(s); else addSale(s);
    clearDraft(); setDraftRestored(false); // บันทึกสำเร็จ → ล้างร่าง
    setSubmitted(true);
    setTimeout(resetCheckout, editingSale ? 1400 : 3000);
  };

  // เปิดฟอร์มแก้ไขดีลที่ทำไปแล้ว — เติมข้อมูลเดิมกลับเข้าฟอร์มทั้งหมด
  const openEditSale = (sale: Sale) => {
    // หารถจากสต็อก ถ้าถูกลบไปแล้วสร้างรถชั่วคราวจากข้อมูลในดีล เพื่อให้ฟอร์มทำงานต่อได้
    const fk = forklifts.find(f => f.id === sale.forklift_id) ?? {
      id: sale.forklift_id, SN: sale.forklift_unit_no, brand: sale.forklift_brand,
      model: sale.forklift_model, capacity: "", height: "", fuel: "", cost_price: 0,
      stock_price: 0, status: "", created_at: sale.created_at,
    } as Forklift;
    setEditingSale(sale);
    setSelected(fk);
    setVehicleType(sale.vehicle_type ?? fk.vehicle_category ?? "Forklift");
    setForm({
      customer_name: sale.customer_name ?? "", customer_tel: sale.customer_tel ?? "",
      customer_type: (sale.customer_type ?? "") as CustomerType | "",
      province: sale.province ?? "", payment_type: (sale.payment_type ?? "") as PaymentType | "",
      finance_company: sale.finance_company ?? "",
      actual_sale: sale.actual_sale ? String(sale.actual_sale) : "",
      deposit: sale.deposit ? String(sale.deposit) : "",
      delivery_date: sale.delivery_date ?? "", payment_received_date: sale.payment_received_date ?? "", remark: sale.remark ?? "",
      warranty_expiry: sale.warranty_expiry ?? "", parts_schedule: sale.parts_schedule ?? "",
      contact_source: (sale.contact_source ?? "") as ContactSource | "",
      sale_type: (sale.sale_type ?? "") as SaleType | "",
      bill_note_no: (sale.custom_fields?.["เลขใบวางบิล"] as string) ?? "",
    });
    // เติมค่าช่องที่เพิ่มเอง (จับคู่ตามชื่อ)
    const cvals: Record<string, string> = {};
    fieldConfig.saleExtraFieldDefs.forEach(def => {
      const v = sale.custom_fields?.[def.name];
      if (v != null) cvals[def.id] = String(v);
    });
    setSaleCustomVals(cvals);
    setCommCategory(String(sale.custom_fields?.[COMMISSION_FIELD] ?? ""));
    setCustomNotifItems(sale.custom_notifications ?? []);
    setShowCustomNotifs((sale.custom_notifications ?? []).length > 0);
    setPaymentProofs(sale.payment_proofs ?? (sale.payment_proof ? [sale.payment_proof] : []));
    setAddOns(sale.add_ons ?? []);
    setFreebie(sale.freebie ?? false);
    setShippingCost(sale.shipping_cost ? String(sale.shipping_cost) : "");
    { // ผู้ให้บริการขนส่ง — เติมกลับตอนแก้ไข (ถ้าไม่อยู่ใน list = อื่นๆ)
      const sup = (sale.custom_fields?.["ผู้ให้บริการขนส่ง"] as string) ?? "";
      if (sup && !fieldConfig.shippingSuppliers.includes(sup)) { setShipSupplier("อื่นๆ (ระบุเอง)"); setShipSupplierOther(sup); }
      else { setShipSupplier(sup); setShipSupplierOther(""); }
    }
    setErrors({}); setSubmitted(false); setLightboxIdx(null);
    setDetailSale(null); // ปิดหน้ารายละเอียดถ้าเปิดอยู่
  };

  const resetCheckout = () => {
    setSelected(null); setEditingSale(null); setForm(emptyCheckout); setErrors({}); setSaleCustomVals({});
    setSubmitted(false); setCustomNotifItems([]); setShowCustomNotifs(false);
    setNewNotifLabel(""); setNewNotifDate(""); setPaymentProofs([]);
    setAddOns([]); setNewAddon({ name: "", price: "" }); setCancelBox(false); setCancelReason("");
    setFreebie(false); setShippingCost(""); setCommCategory("");
    setShipSupplier(""); setShipSupplierOther(""); setRentCarNo(""); setRentBy("");
  };

  // ── ร่างฟอร์มปิดการขาย (กันข้อมูลหายถ้าเด้งออกก่อนบันทึก) — เก็บ localStorage ต่อรถ 1 คัน ──
  const DRAFT_KEY = "salesos_checkout_draft_v1";
  const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch {} };
  // บันทึกร่างทุกครั้งที่กรอก (เฉพาะปิดการขายใหม่ ไม่ใช่แก้ไขดีลเก่า/รถเช่า) — เก็บเฉพาะที่มีข้อมูลจริง
  useEffect(() => {
    if (!selected || editingSale || form.sale_type === "รถเช่า") return;
    const hasContent = !!(form.customer_name.trim() || form.customer_tel.trim() || form.actual_sale.trim()
      || form.deposit.trim() || form.delivery_date || form.bill_note_no.trim() || paymentProofs.length || addOns.length);
    try {
      if (hasContent) localStorage.setItem(DRAFT_KEY, JSON.stringify({
        id: selected.id, form, paymentProofs, commCategory, saleCustomVals,
        customNotifItems, addOns, freebie, shippingCost, vehicleType,
      }));
    } catch {}
  }, [selected, editingSale, form, paymentProofs, commCategory, saleCustomVals, customNotifItems, addOns, freebie, shippingCost, vehicleType]);

  // เปิดฟอร์มปิดการขายของรถคันหนึ่ง (ใช้ร่วมทั้งมุมมองการ์ดและตาราง)
  const openCheckout = (item: Forklift) => {
    // รถคันนี้เป็นรถเช่าอยู่แล้ว → เปิดมาเป็นฟอร์มรถเช่าเลย (ซ่อนช่องขายทั้งหมด)
    const isRent = String(item.status ?? "").includes("เช่า") || !!item.custom_fields?.["เบอร์รถเช่า"];
    setSelected(item); setErrors({}); setSubmitted(false);
    setLightboxIdx(null); setVehicleType(item.vehicle_category ?? "Forklift");
    setNewNotifLabel(""); setNewNotifDate("");
    setRentCarNo((item.custom_fields?.["เบอร์รถเช่า"] as string) ?? "");
    setRentBy((item.custom_fields?.["ผู้เบิกรถเช่า"] as string) ?? "");
    // กู้ร่างที่กรอกค้างไว้ของรถคันนี้ (ถ้ามี) — ไม่งั้นเริ่มฟอร์มเปล่า
    let draft: Record<string, unknown> | null = null;
    try { if (!isRent) { const raw = localStorage.getItem(DRAFT_KEY); if (raw) { const d = JSON.parse(raw); if (d?.id === item.id) draft = d; } } } catch {}
    if (draft) {
      setForm({ ...emptyCheckout, ...(draft.form as typeof emptyCheckout) });
      setPaymentProofs((draft.paymentProofs as string[]) ?? []);
      setCommCategory((draft.commCategory as string) ?? "");
      setSaleCustomVals((draft.saleCustomVals as Record<string, string>) ?? {});
      setCustomNotifItems((draft.customNotifItems as { label: string; date: string }[]) ?? []);
      setShowCustomNotifs(((draft.customNotifItems as unknown[]) ?? []).length > 0);
      setAddOns((draft.addOns as { name: string; price: number }[]) ?? []);
      setFreebie((draft.freebie as boolean) ?? false);
      setShippingCost((draft.shippingCost as string) ?? "");
      if (draft.vehicleType) setVehicleType(draft.vehicleType as VehicleType);
      setDraftRestored(true);
    } else {
      // เฟส 2: ถ้ามาจาก "ขายคันใหม่ให้ลูกค้านี้" → เติมข้อมูลลูกค้าไว้ให้เลย
      const pc = (!isRent && pendingCustomer) ? pendingCustomer : null;
      setForm({
        ...emptyCheckout, sale_type: isRent ? "รถเช่า" : "",
        ...(pc ? { customer_name: pc.name, customer_tel: pc.tel, customer_type: pc.customer_type as CustomerType | "", province: pc.province, contact_source: pc.contact_source as ContactSource | "" } : {}),
      });
      setPaymentProofs([]); setSaleCustomVals({}); setCommCategory("");
      setCustomNotifItems([]); setAddOns([]); setFreebie(false); setShippingCost("");
      setShowCustomNotifs(false); setDraftRestored(false);
    }
    setPendingCustomer(null); // ใช้ครั้งเดียว
    setShowCustHist(true);
  };
  // รถคันนี้เป็นรถเช่าไหม + ป้ายปุ่มการ์ด (รถเช่า → "รถเช่า GR-xxx" ตามเบอร์รถเช่าของคันนั้น)
  const isRentalCar = (f: Forklift) => String(f.status ?? "").includes("เช่า");
  const cardActionLabel = (f: Forklift) => {
    if (!isRentalCar(f)) return "ปิดการขาย";
    const no = String(f.custom_fields?.["เบอร์รถเช่า"] ?? "").trim();
    return no ? `รถเช่า ${no}` : "รถเช่า";
  };

  // ตรวจฟอร์มแล้วบันทึกดีลด้วยสถานะที่เลือก (ใช้ร่วมทุกปุ่ม)
  // รถคันที่เลือกต้องลงข้อมูลบริการหลังการขายก่อนปิดการขายไหม
  // (เฉพาะรถที่ขายพร้อมเงื่อนไขเข้าเซอร์วิส = โฟล์คลิฟท์ · รถเช่าไม่ใช่การขาย จึงข้าม)
  const needWarranty = !!selected && isForkliftVehicle(selected.brand, selected.model) && form.sale_type !== "รถเช่า";

  const submitSale = (status: SaleStatus) => {
    const errs = validate(status);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      // โชว์กล่องสรุปที่ยังกรอกไม่ครบ ใกล้ปุ่ม — กันกดปุ่มแล้วไม่รู้ว่าติดตรงไหน
      setTimeout(() => document.getElementById("sale-error-summary")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
      return;
    }
    commitSale(status);
  };
  // รถเช่า: ต่างจากการขาย — กรอกแค่ เบอร์รถเช่า + ผู้เบิกรถเช่า → ตั้งสถานะรถ "รถเช่า" (ไม่สร้างดีลขาย/ไม่คิดค่าคอม)
  const submitRental = () => {
    if (!selected) return;
    const errs: Record<string, string> = {};
    if (!rentCarNo.trim()) errs.rentCarNo = "กรุณากรอกเบอร์รถเช่า";
    if (!rentBy.trim())    errs.rentBy    = "กรุณากรอกผู้เบิกรถเช่า";
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    const cf = { ...(selected.custom_fields || {}), "เบอร์รถเช่า": rentCarNo.trim(), "ผู้เบิกรถเช่า": rentBy.trim() };
    updateForklift({ ...selected, status: "รถเช่า", custom_fields: cf });
    setUndoToast(`บันทึกรถเช่า ${selected.SN || selected.model} แล้ว — ผู้เบิก ${rentBy.trim()}`);
    setTimeout(() => setUndoToast(null), 4000);
    resetCheckout();
  };
  const handleSell = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.sale_type === "รถเช่า") return submitRental(); // รถเช่า → เส้นทางแยก
    submitSale("ปิดการขาย/จัดส่งแล้ว");
  };
  const handleReserve = (e: React.MouseEvent) => { e.preventDefault(); submitSale("จอง/รอโอน"); };            // จองไว้ก่อน ยังไม่โอน — ไม่ต้องแนบสลิป
  const handleBook = (e: React.MouseEvent) => { e.preventDefault(); submitSale("จอง/โอนมัดจำแล้ว"); };        // จอง + โอนมัดจำแล้ว — ต้องแนบสลิป
  const handleShipping = (e: React.MouseEvent) => { e.preventDefault(); submitSale("รอจัดส่ง"); };
  const handleFinance = (e: React.MouseEvent) => { e.preventDefault(); submitSale("รอไฟแนนซ์"); };

  // ยกเลิกการจอง (รถที่ยังไม่ปิดขาด) — คืนรถสู่สต็อก + เก็บเหตุผลไว้ใน remark
  const cancelBooking = () => {
    if (!detailSale) return;
    const reason = cancelReason.trim() || "ไม่ระบุเหตุผล";
    updateSale({ ...detailSale, remark: `${detailSale.remark ? detailSale.remark + " · " : ""}ยกเลิกการจอง: ${reason}` });
    deleteSale(detailSale.id);
    setUndoToast(`ยกเลิกการจอง ${detailSale.forklift_unit_no} — รถกลับสู่สต็อก (${reason})`);
    setTimeout(() => setUndoToast(null), 4000);
    setDetailSale(null); setCancelBox(false); setCancelReason("");
  };

  const handleUpdateTarget = () => {
    const n = Number(targetInput.replace(/,/g, ""));
    if (!isNaN(n) && n > 0 && salesUser) {
      const updated = { ...salesUser, target_monthly: n };
      setSalesUser(updated); localStorage.setItem("sales_user", JSON.stringify(updated));
    }
    setEditingTarget(false);
  };

  const handleDeleteSale = (saleId: string) => {
    const sale = sales.find(s => s.id === saleId);
    deleteSale(saleId); setDeleteConfirm(null);
    if (sale) { setUndoToast(`ลบรายการ ${sale.forklift_unit_no} แล้ว — รถกลับสู่สต็อก`); setTimeout(() => setUndoToast(null), 4000); }
  };

  const fmt = formatBaht; // ใช้ตัวจัดรูปแบบเงินกลาง (lib/format)
  const selectedInspRecs = selected ? inspections.filter(r => insMatches(r.unit_no, selected.SN, selected.id)) : [];
  const receiverPhotos   = labeledPhotos(selectedInspRecs.filter(r => r.role === "ผู้รับรถ" || !r.role));
  const delivererPhotos  = labeledPhotos(selectedInspRecs.filter(r => r.role === "ผู้ส่งมอบรถ"));
  const receiverNames    = [...new Set(selectedInspRecs.filter(r => r.role === "ผู้รับรถ" || !r.role).map(r => r.transporter_name).filter(Boolean))].join(", ");
  const delivererNames   = [...new Set(selectedInspRecs.filter(r => r.role === "ผู้ส่งมอบรถ").map(r => r.transporter_name).filter(Boolean))].join(", ");
  const selectedPhotos   = [...receiverPhotos, ...delivererPhotos]; // combined for lightbox

  // Settings — standard dropdown handlers
  const saveStdOption = () => {
    if (!editingSaleField || !sNewOpt.trim()) return;
    updateFieldOptions(editingSaleField, [...fieldConfig[editingSaleField], sNewOpt.trim()]);
    setSNewOpt("");
  };
  const deleteStdOption = (field: SaleDropdown, idx: number) => {
    updateFieldOptions(field, fieldConfig[field].filter((_, i) => i !== idx));
    if (sEditOpt?.idx === idx) setSEditOpt(null);
  };
  const saveStdEditOption = () => {
    if (!editingSaleField || !sEditOpt?.val.trim()) return;
    const updated = [...fieldConfig[editingSaleField]];
    updated[sEditOpt.idx] = sEditOpt.val.trim();
    updateFieldOptions(editingSaleField, updated);
    setSEditOpt(null);
  };

  const resetSefWizard = () => { setSefStep(null); setSefName(""); setSefType("text"); setSefOptions([]); setSefOptInput(""); };
  const addSefOption = () => { if (!sefOptInput.trim()) return; setSefOptions(p => [...p, sefOptInput.trim()]); setSefOptInput(""); };
  const commitSef = () => {
    if (!sefName.trim()) return;
    addSaleExtraFieldDef(sefName, sefType, sefType === "select" ? sefOptions : []);
    resetSefWizard();
  };

  const confirmAddFilter = () => {
    if (!newFilterName.trim()) return;
    addSalesFilterRequest(newFilterName.trim()); setNewFilterName(""); setShowAddFilter(false);
  };

  const filteredHistory = (() => {
    const base = historyTab === "all"
      ? mySales
      : mySales.filter(s => saleMatchesTab(String(s.sale_status ?? "ขายแล้ว"), historyTab));
    const q = dealSearch.trim().toLowerCase();
    if (!q) return base;
    // ค้นหาชื่อบริษัท/ลูกค้า + SN/รุ่น/ยี่ห้อ/เบอร์ — หาดีลเก่าง่ายขึ้น
    return base.filter(s => [s.customer_name, s.customer_tel, s.forklift_unit_no, s.forklift_model, s.forklift_brand]
      .some(v => String(v ?? "").toLowerCase().includes(q)));
  })();

  return (
    <div className="min-h-screen bg-slate-50">
      {undoToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2.5">
          <RotateCcw className="w-4 h-4 text-emerald-400" />{undoToast}
        </div>
      )}

      {/* Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-indigo-500 to-blue-700 rounded-xl p-2">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-800 text-sm leading-tight">ทีมขาย</p>
              <p className="text-slate-500 text-xs">{salesUser?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleRefresh} title="รีเฟรชข้อมูลล่าสุด"
              className="flex items-center gap-1.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 text-sm font-medium px-3 py-1.5 rounded-lg transition-all border border-transparent hover:border-emerald-200">
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-emerald-600" : ""}`} /><span className="hidden sm:inline">รีเฟรช</span>
            </button>
            <button
              onClick={() => { setTestNotifActive(p => !p); setShowBookingNotif(true); }}
              title="ทดสอบการแจ้งเตือน"
              className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${testNotifActive ? "bg-amber-100 text-amber-700 border-amber-300" : "text-slate-500 border-dashed border-slate-300 hover:border-amber-300 hover:text-amber-600"}`}>
              <Bell className="w-3.5 h-3.5" />ทดสอบ
            </button>
            {/* กระดิ่งรวมทุกแจ้งเตือน (รอบเช็ค/ประกัน + ผลอนุมัติจอง) */}
            <button onClick={() => setShowBookingNotif(true)} title="การแจ้งเตือน"
              className="relative flex items-center text-slate-600 hover:text-amber-600 hover:bg-amber-50 p-2 rounded-lg transition-all border border-transparent hover:border-amber-200">
              <Bell className="w-5 h-5" />
              {(bookingNotifs.length + notifications.length) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{bookingNotifs.length + notifications.length}</span>
              )}
            </button>
            {/* แอดมิน (เจ้าของระบบ) สลับดูดีลของทุกเซลล์ได้ — ไว้ตามแก้ข้อมูลที่ค้างแทนทีม */}
            {isAdminUser && (
              <button onClick={() => setViewAllDeals(v => !v)}
                title={seeAll ? "กำลังดูดีลของทุกเซลล์ — กดเพื่อกลับไปดูเฉพาะของฉัน" : "ดูดีลของทุกเซลล์ (สิทธิ์แอดมิน)"}
                className={`flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-lg border transition-all ${seeAll ? "bg-violet-600 text-white border-violet-600" : "text-violet-700 bg-violet-50 border-violet-200 hover:bg-violet-100"}`}>
                👑<span className="hidden sm:inline">{seeAll ? "ทุกเซลล์" : "ดูทุกเซลล์"}</span>
              </button>
            )}
            <button onClick={() => setShowHistory(true)}
              className="flex items-center gap-1.5 text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 text-sm font-medium px-3 py-1.5 rounded-lg transition-all border border-transparent hover:border-indigo-200">
              <History className="w-4 h-4" /><span className="hidden sm:inline">{seeAll ? `การขายทุกเซลล์ (${mySales.length})` : `การขายของฉัน (${mySales.length})`}</span>
            </button>
            <button onClick={() => { void signOutSupabase(); localStorage.removeItem("sales_user"); router.push("/sales/login"); }}
              className="flex items-center gap-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 text-sm font-medium px-3 py-1.5 rounded-lg transition-all">
              <LogOut className="w-4 h-4" /><span className="hidden sm:inline">ออก</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-5">
        {/* โหมดแอดมิน — บอกให้ชัดว่าตัวเลขที่เห็นเป็นของทุกเซลล์ ไม่ใช่ของตัวเอง */}
        {seeAll && (
          <div className="bg-violet-50 border border-violet-200 rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-lg">👑</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-violet-800">โหมดแอดมิน — กำลังดูดีลของทุกเซลล์ ({mySales.length} ดีล)</p>
              <p className="text-[11px] text-violet-600 mt-0.5">ยอดขาย/เป้า/รายการค้างที่เห็นเป็นของทั้งทีม · เปิดดีลของเซลล์คนไหนก็ได้เพื่อเติมข้อมูลที่ค้าง (เช่น ข้อมูลรับประกัน) · ดีลที่สร้างใหม่ยังบันทึกในชื่อคุณเอง</p>
            </div>
            <button onClick={() => setViewAllDeals(false)}
              className="flex-shrink-0 text-xs font-bold text-violet-700 bg-white border border-violet-200 hover:bg-violet-100 rounded-lg px-3 py-2">กลับไปดูเฉพาะของฉัน</button>
          </div>
        )}
        {/* แถบเตือนค้าง (ปิดไม่ได้) — เตือนไปเรื่อยๆ จนกว่าจะลงข้อมูลรับประกันครบ · หายเองเมื่อครบ */}
        {blockedDeals.length > 0 && (
          <button onClick={() => setWarnDismissed(false)}
            className="flex items-center gap-3 bg-red-50 border border-red-300 rounded-2xl px-4 py-3 text-left hover:bg-red-100 transition-colors animate-pulse">
            <span className="text-2xl flex-shrink-0">⚠️</span>
            <span className="flex-1 min-w-0">
              <span className="font-bold text-red-700 text-sm block">มี {blockedDeals.length} ดีลยังไม่ลงข้อมูลรับประกัน · ค่าคอมยังไม่ออก</span>
              <span className="text-xs text-red-600">แตะเพื่อลงข้อมูลให้ครบ — แถบนี้จะหายเองเมื่อลงครบทุกดีล</span>
            </span>
            <span className="text-xs font-bold text-white bg-red-600 rounded-lg px-3 py-1.5 flex-shrink-0 whitespace-nowrap">ลงข้อมูล</span>
          </button>
        )}
        {/* ── รถถึงคลังแล้วแต่ดีลยังไม่ปิด (25 ก.ย. 2569 · ผู้ใช้สั่งให้เตือน) ── */}
        {/* รถรับเข้าคลังนานแล้วแต่ดีลยังค้างจอง/มัดจำ → ยอดขายและค่าคอมยังไม่เข้าเดือนไหนเลย */}
        {toCloseDeals.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-2xl px-4 py-3">
            <p className="font-bold text-amber-800 text-sm">🚚 รถถึงคลังแล้ว {toCloseDeals.length} คัน แต่ยังไม่ได้ปิดการขาย</p>
            <p className="text-xs text-amber-700 mt-0.5 mb-2">ปิดให้จบเพื่อให้ยอดขายและค่าคอมเข้าเดือนที่ถูก — แตะที่รายการเพื่อเปิดดีล</p>
            <div className="flex flex-col gap-1.5">
              {toCloseDeals.map(({ s, days, f }) => (
                <button key={s.id} onClick={() => setDetailSale(s)}
                  className="flex items-center gap-2 flex-wrap text-left text-xs bg-white border border-amber-200 rounded-lg px-2.5 py-1.5 hover:bg-amber-100 transition-colors">
                  <span className="font-semibold text-slate-800">{s.customer_name || "(ไม่มีชื่อลูกค้า)"}</span>
                  <span className="text-slate-500">{s.forklift_brand} {s.forklift_model}</span>
                  <span className="text-slate-400">{f.SN || f.id}</span>
                  <span className="ml-auto font-bold text-amber-700">รับรถมาแล้ว {days} วัน · {s.sale_status || "จอง"}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {/* เฟส 2: แถบ "กำลังจะขายให้ลูกค้า X" — เลือกรถแล้วฟอร์มเติมข้อมูลลูกค้าให้เอง */}
        {pendingCustomer && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 text-sm text-emerald-800">
            <Users className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1"><b>กำลังจะขายให้ “{pendingCustomer.name}”</b> — เลือกรถที่จะขาย แล้วข้อมูลลูกค้าจะเติมให้อัตโนมัติ</span>
            <button onClick={() => setPendingCustomer(null)} className="font-semibold text-emerald-600 hover:text-emerald-800 underline flex-shrink-0">ยกเลิก</button>
          </div>
        )}
        {/* Stats Banner */}
        <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-blue-800 rounded-2xl p-5 text-white relative overflow-hidden shadow-lg shadow-indigo-200">
          <div className="absolute right-0 top-0 w-48 h-full bg-white/5 rounded-l-full" />
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3"><Package className="w-7 h-7 text-white" /></div>
              <div>
                <p className="text-indigo-200 text-sm font-medium">สต็อกพร้อมขาย</p>
                <p className="text-4xl font-bold leading-tight">{readyCount} <span className="text-lg font-semibold text-indigo-300">คัน</span></p>
                {bookedCars.length > 0 && (
                  <button onClick={() => setShowBooked(true)}
                    className="text-amber-300 hover:text-amber-200 text-xs font-medium mt-0.5 flex items-center gap-1 underline decoration-dotted underline-offset-2">
                    + ติดจอง {bookedCars.length} คัน <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
            <div className="text-right hidden sm:block">
              <div className="flex items-center gap-2 justify-end mb-1">
                <Target className="w-4 h-4 text-indigo-300" />
                <p className="text-indigo-200 text-sm font-medium">เป้าหมายเดือนนี้</p>
              </div>
              {editingTarget ? (
                <div className="flex items-center gap-2">
                  <MoneyInput value={targetInput} onChange={v => setTargetInput(v)}
                    onKeyDown={e => { if (e.key === "Enter") handleUpdateTarget(); if (e.key === "Escape") setEditingTarget(false); }} autoFocus
                    className="w-32 text-right bg-white/20 border border-white/30 rounded-lg px-2 py-1 text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/50" placeholder="ตั้งเป้า..." />
                  <button onClick={handleUpdateTarget} className="bg-white/20 hover:bg-white/30 text-white rounded-lg p-1.5"><Check className="w-4 h-4" /></button>
                  <button onClick={() => setEditingTarget(false)} className="bg-white/10 text-white/70 rounded-lg p-1.5"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <div className="flex items-center gap-2 justify-end">
                  <p className="text-2xl font-bold">฿{fmt(salesUser?.target_monthly ?? 0)}</p>
                  <button onClick={() => { setTargetInput(String(salesUser?.target_monthly ?? 0)); setEditingTarget(true); }}
                    className="bg-white/10 hover:bg-white/25 text-white/70 hover:text-white rounded-lg p-1.5 transition-all">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Search + Sort + Filter */}
        <div className="flex gap-2 flex-wrap">
          <div className="flex-1 relative min-w-[200px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา รหัสสินค้า / หมายเลข / ยี่ห้อ / รุ่น..."
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 hover:border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white text-slate-800 placeholder:text-slate-400 transition-all shadow-sm" />
          </div>
          {/* จัดเรียง ล่าสุด/เก่าสุด */}
          <div className="flex items-center rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <button onClick={() => setSortOrder("newest")}
              className={`flex items-center gap-1 text-sm font-semibold px-3 py-2.5 transition-all ${sortOrder === "newest" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              <ChevronDown className="w-3.5 h-3.5" />ล่าสุด
            </button>
            <button onClick={() => setSortOrder("oldest")}
              className={`flex items-center gap-1 text-sm font-semibold px-3 py-2.5 transition-all border-l border-slate-200 ${sortOrder === "oldest" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              <ChevronUp className="w-3.5 h-3.5" />เก่าสุด
            </button>
          </div>
          {hasFilter && (
            <button onClick={clearFilters}
              className="flex items-center gap-1 text-slate-500 hover:text-red-600 text-sm px-3 py-2.5 rounded-xl border border-slate-200 hover:border-red-200 hover:bg-red-50 transition-all bg-white shadow-sm">
              <X className="w-3.5 h-3.5" />ล้าง
            </button>
          )}
        </div>

        {/* ── แถบกรองแบบ dropdown (รถพร้อมขายทุกรุ่น) — เลือกได้แบบไล่ระดับ ยี่ห้อ→รุ่น→เสา ── */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500"><Filter className="w-3.5 h-3.5" />กรอง</span>
          <select value={fBrand} onChange={e => { setFBrand(e.target.value); setFModel(""); setFMast(""); }}
            className="text-sm bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer shadow-sm">
            <option value="">ยี่ห้อทั้งหมด</option>
            {brands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={fModel} onChange={e => { setFModel(e.target.value); setFMast(""); }}
            className="text-sm bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer shadow-sm max-w-[180px]">
            <option value="">รุ่นทั้งหมด</option>
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          {masts.length > 0 && (
            <select value={fMast} onChange={e => setFMast(e.target.value)}
              className="text-sm bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer shadow-sm">
              <option value="">เสาทั้งหมด</option>
              {masts.map(m => <option key={m} value={m}>เสา {m}</option>)}
            </select>
          )}
          <select value={fFuel} onChange={e => setFFuel(e.target.value)}
            className="text-sm bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer shadow-sm">
            <option value="">พลังงานทั้งหมด</option>
            {fuels.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={fStatus} onChange={e => setFStatus(e.target.value)}
            className="text-sm bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer shadow-sm">
            <option value="">สถานะ: ขายได้ทั้งหมด</option>
            <option value="__recent__">🆕 รับมาล่าสุด (เรียงวันรับใหม่สุด)</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* งาน 4: ค้นเจอรถแต่ถูกซ่อน (ขายแล้ว/เช่า/รอรับ) — แจ้งเหตุผลกันเข้าใจผิดว่าข้อมูลหาย */}
        {searchHiddenHit && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              พบรถ <span className="font-bold">{displayCode(searchHiddenHit.f)}</span>
              {" "}({searchHiddenHit.f.brand} {searchHiddenHit.f.model}) ในระบบ — <span className="font-bold">แต่ไม่แสดงในรายการขายเพราะ &ldquo;{searchHiddenHit.reason}&rdquo;</span>
              <span className="block text-xs text-amber-600 mt-0.5">สถานะจริงในสต็อก: {String(searchHiddenHit.f.status)} · ถ้าคิดว่าผิด แจ้งฝ่ายสต็อกแก้สถานะ</span>
            </div>
          </div>
        )}

        {/* แถบสลับมุมมอง + จำนวนที่แสดง */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">แสดง <span className="font-bold text-slate-700">{sorted.length}</span> คัน{searchHiddenHit && sorted.length === 0 && <span className="text-amber-600"> · พบ 1 คันที่ &ldquo;{searchHiddenHit.reason}&rdquo; (ดูด้านล่าง)</span>}</p>
          <div className="flex rounded-xl border border-slate-200 overflow-hidden text-sm font-semibold bg-white">
            <button onClick={() => setViewMode("card")}
              className={`px-3 py-1.5 flex items-center gap-1.5 transition ${viewMode === "card" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              <LayoutGrid className="w-4 h-4" />การ์ด
            </button>
            <button onClick={() => setViewMode("table")}
              className={`px-3 py-1.5 flex items-center gap-1.5 transition ${viewMode === "table" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              <TableIcon className="w-4 h-4" />ตาราง
            </button>
            <button onClick={() => setViewMode("byModel")}
              className={`px-3 py-1.5 flex items-center gap-1.5 transition ${viewMode === "byModel" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              <Package className="w-4 h-4" />ตามรุ่น
            </button>
          </div>
        </div>

        {sorted.length === 0 && !searchHiddenHit && (
          <div className="text-center py-16 text-slate-400 bg-white rounded-2xl border border-slate-100">
            <Filter className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="font-semibold text-slate-500">ไม่มีสินค้าในระบบ</p>
            <p className="text-sm mt-1">{hasFilter ? "ลองเปลี่ยนตัวกรองการค้นหา" : "ยังไม่มีรถพร้อมขายในสต็อก"}</p>
          </div>
        )}

        {/* ค้นเจอรถที่ขายแล้ว/ถูกซ่อน → โชว์การ์ดแบบดูอย่างเดียว (กดปิดการขายไม่ได้) แทนจอ "0 คัน" */}
        {searchHiddenHit && sorted.length === 0 && (() => {
          const item = searchHiddenHit.f;
          const recs = inspections.filter(r => insMatches(r.unit_no, item.SN, item.id));
          const photos = recs.flatMap(r => r.images);
          const coverPhoto = recs.map(r => r.image_slots?.front).find(Boolean) || photos[0] || null;
          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden opacity-95">
                {coverPhoto ? (
                  <div className="relative h-40 bg-slate-100 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={driveImg(coverPhoto)} alt={`${item.brand} ${item.model}`} className="w-full h-full object-cover grayscale" />
                    <span className="absolute top-2 left-2 flex items-center gap-1 text-xs text-white bg-slate-700/80 px-2 py-0.5 rounded-full"><Eye className="w-3 h-3" />ดูอย่างเดียว</span>
                  </div>
                ) : (
                  <div className="h-40 bg-gradient-to-br from-slate-100 to-slate-50 flex flex-col items-center justify-center gap-1.5 border-b border-slate-100">
                    <ImageOff className="w-7 h-7 text-slate-300" />
                    <span className="text-xs text-slate-400">ยังไม่มีรูปรถ</span>
                  </div>
                )}
                <div className="p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-md mb-1 ${isPendingId(item.id) ? "text-amber-700 bg-amber-50 border border-amber-200" : "text-slate-600 bg-slate-100 border border-slate-200"}`}>#{displayCode(item)}</span>
                      <p className="font-bold text-slate-800 text-base">{item.brand}</p>
                      <p className="text-sm text-slate-600 font-medium">{item.model}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{item.SN}{item.pi_no ? ` · PI ${item.pi_no}` : ""}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_BADGE[item.status] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>{item.status}</span>
                  </div>
                  <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 text-xs text-amber-700 flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>คันนี้ <span className="font-bold">{searchHiddenHit.reason}</span> — ขายซ้ำไม่ได้ · ถ้าคิดว่าผิด แจ้งฝ่ายสต็อกแก้สถานะ</span>
                  </div>
                  <button disabled className="w-full bg-slate-100 text-slate-400 text-sm font-bold py-2.5 rounded-xl cursor-not-allowed flex items-center justify-center gap-1.5">
                    <Eye className="w-4 h-4" />ปิดการขายไม่ได้ ({item.status})
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── มุมมองตาราง ── */}
        {viewMode === "table" && sorted.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                  {["รหัส", "ยี่ห้อ/รุ่น", "SN", "PI", "พิกัด", "เสา", "พลังงาน", "สถานะ", "ราคาต้นทุน", "วันรับรถ", "โลเคชั่น", "เซลล์ดูแล", ""].map((h, i) => (
                    <th key={i} className="px-3 py-2.5 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((item) => (
                  <tr key={item.id} onClick={() => openCheckout(item)}
                    className="border-b border-slate-50 hover:bg-indigo-50/40 cursor-pointer transition-colors">
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isPendingId(item.id) ? "text-amber-700 bg-amber-50 border border-amber-200" : "text-slate-500 bg-slate-100 border border-slate-200"}`}>#{displayCode(item)}</span>
                    </td>
                    <td className="px-3 py-2.5"><span className="font-semibold text-slate-800">{item.brand}</span> <span className="text-slate-500">{item.model}</span></td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{item.SN || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{item.pi_no || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{item.capacity || (item.capacity_kg ? `${item.capacity_kg} kg` : "—")}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{mastOf(item) ? <span className="text-indigo-600 font-semibold">{mastOf(item)}</span> : <span className="text-slate-400">—</span>}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{item.fuel || "—"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_BADGE[item.status] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>{item.status}</span></td>
                    <td className="px-3 py-2.5 font-bold text-indigo-700 whitespace-nowrap">฿{fmt(item.cost_price)}</td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{item.received_date || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{item.location || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{(item.custom_fields?.["เซลล์ผู้ดูแล"] as string) || "—"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 font-semibold text-xs ${isRentalCar(item) ? "text-teal-600" : "text-indigo-600"}`}>{cardActionLabel(item)}<ChevronRight className="w-3.5 h-3.5" /></span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── มุมมองตามรุ่น: เห็นว่ารุ่นไหนเหลือเยอะ/ใกล้หมด → คลิกดูรายคัน ── */}
        {viewMode === "byModel" && sorted.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {byModel.map((g) => {
              const tone = g.ready === 0 ? "bg-slate-100 text-slate-500 border-slate-200"
                : g.ready <= 2 ? "bg-red-50 text-red-700 border-red-200"
                : "bg-emerald-50 text-emerald-700 border-emerald-200";
              return (
                <button key={`${g.brand}|${g.model}|${g.mast}`}
                  onClick={() => { setFBrand(g.brand); setFModel(g.model); setFMast(g.mast); setFSpecModel(""); setViewMode("table"); }}
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-200 p-4 text-left transition-all flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800 text-sm truncate">{g.model}{g.mast ? <span className="text-indigo-600"> · เสา {g.mast}</span> : ""}</p>
                      <p className="text-xs text-slate-500">{g.brand}</p>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border flex-shrink-0 ${tone}`}>
                      {g.ready === 0 ? "หมด" : `เหลือ ${g.ready}`}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{[g.capacity, g.fuel].filter(Boolean).join(" · ") || "—"}</p>
                  <p className="text-[11px] text-slate-400 border-t border-slate-50 pt-1.5">พร้อมขาย {g.ready} คัน</p>
                </button>
              );
            })}
          </div>
        )}

        {/* ── มุมมองการ์ด ── */}
        {viewMode === "card" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map(item => {
            const recs = inspections.filter(r => insMatches(r.unit_no, item.SN, item.id));
            const photos = recs.flatMap(r => r.images);
            // งาน 3: รูปหน้ารถโชว์บนการ์ด — เลือกช่อง "รถด้านหน้า" ก่อน ถ้าไม่มีใช้รูปแรกที่มี
            const coverPhoto = recs.map(r => r.image_slots?.front).find(Boolean) || photos[0] || null;
            return (
              <div key={item.id}
                onClick={() => openCheckout(item)}
                className="bg-white rounded-2xl shadow-sm hover:shadow-lg border border-slate-100 hover:border-indigo-200 transition-all cursor-pointer group overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-indigo-400 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                {/* รูปหน้ารถ (ถ้ามี) — ทำให้เซลล์เห็นรถได้ทันที */}
                {coverPhoto ? (
                  <div className="relative h-40 bg-slate-100 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={driveImg(coverPhoto)} alt={`${item.brand} ${item.model}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    {photos.length > 0 && (
                      <span className="absolute top-2 right-2 flex items-center gap-1 text-xs text-white bg-black/55 px-2 py-0.5 rounded-full"><Camera className="w-3 h-3" />{photos.length}</span>
                    )}
                  </div>
                ) : (
                  <div className="h-40 bg-gradient-to-br from-slate-100 to-slate-50 flex flex-col items-center justify-center gap-1.5 border-b border-slate-100">
                    <ImageOff className="w-7 h-7 text-slate-300" />
                    <span className="text-xs text-slate-400">ยังไม่มีรูปรถ</span>
                  </div>
                )}
                <div className="p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between">
                    <div>
                      {/* รหัสสินค้า (ID) — โชว์ทุกคันเพื่อแยกรถถูกตัว */}
                      <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-md mb-1 ${isPendingId(item.id) ? "text-amber-700 bg-amber-50 border border-amber-200" : "text-slate-600 bg-slate-100 border border-slate-200"}`}>#{displayCode(item)}</span>
                      <p className="font-bold text-slate-800 text-base">{item.brand}</p>
                      <p className="text-sm text-slate-600 font-medium">{item.model}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{item.SN}{item.pi_no ? ` · PI ${item.pi_no}` : ""}</p>
                      {item.status === "พร้อมขาย" && (() => {
                        const days = daysInStock(item);
                        return (
                          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                            {fStatus === "__recent__" && days != null && <span className="text-[10px] font-bold text-white bg-gradient-to-r from-sky-500 to-blue-600 px-2 py-0.5 rounded-full shadow-sm">🆕 เพิ่งเข้า {days === 0 ? "วันนี้" : `${days} วัน`}</span>}
                            {fifoOldestIds.has(item.id) && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded-full">🟢 ควรขายก่อน (FIFO)</span>}
                            {days != null && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${days > 180 ? "bg-red-100 text-red-700" : days > 90 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>ค้างสต็อก {days} วัน</span>}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_BADGE[item.status] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>{item.status}</span>
                      {String(item.status).trim() === "สั่งผลิต" && (() => {
                        const od = (item.custom_fields as Record<string, unknown> | undefined)?.["วันสั่งรถ"] as string | undefined;
                        return od?.trim()
                          ? <span className="text-[10px] font-semibold text-violet-600 bg-violet-50 border border-violet-100 px-1.5 py-0.5 rounded">🏭 สั่งรถ {od}</span>
                          : <span className="text-[10px] text-slate-400">ยังไม่ระบุวันสั่งรถ</span>;
                      })()}
                    </div>
                  </div>
                  {(() => {
                    const code = [item.model, item.height, item.control_type, item.fork_length, item.attachments, item.capacity_kg, item.fuel]
                      .map(v => (v == null ? "" : String(v)).trim())
                      .filter(Boolean)
                      .join(" / ");
                    return (
                      <div className="bg-slate-50 rounded-lg px-2.5 py-2 text-xs leading-snug">
                        <span className="text-slate-400">รหัสสเปก</span>
                        <p className="font-semibold text-slate-700 mt-0.5 break-words">{code || "— ไม่มีข้อมูลสเปก —"}</p>
                      </div>
                    );
                  })()}
                  <div className="border-t border-slate-100 pt-3">
                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-2.5"><p className="text-xs text-indigo-500 font-medium">ราคาต้นทุน</p><p className="font-bold text-indigo-700 text-sm">฿{fmt(item.cost_price)}</p></div>
                  </div>
                  <button className={`w-full bg-gradient-to-r text-white text-sm font-bold py-2.5 rounded-xl transition-all active:scale-[0.97] flex items-center justify-center gap-1.5 shadow-sm ${isRentalCar(item) ? "from-teal-600 to-emerald-700 hover:from-teal-500 hover:to-emerald-600" : "from-indigo-600 to-blue-700 hover:from-indigo-500 hover:to-blue-600"}`}>
                    {cardActionLabel(item)} <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </main>

      {/* ── Checkout Modal ── */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && resetCheckout()}>
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            <div className={`px-6 py-4 flex items-center justify-between flex-shrink-0 ${editingSale ? "bg-gradient-to-r from-violet-600 to-fuchsia-700" : "bg-gradient-to-r from-indigo-600 to-blue-700"}`}>
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">{editingSale ? <><Pencil className="w-4 h-4" />แก้ไขรายการขาย</> : "ปิดการขาย"}</h3>
                <p className={`text-sm ${editingSale ? "text-fuchsia-100" : "text-indigo-200"}`}>{selected.SN} — {selected.brand} {selected.model}</p>
              </div>
              <button onClick={resetCheckout} className="text-white/70 hover:text-white hover:bg-white/20 rounded-xl p-2 transition-all"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0 p-5">
              {submitted ? (
                <div className="flex flex-col items-center justify-center h-52 gap-4">
                  <div className="bg-emerald-100 rounded-full p-4"><CheckCircle className="w-12 h-12 text-emerald-600" /></div>
                  <div className="text-center"><p className="text-xl font-bold text-slate-800">{editingSale ? "แก้ไขสำเร็จ!" : "บันทึกสำเร็จ!"}</p><p className="text-slate-500 text-sm mt-1">บันทึกข้อมูลในระบบแล้ว</p></div>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {/* แถบความคืบหน้าดีล — เฉพาะดีลที่อยู่ในขั้นจอง/มัดจำ/รอ อยู่แล้ว */}
                  {(() => {
                    const ps = editingSale?.sale_status || (selected.status && selected.status !== "พร้อมขาย" ? selected.status : "");
                    return ps ? <DealProgress status={ps} /> : null;
                  })()}
                  {/* Stock price only */}
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                    <p className="text-xs text-indigo-500 font-medium">ราคาต้นทุน</p>
                    <p className="font-bold text-indigo-700">฿{fmt(selected.cost_price)}</p>
                  </div>

                  {/* สถานที่ที่รถอยู่ (จุดรับ/ส่ง) — ดูอย่างเดียว (แก้ได้เฉพาะฝ่ายสต็อก) */}
                  <div className="bg-teal-50 border border-teal-100 rounded-xl p-3">
                    <p className="text-xs text-teal-600 font-medium flex items-center gap-1.5 mb-0.5">
                      <MapPin className="w-3.5 h-3.5" />สถานที่ที่รถอยู่ (จุดรับ/ส่ง)
                      <span className="ml-auto text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md">🔒 แก้ได้เฉพาะฝ่ายสต็อก</span>
                    </p>
                    <p className="text-sm font-semibold text-slate-700">{selected.location?.trim() ? selected.location : <span className="text-slate-400 font-normal">— ยังไม่ระบุ (ให้ฝ่ายสต็อกกรอก) —</span>}</p>
                  </div>

                  {/* FIFO เฟส 2: เตือนถ้าคันนี้ไม่ใช่คันเข้าคลังก่อนสุดในรุ่นเดียวกัน (ไม่บังคับ) */}
                  {!editingSale && selected.status === "พร้อมขาย" && (() => {
                    const oldest = fifoOldestByKey.get(fifoKeyOf(selected));
                    if (!oldest || oldest.id === selected.id) return null;
                    const d = daysInStock(oldest);
                    return (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="text-xs text-amber-800">
                          <p className="font-bold">มีคันเข้าคลังก่อนคันนี้ (แนะนำ FIFO)</p>
                          <p className="mt-0.5">ควรขาย <b>SN {displayCode(oldest)}</b> ก่อน — เข้าคลัง {oldest.received_date || "ไม่ระบุ"}{d != null ? ` · ค้างสต็อก ${d} วัน` : ""}</p>
                          <button type="button" onClick={() => openCheckout(oldest)}
                            className="mt-1.5 text-amber-700 hover:text-amber-900 font-bold underline">สลับไปคันนั้น →</button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ข้อมูลรถจากสต็อก (ดึงอัตโนมัติ ไม่ต้องกรอก) */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                    <p className="text-xs font-semibold text-slate-500 mb-2">ข้อมูลรถ (จากสต็อก)</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      {[
                        { label: "PI", value: selected.pi_no },
                        { label: "MODEL", value: selected.model },
                        { label: "พิกัดยก", value: selected.capacity || (selected.capacity_kg ? `${selected.capacity_kg} kg` : "") },
                        { label: "พลังงาน", value: selected.fuel },
                        { label: "เสา (MAST)", value: selected.custom_fields?.["MAST"] },
                        { label: "Valve", value: selected.custom_fields?.["Valve"] ?? selected.control_type },
                        { label: "SN", value: selected.SN },
                        { label: "วันรับรถ", value: selected.received_date },
                      ].map(({ label, value }) => (
                        <div key={label} className="min-w-0">
                          <span className="text-[11px] text-slate-400 block">{label}</span>
                          <span className="text-slate-800 font-medium break-words">{value || "—"}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2.5 pt-2.5 border-t border-slate-200">
                      <span className="text-[11px] text-slate-400 block">รหัสสเปก</span>
                      <span className="text-slate-800 font-medium break-words text-sm">
                        {[selected.model, selected.custom_fields?.["MAST"], selected.height, selected.custom_fields?.["Valve"] ?? selected.control_type, selected.custom_fields?.["ประเภทสินค้า"], selected.capacity, selected.fuel].map(v => (v == null ? "" : String(v)).trim()).filter(Boolean).join(" / ") || "—"}
                      </span>
                    </div>
                  </div>

                  {/* Photos split by role */}
                  {selectedPhotos.length > 0 ? (
                    <div className="flex flex-col gap-3">
                      {receiverPhotos.length > 0 && (
                        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                          <p className="text-xs font-semibold text-amber-700 mb-2.5 flex items-center gap-1.5 flex-wrap">
                            🚛 รูปจากผู้รับรถ ({receiverPhotos.length} รูป){receiverNames && <span className="font-bold">— ผู้รับ: {receiverNames}</span>}
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            {receiverPhotos.map((p, i) => (
                              <button key={i} onClick={e => { e.stopPropagation(); setLightboxIdx(i); }}
                                className="relative aspect-square rounded-xl overflow-hidden bg-amber-100 group hover:ring-2 hover:ring-amber-400 transition-all">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={driveImg(p.url)} alt={p.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                {p.label && <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[10px] font-semibold px-1.5 py-0.5 truncate text-center">{p.label}</span>}
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center"><ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100" /></div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {delivererPhotos.length > 0 && (
                        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
                          <p className="text-xs font-semibold text-indigo-700 mb-2.5 flex items-center gap-1.5 flex-wrap">
                            📦 รูปจากผู้ส่งมอบรถ ({delivererPhotos.length} รูป){delivererNames && <span className="font-bold">— ผู้ส่ง: {delivererNames}</span>}
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            {delivererPhotos.map((p, i) => (
                              <button key={i} onClick={e => { e.stopPropagation(); setLightboxIdx(receiverPhotos.length + i); }}
                                className="relative aspect-square rounded-xl overflow-hidden bg-indigo-100 group hover:ring-2 hover:ring-indigo-400 transition-all">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={driveImg(p.url)} alt={p.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                {p.label && <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[10px] font-semibold px-1.5 py-0.5 truncate text-center">{p.label}</span>}
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center"><ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100" /></div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl px-4 py-3 flex items-center gap-2 text-slate-400">
                      <ImageOff className="w-4 h-4 flex-shrink-0" /><p className="text-xs">ยังไม่มีรูปตรวจรับสำหรับรถคันนี้</p>
                    </div>
                  )}

                  <form onSubmit={handleSell} className="flex flex-col gap-4">
                    {/* กู้ข้อมูลที่กรอกค้างไว้ (เด้งออกก่อนบันทึก) */}
                    {draftRestored && !editingSale && (
                      <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2 text-xs text-violet-700">
                        <RefreshCw className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="flex-1">กู้ข้อมูลที่กรอกค้างไว้ให้แล้ว — กรอกต่อได้เลย</span>
                        <button type="button" onClick={() => { clearDraft(); if (selected) openCheckout(selected); }}
                          className="font-semibold text-violet-600 hover:text-violet-800 underline flex-shrink-0">ล้าง เริ่มใหม่</button>
                      </div>
                    )}
                    {/* ── ช่องทางติดต่อ + ประเภทขาย ── */}
                    <div className="grid grid-cols-2 gap-3">
                      <SField label="ช่องทางที่ลูกค้าติดต่อ" error="">
                        <select value={form.contact_source} onChange={e => setForm({ ...form, contact_source: e.target.value as ContactSource })} className={ss("")}>
                          <option value="">-- เลือก --</option>
                          {CONTACT_SOURCES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </SField>
                      <SField label="ประเภทการขาย" error="">
                        <select value={form.sale_type} onChange={e => setForm({ ...form, sale_type: e.target.value as SaleType })} className={ss("")}>
                          <option value="">-- เลือก --</option>
                          {fieldConfig.saleTypes.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </SField>
                    </div>

                    {/* ── รถเช่า: กรอกแค่ 2 ช่อง (เบอร์รถเช่า + ผู้เบิก) · ซ่อนช่องขายทั้งหมด ── */}
                    {form.sale_type === "รถเช่า" && (
                      <div className="border border-teal-200 bg-teal-50/50 rounded-xl p-3.5 flex flex-col gap-3">
                        <p className="text-xs font-bold text-teal-700 flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5" />รายการรถเช่า — กรอกแค่ 2 ช่องนี้</p>
                        <SField label="เบอร์รถเช่า *" error={errors.rentCarNo}>
                          <input value={rentCarNo} onChange={e => { setRentCarNo(e.target.value); setErrors(p => ({ ...p, rentCarNo: "" })); }} placeholder="เช่น GR-001" className={si(errors.rentCarNo)} />
                        </SField>
                        <SField label="ผู้เบิกรถเช่า *" error={errors.rentBy}>
                          <input value={rentBy} onChange={e => { setRentBy(e.target.value); setErrors(p => ({ ...p, rentBy: "" })); }} placeholder="ชื่อผู้เบิก / หน่วยงาน" className={si(errors.rentBy)} />
                        </SField>
                        <button type="submit" className="w-full bg-gradient-to-r from-teal-600 to-emerald-700 hover:from-teal-500 hover:to-emerald-600 text-white font-bold py-3 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                          <CheckCircle className="w-4 h-4" />บันทึกรถเช่า
                        </button>
                      </div>
                    )}

                    {/* ── ช่องการขายปกติ (ซ่อนเมื่อเลือกรถเช่า) ── */}
                    {form.sale_type !== "รถเช่า" && (<>
                    {/* ── หมวดค่าคอม (โฟล์คลิฟท์) — สแตกเกอร์คิดตามยอดขาย · ลูกค้าเก่าตรวจอัตโนมัติจากประวัติ ── */}
                    {isStackerModel(selected?.model) ? (
                      <div className="text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />สแตกเกอร์ ({selected?.model}) — ค่าคอมคิดตามยอดขายอัตโนมัติ ไม่ต้องเลือกหมวด
                      </div>
                    ) : isOtherGroup(selected?.brand, selected?.model) ? (
                      <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />รถกลุ่มอื่น ({selected?.model}) — ค่าคอมคิด 1% ของยอดรวมทั้งเดือน ไม่ต้องเลือกหมวด
                      </div>
                    ) : custReturning > 0 ? (
                      <div className="text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 flex items-start gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <span>🔁 <b>ลูกค้าเก่า</b> — ตรวจพบเคยซื้อกับบริษัทแล้ว {custReturning} ครั้ง (ชื่อ/เบอร์ตรงกัน) · ระบบคิดค่าคอมเป็น &ldquo;ลูกค้าเก่า&rdquo; อัตโนมัติ ไม่ต้องเลือก</span>
                      </div>
                    ) : (
                      <SField label="หมวดค่าคอม (เฉพาะลูกค้าใหม่ — ลูกค้าเก่าระบบตรวจเอง)" error="">
                        <select value={commCategory} onChange={e => setCommCategory(e.target.value)} className={ss("")}>
                          <option value="">-- เลือกหมวดลูกค้า --</option>
                          {COMMISSION_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </SField>
                    )}

                    <div className="relative">
                      <SField label="ชื่อลูกค้า *" error={errors.customer_name}>
                        <input value={form.customer_name}
                          onChange={e => setForm({ ...form, customer_name: e.target.value })}
                          onFocus={() => setCustFocus(true)}
                          onBlur={() => setTimeout(() => setCustFocus(false), 150)}
                          placeholder="ชื่อ-นามสกุล / ชื่อบริษัท" autoComplete="off" className={si(errors.customer_name)} />
                      </SField>
                      {/* เฟส 1: ดรอปดาวน์ลูกค้าเก่า — พิมพ์ชื่อแล้วเด้งให้เลือก กดแล้วเติมข้อมูลอัตโนมัติ */}
                      {custFocus && custMatches.length > 0 && (
                        <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto">
                          <p className="text-[10px] text-slate-400 px-3 pt-2 pb-1 font-semibold uppercase tracking-wide">ลูกค้าเก่า — กดเพื่อเติมข้อมูล</p>
                          {custMatches.map((c, i) => (
                            <button key={i} type="button" onMouseDown={e => e.preventDefault()} onClick={() => applyCustomer(c)}
                              className="w-full text-left px-3 py-2 hover:bg-emerald-50 border-t border-slate-50 flex flex-col gap-0.5">
                              <span className="text-sm font-semibold text-slate-800">{c.name}</span>
                              <span className="text-[11px] text-slate-500">
                                {c.tel ? `${c.tel} · ` : ""}{c.province || "—"} · ซื้อ {c.count} ครั้ง{c.lastCar ? ` · ล่าสุด ${c.lastCar}` : ""}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* เฟส 2: ประวัติการซื้อของลูกค้านี้ (โชว์ระหว่างปิดการขาย ช่วยอ้างอิง) */}
                    {custHistory.length > 0 && (
                      <div className="border border-violet-200 bg-violet-50/40 rounded-xl overflow-hidden">
                        <button type="button" onClick={() => setShowCustHist(p => !p)}
                          className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-violet-700 hover:bg-violet-50">
                          <span className="flex items-center gap-1.5"><History className="w-3.5 h-3.5" />ประวัติการซื้อของลูกค้านี้ ({custHistory.length})</span>
                          <ChevronDown className={`w-4 h-4 transition-transform ${showCustHist ? "rotate-180" : ""}`} />
                        </button>
                        {showCustHist && (
                          <div className="max-h-44 overflow-y-auto border-t border-violet-100">
                            {custHistory.map(h => (
                              <div key={h.id} className="px-3 py-2 flex items-center justify-between gap-2 text-xs border-t border-violet-50 first:border-0">
                                <div className="min-w-0">
                                  <p className="font-semibold text-slate-700 truncate">{h.forklift_brand} {h.forklift_model} <span className="text-slate-400 font-normal">· {h.forklift_unit_no}</span></p>
                                  <p className="text-[11px] text-slate-400">{String(h.created_at).slice(0, 10)} · {h.sales_staff || "—"} · {h.sale_status ?? "ขายแล้ว"}</p>
                                </div>
                                <span className="text-xs font-bold text-violet-700 whitespace-nowrap">฿{fmt(Number(h.actual_sale) || 0)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <SField label="เบอร์โทร *" error={errors.customer_tel}><input value={form.customer_tel} onChange={e => setForm({ ...form, customer_tel: e.target.value })} placeholder="0XX-XXX-XXXX" className={si(errors.customer_tel)} /></SField>
                    <div className="grid grid-cols-2 gap-3">
                      <SField label="ประเภทลูกค้า *" error={errors.customer_type}>
                        <select value={form.customer_type} onChange={e => setForm({ ...form, customer_type: e.target.value as CustomerType })} className={ss(errors.customer_type)}>
                          <option value="">-- เลือก --</option>
                          {fieldConfig.customerTypes.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </SField>
                      <SField label="จังหวัด *" error={errors.province}>
                        <select value={form.province} onChange={e => setForm({ ...form, province: e.target.value })} className={ss(errors.province)}>
                          <option value="">-- เลือก --</option>
                          {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </SField>
                    </div>
                    <SField label="ประเภทการชำระ *" error={errors.payment_type}>
                      <select value={form.payment_type} onChange={e => setForm({ ...form, payment_type: e.target.value as PaymentType, finance_company: "" })} className={ss(errors.payment_type)}>
                        <option value="">-- เลือก --</option>
                        {/* รวมค่าเดิมของดีลเก่า (เช่น บิลแวท) ถ้าไม่อยู่ในตัวเลือกปัจจุบัน — จะได้แก้ไขดีลเก่าได้ */}
                        {[...fieldConfig.paymentTypes, ...(form.payment_type && !fieldConfig.paymentTypes.includes(form.payment_type) ? [form.payment_type] : [])].map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </SField>
                    {form.payment_type === "ไฟแนนซ์" && (
                      <SField label="บริษัทไฟแนนซ์ *" error={errors.finance_company}>
                        <select value={form.finance_company} onChange={e => setForm({ ...form, finance_company: e.target.value })} className={ss(errors.finance_company)}>
                          <option value="">-- เลือกบริษัท --</option>
                          {fieldConfig.financeCompanies.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </SField>
                    )}
                    {/* ลูกค้าเครดิต — กรอกเลขใบวางบิล (แทนการแนบสลิป) */}
                    {form.payment_type === "เครดิต" && (
                      <SField label="เลขใบวางบิล *" error={errors.bill_note_no}>
                        <input value={form.bill_note_no} onChange={e => setForm({ ...form, bill_note_no: e.target.value })}
                          placeholder="กรอกเลขใบวางบิล" className={si(errors.bill_note_no)} />
                        <p className="text-[11px] text-slate-400 mt-1">ลูกค้าเครดิตไม่ต้องแนบสลิป — จบแค่กรอกเลขใบวางบิล</p>
                      </SField>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <SField label="ราคาขายจริง (฿) *" error={errors.actual_sale}><MoneyInput value={form.actual_sale} onChange={v => setForm({ ...form, actual_sale: v })} placeholder="บาท" className={si(errors.actual_sale)} /></SField>
                      <SField label="มัดจำ (฿)" error=""><MoneyInput value={form.deposit} onChange={v => setForm({ ...form, deposit: v })} placeholder="บาท" className={si("")} /></SField>
                    </div>
                    <SField label="วันส่งมอบ *" error={errors.delivery_date}><input type="date" value={form.delivery_date} onChange={e => setForm({ ...form, delivery_date: e.target.value })} className={si(errors.delivery_date)} /></SField>
                    {/* วันที่รับเงินเข้าบัญชี — กำหนดงวดจ่ายค่าคอม (ยังไม่รับเงิน = เว้นว่าง → ค่าคอมรอรับเงิน) */}
                    <SField label="วันที่รับเงินเข้าบัญชี (สำหรับงวดค่าคอม)" error="">
                      <input type="date" value={form.payment_received_date} onChange={e => setForm({ ...form, payment_received_date: e.target.value })} className={si("")} />
                      <p className="text-[11px] text-slate-400 mt-1">กรอกเมื่อเงินเข้าบัญชีจริง — ค่าคอมจะตกงวดเดือนนี้ (จ่ายวันที่ 25 เดือนถัดไป) · ยังไม่รับเงิน = เว้นว่าง</p>
                    </SField>

                    {/* ── การแจ้งเตือน (Part 4) ── */}
                    <div className="border border-amber-100 rounded-xl p-3.5 bg-amber-50/40">
                      <div className="flex items-center justify-between mb-2.5">
                        <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5"><Bell className="w-3.5 h-3.5" />ตั้งการแจ้งเตือน (ไม่บังคับ)</p>
                        <button type="button" onClick={() => setShowCustomNotifs(p => !p)}
                          className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-all ${showCustomNotifs ? "bg-amber-500 text-white border-amber-500" : "text-amber-600 border-amber-200 hover:bg-amber-100"}`}>
                          <Pencil className="w-3 h-3" />เพิ่มเอง{customNotifItems.length > 0 && ` (${customNotifItems.length})`}
                        </button>
                      </div>

                      {/* Fixed date fields with clear buttons */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5">วันหมดประกันรถ</label>
                          <div className="flex items-center gap-1">
                            <input type="date" value={form.warranty_expiry} onChange={e => setForm({ ...form, warranty_expiry: e.target.value })} className={`flex-1 ${si("")}`} />
                            {form.warranty_expiry && (
                              <button type="button" onClick={() => setForm({ ...form, warranty_expiry: "" })}
                                className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-all flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5">รอบเปลี่ยนอะไหล่</label>
                          <div className="flex items-center gap-1">
                            <input type="date" value={form.parts_schedule} onChange={e => setForm({ ...form, parts_schedule: e.target.value })} className={`flex-1 ${si("")}`} />
                            {form.parts_schedule && (
                              <button type="button" onClick={() => setForm({ ...form, parts_schedule: "" })}
                                className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-all flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Custom items — always visible once added */}
                      {customNotifItems.length > 0 && (
                        <div className="mt-3 border-t border-amber-100 pt-3 flex flex-col gap-1.5">
                          {customNotifItems.map((item, i) => (
                            <div key={i} className="flex items-center gap-2 bg-white border border-amber-100 rounded-lg px-2.5 py-1.5 text-xs">
                              <Bell className="w-3 h-3 text-amber-400 flex-shrink-0" />
                              <span className="flex-1 font-medium text-slate-700">{item.label}</span>
                              <span className="text-slate-400 text-xs">{item.date}</span>
                              <button type="button" onClick={() => setCustomNotifItems(p => p.filter((_, j) => j !== i))}
                                className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1 rounded transition-all flex-shrink-0">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add-form — toggled by pencil button */}
                      {showCustomNotifs && (
                        <div className="mt-3 border-t border-amber-100 pt-3">
                          <p className="text-xs font-semibold text-amber-700 mb-2">เพิ่มการแจ้งเตือนแบบกำหนดเอง</p>
                          <div className="flex gap-2">
                            <input value={newNotifLabel} onChange={e => setNewNotifLabel(e.target.value)}
                              placeholder="ชื่อการแจ้งเตือน เช่น ต่อภาษี..."
                              className="flex-1 border border-dashed border-amber-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder:text-slate-400 bg-white text-slate-800" />
                            <input type="date" value={newNotifDate} onChange={e => setNewNotifDate(e.target.value)}
                              className="border border-dashed border-amber-300 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white text-slate-800" />
                            <button type="button"
                              onClick={() => {
                                if (!newNotifLabel.trim() || !newNotifDate) return;
                                setCustomNotifItems(p => [...p, { label: newNotifLabel.trim(), date: newNotifDate }]);
                                setNewNotifLabel(""); setNewNotifDate("");
                              }}
                              disabled={!newNotifLabel.trim() || !newNotifDate}
                              className="bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors flex-shrink-0">
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <SField label="หมายเหตุ" error="">
                      <textarea value={form.remark} onChange={e => setForm({ ...form, remark: e.target.value })} rows={2} placeholder="หมายเหตุเพิ่มเติม..."
                        className="w-full border border-slate-200 hover:border-slate-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-800 placeholder:text-slate-400 resize-none transition-all" />
                    </SField>

                    {/* หลักฐานการชำระเงิน — บังคับแนบรูป (แนบได้หลายรูป) · ลูกค้าเครดิตซ่อน (ใช้เลขใบวางบิลแทน) */}
                    {form.payment_type !== "เครดิต" && (
                    <SField label={`หลักฐานการชำระเงิน * ${paymentProofs.length ? `(${paymentProofs.length} รูป)` : ""}`} error={errors.payment_proof}>
                      <input ref={paymentInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePaymentProof} />
                      {paymentProofs.length > 0 ? (
                        <div className="grid grid-cols-3 gap-2">
                          {paymentProofs.map((img, i) => (
                            <div key={i} className="relative aspect-square rounded-xl overflow-hidden border-2 border-emerald-300 bg-slate-100 group">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={driveImg(img)} alt={`หลักฐาน ${i + 1}`} className="w-full h-full object-cover" />
                              <button type="button" onClick={() => setPaymentProofs(prev => prev.filter((_, j) => j !== i))}
                                className="absolute top-1 right-1 bg-slate-900/70 hover:bg-red-500 text-white rounded-lg p-1"><X className="w-3.5 h-3.5" /></button>
                            </div>
                          ))}
                          {/* ปุ่มเพิ่มรูปเพิ่ม */}
                          <button type="button" onClick={() => paymentInputRef.current?.click()} disabled={paymentBusy}
                            className="aspect-square rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 hover:bg-emerald-50 flex flex-col items-center justify-center gap-1 text-emerald-600 disabled:opacity-50">
                            {paymentBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Plus className="w-5 h-5" /><span className="text-[11px] font-semibold">เพิ่มรูป</span></>}
                          </button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => paymentInputRef.current?.click()} disabled={paymentBusy}
                          className={`w-full border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center gap-1.5 transition-all ${errors.payment_proof ? "border-red-300 bg-red-50/40 hover:bg-red-50" : "border-emerald-300 bg-emerald-50/40 hover:bg-emerald-50"}`}>
                          {paymentBusy ? <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" /> : <Camera className={`w-6 h-6 ${errors.payment_proof ? "text-red-400" : "text-emerald-500"}`} />}
                          <span className={`text-sm font-semibold ${errors.payment_proof ? "text-red-600" : "text-emerald-700"}`}>{paymentBusy ? "กำลังอัปโหลด..." : "แตะเพื่อถ่าย/แนบสลิป (เลือกได้หลายรูป)"}</span>
                          <span className="text-[11px] text-slate-400">จำเป็นต้องแนบ — ห้ามข้าม</span>
                        </button>
                      )}
                    </SField>
                    )}

                    {/* Extra sale fields */}
                    {fieldConfig.saleExtraFieldDefs.length > 0 && (
                      <div className="border border-violet-100 rounded-2xl p-4 bg-violet-50/30">
                        <p className="text-xs font-semibold text-violet-700 mb-3 flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5" />รายการที่เพิ่มเอง</p>
                        <div className="flex flex-col gap-3">
                          {fieldConfig.saleExtraFieldDefs.map(def => (
                            <SField key={def.id} label={`${def.name}${def.type === "select" ? " ▼" : ""}`} error="">
                              {def.type === "select" ? (
                                <select value={saleCustomVals[def.id] ?? ""} onChange={e => setSaleCustomVals(p => ({ ...p, [def.id]: e.target.value }))} className={ss("")}>
                                  <option value="">-- เลือก --</option>
                                  {(def.options ?? []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                              ) : (
                                <input value={saleCustomVals[def.id] ?? ""} onChange={e => setSaleCustomVals(p => ({ ...p, [def.id]: e.target.value }))} placeholder={`กรอก${def.name}...`} className={si("")} />
                              )}
                            </SField>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── คำนวณกำไร (ราคาขาย − ต้นทุน − อุปกรณ์เสริม − ของแถม − ค่าขนส่ง) ── */}
                    {selected && (() => {
                      const isQ22K2 = /Q22K2/i.test(selected.model) && (String(selected.fuel || "").includes("ดีเซล") || /^CPCD/i.test(selected.model));
                      const sale = Number(form.actual_sale) || 0;
                      const cost = selected.cost_price || 0;
                      const addOnTotal = addOns.reduce((s, a) => s + (Number(a.price) || 0), 0); // อุปกรณ์เสริม = ต้นทุนเพิ่ม (หักจากกำไร)
                      const ship = Number(shippingCost) || 0;
                      const free = freebie ? 2800 : 0;
                      const profit = sale - cost - addOnTotal - free - ship;
                      return (
                        <div className="border border-emerald-100 bg-emerald-50/40 rounded-xl p-3 flex flex-col gap-2">
                          <p className="text-xs font-bold text-emerald-700 flex items-center gap-1.5"><Target className="w-3.5 h-3.5" />คำนวณกำไร</p>
                          {isQ22K2 && (
                            <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                              <input type="checkbox" checked={freebie} onChange={e => setFreebie(e.target.checked)} className="w-4 h-4 mt-0.5 flex-shrink-0" />
                              <span>มีของแถม (กรองเครื่อง/เกียร์/อากาศ + น้ำมันเครื่อง/เกียร์) — หักต้นทุน ฿2,800</span>
                            </label>
                          )}
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm text-slate-600 flex-shrink-0">ผู้ให้บริการขนส่ง</span>
                              <select value={shipSupplier} onChange={e => setShipSupplier(e.target.value)}
                                className="flex-1 min-w-[140px] border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300">
                                <option value="">— เลือกผู้ให้บริการ —</option>
                                {fieldConfig.shippingSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
                                <option value="อื่นๆ (ระบุเอง)">อื่นๆ (ระบุเอง)</option>
                              </select>
                            </div>
                            {shipSupplier === "อื่นๆ (ระบุเอง)" && (
                              <input value={shipSupplierOther} onChange={e => setShipSupplierOther(e.target.value)} placeholder="พิมพ์ชื่อผู้ให้บริการขนส่ง"
                                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                            )}
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-slate-600 flex-shrink-0">ค่าขนส่ง (บาท)</span>
                              <MoneyInput value={shippingCost} onChange={v => setShippingCost(v)} placeholder="0"
                                className="w-24 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                            </div>
                          </div>
                          <div className="border-t border-emerald-100 pt-2 text-sm flex flex-col gap-0.5">
                            <div className="flex justify-between text-slate-500"><span>ราคาขาย</span><span>฿{sale.toLocaleString()}</span></div>
                            <div className="flex justify-between text-slate-500"><span>− ต้นทุนสินค้า</span><span>฿{cost.toLocaleString()}</span></div>
                            {addOnTotal > 0 && <div className="flex justify-between text-slate-500"><span>− อุปกรณ์เสริม ({addOns.length} รายการ)</span><span>฿{addOnTotal.toLocaleString()}</span></div>}
                            {free > 0 && <div className="flex justify-between text-slate-500"><span>− ของแถม</span><span>฿{free.toLocaleString()}</span></div>}
                            {ship > 0 && <div className="flex justify-between text-slate-500"><span>− ค่าขนส่ง</span><span>฿{ship.toLocaleString()}</span></div>}
                            <div className={`flex justify-between font-bold pt-1 ${profit >= 0 ? "text-emerald-700" : "text-red-600"}`}><span>= กำไร</span><span>฿{profit.toLocaleString()}</span></div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── อุปกรณ์เสริม (Add-On) — ติดตั้งพร้อมรถ · ราคาเติมเอง ── */}
                    <div className="border border-slate-200 rounded-xl p-3 flex flex-col gap-2">
                      <p className="text-xs font-bold text-slate-600 flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" />อุปกรณ์เสริม (ถ้ามี)</p>
                      {addOns.map((a, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm bg-slate-50 rounded-lg px-2.5 py-1.5">
                          <span className="flex-1 text-slate-700">{a.name}</span>
                          <span className="text-indigo-600 font-bold">฿{a.price.toLocaleString()}</span>
                          <button type="button" onClick={() => setAddOns(addOns.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      ))}
                      <div className="flex gap-1.5">
                        <select value={newAddon.name} onChange={e => setNewAddon({ ...newAddon, name: e.target.value })}
                          className="flex-1 min-w-0 border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300">
                          <option value="">เลือกอุปกรณ์...</option>
                          {ADDON_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                        <MoneyInput value={newAddon.price} onChange={v => setNewAddon({ ...newAddon, price: v })}
                          placeholder="ราคา" className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                        <button type="button" onClick={() => { if (newAddon.name && newAddon.price) { setAddOns([...addOns, { name: newAddon.name, price: Number(newAddon.price) }]); setNewAddon({ name: "", price: "" }); } }}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3 text-sm font-bold flex-shrink-0">เพิ่ม</button>
                      </div>
                    </div>

                    {/* ── บริการหลังการขาย / รอบเช็ค — ต้องกรอกก่อนปิดการขาย (รถที่มีเงื่อนไขเข้าเซอร์วิส) ── */}
                    {/* (25 ก.ย. 2569 · ผู้ใช้สั่ง) เดิมกรอกได้หลังปิดการขายเท่านั้น ทำให้หลายดีลค้างไม่ได้ลง
                        ค่าคอมเลยเป็น 0 ย้อนหลัง · ย้ายมาให้กรอกตรงนี้ + บังคับก่อนกดปิดการขาย */}
                    {selected && (
                      <div className="pt-2">
                        {needWarranty && !warrantyFilled(selected) && (
                          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                            ⚠️ รถรุ่นนี้ขายพร้อมเงื่อนไขบริการ (เช็คฟรี {SVC_ROUNDS} รอบ) — <b>ต้องกรอกและกดบันทึกกล่องนี้ก่อน</b> ถึงจะปิดการขายได้
                          </p>
                        )}
                        <WarrantyBlock forklift={selected} actor={salesUser?.name || "ฝ่ายขาย"} defaultStart={form.delivery_date || ""} />
                      </div>
                    )}

                    {/* ── Action buttons (Part 3) ── */}
                    <div className="flex flex-col gap-2 pt-2">
                      {editingSale && (
                        <p className="text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                          <Pencil className="w-3.5 h-3.5 flex-shrink-0" />กำลังแก้ไขดีลเดิม — เลือกสถานะที่ต้องการบันทึกทับ (เปลี่ยนสถานะได้)
                        </p>
                      )}
                      {/* สรุปช่องที่ยังกรอกไม่ครบ — เด้งใกล้ปุ่มเวลากดแล้วไม่ผ่าน */}
                      {Object.keys(errors).length > 0 && (
                        <div id="sale-error-summary" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="font-bold mb-0.5">ยังบันทึกไม่ได้ — กรอกให้ครบก่อน:</p>
                            <p>{Object.entries(errors).map(([, msg]) => msg).join(" · ")}</p>
                          </div>
                        </div>
                      )}
                      <button type="submit" className={`w-full text-white font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] shadow-sm flex items-center justify-center gap-2 ${editingSale ? "bg-gradient-to-r from-violet-600 to-fuchsia-700 hover:from-violet-500 hover:to-fuchsia-600" : "bg-gradient-to-r from-indigo-600 to-blue-700 hover:from-indigo-500 hover:to-blue-600"}`}>
                        <CheckCircle className="w-4 h-4" />{editingSale ? "บันทึกการแก้ไข" : "ปิดการขาย / จัดส่งแล้ว"}
                      </button>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={handleReserve}
                          className="w-full bg-yellow-400 hover:bg-yellow-500 text-slate-900 font-bold py-3 rounded-xl transition-all active:scale-[0.98] shadow-sm flex items-center justify-center gap-1 text-xs">
                          📝 จอง/รอโอน
                        </button>
                        <button type="button" onClick={handleBook}
                          className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-xl transition-all active:scale-[0.98] shadow-sm flex items-center justify-center gap-1 text-xs">
                          📌 จอง/โอนมัดจำแล้ว
                        </button>
                        <button type="button" onClick={handleShipping}
                          className="w-full bg-orange-400 hover:bg-orange-500 text-white font-bold py-3 rounded-xl transition-all active:scale-[0.98] shadow-sm flex items-center justify-center gap-1 text-xs">
                          🚚 รอจัดส่ง
                        </button>
                        <button type="button" onClick={handleFinance}
                          className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-xl transition-all active:scale-[0.98] shadow-sm flex items-center justify-center gap-1 text-xs">
                          🏦 รอไฟแนนซ์
                        </button>
                      </div>
                    </div>
                    </>)}
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Photo Lightbox ── */}
      {selected && lightboxIdx !== null && selectedPhotos.length > 0 && (
        <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4" onClick={() => setLightboxIdx(null)}>
          <button onClick={() => setLightboxIdx(null)} className="absolute top-4 right-4 text-white/70 hover:text-white bg-white/10 rounded-full p-2"><X className="w-6 h-6" /></button>
          {lightboxIdx > 0 && <button onClick={e => { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1); }} className="absolute left-4 top-1/2 -translate-y-1/2 text-white bg-white/10 hover:bg-white/20 rounded-full p-3"><ChevronLeft className="w-6 h-6" /></button>}
          <div className="max-w-3xl max-h-[80vh]" onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={driveImg(selectedPhotos[lightboxIdx].url)} alt={selectedPhotos[lightboxIdx].label} className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl" />
          </div>
          {lightboxIdx < selectedPhotos.length - 1 && <button onClick={e => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-white bg-white/10 hover:bg-white/20 rounded-full p-3"><ChevronRight className="w-6 h-6" /></button>}
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">
            {selectedPhotos[lightboxIdx].label && <span className="font-semibold text-white">{selectedPhotos[lightboxIdx].label} · </span>}
            {lightboxIdx + 1} / {selectedPhotos.length}
          </p>
        </div>
      )}

      {/* ── รายการรถติดจอง (กดจาก stat banner) — ดูทีละยอด → กดเข้าดีล ── */}
      {showBooked && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[54] flex items-end sm:items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowBooked(false)}>
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-amber-50 flex-shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-800">รถติดจอง</h3>
                <p className="text-xs text-slate-500">{bookedCars.length} คัน — แตะแต่ละคันเพื่อดูรายละเอียดดีล</p>
              </div>
              <button onClick={() => setShowBooked(false)} className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0 p-4 flex flex-col gap-2">
              {bookedCars.map(f => {
                const sale = latestSaleFor(f.id);
                return (
                  <button key={f.id} onClick={() => { setShowBooked(false); if (sale) setDetailSale(sale); else openCheckout(f); }}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-amber-50 hover:border-amber-300 p-3 text-left transition-all active:scale-[0.99]">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md text-slate-600 bg-white border border-slate-200">#{displayCode(f)}</span>
                        {f.pi_no && displayCode(f) !== f.pi_no && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md text-violet-700 bg-violet-50 border border-violet-200">{piLabel(f.pi_no)}</span>}
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md text-amber-700 bg-amber-100 border border-amber-200">{f.status}</span>
                      </div>
                      <p className="font-semibold text-slate-800 text-sm">{f.brand} {f.model}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{sale
                        ? <>{sale.customer_name || "—"}{sale.sales_staff ? ` · ${sale.sales_staff}` : ""}{sale.deposit ? ` · มัดจำ ฿${Number(sale.deposit).toLocaleString()}` : ""}</>
                        : <span className="text-slate-400">ยังไม่มีดีลผูก — แตะเพื่อเปิดปิดการขาย</span>}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── ป๊อปอัพเตือนฝ่ายขาย: ดีลที่ยังลงข้อมูลรับประกันไม่ครบ → ค่าคอมยังไม่ออก ── */}
      {showWarnPopup && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setWarnDismissed(true); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="bg-red-100 text-2xl rounded-xl w-11 h-11 flex items-center justify-center flex-shrink-0">⚠️</div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-800">ยังลงข้อมูลไม่ครบ · ค่าคอมยังไม่ออก</h3>
                <p className="text-xs text-slate-500 mt-0.5">มี <b className="text-red-600">{blockedDeals.length} ดีล</b> ที่ยังไม่ลงข้อมูล<b>รับประกัน/บริการหลังการขาย</b> — ต้องลงให้ครบก่อน ค่าคอมถึงจะออก</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
              {blockedDeals.map(s => {
                const fk = forklifts.find(f => f.id === s.forklift_id);
                return (
                  <button key={s.id} onClick={() => { setWarnDismissed(true); setDetailSale(s); }}
                    className="flex items-center justify-between gap-2 border border-red-200 bg-red-50 hover:bg-red-100 rounded-xl px-3 py-2.5 text-left transition-colors">
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold text-slate-800 text-sm block truncate">{fk?.brand || s.forklift_brand} {fk?.model || s.forklift_model}</span>
                      <span className="text-[11px] text-slate-500">{s.customer_name || "—"}{s.delivery_date ? ` · ปิด ${s.delivery_date}` : ""}</span>
                    </span>
                    <span className="text-xs font-bold text-red-600 flex-shrink-0 whitespace-nowrap">ลงข้อมูล →</span>
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setWarnDismissed(true)}
                className="px-4 py-2 rounded-lg text-sm font-bold text-slate-600 border border-slate-200 hover:bg-slate-50">ไว้ทีหลัง</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sale Detail Modal (Part 2) ── */}
      {detailSale && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[55] flex items-end sm:items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) { setDetailSale(null); setDetailLightboxIdx(null); } }}>
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0 bg-indigo-50">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md text-slate-600 bg-white border border-slate-200">#{displayCode({ id: detailSale.forklift_id, SN: detailSale.forklift_unit_no, pi_no: detailSale.custom_fields?.["PI"] as string })}</span>
                  {(detailSale.custom_fields?.["PI"] as string) && <span className="text-[11px] font-bold px-2 py-0.5 rounded-md text-violet-700 bg-violet-50 border border-violet-200">{piLabel(detailSale.custom_fields?.["PI"] as string)}</span>}
                </div>
                <h3 className="text-base font-bold text-slate-800 truncate">{detailSale.forklift_brand} {detailSale.forklift_model}</h3>
                <p className="text-xs text-slate-500">รายละเอียดการขาย</p>
              </div>
              <button onClick={() => { setDetailSale(null); setDetailLightboxIdx(null); }} className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0 p-5 flex flex-col gap-3">
              {/* แถบความคืบหน้าดีล */}
              <DealProgress status={detailSale.sale_status} />
              {/* Status badge */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-bold px-3 py-1 rounded-full border ${SALE_STATUS_BADGE[detailSale.sale_status ?? "ขายแล้ว"]}`}>
                  {detailSale.sale_status ?? "ขายแล้ว"}
                </span>
                {detailSale.vehicle_type && (
                  <span className="text-xs bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full font-semibold">{detailSale.vehicle_type}</span>
                )}
                {detailSale.contact_source && (
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${CONTACT_SOURCE_COLORS[detailSale.contact_source] ?? "bg-slate-100 text-slate-600"}`}>{detailSale.contact_source}</span>
                )}
                {detailSale.sale_type && (
                  <span className="text-xs bg-violet-100 text-violet-700 px-2.5 py-1 rounded-full font-semibold">{detailSale.sale_type}</span>
                )}
              </div>

              {/* บริการหลังการขาย / รับประกัน — ฝ่ายขายลงข้อมูลให้ครบ (กันจ่ายค่าคอม) */}
              {(() => {
                const fk = forklifts.find(f => String(f.id) === String(detailSale.forklift_id) || (detailSale.forklift_unit_no && String(f.SN ?? "").toUpperCase() === String(detailSale.forklift_unit_no).toUpperCase()));
                // กติกา: ฝ่ายขายลงข้อมูลหลังการขายแล้ว → ล็อก แก้ไขไม่ได้ (แก้ที่ฝ่ายสต็อก/แอดมินเท่านั้น)
                return fk ? <WarrantyBlock forklift={fk} actor={salesUser?.name || "ฝ่ายขาย"} canEdit={!warrantyFilled(fk)} defaultStart={toGregorian(String(detailSale.delivery_date ?? "")).slice(0, 10)} /> : null;
              })()}

              {/* ── ยกเลิกการจอง — เฉพาะดีลที่ยังไม่ปิดขาด (ไม่ผ่านไฟแนนซ์/ลูกค้ายกเลิก) ── */}
              {!["ปิดการขาย/จัดส่งแล้ว", "ขายแล้ว"].includes(detailSale.sale_status ?? "") && (
                <div className="border border-rose-100 bg-rose-50/50 rounded-xl p-3">
                  {!cancelBox ? (
                    <button onClick={() => setCancelBox(true)} className="text-sm font-semibold text-rose-600 flex items-center gap-1.5 hover:text-rose-700">
                      <RotateCcw className="w-4 h-4" />ยกเลิกการจอง — คืนรถสู่สต็อก
                    </button>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-bold text-rose-700">เหตุผลการยกเลิก</p>
                      <select value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                        className="w-full border border-rose-200 rounded-lg px-2.5 py-2 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-300">
                        <option value="">— เลือกเหตุผล —</option>
                        <option value="ไม่ผ่านไฟแนนซ์">ไม่ผ่านไฟแนนซ์</option>
                        <option value="ลูกค้ายกเลิกการสั่งซื้อ">ลูกค้ายกเลิกการสั่งซื้อ</option>
                        <option value="รถมีปัญหา/เปลี่ยนคัน">รถมีปัญหา / เปลี่ยนคัน</option>
                        <option value="อื่นๆ">อื่นๆ</option>
                      </select>
                      <div className="flex gap-2">
                        <button onClick={cancelBooking} disabled={!cancelReason}
                          className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-sm font-bold py-2 rounded-lg transition-colors">ยืนยันยกเลิก</button>
                        <button onClick={() => { setCancelBox(false); setCancelReason(""); }}
                          className="px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-semibold py-2 rounded-lg transition-colors">ปิด</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <DetailRow label="รถ" value={`${detailSale.forklift_brand} ${detailSale.forklift_model} (${detailSale.forklift_unit_no})`} />
              <DetailRow label="พนักงานขาย" value={detailSale.sales_staff} />
              <DetailRow label="ชื่อลูกค้า" value={detailSale.customer_name} />
              <DetailRow label="เบอร์โทร" value={detailSale.customer_tel} />
              <DetailRow label="ประเภทลูกค้า" value={detailSale.customer_type} />
              <DetailRow label="จังหวัด" value={detailSale.province} />
              <DetailRow label="การชำระ" value={detailSale.payment_type + (detailSale.finance_company ? ` — ${detailSale.finance_company}` : "")} />
              <DetailRow label="ราคาขาย" value={`฿${detailSale.actual_sale.toLocaleString("th-TH")}`} highlight />
              <DetailRow label="มัดจำ" value={`฿${detailSale.deposit.toLocaleString("th-TH")}`} />
              <DetailRow label="วันส่งมอบ" value={detailSale.delivery_date} />
              <DetailRow label="วันที่บันทึก" value={detailSale.created_at} />
              {detailSale.warranty_expiry && (
                <DetailRow label="วันหมดประกัน"
                  value={`${detailSale.warranty_expiry}${(() => { const d = daysUntil(detailSale.warranty_expiry!); return d < 0 ? ` (เกินกำหนด ${Math.abs(d)} วัน)` : d === 0 ? " (วันนี้!)" : ` (เหลืออีก ${d} วัน)`; })()}`} />
              )}
              {detailSale.parts_schedule && (
                <DetailRow label="รอบเปลี่ยนอะไหล่"
                  value={`${detailSale.parts_schedule}${(() => { const d = daysUntil(detailSale.parts_schedule!); return d < 0 ? ` (เกินกำหนด ${Math.abs(d)} วัน)` : d === 0 ? " (วันนี้!)" : ` (เหลืออีก ${d} วัน)`; })()}`} />
              )}
              {(detailSale.custom_notifications ?? []).length > 0 && (
                <div className="border-t border-amber-100 pt-3 mt-1">
                  <p className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1.5"><Bell className="w-3 h-3" />การแจ้งเตือนแบบกำหนดเอง</p>
                  {(detailSale.custom_notifications ?? []).map((n, i) => {
                    const d = daysUntil(n.date);
                    const suffix = d < 0 ? ` (เกินกำหนด ${Math.abs(d)} วัน)` : d === 0 ? " (วันนี้!)" : ` (เหลืออีก ${d} วัน)`;
                    return <DetailRow key={i} label={n.label} value={`${n.date}${suffix}`} />;
                  })}
                </div>
              )}
              {detailSale.remark && <DetailRow label="หมายเหตุ" value={detailSale.remark} />}
              {(() => {
                const proofs = detailSale.payment_proofs?.length ? detailSale.payment_proofs : (detailSale.payment_proof ? [detailSale.payment_proof] : []);
                if (!proofs.length) return null;
                return (
                  <div className="border-t border-slate-100 pt-3 mt-1">
                    <p className="text-xs font-semibold text-emerald-700 mb-2 flex items-center gap-1.5"><Camera className="w-3.5 h-3.5" />หลักฐานการชำระเงิน ({proofs.length} รูป)</p>
                    <div className="grid grid-cols-2 gap-2">
                      {proofs.map((img, i) => (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img key={i} src={driveImg(img)} alt={`หลักฐาน ${i + 1}`} className="w-full max-h-72 object-contain rounded-xl border border-slate-200 bg-slate-50" />
                      ))}
                    </div>
                  </div>
                );
              })()}
              {(() => {
                // โชว์เฉพาะ custom field ที่อ่านง่าย — ข้ามค่า JSON (warranty/ประวัติ) + คีย์ internal
                const INTERNAL = new Set(["บริการหลังการขาย", "ประวัติแก้ไข", "เอกสารแนบ"]);
                const rows = Object.entries(detailSale.custom_fields ?? {}).filter(([k, v]) => {
                  const s = String(v ?? "").trim();
                  return s && !s.startsWith("{") && !s.startsWith("[") && !INTERNAL.has(k);
                });
                if (rows.length === 0) return null;
                return (
                  <div className="border-t border-slate-100 pt-3 mt-1">
                    <p className="text-xs font-semibold text-violet-700 mb-2">รายการเพิ่มเติม</p>
                    {rows.map(([k, v]) => <DetailRow key={k} label={k} value={v} />)}
                  </div>
                );
              })()}
              {detailInspPhotos.all.length > 0 && (
                <div className="border-t border-slate-100 pt-3 mt-1">
                  <p className="text-xs font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5" />รูปภาพประกอบ
                  </p>
                  {detailInspPhotos.receiver.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-amber-700 mb-2">🚛 รูปผู้รับรถ ({detailInspPhotos.receiver.length} รูป){detailInspPhotos.receiverNames && ` — ผู้รับ: ${detailInspPhotos.receiverNames}`}</p>
                      <div className="grid grid-cols-3 gap-2">
                        {detailInspPhotos.receiver.map((p, i) => (
                          <button key={i} onClick={() => setDetailLightboxIdx(i)}
                            className="relative aspect-square rounded-xl overflow-hidden bg-amber-50 group hover:ring-2 hover:ring-amber-400 transition-all">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={driveImg(p.url)} alt={p.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                            {p.label && <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[10px] font-semibold px-1.5 py-0.5 truncate text-center">{p.label}</span>}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center">
                              <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100" />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {detailInspPhotos.deliverer.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-indigo-700 mb-2">📦 รูปผู้ส่งมอบรถ ({detailInspPhotos.deliverer.length} รูป){detailInspPhotos.delivererNames && ` — ผู้ส่ง: ${detailInspPhotos.delivererNames}`}</p>
                      <div className="grid grid-cols-3 gap-2">
                        {detailInspPhotos.deliverer.map((p, i) => (
                          <button key={i} onClick={() => setDetailLightboxIdx(detailInspPhotos.receiver.length + i)}
                            className="relative aspect-square rounded-xl overflow-hidden bg-indigo-50 group hover:ring-2 hover:ring-indigo-400 transition-all">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={driveImg(p.url)} alt={p.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                            {p.label && <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[10px] font-semibold px-1.5 py-0.5 truncate text-center">{p.label}</span>}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center">
                              <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100" />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Photo Lightbox ── */}
      {detailSale && detailLightboxIdx !== null && detailInspPhotos.all.length > 0 && (
        <div className="fixed inset-0 bg-black/90 z-[70] flex items-center justify-center p-4" onClick={() => setDetailLightboxIdx(null)}>
          <button onClick={() => setDetailLightboxIdx(null)} className="absolute top-4 right-4 text-white/70 hover:text-white bg-white/10 rounded-full p-2"><X className="w-6 h-6" /></button>
          {detailLightboxIdx > 0 && (
            <button onClick={e => { e.stopPropagation(); setDetailLightboxIdx(detailLightboxIdx - 1); }} className="absolute left-4 top-1/2 -translate-y-1/2 text-white bg-white/10 hover:bg-white/20 rounded-full p-3"><ChevronLeft className="w-6 h-6" /></button>
          )}
          <div className="max-w-3xl max-h-[80vh]" onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={driveImg(detailInspPhotos.all[detailLightboxIdx].url)} alt={detailInspPhotos.all[detailLightboxIdx].label} className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl" />
          </div>
          {detailLightboxIdx < detailInspPhotos.all.length - 1 && (
            <button onClick={e => { e.stopPropagation(); setDetailLightboxIdx(detailLightboxIdx + 1); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-white bg-white/10 hover:bg-white/20 rounded-full p-3"><ChevronRight className="w-6 h-6" /></button>
          )}
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">
            {detailInspPhotos.all[detailLightboxIdx].label && <span className="font-semibold text-white">{detailInspPhotos.all[detailLightboxIdx].label} · </span>}
            {detailLightboxIdx + 1} / {detailInspPhotos.all.length}
          </p>
        </div>
      )}

      {/* ── Sales History Modal (Part 2) ── */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowHistory(false)}>
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[82vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <div><h3 className="text-base font-bold text-slate-800">การขายของฉัน</h3><p className="text-xs text-slate-500 mt-0.5">{mySales.length} ดีล · {myCustomers.length} ลูกค้า</p></div>
              <div className="flex items-center gap-2">
                <button onClick={exportMySalesExcel} disabled={mySales.length === 0}
                  className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-3 py-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  <Download className="w-4 h-4" /><span className="hidden sm:inline">Export Excel</span>
                </button>
                <button onClick={() => { setShowHistory(false); setDeleteConfirm(null); }} className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-all"><X className="w-5 h-5" /></button>
              </div>
            </div>

            {/* สลับ: ดีลของฉัน / ลูกค้าของฉัน */}
            <div className="flex gap-2 px-4 pt-3 flex-shrink-0">
              <button onClick={() => setHistoryView("deals")} className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold transition ${historyView === "deals" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>📋 ดีลของฉัน ({mySales.length})</button>
              <button onClick={() => setHistoryView("customers")} className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold transition ${historyView === "customers" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>👥 ลูกค้าของฉัน ({myCustomers.length})</button>
              <button onClick={() => setHistoryView("monthly")} className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold transition ${historyView === "monthly" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>📊 สรุปรายเดือน</button>
            </div>

            {/* Category Tabs (เฉพาะมุมมองดีล) */}
            {historyView === "deals" && (
            <div className="flex gap-1 px-4 pt-3 pb-2 border-b border-slate-100 flex-shrink-0 overflow-x-auto">
              {HISTORY_TABS.map(tab => {
                const count = tab.key === "all" ? mySales.length : mySales.filter(s => saleMatchesTab(String(s.sale_status ?? "ขายแล้ว"), tab.key)).length;
                return (
                  <button key={tab.key} onClick={() => setHistoryTab(tab.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${historyTab === tab.key ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                    {tab.label}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${historyTab === tab.key ? "bg-white/30 text-white" : "bg-white text-slate-500"}`}>{count}</span>
                  </button>
                );
              })}
            </div>
            )}

            {/* ค้นหาในดีลของฉัน — หาชื่อบริษัท/ลูกค้าที่ซื้อไป (เฉพาะมุมมองดีล) */}
            {historyView === "deals" && (
              <div className="px-4 pt-3 flex-shrink-0">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input value={dealSearch} onChange={e => setDealSearch(e.target.value)} placeholder="ค้นหาชื่อบริษัท / ลูกค้า / SN / รุ่น..."
                    className="w-full border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  {dealSearch && <button onClick={() => setDealSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>}
                </div>
              </div>
            )}

            {/* มุมมองดีลของฉัน */}
            {historyView === "deals" && (filteredHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400"><History className="w-10 h-10 text-slate-300 mb-2" /><p className="text-sm">ยังไม่มีประวัติการขาย</p></div>
            ) : (
              <div className="overflow-y-auto flex-1 min-h-0 p-4 flex flex-col gap-2">
                {filteredHistory.map(sale => (
                  <div key={sale.id} className="bg-slate-50 border border-slate-100 rounded-xl p-4 group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {sale.forklift_id && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isPendingId(sale.forklift_id) ? "text-amber-700 bg-amber-50 border border-amber-200" : "text-slate-600 bg-slate-100 border border-slate-200"}`}>#{displayCode({ id: sale.forklift_id, SN: sale.forklift_unit_no, pi_no: sale.custom_fields?.["PI"] as string })}</span>
                          )}
                          <p className="font-bold text-slate-800 text-sm">{sale.forklift_unit_no}</p>
                          <p className="text-slate-600 text-sm">{sale.forklift_brand} {sale.forklift_model}</p>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${SALE_STATUS_BADGE[sale.sale_status ?? "ขายแล้ว"]}`}>
                            {sale.sale_status ?? "ขายแล้ว"}
                          </span>
                          {/* สถานะอนุมัติจองจากสต็อก */}
                          {(() => {
                            const a = String(sale.custom_fields?.[STOCK_APPROVAL_FIELD] ?? "");
                            if (a === "รออนุมัติ") return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">⏳ รอสต็อกอนุมัติ</span>;
                            if (a === "ปฏิเสธ") return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">❌ สต็อกปฏิเสธ</span>;
                            if (a === "อนุมัติแล้ว") return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">✅ อนุมัติแล้ว</span>;
                            return null;
                          })()}
                        </div>
                        <p className="text-xs text-slate-500 mt-1 truncate">{sale.customer_name} · {sale.province}</p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${paymentBadgeClass(sale.payment_type)}`}>{sale.payment_type || "ไม่ระบุ"}</span>
                          {sale.contact_source && <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CONTACT_SOURCE_COLORS[sale.contact_source] ?? "bg-slate-100 text-slate-600"}`}>{sale.contact_source}</span>}
                          <span className="text-xs text-slate-500">{sale.created_at}</span>
                        </div>
                        {/* ── Notification countdown tags ── */}
                        {(() => {
                          const tags: { label: string; days: number }[] = [];
                          if (sale.warranty_expiry) tags.push({ label: "ประกันรถ", days: daysUntil(sale.warranty_expiry) });
                          if (sale.parts_schedule)  tags.push({ label: "เปลี่ยนอะไหล่", days: daysUntil(sale.parts_schedule) });
                          (sale.custom_notifications ?? []).forEach(n => tags.push({ label: n.label, days: daysUntil(n.date) }));
                          if (tags.length === 0) return null;
                          return (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {tags.map((tag, ti) => {
                                const expired  = tag.days < 0;
                                const urgent   = tag.days >= 0 && tag.days <= 7;
                                const upcoming = tag.days > 7 && tag.days <= 30;
                                const future   = tag.days > 30;
                                const cls = expired  ? "bg-red-100 text-red-700 border-red-200"
                                          : urgent   ? "bg-amber-100 text-amber-700 border-amber-200"
                                          : upcoming ? "bg-blue-100 text-blue-700 border-blue-200"
                                          : "bg-slate-100 text-slate-600 border-slate-200";
                                const label = expired
                                  ? `${tag.label} — เกินกำหนด ${Math.abs(tag.days)} วัน`
                                  : tag.days === 0
                                    ? `${tag.label} — วันนี้!`
                                    : future
                                      ? `${tag.label} — อีก ${tag.days} วัน`
                                      : `${tag.label} — เหลืออีก ${tag.days} วัน`;
                                return (
                                  <span key={ti} className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
                                    <Bell className="w-2.5 h-2.5 flex-shrink-0" />{label}
                                  </span>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                        <p className="font-bold text-indigo-700">฿{sale.actual_sale.toLocaleString("th-TH")}</p>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setDetailSale(sale)}
                            className="text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 p-1.5 rounded-lg transition-all flex items-center gap-1 text-xs font-medium">
                            <Eye className="w-3.5 h-3.5" />ดู
                          </button>
                          <button onClick={() => { setShowHistory(false); openEditSale(sale); }}
                            className="text-violet-600 hover:text-violet-800 hover:bg-violet-50 p-1.5 rounded-lg transition-all flex items-center gap-1 text-xs font-semibold">
                            <Pencil className="w-3.5 h-3.5" />แก้ไข
                          </button>
                        </div>
                        {deleteConfirm === sale.id ? (
                          <div className="flex gap-1.5 mt-1 justify-end">
                            <button onClick={() => handleDeleteSale(sale.id)} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1"><Trash2 className="w-3 h-3" />ลบ</button>
                            <button onClick={() => setDeleteConfirm(null)} className="bg-slate-200 text-slate-700 text-xs font-bold px-2.5 py-1.5 rounded-lg">ยกเลิก</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteConfirm(sale.id)} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {/* มุมมองลูกค้าของฉัน */}
            {historyView === "customers" && (myCustomers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <Users className="w-12 h-12 mb-3 opacity-40" />
                <p className="text-sm">ยังไม่มีข้อมูลลูกค้า</p>
              </div>
            ) : (
              <div className="overflow-y-auto flex-1 min-h-0 p-4 flex flex-col gap-2.5">
                {/* เฟส 2: ค้นหาลูกค้า */}
                <div className="relative flex-shrink-0">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input value={custSearch} onChange={e => setCustSearch(e.target.value)} placeholder="ค้นหาชื่อ / เบอร์ / จังหวัด..."
                    className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                {myCustomersFiltered.length === 0 ? (
                  <p className="text-center text-sm text-slate-400 py-10">ไม่พบลูกค้าตามที่ค้นหา</p>
                ) : myCustomersFiltered.map((c, i) => (
                  <div key={i} className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 truncate">{c.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {c.tel ? `☎ ${c.tel}` : "ไม่มีเบอร์"}{c.province ? ` · ${c.province}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-bold bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full">
                        {c.deals.length} ดีล
                      </span>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {c.deals.map((d, j) => (
                        <button key={j} onClick={() => { setShowHistory(false); setDetailSale(d); }}
                          className="text-[11px] bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                          {d.forklift_brand} {d.forklift_model} · {d.sale_status ?? "ขายแล้ว"}
                        </button>
                      ))}
                    </div>
                    {/* เฟส 2: เริ่มดีลใหม่ให้ลูกค้านี้ — เติมข้อมูลไว้ให้ */}
                    <button type="button" onClick={() => sellToCustomer(c.name, c.tel)}
                      className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl py-2 transition-all">
                      <Plus className="w-3.5 h-3.5" />ขายคันใหม่ให้ลูกค้านี้
                    </button>
                  </div>
                ))}
              </div>
            ))}

            {/* มุมมองสรุปรายเดือน (แดชบอร์ดของเซลล์ ตามรูป) */}
            {historyView === "monthly" && (
              myMonths.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <History className="w-12 h-12 mb-3 opacity-40" /><p className="text-sm">ยังไม่มีข้อมูลการขาย</p>
                </div>
              ) : (
                <div className="overflow-y-auto flex-1 min-h-0 p-4 flex flex-col gap-4">
                  {/* หัว: ชื่อเซลล์ — เดือน + ตัวเลือกเดือน */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <h4 className="text-lg font-bold text-slate-800">{salesUser?.name} — เดือน {monthLabel(histMonth)}</h4>
                      <p className="text-sm text-slate-500 mt-0.5">ขายทั้งหมด {monthly?.count ?? 0} คัน · รายได้ ฿{fmt(monthly?.revenue ?? 0)}</p>
                    </div>
                    <select value={histMonth} onChange={e => setHistMonth(e.target.value)}
                      className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400">
                      {myMonths.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
                    </select>
                  </div>

                  {/* กราฟแท่งยอดขายรายสัปดาห์ */}
                  {monthly && (
                    <div className="bg-slate-50/70 border border-slate-100 rounded-2xl p-4">
                      <p className="text-xs font-semibold text-slate-500 mb-3">ยอดขายรายสัปดาห์</p>
                      {(() => {
                        const max = Math.max(...monthly.weeks.map(w => w.total), 1);
                        return (
                          <div className="flex items-end justify-around gap-3 h-40">
                            {monthly.weeks.map((w, i) => (
                              <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-1.5">
                                <span className="text-[10px] font-bold text-slate-500">{w.total ? `฿${fmt(w.total)}` : ""}</span>
                                <div className="w-full rounded-t-lg bg-gradient-to-t from-orange-500 to-amber-400 transition-all"
                                  style={{ height: `${Math.max((w.total / max) * 100, w.total ? 4 : 0)}%` }} />
                                <span className="text-[11px] text-slate-400">สัปดาห์ {i + 1}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* รายการต่อสัปดาห์ */}
                  {monthly?.weeks.map((w, i) => w.deals.length === 0 ? null : (
                    <div key={i} className="border border-slate-100 rounded-2xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                        <span className="text-sm font-bold text-slate-700">สัปดาห์ {i + 1}</span>
                        <span className="text-sm font-semibold text-slate-500">฿{fmt(w.total)} · {w.deals.length} คัน</span>
                      </div>
                      <div className="flex flex-col">
                        {w.deals.map(s => (
                          <button key={s.id} onClick={() => { setShowHistory(false); setDetailSale(s); }}
                            className="flex items-start justify-between gap-3 px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-indigo-50/40 text-left transition-colors">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-800">{s.forklift_unit_no} — {s.forklift_brand} {s.forklift_model}</p>
                              <p className="text-xs text-slate-500 mt-0.5 truncate">{s.customer_name || "ไม่ระบุลูกค้า"} · </p>
                            </div>
                            <span className="text-sm font-bold text-indigo-700 whitespace-nowrap">฿{fmt(Number(s.actual_sale) || 0)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* ── Settings Modal (Sales) ── */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowSettings(false)}>
          <div className="w-full max-w-2xl shadow-2xl"
            style={{ height: "88vh", overflowY: "scroll", borderRadius: "24px", backgroundColor: "white" }}>

            <div style={{ position: "sticky", top: 0, zIndex: 10, backgroundColor: "white", borderBottom: "1px solid #f1f5f9" }}
              className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="bg-indigo-100 rounded-xl p-2"><Settings className="w-4 h-4 text-indigo-600" /></div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">จัดการตัวเลือกช่องกรอก (ฝ่ายขาย)</h3>
                  <p className="text-xs text-slate-500">แก้ไข เพิ่ม หรือลบตัวเลือกในแต่ละช่อง</p>
                </div>
              </div>
              <button onClick={() => { setShowSettings(false); setEditingSaleField(null); setExpandedSefId(null); resetSefWizard(); }}
                className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-all flex-shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4">
              {(Object.keys(SALE_FIELD_LABELS) as SaleDropdown[]).map(field => (
                <div key={field} className="border border-slate-100 rounded-2xl overflow-hidden">
                  <button onClick={() => setEditingSaleField(editingSaleField === field ? null : field)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors">
                    <span className="font-semibold text-slate-800 text-sm">{SALE_FIELD_LABELS[field]}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{fieldConfig[field].length} ตัวเลือก</span>
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${editingSaleField === field ? "rotate-180" : ""}`} />
                    </div>
                  </button>
                  {editingSaleField === field && (
                    <div className="p-4 flex flex-col gap-2 border-t border-slate-100">
                      {fieldConfig[field].map((opt, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          {sEditOpt?.idx === idx ? (
                            <>
                              <input autoFocus value={sEditOpt.val} onChange={e => setSEditOpt({ idx, val: e.target.value })}
                                onKeyDown={e => { if (e.key === "Enter") saveStdEditOption(); if (e.key === "Escape") setSEditOpt(null); }}
                                className="flex-1 border border-indigo-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                              <button onClick={saveStdEditOption} className="bg-indigo-600 hover:bg-indigo-700 text-white p-1.5 rounded-lg"><Check className="w-4 h-4" /></button>
                              <button onClick={() => setSEditOpt(null)} className="bg-slate-200 text-slate-700 p-1.5 rounded-lg"><X className="w-4 h-4" /></button>
                            </>
                          ) : (
                            <>
                              <span className="flex-1 text-sm text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-1.5">{opt}</span>
                              <button onClick={() => setSEditOpt({ idx, val: opt })} className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 p-1.5 rounded-lg transition-all"><Pencil className="w-3.5 h-3.5" /></button>
                              <button onClick={() => deleteStdOption(field, idx)} className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                            </>
                          )}
                        </div>
                      ))}
                      <div className="flex items-center gap-2 mt-1 pt-2 border-t border-slate-100">
                        <input value={sNewOpt} onChange={e => setSNewOpt(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); saveStdOption(); } }}
                          placeholder="พิมพ์ตัวเลือกใหม่..."
                          className="flex-1 border border-dashed border-emerald-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 placeholder:text-slate-400" />
                        <button onClick={saveStdOption} disabled={!sNewOpt.trim()}
                          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1">
                          <Plus className="w-3.5 h-3.5" />เพิ่ม
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Sale extra field defs */}
              <div className="border border-violet-100 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 bg-violet-50 flex items-center justify-between">
                  <span className="font-semibold text-violet-800 text-sm">รายการบันทึกเพิ่มในใบขาย</span>
                  <span className="text-xs text-violet-500">{fieldConfig.saleExtraFieldDefs.length} รายการ</span>
                </div>
                <div className="p-4 flex flex-col gap-3">
                  {fieldConfig.saleExtraFieldDefs.length === 0 && sefStep === null && (
                    <p className="text-xs text-slate-400 text-center py-2">ยังไม่มีรายการเพิ่มเติม</p>
                  )}
                  {fieldConfig.saleExtraFieldDefs.map(def => (
                    <div key={def.id} className="border border-slate-100 rounded-xl overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${def.type === "select" ? "bg-violet-100 text-violet-700" : "bg-slate-200 text-slate-600"}`}>
                          {def.type === "select" ? "ตัวเลือก" : "ข้อความ"}
                        </span>
                        {editingSefId === def.id ? (
                          <>
                            <input autoFocus value={editingSefVal} onChange={e => setEditingSefVal(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter" && editingSefVal.trim()) { renameSaleExtraFieldDef(def.id, editingSefVal); setEditingSefId(null); } if (e.key === "Escape") setEditingSefId(null); }}
                              className="flex-1 border border-indigo-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                            <button onClick={() => { if (editingSefVal.trim()) renameSaleExtraFieldDef(def.id, editingSefVal); setEditingSefId(null); }} className="text-white bg-indigo-600 hover:bg-indigo-700 p-1.5 rounded-lg"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setEditingSefId(null)} className="text-slate-600 bg-slate-200 p-1.5 rounded-lg"><X className="w-3.5 h-3.5" /></button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 text-sm font-semibold text-slate-800">{def.name}</span>
                            <button onClick={() => { setEditingSefId(def.id); setEditingSefVal(def.name); }} className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 p-1.5 rounded-lg transition-all"><Pencil className="w-3.5 h-3.5" /></button>
                            {def.type === "select" && (
                              <button onClick={() => setExpandedSefId(expandedSefId === def.id ? null : def.id)} className="text-slate-400 hover:text-violet-600 hover:bg-violet-50 p-1.5 rounded-lg transition-all">
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${expandedSefId === def.id ? "rotate-180" : ""}`} />
                              </button>
                            )}
                            <button onClick={() => removeSaleExtraFieldDef(def.id)} className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                          </>
                        )}
                      </div>
                      {def.type === "select" && expandedSefId === def.id && (
                        <div className="p-3 border-t border-slate-100 flex flex-col gap-2">
                          {(def.options ?? []).length === 0 && <p className="text-xs text-slate-400 text-center py-1">ยังไม่มีตัวเลือก</p>}
                          {(def.options ?? []).map((opt, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              {sefEditOpt?.idx === idx ? (
                                <>
                                  <input autoFocus value={sefEditOpt.val} onChange={e => setSefEditOpt({ idx, val: e.target.value })}
                                    onKeyDown={e => { if (e.key === "Enter" && sefEditOpt.val.trim()) { editSaleExtraFieldOption(def.id, idx, sefEditOpt.val); setSefEditOpt(null); } if (e.key === "Escape") setSefEditOpt(null); }}
                                    className="flex-1 border border-indigo-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                                  <button onClick={() => { if (sefEditOpt.val.trim()) editSaleExtraFieldOption(def.id, idx, sefEditOpt.val); setSefEditOpt(null); }} className="bg-indigo-600 text-white p-1.5 rounded-lg"><Check className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => setSefEditOpt(null)} className="bg-slate-200 text-slate-700 p-1.5 rounded-lg"><X className="w-3.5 h-3.5" /></button>
                                </>
                              ) : (
                                <>
                                  <span className="flex-1 text-sm text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-1.5">{opt}</span>
                                  <button onClick={() => setSefEditOpt({ idx, val: opt })} className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 p-1.5 rounded-lg transition-all"><Pencil className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => removeSaleExtraFieldOption(def.id, idx)} className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                                </>
                              )}
                            </div>
                          ))}
                          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                            <input value={sefNewOpt} onChange={e => setSefNewOpt(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter" && sefNewOpt.trim()) { addSaleExtraFieldOption(def.id, sefNewOpt); setSefNewOpt(""); } }}
                              placeholder="พิมพ์ตัวเลือกใหม่..."
                              className="flex-1 border border-dashed border-violet-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 placeholder:text-slate-400" />
                            <button onClick={() => { if (sefNewOpt.trim()) { addSaleExtraFieldOption(def.id, sefNewOpt); setSefNewOpt(""); } }} disabled={!sefNewOpt.trim()}
                              className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1">
                              <Plus className="w-3.5 h-3.5" />เพิ่ม
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {sefStep === null && (
                    <button onClick={() => setSefStep("name")}
                      className="w-full border-2 border-dashed border-violet-200 hover:border-violet-400 bg-violet-50/50 hover:bg-violet-50 text-violet-600 text-sm font-semibold rounded-xl py-2.5 transition-all flex items-center justify-center gap-1.5">
                      <Plus className="w-4 h-4" />เพิ่มรายการบันทึกใหม่
                    </button>
                  )}
                  {sefStep === "name" && (
                    <div className="border border-violet-200 bg-violet-50/40 rounded-2xl p-4 flex flex-col gap-3">
                      <p className="text-xs font-semibold text-violet-700">ขั้น 1 / 2 — ตั้งชื่อ</p>
                      <div className="flex items-center gap-2">
                        <input autoFocus value={sefName} onChange={e => setSefName(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter" && sefName.trim()) setSefStep("type"); if (e.key === "Escape") resetSefWizard(); }}
                          placeholder="ชื่อรายการ เช่น เลขสัญญา, ผู้ค้ำ..."
                          className="flex-1 border border-violet-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-slate-800 placeholder:text-slate-400" />
                        <button onClick={() => { if (sefName.trim()) setSefStep("type"); }} disabled={!sefName.trim()}
                          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white px-4 py-2.5 rounded-xl text-sm font-semibold">ต่อไป →</button>
                        <button onClick={resetSefWizard} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2.5 rounded-xl"><X className="w-4 h-4" /></button>
                      </div>
                    </div>
                  )}
                  {sefStep === "type" && (
                    <div className="border border-violet-200 bg-violet-50/40 rounded-2xl p-4 flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setSefStep("name")} className="text-violet-500 hover:text-violet-700 hover:bg-violet-100 p-1.5 rounded-lg"><ArrowLeft className="w-4 h-4" /></button>
                        <p className="text-xs font-semibold text-violet-700">&quot;{sefName}&quot; เป็นช่องแบบไหน?</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => { setSefType("text"); addSaleExtraFieldDef(sefName, "text"); resetSefWizard(); }}
                          className="flex flex-col items-center gap-2 border-2 border-slate-200 hover:border-emerald-400 bg-white hover:bg-emerald-50 rounded-2xl p-4 transition-all group">
                          <div className="bg-slate-100 group-hover:bg-emerald-100 rounded-xl p-2.5"><Type className="w-5 h-5 text-slate-500 group-hover:text-emerald-600" /></div>
                          <p className="text-sm font-bold text-slate-700 group-hover:text-emerald-700">ช่องพิมพ์</p>
                          <p className="text-xs text-slate-400 text-center">กรอกอิสระ</p>
                        </button>
                        <button onClick={() => { setSefType("select"); setSefStep("options"); }}
                          className="flex flex-col items-center gap-2 border-2 border-slate-200 hover:border-violet-400 bg-white hover:bg-violet-50 rounded-2xl p-4 transition-all group">
                          <div className="bg-slate-100 group-hover:bg-violet-100 rounded-xl p-2.5"><ListOrdered className="w-5 h-5 text-slate-500 group-hover:text-violet-600" /></div>
                          <p className="text-sm font-bold text-slate-700 group-hover:text-violet-700">ช่องตัวเลือก</p>
                          <p className="text-xs text-slate-400 text-center">กดเลือกจากรายการ</p>
                        </button>
                      </div>
                    </div>
                  )}
                  {sefStep === "options" && (
                    <div className="border border-violet-200 bg-violet-50/40 rounded-2xl p-4 flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setSefStep("type")} className="text-violet-500 hover:text-violet-700 hover:bg-violet-100 p-1.5 rounded-lg"><ArrowLeft className="w-4 h-4" /></button>
                        <p className="text-xs font-semibold text-violet-700">เพิ่มตัวเลือกสำหรับ &quot;{sefName}&quot;</p>
                      </div>
                      <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                        {sefOptions.length === 0 && <p className="text-xs text-slate-400 text-center py-2">ยังไม่มีตัวเลือก</p>}
                        {sefOptions.map((opt, i) => (
                          <div key={i} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
                            <span className="flex-1 text-sm text-slate-700">{opt}</span>
                            <button onClick={() => setSefOptions(p => p.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <input value={sefOptInput} onChange={e => setSefOptInput(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSefOption(); } }}
                          placeholder="พิมพ์ตัวเลือก..."
                          className="flex-1 border border-dashed border-violet-300 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 placeholder:text-slate-400 bg-white" />
                        <button onClick={addSefOption} disabled={!sefOptInput.trim()}
                          className="bg-slate-200 hover:bg-slate-300 disabled:opacity-40 text-slate-700 px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-1">
                          <Plus className="w-3.5 h-3.5" />เพิ่ม
                        </button>
                      </div>
                      <div className="flex items-center gap-2 pt-1 border-t border-violet-100">
                        <button onClick={resetSefWizard} className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 py-2 rounded-xl text-sm font-semibold">ยกเลิก</button>
                        <button onClick={commitSef} className="flex-1 bg-violet-600 hover:bg-violet-700 text-white py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5">
                          <Check className="w-4 h-4" />บันทึก ({sefOptions.length} ตัวเลือก)
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sales filter requests */}
              <div className="border border-indigo-100 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 bg-indigo-50 flex items-center justify-between">
                  <span className="font-semibold text-indigo-800 text-sm">ตัวกรองที่ขอเพิ่ม</span>
                  <span className="text-xs text-indigo-500">{fieldConfig.salesFilterRequests.length} ตัวกรอง</span>
                </div>
                <div className="p-4 flex flex-col gap-2">
                  {fieldConfig.salesFilterRequests.length === 0 && !showAddFilter && <p className="text-xs text-slate-400 text-center py-2">ยังไม่มีตัวกรองที่ขอเพิ่ม</p>}
                  {fieldConfig.salesFilterRequests.map(name => (
                    <div key={name} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
                      <span className="flex-1 text-sm text-slate-700">{name}</span>
                      <button onClick={() => removeSalesFilterRequest(name)} className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                  {/* เพิ่มตัวกรองใหม่ */}
                  {showAddFilter ? (
                    <div className="flex items-center gap-2">
                      <input autoFocus value={newFilterName} onChange={e => setNewFilterName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") confirmAddFilter(); if (e.key === "Escape") { setShowAddFilter(false); setNewFilterName(""); } }}
                        placeholder="ชื่อตัวกรอง เช่น ความยาวงา"
                        className="flex-1 border border-indigo-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                      <button onClick={confirmAddFilter} disabled={!newFilterName.trim()}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-lg disabled:opacity-40 transition-colors"><Check className="w-4 h-4" /></button>
                      <button onClick={() => { setShowAddFilter(false); setNewFilterName(""); }}
                        className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-2 rounded-lg transition-all"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <button onClick={() => setShowAddFilter(true)}
                      className="w-full border-2 border-dashed border-indigo-200 hover:border-indigo-400 text-indigo-600 hover:bg-indigo-50 rounded-lg py-2.5 flex items-center justify-center gap-1.5 text-sm font-semibold transition-all">
                      <Plus className="w-4 h-4" />เพิ่มตัวกรอง
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ผู้ช่วย AI พี่เก่ง (โครงไว้ก่อน — เติมความสามารถทีหลัง) ── */}
      {/* ── กล่องแจ้งเตือนผลอนุมัติจองจากฝ่ายสต็อก ── */}
      {showBookingNotif && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowBookingNotif(false)}>
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0 bg-amber-50">
              <div>
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><Bell className="w-4 h-4 text-amber-500" />การแจ้งเตือน</h3>
                <p className="text-xs text-slate-500 mt-0.5">{bookingNotifs.length + notifications.length} รายการ (รอบเช็ค/ประกัน + ผลอนุมัติจอง)</p>
              </div>
              <div className="flex items-center gap-1.5">
                {bookingNotifs.length > 0 && <button onClick={ackAllBookings} className="text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1.5 rounded-lg">รับทราบจองทั้งหมด</button>}
                <button onClick={() => setShowBookingNotif(false)} className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-all"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0 p-4 flex flex-col gap-2.5">
              {bookingNotifs.length === 0 && notifications.length === 0 && (
                <div className="flex flex-col items-center justify-center py-14 text-slate-400"><Bell className="w-10 h-10 text-slate-300 mb-2" /><p className="text-sm">ไม่มีการแจ้งเตือนใหม่</p></div>
              )}
              {/* รอบเช็ค/ประกัน/อะไหล่ (แจ้งเซลล์ผู้ขายคันนั้น) */}
              {notifications.map((n, i) => (
                <div key={`n${i}`} className={`border rounded-2xl p-3.5 ${n.days <= 1 ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-bold text-[11px] px-2 py-0.5 rounded-full ${n.days <= 1 ? "bg-red-500 text-white" : "bg-amber-500 text-white"}`}>{n.days === 0 ? "วันนี้!" : n.days < 0 ? `เกิน ${Math.abs(n.days)} วัน` : `อีก ${n.days} วัน`}</span>
                    <p className="font-semibold text-slate-800 text-sm">{n.sale.forklift_unit_no} — {n.sale.customer_name}</p>
                    {n.sale.id === "__test__" && <span className="text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-semibold">TEST</span>}
                  </div>
                  <p className={`text-[11px] mt-1 font-medium ${n.days <= 1 ? "text-red-600" : "text-amber-700"}`}>{n.type === "warranty" ? "🛡️ ประกันรถหมดอายุ" : n.type === "parts" ? "🔧 ถึงรอบเปลี่ยนอะไหล่" : n.type === "service" ? `🔧 ถึงรอบเช็ครับประกัน (${n.label})` : (n.label ?? "การแจ้งเตือนพิเศษ")}</p>
                </div>
              ))}
              {bookingNotifs.map(s => {
                const approved = String(s.custom_fields?.[STOCK_APPROVAL_FIELD] ?? "") === "อนุมัติแล้ว";
                return (
                  <div key={s.id} className={`border rounded-2xl p-3.5 ${approved ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-bold ${approved ? "text-emerald-700" : "text-red-700"}`}>{approved ? "✅ อนุมัติจองแล้ว — สต็อกออกเรียบร้อย" : "❌ ถูกปฏิเสธจากสต็อก — รถกลับสู่สต็อก"}</p>
                        <p className="font-semibold text-slate-800 text-sm mt-1">{s.forklift_brand} {s.forklift_model} <span className="text-xs text-slate-400">#{displayCode({ id: s.forklift_id, SN: s.forklift_unit_no, pi_no: s.custom_fields?.["PI"] as string })}</span></p>
                        <p className="text-[11px] text-slate-500 mt-0.5">ลูกค้า {s.customer_name || "—"} · ฿{Number(s.actual_sale || 0).toLocaleString("th-TH")}</p>
                        {!approved && s.custom_fields?.["เหตุผลปฏิเสธ"] && <p className="text-[11px] text-red-600 mt-1">เหตุผล: {s.custom_fields["เหตุผลปฏิเสธ"]}</p>}
                        {s.custom_fields?.["อนุมัติเมื่อ"] && <p className="text-[10px] text-slate-400 mt-0.5">{s.custom_fields["อนุมัติเมื่อ"]}{s.custom_fields?.["อนุมัติโดย"] ? ` · โดย ${s.custom_fields["อนุมัติโดย"]}` : ""}</p>}
                      </div>
                      <button onClick={() => ackBooking(s.id)} className="text-xs font-semibold text-slate-500 hover:text-slate-800 bg-white/70 hover:bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg flex-shrink-0">รับทราบ</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <AiAssistant salesUserName={salesUser?.name} />
    </div>
  );
}

// แถวปุ่มกรองสเปก — ชุดค่าเดียวกับที่ฝ่ายสต๊อกกรอก กดเลือก/กดซ้ำยกเลิก
function FilterChipRow({ label, options, value, onChange, fmt }: {
  label: string; options: string[]; value: string;
  onChange: (v: string) => void; fmt?: (v: string) => string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <div className="flex items-center gap-1.5 flex-wrap">
        {options.map(opt => (
          <button key={opt} type="button"
            onClick={() => onChange(value === opt ? "" : opt)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${value === opt
              ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
              : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-700"}`}>
            {fmt ? fmt(opt) : opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function SField({ label, error, children }: { label: string; error: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1.5">{label}</label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1"><AlertCircle className="w-3 h-3 flex-shrink-0" />{error}</p>}
    </div>
  );
}
function DetailRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-500 font-medium w-28 flex-shrink-0 pt-0.5">{label}</span>
      <span className={`text-sm flex-1 ${highlight ? "font-bold text-indigo-700" : "text-slate-800"}`}>{value}</span>
    </div>
  );
}
function si(error: string) {
  return `w-full border rounded-xl px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all ${error ? "border-red-300 bg-red-50" : "border-slate-200 hover:border-slate-300 bg-white"}`;
}
function ss(error: string) {
  return `w-full border rounded-xl px-3.5 py-2.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all ${error ? "border-red-300" : "border-slate-200 hover:border-slate-300"}`;
}
