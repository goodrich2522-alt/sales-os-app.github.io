"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Upload, X, CheckCircle, Truck, Camera, AlertCircle, LogOut, ChevronRight, Package, History, ImageOff, Hash, Calendar, User, FileText, PackageCheck, Clock, Search, RotateCcw, Building2, Briefcase, Trash2, MapPin, Link2, Download, RefreshCw } from "lucide-react";
import { useApp } from "@/lib/AppContext";
import { Forklift, Sale, InspectionRecord, INSPECTION_SLOTS, INSPECTION_EXTRA_SLOTS, InspectionSlotKey, SLOT_LABELS } from "@/lib/types";
import { driveImg } from "@/lib/img";
import { thaiDate, today, specCode } from "@/lib/format";
import { Lightbox } from "@/components/ui/Lightbox";

type TransporterRole = "ผู้รับรถ" | "ผู้ส่งมอบรถ";

export default function TransporterMain() {
  const router = useRouter();
  const { addInspection, deleteInspection, updateForklift, forklifts, sales, inspections, setActor, refresh } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const doRefresh = async () => { setRefreshing(true); await refresh(); setTimeout(() => setRefreshing(false), 400); };
  const [username, setUsername] = useState("");
  const [userphone, setUserphone] = useState("");
  const [role, setRole] = useState<TransporterRole>("ผู้รับรถ");
  const [showHistory, setShowHistory] = useState(false);
  const [histSearch, setHistSearch] = useState("");
  const [histDeleteId, setHistDeleteId] = useState<string | null>(null); // ยืนยันก่อนลบรายการประวัติ
  const [lightbox, setLightbox] = useState<{ imgs: string[]; idx: number } | null>(null);
  // รูปบังคับ 6 ช่อง (name plate / เอกสาร PI / รถ 4 มุม) + รูปเพิ่มเติมไม่บังคับ
  const [slotImages, setSlotImages] = useState<Partial<Record<InspectionSlotKey, string>>>({});
  const [extraImages, setExtraImages] = useState<string[]>([]);
  const [activeSlot, setActiveSlot] = useState<InspectionSlotKey | null>(null); // ช่องที่กำลังจะถ่าย
  const slotInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── ฟอร์มผู้รับรถ (flow ใหม่: เลือกผู้ผลิต → PI → เลือกคัน → กรอก SN/รูป) ──
  const [brandFilter, setBrandFilter] = useState("ทั้งหมด"); // กรองการ์ด PI ตามผู้ผลิต (HELI/HANGCHA/EP/ทั้งหมด)
  const [openPI, setOpenPI] = useState<string | null>(null);   // PI ที่กางดูรายการรถ
  const [recvCarId, setRecvCarId] = useState<string | null>(null); // รถที่เลือกรับ (เปิดฟอร์ม)
  const [receivedDate, setReceivedDate] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [unitNo, setUnitNo] = useState("");           // SN ที่กรอก (สำหรับรถที่ยังไม่มี SN)

  // ── ฟอร์มผู้ส่งรถ (กรอก SN → โชว์รายละเอียดรถให้ตรวจก่อนส่ง) ──
  const [delSN, setDelSN] = useState("");
  const [senderName, setSenderName] = useState("");
  const [deliverDate, setDeliverDate] = useState("");
  const [salesOwner, setSalesOwner] = useState("");
  const [delCompany, setDelCompany] = useState("");   // บริษัท/สถานที่ที่ไปส่ง (บังคับ)
  const [delLocation, setDelLocation] = useState("");  // ลิงก์โลเคชั่นหน้างาน (ไม่บังคับ)

  const MAX_DELIVERY_PHOTOS = 12;

  // ── สถานะหลังบันทึก (เพื่อยกเลิกรายการล่าสุด) ──
  const [done, setDone] = useState<null | { insId: string; before: Forklift | null; label: string }>(null);
  // ── ป๊อปอัพเตือน SN ซ้ำก่อนรับรถ (SN ตรงกับรถที่รับเข้าระบบแล้ว) ──
  const [dupConfirm, setDupConfirm] = useState<Forklift | null>(null);

  useEffect(() => {
    const name = localStorage.getItem("transporter_name");
    if (!name) { router.push("/transporter/login"); return; }
    // หน้าผู้ขนส่งจงใจไม่ผูก Supabase Auth (ล็อกอินด้วยชื่อเล่น+เบอร์) — ไม่ต้องเช็ค session
    setUsername(name); setReceiverName(name); setSenderName(name); setActor(`${name} (ขนส่ง)`);
    setUserphone(localStorage.getItem("transporter_phone") || "");
  }, [router]);

  const isReceiver = role === "ผู้รับรถ";

  // ===== ผู้รับรถ: เลือกผู้ผลิต → PI → คัน =====
  // โชว์ทุก PI ทุกคันในระบบ (เก็บข้อมูลไว้ทั้งหมด — รวมที่รับ/ขาย/เช่าแล้ว) · คนรับกดรับได้เฉพาะคัน "รอรับ"
  const waitingList = forklifts;
  // สถานะที่ผ่านขั้นรับแล้ว (ดูอย่างเดียว กดรับซ้ำไม่ได้)
  const isLockedStatus = (st: string) => String(st || "").trim() !== "รอรับ";
  // ตัวกรองตามผู้ผลิต (โฟล์คลิฟท์ที่ต้องรับเข้า) — โชว์ HELI/HANGCHA/EP เสมอ + ยี่ห้ออื่นที่มีรถในสต็อก
  const FORKLIFT_BRANDS = ["HELI", "HANGCHA", "EP"];
  const brandOf = (f: Forklift) => String(f.brand || "").trim().toUpperCase();
  const brandCount = (b: string) => waitingList.filter(f => brandOf(f) === b.toUpperCase()).length;
  // นับรถทั้งหมดของยี่ห้อ (รวมที่ปิดการขาย/รถเช่า) — ใช้แยกข้อความว่า "ไม่มีเลย" vs "รับ/ขาย/เช่าครบแล้ว"
  const brandTotalAll = (b: string) => forklifts.filter(f => brandOf(f) === b.toUpperCase()).length;
  const brandTabs = (() => {
    const present = [...new Set(waitingList.map(brandOf).filter(Boolean))];
    const extra = present.filter(b => !FORKLIFT_BRANDS.some(x => x.toUpperCase() === b)); // ยี่ห้ออื่นนอกเหนือ 3 ตัวหลัก
    return [...FORKLIFT_BRANDS, ...extra];
  })();
  // จัดกลุ่มรถรอรับตามเลข PI (กรองตามแบรนด์ก่อน) — โชว์เป็นการ์ด PI ให้กดเข้าไปดูรถแต่ละคัน
  const piGroups = (() => {
    const list = brandFilter === "ทั้งหมด" ? waitingList : waitingList.filter(f => brandOf(f) === brandFilter.toUpperCase());
    const m = new Map<string, Forklift[]>();
    list.forEach(f => { const pi = String(f.pi_no || "").trim() || "(ไม่มี PI)"; const a = m.get(pi) ?? []; a.push(f); m.set(pi, a); });
    const num = (pi: string) => { const mm = pi.match(/\d+/); return mm ? Number(mm[0]) : Number.MAX_SAFE_INTEGER; };
    return [...m.entries()].map(([pi, cars]) => ({ pi, cars })).sort((a, b) => num(a.pi) - num(b.pi) || a.pi.localeCompare(b.pi));
  })();
  const openPICars = openPI ? (piGroups.find(g => g.pi === openPI)?.cars ?? []) : [];
  const recvTarget: Forklift | null = recvCarId ? (forklifts.find(f => f.id === recvCarId) ?? null) : null;
  // SN ที่จะบันทึก: ถ้ารถมี SN จริงแล้วใช้เลย · ยังไม่มี (รถสั่งผลิต) → ใช้ที่กรอก
  const carHasSN = !!(recvTarget?.SN && String(recvTarget.SN).trim());
  const snForSave = (carHasSN ? String(recvTarget!.SN).trim() : unitNo.trim());
  const snKey = snForSave.toUpperCase();

  // ── รูปบังคับ: ต้องครบ 6 ช่องก่อนถึงจะยืนยันได้ (ทั้งผู้รับและผู้ส่ง) ──
  const filledSlots = INSPECTION_SLOTS.filter(s => !!slotImages[s.key]);
  const allSlotsFilled = filledSlots.length === INSPECTION_SLOTS.length;
  const missingSlotLabels = INSPECTION_SLOTS.filter(s => !slotImages[s.key]).map(s => s.label);

  const receiverValid = !!(recvTarget && receivedDate && receiverName.trim() && snForSave) && allSlotsFilled;

  // ── เช็ค SN ซ้ำ: SN ที่กรอก/มี ตรงกับรถอื่นที่ "รับเข้าระบบแล้ว" (สถานะไม่ใช่ 'รอรับ') → เตือนก่อน ──
  const snDupCar: Forklift | null = snKey
    ? (forklifts.find(f => f.id !== recvTarget?.id &&
        ((f.SN && String(f.SN).toUpperCase() === snKey) || String(f.id ?? "").toUpperCase() === snKey) &&
        String(f.status || "").trim() !== "รอรับ") || null)
    : null;

  // ===== ผู้ส่งรถ: กรอก SN → หา รถ + ดีล =====
  const delKey = delSN.trim().toUpperCase();
  const delFork = delKey ? (forklifts.find(f => f.SN && String(f.SN).toUpperCase() === delKey) || null) : null;
  const delSale: Sale | null = delKey
    ? (sales.filter(s => String(s.forklift_unit_no || "").toUpperCase() === delKey)
        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0] || null)
    : null;
  // ผู้ส่งมอบรถ: รูปอิสระ (ไม่บังคับ 6 ช่อง) แต่ต้องมีอย่างน้อย 1 และไม่เกิน 12 + บริษัทที่ไปส่ง
  const deliveryPhotosValid = extraImages.length >= 1 && extraImages.length <= MAX_DELIVERY_PHOTOS;
  const delValid = !!(delFork && senderName.trim() && deliverDate && delCompany.trim()) && deliveryPhotosValid;
  const targetReady = isReceiver ? !!recvTarget : !!delFork;


  // กรอก SN ผู้ส่ง → เติมชื่อเซลล์จากดีลให้อัตโนมัติ
  const handleDelSnChange = (v: string) => {
    setDelSN(v);
    const k = v.trim().toUpperCase();
    const sale = sales.filter(s => String(s.forklift_unit_no || "").toUpperCase() === k)
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];
    setSalesOwner(sale?.sales_staff || "");
  };

  // ===== รูป =====
  // ย่อรูปเป็น dataURL (ยาวสุด 800px, jpeg 72%) — ใช้ร่วมทั้งรูปช่องบังคับและรูปเพิ่มเติม
  const fileToResizedDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (!ev.target?.result) { reject(new Error("read fail")); return; }
        const img = new Image();
        img.onload = () => {
          const MAX = 800;
          const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * ratio);
          canvas.height = Math.round(img.height * ratio);
          canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.72));
        };
        img.src = ev.target.result as string;
      };
      reader.readAsDataURL(file);
    });

  // ถ่ายรูปลงช่องบังคับ (ทีละช่อง — แตะการ์ดช่องก่อนแล้วเลือกรูป)
  const handleSlotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // ให้เลือกไฟล์เดิมซ้ำได้ (กรณีถ่ายใหม่)
    if (!file || !activeSlot) return;
    const url = await fileToResizedDataUrl(file);
    setSlotImages(p => ({ ...p, [activeSlot]: url }));
    setActiveSlot(null);
  };
  const retakeSlot = (key: InspectionSlotKey) =>
    setSlotImages(p => { const n = { ...p }; delete n[key]; return n; });

  // รูปเพิ่มเติม (ผู้รับ = ไม่บังคับ ไม่จำกัด · ผู้ส่งมอบ = รูปหลัก จำกัด 12 รูป)
  const handleExtraUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const cap = isReceiver ? Infinity : MAX_DELIVERY_PHOTOS; // หน้าผู้ส่งมอบจำกัดไม่เกิน 12 รูป
    Array.from(files).forEach(async (file) => {
      const url = await fileToResizedDataUrl(file);
      setExtraImages(prev => (prev.length >= cap ? prev : [...prev, url]));
    });
    e.target.value = "";
  };
  const removeExtraImage = (idx: number) => setExtraImages(prev => prev.filter((_, i) => i !== idx));

  // รวมรูปส่งเข้า inspection: 6 ช่องเรียงตามลำดับ + รูปเพิ่มเติมต่อท้าย
  const buildImagePayload = () => {
    const slots: Partial<Record<InspectionSlotKey, string>> = { ...slotImages };
    // เรียงรูป: 6 ช่องบังคับ → ช่องเสริม (กล่องเครื่องมือ/ตู้ชาร์จ) → รูปเพิ่มเติม
    const ordered = [...INSPECTION_SLOTS, ...INSPECTION_EXTRA_SLOTS].map(s => slotImages[s.key]).filter(Boolean) as string[];
    return { images: [...ordered, ...extraImages], image_slots: slots };
  };

  // ===== บันทึก =====
  const submitReceiver = () => {
    if (!recvTarget || !snForSave) return;
    const insId = `ins_${Date.now()}`;
    const rd = thaiDate(receivedDate);
    addInspection({ id: insId, unit_no: snKey, transporter_name: receiverName.trim() || username, transporter_phone: userphone || undefined, date: receivedDate || today(), ...buildImagePayload(), role: "ผู้รับรถ" });
    const before = { ...recvTarget };
    // รถที่ติดจอง/มัดจำ/รอไฟแนนซ์ไว้แล้ว → คงสถานะเดิม (กันรถหลุดกลับพร้อมขายแล้วโดนขายซ้ำ)
    // รถทั่วไป (รอรับ/สั่งผลิต ฯลฯ) → นำเข้าอัตโนมัติขึ้น "พร้อมขาย" ทันที
    const curStatus = String(recvTarget.status || "").trim();
    const keepStatus = /จอง|มัดจำ|ไฟแนนซ์/.test(curStatus);
    const newStatus = keepStatus ? curStatus : "พร้อมขาย";
    updateForklift({
      ...recvTarget,
      SN: carHasSN ? recvTarget.SN : snForSave,     // รถสั่งผลิต → เติม SN จริงที่กรอก
      received_date: rd || recvTarget.received_date,
      status: newStatus,
    });
    setDone({ insId, before, label: keepStatus ? `รับรถ ${snForSave} แล้ว (คงสถานะ: ${curStatus})` : `รับรถ ${snForSave} แล้ว → พร้อมขาย (นำเข้าอัตโนมัติ)` });
  };

  const submitDeliverer = () => {
    if (!delFork) return;
    const insId = `ins_${Date.now()}`;
    addInspection({ id: insId, unit_no: delFork.SN, transporter_name: senderName.trim() || username, transporter_phone: userphone || undefined, date: deliverDate || today(), ...buildImagePayload(), role: "ผู้ส่งมอบรถ", delivery_company: delCompany.trim() || undefined, location_link: delLocation.trim() || undefined });
    setDone({ insId, before: null, label: `ส่งมอบ ${delFork.SN} → ${delCompany.trim()}` });
  };

  // ยกเลิกรายการล่าสุด — ลบ inspection + คืนรถกลับสถานะก่อนรับ (รถรอรับ → กลับเป็น "รอรับ" ไม่ลบทิ้ง)
  const undoLast = () => {
    if (!done) return;
    deleteInspection(done.insId);
    if (done.before) updateForklift(done.before); // revert: รอรับ→รอรับ / สต็อกเดิม→ค่าเดิม
    resetForm();
  };

  // ลบรายการในประวัติ — ลบเฉพาะ inspection (การเอารถออกจากสต็อกเป็นสิทธิ์ของฝ่ายสต็อกเท่านั้น
  // — เดิมหน้านี้ลบรถถาวรได้ ซึ่งเสี่ยงเกินไปสำหรับ role ผู้ขนส่ง · ดู DEV-PLAN ข้อ 2.3)
  const deleteHistory = (rec: { id: string; unit_no: string; role?: string }) => {
    deleteInspection(rec.id);
    setHistDeleteId(null);
  };

  const resetForm = () => {
    setSlotImages({}); setExtraImages([]); setActiveSlot(null); setDone(null); setDupConfirm(null);
    setOpenPI(null); setRecvCarId(null); setReceivedDate(""); setUnitNo("");
    setReceiverName(username);
    setDelSN(""); setSenderName(username); setDeliverDate(""); setSalesOwner("");
    setDelCompany(""); setDelLocation("");
  };

  // รับคันถัดไปใน PI เดิม — คงวันที่/ชื่อผู้รับ กลับไปหน้ารายการรถของ PI นั้น (batch รับหลายคันใน 1 PI)
  const startNextInPI = () => {
    setSlotImages({}); setExtraImages([]); setActiveSlot(null); setDone(null);
    setRecvCarId(null); setUnitNo("");
  };
  // จำนวนรถใน PI นี้ที่ยังรอรับ — ใช้โชว์ปุ่ม "รับคันถัดไป"
  // เหลือกี่คันที่ "ยังรอรับ" จริงใน PI นี้ (ไม่นับคันที่รับ/มีสถานะอื่นแล้ว) — ใช้โชว์ปุ่มรับคันถัดไป
  const remainingInPI = openPI ? (piGroups.find(g => g.pi === openPI)?.cars.filter(c => String(c.status || "").trim() === "รอรับ").length ?? 0) : 0;

  const switchRole = (r: TransporterRole) => { setRole(r); resetForm(); };
  const handleLogout = () => { localStorage.removeItem("transporter_name"); localStorage.removeItem("transporter_phone"); router.push("/transporter/login"); };

  const histFiltered = [...inspections]
    .filter(r => {
      const q = histSearch.trim().toLowerCase();
      return !q || String(r.unit_no ?? "").toLowerCase().includes(q) || String(r.transporter_name ?? "").toLowerCase().includes(q);
    })
    .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")) || String(b.id ?? "").localeCompare(String(a.id ?? "")));

  // ── Export ประวัติรับ-ส่งรถทุกคัน → Excel (สำรองข้อมูล + ส่งต่อให้ตำแหน่งอื่น) ──
  // ชีต 1 = รายเรคคอร์ด (พร้อมลิงก์รูปทุกช่อง) · ชีต 2 = สรุปรายคัน · export ตามที่ค้นหาอยู่ (ไม่ค้นหา = ทั้งหมด)
  const exportHistoryExcel = async () => {
    if (histFiltered.length === 0) return;
    const XLSX = await import("xlsx");

    // จับคู่รถจาก SN/รหัส เพื่อเติมยี่ห้อ/รุ่น/สถานะ/PI
    const fkByKey = new Map<string, Forklift>();
    forklifts.forEach(f => { if (f.SN) fkByKey.set(String(f.SN).toUpperCase(), f); fkByKey.set(String(f.id).toUpperCase(), f); });
    const findFk = (unit?: string) => unit ? (fkByKey.get(String(unit).toUpperCase()) || null) : null;

    // ── ชีต 1: ประวัติรับ-ส่งรถ (1 แถว = 1 ครั้งที่รับ/ส่ง) ──
    const recRows = histFiltered.map((r, i) => {
      const f = findFk(r.unit_no);
      const slots = (r.image_slots ?? {}) as Record<string, string>;
      const slotUrl = (k: string) => slots[k] ? driveImg(slots[k]) : "";
      const slotVals = new Set(Object.values(slots).filter(Boolean));
      const extras = (r.images ?? []).filter(u => !slotVals.has(u)).map(driveImg);
      return {
        "ลำดับ": i + 1,
        "วันที่": r.date ?? "",
        "บทบาท": r.role ?? "ผู้รับรถ",
        "รหัสรถ": f?.id ?? "",
        "SN": r.unit_no ?? "",
        "ยี่ห้อ": f?.brand ?? "",
        "รุ่น": f?.model ?? "",
        "สถานะรถ": f?.status ?? "",
        "PI": f?.pi_no ?? "",
        "ผู้ขนส่ง": r.transporter_name ?? "",
        "เบอร์": r.transporter_phone ?? "",
        "บริษัทที่ไปส่ง": r.delivery_company ?? "",
        "ลิงก์โลเคชั่น": r.location_link ?? "",
        "จำนวนรูป": (r.images ?? []).length,
        "รูป Name Plate": slotUrl("name_plate"),
        "รูปเอกสาร PI": slotUrl("pi_doc"),
        "รูปรถด้านหน้า": slotUrl("front"),
        "รูปรถด้านหลัง": slotUrl("back"),
        "รูปรถด้านซ้าย": slotUrl("left"),
        "รูปรถด้านขวา": slotUrl("right"),
        "รูปกล่องเครื่องมือ": slotUrl("toolbox"),
        "รูปตู้ชาร์จ": slotUrl("charger"),
        "รูปเพิ่มเติม (ลิงก์)": extras.join("\n"),
      };
    });
    const ws1 = XLSX.utils.json_to_sheet(recRows);
    ws1["!cols"] = [6, 12, 12, 16, 16, 12, 18, 14, 10, 16, 12, 20, 26, 8, 30, 30, 30, 30, 30, 30, 30, 30, 42].map(w => ({ wch: w }));

    // ── ชีต 2: สรุปรายคัน (เฉพาะรถที่มีประวัติ ≥ 1 ครั้ง) ──
    const byCar = new Map<string, { f: Forklift | null; unit: string; recv: InspectionRecord[]; send: InspectionRecord[] }>();
    histFiltered.forEach(r => {
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
        "รหัสรถ": g.f?.id ?? "",
        "SN": g.unit,
        "ยี่ห้อ": g.f?.brand ?? "",
        "รุ่น": g.f?.model ?? "",
        "สถานะรถ": g.f?.status ?? "",
        "PI": g.f?.pi_no ?? "",
        "ครั้งที่รับ": g.recv.length,
        "ครั้งที่ส่ง": g.send.length,
        "วันรับล่าสุด": lr?.date ?? "",
        "วันส่งล่าสุด": ls?.date ?? "",
        "บริษัทปลายทางล่าสุด": ls?.delivery_company ?? "",
        "รวมรูปทั้งหมด": [...g.recv, ...g.send].reduce((s, r) => s + (r.images?.length ?? 0), 0),
      };
    }).sort((a, b) => String(a["ยี่ห้อ"]).localeCompare(String(b["ยี่ห้อ"])) || String(a["รุ่น"]).localeCompare(String(b["รุ่น"])));
    const ws2 = XLSX.utils.json_to_sheet(carRows);
    ws2["!cols"] = [16, 16, 12, 18, 14, 10, 10, 10, 14, 14, 26, 12].map(w => ({ wch: w }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws2, "สรุปรายคัน");
    XLSX.utils.book_append_sheet(wb, ws1, "ประวัติรับ-ส่งรถ");
    XLSX.writeFile(wb, `ประวัติรับ-ส่งรถ_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const inp = "w-full border border-slate-200 hover:border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`rounded-xl p-2 ${isReceiver ? "bg-gradient-to-br from-yellow-400 to-amber-500" : "bg-gradient-to-br from-blue-500 to-indigo-600"}`}>
              {isReceiver ? <Truck className="w-5 h-5 text-slate-900" /> : <Package className="w-5 h-5 text-white" />}
            </div>
            <div>
              <p className="font-bold text-slate-800 text-sm leading-tight">ผู้ขนส่ง</p>
              <p className="text-slate-500 text-xs">{username}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={doRefresh} title="รีเฟรชข้อมูลล่าสุด"
              className="flex items-center gap-1.5 text-slate-600 hover:text-emerald-700 text-sm font-medium transition-colors duration-200 hover:bg-emerald-50 px-3 py-1.5 rounded-lg">
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-emerald-600" : ""}`} /><span className="hidden sm:inline">รีเฟรช</span>
            </button>
            <button onClick={() => setShowHistory(true)}
              className="flex items-center gap-1.5 text-slate-600 hover:text-amber-700 text-sm font-medium transition-colors duration-200 hover:bg-amber-50 px-3 py-1.5 rounded-lg">
              <History className="w-4 h-4" /><span className="hidden sm:inline">ประวัติ</span> ({inspections.length})
            </button>
            <button onClick={handleLogout}
              className="flex items-center gap-1.5 text-slate-500 hover:text-red-600 text-sm font-medium transition-colors duration-200 hover:bg-red-50 px-3 py-1.5 rounded-lg">
              <LogOut className="w-4 h-4" /><span className="hidden sm:inline">ออกจากระบบ</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">

        {/* Role Selector */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <p className="text-sm font-bold text-slate-700 mb-3">คุณเป็นผู้ใด?</p>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => switchRole("ผู้รับรถ")}
              className={`flex flex-col items-center gap-2.5 rounded-2xl p-4 border-2 transition-all ${role === "ผู้รับรถ" ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-slate-50 hover:border-amber-200 hover:bg-amber-50/40"}`}>
              <div className={`rounded-xl p-3 ${role === "ผู้รับรถ" ? "bg-amber-400" : "bg-slate-200"}`}>
                <Truck className={`w-6 h-6 ${role === "ผู้รับรถ" ? "text-slate-900" : "text-slate-500"}`} />
              </div>
              <div className="text-center">
                <p className={`text-sm font-bold ${role === "ผู้รับรถ" ? "text-amber-700" : "text-slate-600"}`}>ผู้รับรถ</p>
                <p className="text-xs text-slate-400 mt-0.5">รับมอบรถจากต้นทาง</p>
              </div>
              {role === "ผู้รับรถ" && <span className="text-xs bg-amber-500 text-white font-bold px-2.5 py-0.5 rounded-full">เลือกอยู่</span>}
            </button>
            <button onClick={() => switchRole("ผู้ส่งมอบรถ")}
              className={`flex flex-col items-center gap-2.5 rounded-2xl p-4 border-2 transition-all ${role === "ผู้ส่งมอบรถ" ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-slate-50 hover:border-indigo-200 hover:bg-indigo-50/40"}`}>
              <div className={`rounded-xl p-3 ${role === "ผู้ส่งมอบรถ" ? "bg-indigo-500" : "bg-slate-200"}`}>
                <Package className={`w-6 h-6 ${role === "ผู้ส่งมอบรถ" ? "text-white" : "text-slate-500"}`} />
              </div>
              <div className="text-center">
                <p className={`text-sm font-bold ${role === "ผู้ส่งมอบรถ" ? "text-indigo-700" : "text-slate-600"}`}>ผู้ส่งมอบรถ</p>
                <p className="text-xs text-slate-400 mt-0.5">ส่งมอบรถให้ลูกค้า</p>
              </div>
              {role === "ผู้ส่งมอบรถ" && <span className="text-xs bg-indigo-500 text-white font-bold px-2.5 py-0.5 rounded-full">เลือกอยู่</span>}
            </button>
          </div>
        </div>

        {/* ============ บันทึกสำเร็จ + ยกเลิกได้ ============ */}
        {done ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div className="bg-emerald-100 rounded-xl p-2.5 flex-shrink-0"><CheckCircle className="w-7 h-7 text-emerald-600" /></div>
              <div>
                <p className="font-bold text-emerald-800">บันทึกเรียบร้อย! ({role})</p>
                <p className="text-sm text-emerald-600 mt-0.5">{done.label}</p>
              </div>
            </div>
            {/* รับหลายคันใน 1 PI — รับคันถัดไปโดยไม่ต้องกรอก PI/วันที่/ชื่อใหม่ */}
            {isReceiver && done.before && remainingInPI > 0 && (
              <button onClick={startNextInPI}
                className="w-full flex items-center justify-center gap-1.5 bg-gradient-to-r from-amber-400 to-amber-500 text-slate-900 font-bold py-3.5 rounded-xl transition-all active:scale-[0.98]">
                <Truck className="w-4 h-4" />รับคันถัดไปใน PI {openPI} (เหลือ {remainingInPI} คัน) <ChevronRight className="w-4 h-4" />
              </button>
            )}
            <div className="flex gap-2">
              <button onClick={undoLast}
                className="flex-1 flex items-center justify-center gap-1.5 border border-red-200 text-red-600 hover:bg-red-50 font-semibold py-3 rounded-xl transition-all">
                <RotateCcw className="w-4 h-4" />ยกเลิกรายการนี้
              </button>
              <button onClick={resetForm}
                className="flex-1 flex items-center justify-center gap-1.5 bg-gradient-to-r from-emerald-500 to-green-600 text-white font-semibold py-3 rounded-xl transition-all">
                {isReceiver && remainingInPI > 0 ? "เริ่ม PI ใหม่" : "ทำรายการต่อไป"} <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : isReceiver ? (
          /* ============ ผู้รับรถ (เลือก PI → เลือกคัน → กรอก SN/รูป) ============ */
          !recvTarget ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              {!openPI ? (
                /* ── ระดับ 1: การ์ดเลข PI ── */
                <>
                  <h2 className="text-base font-bold text-slate-800 mb-1 flex items-center gap-2"><FileText className="w-4 h-4 text-amber-500" />เลือกผู้ผลิต แล้วเลือกเลข PI ที่จะรับเข้า</h2>
                  <p className="text-xs text-slate-500 mb-3">โชว์ทุก PI ทุกคันในระบบ (เลื่อนหา PI ที่รับจริง) · กดรับได้เฉพาะคัน &ldquo;รอรับ&rdquo; · คันที่รับ/ขาย/เช่าแล้วดูอย่างเดียว</p>
                  {/* แถบผู้ผลิต — HELI/HANGCHA/EP + ทั้งหมด (โชว์จำนวนรถต่อยี่ห้อ) */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {[{ b: "ทั้งหมด", n: waitingList.length }, ...brandTabs.map(b => ({ b, n: brandCount(b) }))].map(({ b, n }) => (
                      <button key={b} onClick={() => { setBrandFilter(b); setOpenPI(null); }}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${brandFilter === b ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-600 border-slate-200 hover:border-amber-300"}`}>
                        {b} <span className={`ml-1 ${brandFilter === b ? "text-amber-100" : "text-slate-400"}`}>{n}</span>
                      </button>
                    ))}
                  </div>
                  {piGroups.length === 0 ? (
                    (() => {
                      // ยี่ห้อนี้มีรถในระบบไหม (รวมที่ขาย/เช่าไปแล้ว) → แยกข้อความ
                      const allDone = brandFilter !== "ทั้งหมด" && brandTotalAll(brandFilter) > 0;
                      return (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                          <Truck className="w-10 h-10 text-slate-300 mb-2" />
                          {allDone ? (
                            <><p className="text-sm">รถ {brandFilter} รับเข้าคลัง/ขาย/เช่าครบแล้ว</p>
                              <p className="text-xs text-slate-400 mt-1">ไม่มีรถ {brandFilter} รอรับเข้า · ดูรถทั้งหมดที่หน้าฝ่ายสต็อก</p></>
                          ) : (
                            <><p className="text-sm">{brandFilter === "ทั้งหมด" ? "ยังไม่มีรถในระบบ" : `ยังไม่มีรถ ${brandFilter} ในระบบ`}</p>
                              <p className="text-xs text-slate-400 mt-1">เพิ่มรถที่ฝ่ายสต็อก (นำเข้า PI) ก่อน</p></>
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    /* จัดกลุ่มแยกปี พ.ศ. (PI67-=2567 · PI68-=2568 · PIxxx=2569) กันสับสน */
                    (() => {
                      const yearOf = (pi: string) => /^PI67-/i.test(pi) ? "2567" : /^PI68-/i.test(pi) ? "2568" : pi === "(ไม่มี PI)" ? "ไม่ระบุปี" : "2569";
                      const piShort = (pi: string) => pi.replace(/^PI6[78]-/i, "PI"); // PI68-016 → PI016
                      const order = ["2569", "2568", "2567", "ไม่ระบุปี"];
                      const byYear = new Map<string, typeof piGroups>();
                      piGroups.forEach(g => { const y = yearOf(g.pi); const a = byYear.get(y) ?? []; a.push(g); byYear.set(y, a); });
                      return (
                        <div className="flex flex-col gap-4">
                          {order.filter(y => byYear.has(y)).map(y => {
                            const gs = byYear.get(y)!;
                            const cars = gs.reduce((s, g) => s + g.cars.length, 0);
                            return (
                              <div key={y}>
                                <div className="flex items-center gap-2 mb-2 sticky top-0">
                                  <span className={`text-sm font-bold px-2.5 py-1 rounded-lg ${y === "2569" ? "bg-amber-500 text-white" : "bg-slate-200 text-slate-700"}`}>📅 พ.ศ. {y}</span>
                                  <span className="text-xs text-slate-400">{gs.length} PI · {cars} คัน</span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                                  {gs.map(g => (
                                    <button key={g.pi} onClick={() => setOpenPI(g.pi)}
                                      className="flex flex-col items-center gap-1 rounded-2xl border-2 border-amber-200 bg-amber-50/50 hover:border-amber-400 hover:bg-amber-50 p-4 transition-all active:scale-[0.97]">
                                      <Hash className="w-4 h-4 text-amber-500" />
                                      <span className="text-base font-bold text-slate-800 leading-tight text-center break-all">{piShort(g.pi)}</span>
                                      <span className="text-xs font-semibold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">{g.cars.length} คัน</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()
                  )}
                </>
              ) : (
                /* ── ระดับ 2: รายการรถใน PI ที่เลือก ── */
                <>
                  <button onClick={() => setOpenPI(null)} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-amber-700 mb-3"><ChevronRight className="w-3.5 h-3.5 rotate-180" />เลือก PI อื่น</button>
                  <h2 className="text-base font-bold text-slate-800 mb-1 flex items-center gap-2"><Hash className="w-4 h-4 text-amber-500" />PI {openPI} — {openPICars.length} คัน</h2>
                  <p className="text-xs text-slate-500 mb-3">แตะรถที่จะรับเข้า แล้วกรอก SN (ถ้ายังไม่มี) + แนบรูป 6 ด้าน</p>
                  {/* เลขเอกสารตามคำสั่งซื้อของ PI นี้ (รหัสอ้างอิงนำเข้า / โน้ต PI) */}
                  {(() => {
                    const refs = [...new Set(openPICars.map(c => String(c.custom_fields?.["รหัสอ้างอิงนำเข้า"] || "").trim()).filter(Boolean))];
                    const notes = [...new Set(openPICars.map(c => String(c.custom_fields?.["โน้ต PI"] || "").trim()).filter(Boolean))];
                    if (!refs.length && !notes.length) return null;
                    return (
                      <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 mb-3 text-xs">
                        <p className="font-bold text-sky-800 flex items-center gap-1.5 mb-1"><FileText className="w-3.5 h-3.5" />เลขเอกสารคำสั่งซื้อ</p>
                        {refs.length > 0 && <p className="text-slate-600">รหัสอ้างอิงนำเข้า: {refs.map((r, i) => <span key={i} className="font-semibold text-sky-700">{r}{i < refs.length - 1 ? ", " : ""}</span>)}</p>}
                        {notes.length > 0 && <p className="text-slate-600 mt-0.5">โน้ต PI: <span className="font-medium text-slate-700">{notes.join(" · ")}</span></p>}
                      </div>
                    );
                  })()}
                  <div className="flex flex-col gap-2">
                    {openPICars.map(c => {
                      const noSN = !(c.SN && String(c.SN).trim());
                      const docRef = String(c.custom_fields?.["รหัสอ้างอิงนำเข้า"] || "").trim();
                      const st = String(c.status || "").trim();
                      // มีบันทึกรับรถแล้วหรือยัง (จับคู่ SN หรือ id)
                      const hasRecv = inspections.some(r => {
                        const u = String(r.unit_no ?? "").toUpperCase();
                        return (u === String(c.SN ?? "").toUpperCase() || u === String(c.id ?? "").toUpperCase()) && (r.role ?? "ผู้รับรถ") === "ผู้รับรถ";
                      });
                      // รับได้ = ยังไม่รับเข้าคลัง: "รอรับ" หรือ รถสั่งผลิต/จอง/มัดจำ/ไฟแนนซ์ ที่ยังไม่มีบันทึกรับ (จองก่อนรถมา)
                      const receivable = /รอรับ|จอง|มัดจำ|ไฟแนนซ์|สั่งผลิต/.test(st);
                      const waiting = st === "รอรับ" || (receivable && !hasRecv); // ยังไม่รับ = ป้ายส้ม กดรับได้ · รับแล้ว/ปิด/เช่า = เทา
                      return (
                        // กดรับได้: รถที่ยังไม่รับเข้าคลัง (รวมรถสั่งผลิตที่ถูกจองไว้) · คันที่ผ่านแล้ว = ดูอย่างเดียว
                        <button key={c.id} disabled={!waiting}
                          onClick={() => { if (waiting) { setRecvCarId(c.id); setUnitNo(String(c.SN || "")); } }}
                          className={`flex items-center gap-3 rounded-xl border p-3.5 transition-all text-left ${waiting ? "border-slate-200 bg-slate-50 hover:bg-amber-50 hover:border-amber-300 active:scale-[0.99]" : "border-slate-100 bg-white cursor-default opacity-90"}`}>
                          <div className={`border rounded-lg p-2 flex-shrink-0 ${waiting ? "bg-white border-slate-200" : "bg-slate-50 border-slate-100"}`}><Truck className={`w-4 h-4 ${waiting ? "text-amber-600" : "text-slate-400"}`} /></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-slate-800 text-sm">{c.brand} {c.model}</p>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${waiting ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-600"}`}>{st || "—"}</span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">{noSN
                              ? <span className="text-amber-600 font-semibold">รถสั่งผลิต · PI {c.pi_no || "—"} (ยังไม่มี SN — กรอกตอนรับ)</span>
                              : <>SN: <span className="font-semibold text-slate-700">{c.SN}</span></>}</p>
                            {docRef && <p className="text-[11px] text-sky-600 mt-0.5">เลขเอกสาร: <span className="font-semibold">{docRef}</span></p>}
                          </div>
                          {waiting ? <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          ) : (
            /* ── ระดับ 3: ฟอร์มรับรถของคันที่เลือก ── */
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <button onClick={() => { setRecvCarId(null); setSlotImages({}); setExtraImages([]); }} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-amber-700 mb-3"><ChevronRight className="w-3.5 h-3.5 rotate-180" />เลือกคันอื่นใน PI {recvTarget.pi_no}</button>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                <p className="font-bold text-slate-800 text-sm">{recvTarget.brand} {recvTarget.model}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{recvTarget.SN ? <>SN {recvTarget.SN} · </> : "รถสั่งผลิต · "}PI {recvTarget.pi_no || "—"}</p>
              </div>
              <div className="flex flex-col gap-3.5">
                {/* SN — มีแล้วโชว์เฉยๆ · รถสั่งผลิตให้กรอก */}
                {carHasSN ? (
                  <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5">
                    <PackageCheck className="w-4 h-4 flex-shrink-0" /><span className="text-xs font-medium">SN: <span className="font-bold">{recvTarget.SN}</span></span>
                  </div>
                ) : (
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5"><Hash className="w-3.5 h-3.5 text-amber-500" />SN (ซีเรียลรถจริง) <span className="text-red-500">*</span></label>
                    <input value={unitNo} onChange={e => setUnitNo(e.target.value)} placeholder="กรอกเลข SN ที่ตัวรถ เช่น 010503T1726" className={inp} />
                  </div>
                )}
                {/* หมายเหตุ: นำเข้าอัตโนมัติ */}
                <div className="flex items-center gap-2 text-xs rounded-xl px-3.5 py-2 text-emerald-700 bg-emerald-50 border border-emerald-200">
                  <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  ยืนยันแล้ว → พร้อมขายทันที (นำเข้าอัตโนมัติ)
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5"><Calendar className="w-3.5 h-3.5 text-amber-500" />วันที่รับรถ <span className="text-red-500">*</span></label>
                  <input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} className={inp} />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5"><User className="w-3.5 h-3.5 text-amber-500" />ชื่อผู้รับรถ <span className="text-red-500">*</span></label>
                  <input value={receiverName} onChange={e => setReceiverName(e.target.value)} placeholder="ชื่อผู้ไปรับรถ" className={inp} />
                </div>
              </div>
            </div>
          )
        ) : (
          /* ============ ผู้ส่งมอบรถ ============ */
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <h2 className="text-base font-bold text-slate-800 mb-1 flex items-center gap-2"><FileText className="w-4 h-4 text-indigo-500" />ข้อมูลการส่งมอบรถ</h2>
            <p className="text-xs text-slate-500 mb-4">กรอก SN ของรถที่จะส่ง ระบบจะขึ้นรายละเอียดให้ตรวจเช็คก่อนส่ง ถ้าไม่ถูกกดยกเลิกได้</p>
            <div className="flex flex-col gap-3.5">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5"><Hash className="w-3.5 h-3.5 text-indigo-500" />SN (ซีเรียลรถ)</label>
                <input value={delSN} onChange={e => handleDelSnChange(e.target.value)} placeholder="เช่น 010503T1726"
                  className="w-full border border-slate-200 hover:border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
                {delKey && (delFork ? (
                  <div className="mt-2 bg-indigo-50 border border-indigo-200 rounded-xl p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-indigo-700 flex items-center gap-1.5"><PackageCheck className="w-3.5 h-3.5" />ตรวจเช็ครถก่อนส่ง</p>
                      <button onClick={() => { setDelSN(""); setSalesOwner(""); }} className="text-indigo-400 hover:text-red-500" title="ยกเลิก"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="flex flex-col gap-1 text-sm">
                      <p className="font-bold text-slate-800">{delFork.brand} {delFork.model}</p>
                      <p className="text-xs text-slate-600"><span className="text-slate-400">รหัสสเปก:</span> {specCode(delFork) || "—"}</p>
                      <p className="text-xs text-slate-600"><span className="text-slate-400">ลูกค้า:</span> {delSale?.customer_name || "—"} · <span className="text-slate-400">เซลล์:</span> {delSale?.sales_staff || "—"}</p>
                      <p className="text-xs text-slate-600"><span className="text-slate-400">สถานะ:</span> {delFork.status || "—"}</p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span className="text-xs">ไม่พบรถ SN นี้ในระบบ — เช็คเลขให้ตรง</span>
                  </div>
                ))}
              </div>

              {delFork && (
                <>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5"><User className="w-3.5 h-3.5 text-indigo-500" />ผู้ส่งรถ</label>
                    <input value={senderName} onChange={e => setSenderName(e.target.value)} placeholder="ชื่อผู้ไปส่งรถ"
                      className="w-full border border-slate-200 hover:border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5"><Calendar className="w-3.5 h-3.5 text-indigo-500" />วันที่ส่งรถ</label>
                    <input type="date" value={deliverDate} onChange={e => setDeliverDate(e.target.value)}
                      className="w-full border border-slate-200 hover:border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5"><Briefcase className="w-3.5 h-3.5 text-indigo-500" />เซลล์เจ้าของงาน</label>
                    <input value={salesOwner} onChange={e => setSalesOwner(e.target.value)} placeholder="เซลล์เจ้าของดีล"
                      className="w-full border border-slate-200 hover:border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5"><Building2 className="w-3.5 h-3.5 text-indigo-500" />บริษัทที่ไปส่ง <span className="text-red-500">*</span></label>
                    <input value={delCompany} onChange={e => setDelCompany(e.target.value)} placeholder="ชื่อบริษัท / สถานที่ปลายทาง"
                      className="w-full border border-slate-200 hover:border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5"><MapPin className="w-3.5 h-3.5 text-indigo-500" />ลิงก์โลเคชั่นหน้างาน <span className="text-slate-400 font-normal">(ไม่บังคับ)</span></label>
                    <input value={delLocation} onChange={e => setDelLocation(e.target.value)} type="url" inputMode="url" placeholder="วางลิงก์ Google Maps ที่นี่"
                      className="w-full border border-slate-200 hover:border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
                    {delLocation.trim() && (
                      <a href={delLocation.trim()} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                        <Link2 className="w-3.5 h-3.5" />เปิดลิงก์เพื่อตรวจสอบ
                      </a>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ============ ถ่ายรูป — ผู้รับ: บังคับ 6 ช่อง · ผู้ส่งมอบ: อิสระ ไม่เกิน 12 รูป ============ */}
        {!done && targetReady && isReceiver && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Camera className="w-4 h-4 text-amber-500" />ถ่ายรูปสภาพรถ (บังคับ 6 รูป)
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{role}</span>
              </h3>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${allSlotsFilled ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                {filledSlots.length}/{INSPECTION_SLOTS.length} รูป
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              แตะช่องแล้วถ่าย/เลือกรูปให้ครบทุกช่อง — รูปทั้งหมดจะส่งเข้าหน้าเซลล์ให้ตรวจสอบพร้อมป้ายกำกับ
            </p>

            {/* ── 6 ช่องบังคับ ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {INSPECTION_SLOTS.map(slot => {
                const img = slotImages[slot.key];
                return img ? (
                  <div key={slot.key} className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 border-2 border-emerald-300 group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt={slot.label} className="w-full h-full object-cover" />
                    <span className="absolute bottom-0 inset-x-0 bg-emerald-600/90 text-white text-[11px] font-bold px-1.5 py-1 text-center truncate">
                      ✓ {slot.label}
                    </span>
                    <button onClick={() => retakeSlot(slot.key)} title="ถ่ายใหม่"
                      className="absolute top-1.5 right-1.5 bg-slate-900/70 hover:bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button key={slot.key} onClick={() => { setActiveSlot(slot.key); slotInputRef.current?.click(); }}
                    className="aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 transition-all border-amber-200 hover:border-amber-400 bg-amber-50/40 hover:bg-amber-50">
                    <span className="text-2xl">{slot.icon}</span>
                    <span className="text-xs font-bold text-slate-700 px-1 text-center leading-tight">{slot.label}</span>
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600">
                      <Camera className="w-3 h-3" />แตะเพื่อถ่าย
                    </span>
                  </button>
                );
              })}
            </div>
            {/* input ช่องบังคับ — ทีละรูป (capture เปิดกล้องบนมือถือ) */}
            <input ref={slotInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleSlotUpload} />

            {!allSlotsFilled && (
              <p className="mt-3 text-xs text-amber-600 flex items-start gap-1">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                ยังขาด: {missingSlotLabels.join(" · ")}
              </p>
            )}

            {/* ── ช่องรูปเสริม: กล่องเครื่องมือ + ตู้ชาร์จ (ไม่บังคับ — ถ่ายเมื่อมีของ) ── */}
            <div className="mt-5 pt-4 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-600 mb-2.5">อุปกรณ์แถม (ไม่บังคับ) — ถ่ายเมื่อมีของจริง</p>
              <div className="grid grid-cols-2 gap-2.5">
                {INSPECTION_EXTRA_SLOTS.map(slot => {
                  const img = slotImages[slot.key];
                  return img ? (
                    <div key={slot.key} className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 border-2 border-emerald-300">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img} alt={slot.label} className="w-full h-full object-cover" />
                      <span className="absolute bottom-0 inset-x-0 bg-emerald-600/90 text-white text-[11px] font-bold px-1.5 py-1 text-center truncate">✓ {slot.label}</span>
                      <button onClick={() => retakeSlot(slot.key)} title="ถ่ายใหม่"
                        className="absolute top-1.5 right-1.5 bg-slate-900/70 hover:bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center transition-colors"><X className="w-3 h-3" /></button>
                    </div>
                  ) : (
                    <button key={slot.key} onClick={() => { setActiveSlot(slot.key); slotInputRef.current?.click(); }}
                      className="aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 transition-all border-slate-200 hover:border-indigo-400 bg-slate-50 hover:bg-indigo-50/40">
                      <span className="text-2xl">{slot.icon}</span>
                      <span className="text-xs font-bold text-slate-700 px-1 text-center leading-tight">{slot.label}</span>
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-400"><Camera className="w-3 h-3" />ไม่บังคับ</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── รูปเพิ่มเติม (ไม่บังคับ) ── */}
            <div className="mt-5 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-xs font-semibold text-slate-600">รูปเพิ่มเติม (ไม่บังคับ) เช่น จุดที่มีตำหนิ</p>
                {extraImages.length > 0 && <span className="text-xs bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded-full">{extraImages.length} รูป</span>}
              </div>
              <button onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50 hover:bg-indigo-50/50 rounded-xl p-4 flex items-center justify-center gap-2 transition-all cursor-pointer group">
                <Upload className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                <span className="text-sm text-slate-600 group-hover:text-indigo-600 font-medium transition-colors">แตะเพื่อเพิ่มรูป</span>
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleExtraUpload} />
              {extraImages.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {extraImages.map((img, idx) => (
                    <div key={idx} className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img} alt={`รูปเพิ่มเติม ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      <button onClick={() => removeExtraImage(idx)} className="absolute top-1.5 right-1.5 bg-slate-900/70 hover:bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center transition-colors duration-200 opacity-0 group-hover:opacity-100"><X className="w-3 h-3" /></button>
                      <div className="absolute bottom-1 left-1 text-xs rounded px-1.5 py-0.5 font-semibold bg-amber-500/90 text-white">{idx + 1}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============ ผู้ส่งมอบรถ: ถ่ายรูปอิสระ (อย่างน้อย 1 · ไม่เกิน 12 รูป) ============ */}
        {!done && targetReady && !isReceiver && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Camera className="w-4 h-4 text-indigo-500" />ถ่ายรูปการส่งมอบ
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{role}</span>
              </h3>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${deliveryPhotosValid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                {extraImages.length}/{MAX_DELIVERY_PHOTOS} รูป
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              ถ่ายรูปอะไรก็ได้ตามหน้างาน (ไม่จำกัดว่าต้องเป็นมุมไหน) — อย่างน้อย 1 รูป สูงสุด {MAX_DELIVERY_PHOTOS} รูป · รูปจะส่งเข้าหน้าเซลล์ให้ตรวจสอบ
            </p>

            {extraImages.length < MAX_DELIVERY_PHOTOS ? (
              <button onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/40 hover:bg-indigo-50 rounded-xl p-5 flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer group">
                <Camera className="w-6 h-6 text-indigo-400 group-hover:text-indigo-600 transition-colors" />
                <span className="text-sm text-indigo-600 group-hover:text-indigo-700 font-semibold transition-colors">แตะเพื่อถ่าย/เลือกรูป</span>
                <span className="text-[11px] text-slate-400">เพิ่มได้อีก {MAX_DELIVERY_PHOTOS - extraImages.length} รูป</span>
              </button>
            ) : (
              <div className="w-full rounded-xl p-3 bg-emerald-50 border border-emerald-200 text-center text-xs font-semibold text-emerald-700">
                ครบ {MAX_DELIVERY_PHOTOS} รูปแล้ว (สูงสุด) — ลบรูปออกก่อนถ้าต้องการถ่ายใหม่
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handleExtraUpload} />

            {extraImages.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-3">
                {extraImages.map((img, idx) => (
                  <div key={idx} className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt={`รูปส่งมอบ ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    <button onClick={() => removeExtraImage(idx)} className="absolute top-1.5 right-1.5 bg-slate-900/70 hover:bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center transition-colors duration-200 opacity-0 group-hover:opacity-100"><X className="w-3 h-3" /></button>
                    <div className="absolute bottom-1 left-1 text-xs rounded px-1.5 py-0.5 font-semibold bg-indigo-500/90 text-white">{idx + 1}</div>
                  </div>
                ))}
              </div>
            )}

            {extraImages.length === 0 && (
              <p className="mt-3 text-xs text-amber-600 flex items-start gap-1">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />ต้องมีรูปการส่งมอบอย่างน้อย 1 รูป
              </p>
            )}
          </div>
        )}

        {/* ============ ปุ่มยืนยัน ============ */}
        {!done && targetReady && (
          <div className="flex flex-col gap-2">
            {isReceiver && !receiverValid && (
              <p className="text-xs text-amber-600 text-center flex items-center justify-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
กรอก SN · วันที่รับรถ · ชื่อผู้รับรถ ให้ครบ{!allSlotsFilled && ` + ถ่ายรูปให้ครบ 6 ช่อง (ขาด ${missingSlotLabels.length} รูป)`}
              </p>
            )}
            {!isReceiver && !delValid && (
              <p className="text-xs text-amber-600 text-center flex items-center justify-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                กรอก ผู้ส่งรถ · วันที่ส่งรถ · บริษัทที่ไปส่ง ให้ครบ{!deliveryPhotosValid && " + ถ่ายรูปการส่งมอบอย่างน้อย 1 รูป"}
              </p>
            )}
            <button onClick={() => { if (isReceiver && snDupCar) { setDupConfirm(snDupCar); return; } isReceiver ? submitReceiver() : submitDeliverer(); }} disabled={isReceiver ? !receiverValid : !delValid}
              className={`w-full text-white font-bold py-4 rounded-2xl transition-all duration-200 active:scale-[0.98] text-base shadow-md hover:shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-md disabled:active:scale-100 ${isReceiver ? "bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500" : "bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500"}`}>
              <CheckCircle className="w-5 h-5" />{isReceiver ? "ยืนยันรับมอบรถ" : "ยืนยันส่งมอบรถ"}<ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </main>

      {/* ── History Modal ── */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 flex items-end sm:items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowHistory(false)}>
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-100 flex flex-col gap-3 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-800">ประวัติรับ-ส่งรถ</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{histFiltered.length} รายการ</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={exportHistoryExcel} disabled={histFiltered.length === 0}
                    className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm font-semibold px-3 py-2 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    title="ส่งออกประวัติรถทุกคันเป็น Excel">
                    <Download className="w-4 h-4" /><span className="hidden sm:inline">Excel</span>
                  </button>
                  <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-all"><X className="w-5 h-5" /></button>
                </div>
              </div>
              <input value={histSearch} onChange={e => setHistSearch(e.target.value)} placeholder="ค้นหา หมายเลขรถ / ชื่อผู้ขนส่ง..."
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white text-slate-800 placeholder:text-slate-400" />
            </div>
            <div className="overflow-y-auto flex-1 min-h-0 p-4 flex flex-col gap-2.5">
              {histFiltered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-14 text-slate-400"><History className="w-10 h-10 text-slate-300 mb-2" /><p className="text-sm">ยังไม่มีประวัติ</p></div>
              )}
              {histFiltered.map(rec => {
                const receiver = (rec.role ?? "ผู้รับรถ") === "ผู้รับรถ";
                // หา PI ของรถคันนี้ (จับคู่ตาม SN/รหัสรถ) เพื่อบอกว่าอยู่ใน PI ไหน
                const key = String(rec.unit_no ?? "").toUpperCase();
                const fk = forklifts.find(f => String(f.SN ?? "").toUpperCase() === key || String(f.id ?? "").toUpperCase() === key);
                const pi = fk?.pi_no?.trim();
                return (
                  <div key={rec.id} className="border border-slate-100 rounded-2xl p-3.5 bg-slate-50/60">
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${receiver ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"}`}>{rec.role ?? "ผู้รับรถ"}</span>
                        <span className="font-bold text-slate-800 text-sm truncate">{rec.unit_no}</span>
                        {pi
                          ? <span className="text-[10px] font-bold text-orange-700 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-md flex-shrink-0">PI {pi}</span>
                          : <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md flex-shrink-0">ไม่มี PI</span>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-slate-400">{rec.date}</span>
                        <button onClick={() => setHistDeleteId(rec.id)} className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-all" title="ลบรายการนี้"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mb-2">โดย <span className="font-semibold text-slate-700">{rec.transporter_name || "—"}</span>{rec.transporter_phone ? ` · ☎ ${rec.transporter_phone}` : ""}</p>
                    {(rec.delivery_company || rec.location_link) && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2 text-xs">
                        {rec.delivery_company && <span className="text-slate-600 flex items-center gap-1"><Building2 className="w-3.5 h-3.5 text-indigo-500" />{rec.delivery_company}</span>}
                        {rec.location_link && (
                          <a href={rec.location_link} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />เปิดโลเคชั่น</a>
                        )}
                      </div>
                    )}
                    {histDeleteId === rec.id && (
                      <div className="flex items-center gap-2 mb-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                        <span className="text-xs text-red-700 flex-1">ลบรายการนี้ถาวร? (ตัวรถยังอยู่ในสต็อก — แจ้งฝ่ายสต็อกถ้าต้องเอารถออก)</span>
                        <button onClick={() => deleteHistory(rec)} className="text-xs font-bold bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg">ลบเลย</button>
                        <button onClick={() => setHistDeleteId(null)} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1.5">ยกเลิก</button>
                      </div>
                    )}
                    {rec.images && rec.images.length > 0 ? (
                      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                        {(() => {
                          // ป้ายชื่อช่อง (Name Plate/PI/4 มุม) จาก image_slots — รูปเก่าไม่มีป้าย
                          const urlToLabel = new Map(Object.entries(rec.image_slots ?? {}).map(([k, v]) => [v as string, SLOT_LABELS[k] ?? k]));
                          return rec.images.map((img, i) => (
                            <button key={i} onClick={() => setLightbox({ imgs: rec.images, idx: i })}
                              className="relative aspect-square rounded-lg overflow-hidden bg-slate-200 hover:ring-2 hover:ring-amber-400 transition-all">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={driveImg(img)} alt={urlToLabel.get(img) ?? ""} className="w-full h-full object-cover" />
                              {urlToLabel.get(img) && (
                                <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[9px] font-semibold px-1 py-0.5 truncate text-center">{urlToLabel.get(img)}</span>
                              )}
                            </button>
                          ));
                        })()}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 flex items-center gap-1"><ImageOff className="w-3.5 h-3.5" />ไม่มีรูป</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── ป๊อปอัพเตือน SN ซ้ำ (SN ตรงกับรถที่รับเข้าระบบแล้ว) ── */}
      {dupConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setDupConfirm(null)}>
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="px-6 pt-6 pb-4 flex flex-col items-center text-center gap-3">
              <div className="bg-amber-100 rounded-2xl p-3"><AlertCircle className="w-8 h-8 text-amber-600" /></div>
              <h3 className="text-lg font-bold text-slate-800">SN นี้มีรถอยู่ในระบบแล้ว</h3>
              <p className="text-sm text-slate-500">
                SN <span className="font-bold text-slate-700">{snKey}</span> ตรงกับรถที่รับเข้าระบบไปแล้ว:
              </p>
              <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-left">
                <p className="font-bold text-slate-800 text-sm">{dupConfirm.brand} {dupConfirm.model}</p>
                <p className="text-xs text-slate-500 mt-0.5">สถานะ: <span className="font-semibold text-amber-700">{dupConfirm.status || "—"}</span></p>
                {dupConfirm.pi_no && <p className="text-xs text-slate-500 mt-0.5">PI: {dupConfirm.pi_no}</p>}
              </div>
              <p className="text-xs text-amber-600">หากดำเนินการต่อจะเป็นการรับ/เพิ่มรถ SN นี้ซ้ำ — ต้องการทำต่อหรือไม่?</p>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button onClick={() => setDupConfirm(null)}
                className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold py-3 rounded-xl transition-all">ยกเลิก</button>
              <button onClick={() => { setDupConfirm(null); submitReceiver(); }}
                className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold py-3 rounded-xl transition-all active:scale-[0.98]">เพิ่มซ้ำ</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lightbox (ใช้ component กลาง) ── */}
      {lightbox && (
        <Lightbox
          imgs={lightbox.imgs}
          idx={lightbox.idx}
          onClose={() => setLightbox(null)}
          onIdx={next => setLightbox(l => l ? { ...l, idx: next } : l)}
        />
      )}
    </div>
  );
}
