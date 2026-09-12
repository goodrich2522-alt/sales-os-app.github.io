"use client";
// components/QuoteImport.tsx — นำเข้ารถจากใบเสนอราคา (เฟส 4)
// อ่าน PDF ในเบราว์เซอร์ (ไฟล์ไม่ออกนอกเครื่อง) → parse → คนตรวจ/แก้ → บันทึกเข้าสต็อก
// รอบแรกรองรับ HELI (text layer) · เจ้าอื่นทยอยเพิ่ม

import { useState } from "react";
import { useApp } from "@/lib/AppContext";
import { readPdfText, looksScanned, parseQuoteText, detectVendor, parseQuoteExcel, readExcelRows, isExcelFile, isImageFile, readImageText, normalizeStaxxModel, ParsedVehicle, KD_LEAD_MIN_DAYS, KD_LEAD_MAX_DAYS } from "@/lib/quoteImport";
import { categorizeModel } from "@/lib/constants";
import { today, addDays, thaiDate } from "@/lib/format";
import { Forklift } from "@/lib/types";
import { X, Upload, FileText, CheckCircle, AlertTriangle, Loader2, Trash2, Undo2, Plus, Factory } from "lucide-react";

export function QuoteImport({ onClose }: { onClose: () => void }) {
  const { addForkliftsBulk, forklifts, deleteForklift } = useApp();
  const [rows, setRows] = useState<ParsedVehicle[]>([]);
  const [busy, setBusy] = useState(false);
  const [ocr, setOcr] = useState<{ name: string; pct: number } | null>(null); // สถานะ OCR รูป
  const [vendor, setVendor] = useState("");
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState(0);
  const [skipped, setSkipped] = useState(0);         // จำนวนที่ข้ามเพราะ SN ซ้ำ
  const [savedMto, setSavedMto] = useState(0);       // จำนวนรถสั่งผลิต (KD) ที่บันทึกจริง
  const [skippedSns, setSkippedSns] = useState<string[]>([]); // SN ที่ถูกข้าม (โชว์ให้เห็นชัด)
  const [importedIds, setImportedIds] = useState<string[]>([]); // สำหรับปุ่มยกเลิกการนำเข้า
  const [done, setDone] = useState(false);           // บันทึกเสร็จแล้ว → แสดงหน้าสรุป
  const [receivedDate, setReceivedDate] = useState(""); // วันรับรถเข้า — ใส่ให้ทั้งล็อตตอนบันทึก
  const [orderDate, setOrderDate] = useState("");       // วันสั่งซื้อรถ (วันสั่งรถ) — ใส่ให้ทั้งล็อตตอนบันทึก
  const [lotStatus, setLotStatus] = useState<"auto" | "รอรับ" | "พร้อมขาย">("auto"); // สถานะเริ่มต้นของทั้งล็อต (auto = ตามแบรนด์)

  const existingIds = new Set(forklifts.map((f) => String(f.id)));

  // ── รถสั่งผลิต (KD) — ใบที่เลข PI ลงท้าย KD ยังไม่มี SN ตอนนี้ · SN มาตอนผลิตเสร็จ 60-90 วัน ──
  const isMto = (v: ParsedVehicle) => !!v.made_to_order && !String(v.SN ?? "").trim();
  const kdBase = orderDate || today();                              // นับจากวันสั่งรถ (ไม่กรอก = วันนี้)
  const kdFrom = addDays(kdBase, KD_LEAD_MIN_DAYS);
  const kdTo   = addDays(kdBase, KD_LEAD_MAX_DAYS);
  const mtoCount = rows.filter(isMto).length;
  // ติ๊กเอง — เผื่อเอกสารไม่ได้เขียน KD ไว้ หรือ parser อ่านไม่เจอ
  const toggleMto = (i: number) =>
    setRows((r) => r.map((v, j) => (j === i ? { ...v, made_to_order: !v.made_to_order } : v)));

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true); setNotice("");
    const all: ParsedVehicle[] = [];
    const vendors = new Set<string>();
    for (const f of Array.from(files)) {
      try {
        // Excel = Serial No. List ของ STAXX (มี SN จริงเป็นช่วง)
        if (isExcelFile(f.name)) {
          const res = parseQuoteExcel(await readExcelRows(f));
          if (res.vehicles.length === 0) { setNotice(`⚠️ "${f.name}" ไม่พบคอลัมน์ Serial No./Model`); continue; }
          vendors.add("STAXX (Serial List)");
          all.push(...res.vehicles);
          continue;
        }
        // รูป (JPEG/PNG) → OCR ในเครื่อง แล้วส่งเข้า parser เดิม
        if (isImageFile(f.name)) {
          setOcr({ name: f.name, pct: 0 });
          const text = await readImageText(f, (pct) => setOcr({ name: f.name, pct }));
          setOcr(null);
          const res = parseQuoteText(text);
          vendors.add(res.vendor === "unknown" ? "รูป (OCR)" : `${res.vendor} (OCR)`);
          if (res.vehicles.length === 0) {
            setNotice(`ℹ️ "${f.name}" อ่าน (OCR) แล้วยังจับรายการรถอัตโนมัติไม่ได้ (ภาพเอียง/ไม่ชัด/ตารางซับซ้อน) — กด "เพิ่มรถเอง" แล้วกรอกจากรูปได้`);
            continue;
          }
          all.push(...res.vehicles);
          continue;
        }
        // PDF
        const text = await readPdfText(f);
        if (looksScanned(text)) {
          const v = detectVendor(text);
          vendors.add(v === "unknown" ? "สแกน" : v);
          setNotice(`⚠️ "${f.name}" เป็นไฟล์สแกน (ไม่มี text layer) — ต้องใช้ OCR (ยังไม่รองรับ) หรือกรอกมือ`);
          continue;
        }
        const res = parseQuoteText(text);
        vendors.add(res.vendor);
        if (res.vendor === "unknown") { setNotice(`⚠️ "${f.name}" เดาผู้ผลิตไม่ได้`); continue; }
        if (res.vendor === "STAXX") { setNotice(`ℹ️ "${f.name}" เป็น STAXX — ใบ PDF ได้แค่รุ่น/ราคา · ใช้ไฟล์ Excel Serial List เพื่อดึง SN`); continue; }
        if (res.vehicles.length === 0) { setNotice(`⚠️ "${f.name}" (${res.vendor}) อ่านไม่พบรายการรถ — ตรวจไฟล์`); continue; }
        all.push(...res.vehicles);
      } catch (e) {
        setOcr(null);
        setNotice(`อ่าน "${f.name}" ไม่ได้: ${e instanceof Error ? e.message : "ผิดพลาด"}`);
      }
    }
    // ── merge ราคา FOB จาก Proforma STAXX → รถ Excel SN (จับคู่ตามรุ่น) ──
    const staxxSN = all.filter((v) => v.vendor === "STAXX" && v.SN);           // Excel: มี SN ไม่มีราคา
    const staxxPF = all.filter((v) => v.vendor === "STAXX" && !v.SN && v.fobUsd); // Proforma: มีราคาไม่มี SN
    const others = all.filter((v) => v.vendor !== "STAXX");
    let staxxRows: ParsedVehicle[];
    if (staxxSN.length && staxxPF.length) {
      const fobMap = new Map(staxxPF.map((v) => [normalizeStaxxModel(v.model), v.fobUsd!]));
      staxxRows = staxxSN.map((v) => {
        const fob = fobMap.get(normalizeStaxxModel(v.model));
        return fob ? { ...v, fobUsd: fob, flags: [...(v.flags ?? []), `ราคา FOB $${fob} — เติมราคาทุนบาทเอง`] } : v;
      });
      const hit = staxxRows.filter((v) => v.fobUsd).length;
      setNotice(`✅ จับคู่ราคา FOB จาก Proforma ให้ ${hit}/${staxxRows.length} คัน (ราคา FOB เป็น USD ไม่ใช่ราคาทุนบาท)`);
    } else {
      staxxRows = staxxSN.length ? staxxSN : staxxPF;
    }
    // ราคาทุนอิงตามเอกสารแต่ละชุดเท่านั้น (ไม่ดึงจากสต็อกเดิม เพราะต้นทุนขึ้นลงตามตลาด)
    setVendor([...vendors].join(", "));
    setRows([...others, ...staxxRows]);
    setOcr(null);
    setBusy(false);
  };

  const edit = (i: number, key: keyof ParsedVehicle, val: string) =>
    setRows((r) => r.map((v, j) => (j === i ? { ...v, [key]: val } : v)));
  const removeRow = (i: number) => setRows((r) => r.filter((_, j) => j !== i));
  // เพิ่มรถเอง (กรอกมือ) — สำรองกรณีอ่านไฟล์ PDF ไม่ได้ / เอกสารรูปแบบไม่รองรับ
  const addBlankRow = () => setRows((r) => [...r, { brand: "HELI", model: "", SN: "", vendor: "unknown", flags: ["เพิ่มเอง — ตรวจข้อมูลให้ครบ"] }]);

  const toForklift = (v: ParsedVehicle, i: number): Forklift => {
    // สถานะเริ่มต้น: เลือกเอง (รอรับ/พร้อมขาย) หรือ auto → STAXX/CNC มาเป็นตู้ทั้งล็อต ลงวันรับแล้วขายได้เลย · แบรนด์อื่นต้องผ่านผู้รับรถ = รอรับ
    // รถสั่งผลิต (KD) → สถานะ "สั่งผลิต" (ยังไม่เข้าคลัง · รอ SN) เว้นแต่ผู้ใช้เลือกสถานะล็อตเอง
    const finalStatus = lotStatus !== "auto" ? lotStatus
      : isMto(v) ? "สั่งผลิต"
      : ((/^(STAXX|CNC)$/i.test(v.brand) && receivedDate) ? "พร้อมขาย" : "รอรับ");
    return {
    // id: SN จริง > เลข PI ที่คนกรอก > รหัสอ้างอิงนำเข้าจริง > "PI" (กันชนกัน + ไม่โชว์ "#PI" เปล่า)
    id: v.SN || `${v.pi_no || v.import_ref || "PI"}#${i + 1}`,
    SN: v.SN || "",
    brand: v.brand, model: v.model,
    capacity: v.capacity || "", capacity_kg: v.capacity_kg || "",
    height: v.height || "", fuel: v.fuel || "",
    cost_price: Number(v.cost_price) || 0, stock_price: 0,
    status: finalStatus,
    created_at: today(),
    // "พร้อมขาย" ควรมีวันรับรถ → ถ้าไม่กรอกใช้วันนี้ · "รอรับ" ใช้ค่าที่กรอก (เว้นว่างได้ ค่อยเติมตอนรับ)
    received_date: receivedDate || (finalStatus === "พร้อมขาย" ? today() : undefined),
    vehicle_category: categorizeModel(v.model),
    pi_no: v.pi_no || undefined,   // เว้นว่างสำหรับใบเสนอราคา — เติมเลข PI จริงทีหลัง
    custom_fields: {
      ...(v.mast ? { MAST: v.mast } : {}),
      ...(v.valve ? { Valve: v.valve } : {}),
      ...(v.fobUsd ? { "ราคา FOB (USD)": String(v.fobUsd) } : {}),
      ...(v.import_ref ? { "รหัสอ้างอิงนำเข้า": v.import_ref } : {}), // ref จริงจากเอกสาร (เช่น C20726201-001)
      ...(orderDate ? { "วันสั่งรถ": orderDate } : {}), // วันสั่งซื้อรถ (ทั้งล็อต)
      // รถสั่งผลิต (KD): จำไว้ว่า SN ยังไม่มา + ช่วงที่คาดว่าจะได้ (หน้าสต็อกใช้ "วันคาดรับรถสั่งผลิต" แจ้งเตือนอยู่แล้ว)
      ...(isMto(v) ? {
        "รถสั่งผลิต (KD)": "ใช่",
        ...(kdFrom ? { "คาดได้ SN เร็วสุด": kdFrom } : {}),
        ...(kdTo ? { "วันคาดรับรถสั่งผลิต": kdTo } : {}),
      } : {}),
      ชีตต้นทาง: "ใบเสนอราคา",
    },
  } as Forklift;
  };

  const save = () => {
    // กัน SN ซ้ำ: ถ้ามีในสต็อกแล้ว หรือซ้ำภายในชุดเดียวกัน → ข้าม (ไม่นำเข้าครั้งที่ 2)
    const seen = new Set(existingIds);
    const fresh: Forklift[] = [];
    const skipSns: string[] = [];
    let mto = 0;
    rows.forEach((v, i) => {
      const fk = toForklift(v, i);
      if (seen.has(fk.id)) { skipSns.push(String(fk.id)); return; }
      seen.add(fk.id);
      if (isMto(v)) mto++;
      fresh.push(fk);
    });
    setSavedMto(mto);
    if (fresh.length) addForkliftsBulk(fresh);
    setImportedIds(fresh.map((f) => String(f.id)));
    setSkipped(skipSns.length);
    setSkippedSns(skipSns);
    setSaved(fresh.length);
    setDone(true);
  };

  // ยกเลิกการนำเข้า — ลบรถที่เพิ่งนำเข้าออกทั้งล็อต
  const undoImport = () => {
    importedIds.forEach((id) => deleteForklift(id));
    setImportedIds([]);
    onClose();
  };

  const dupCount = rows.filter((v, i) => existingIds.has(toForklift(v, i).id)).length;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-3xl w-full max-w-6xl max-h-[88vh] flex flex-col shadow-2xl">
        {/* header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><FileText className="w-4 h-4 text-emerald-600" />นำเข้าจากใบเสนอราคา</h3>
            <p className="text-xs text-slate-500 mt-0.5">อ่านไฟล์ในเครื่อง 100% · รองรับ HELI / HANGCHA / ROCKMAN (PDF) · STAXX (Excel Serial List){vendor ? ` · อ่านได้: ${vendor}` : ""}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-all"><X className="w-5 h-5" /></button>
        </div>

        {/* body */}
        <div className="overflow-y-auto flex-1 min-h-0 p-5 flex flex-col gap-4">
          {done ? (
            <div className="text-center py-10 text-emerald-700">
              <CheckCircle className="w-12 h-12 mx-auto mb-3" />
              <p className="font-bold">บันทึกเข้าสต็อกแล้ว {saved} คัน{lotStatus === "รอรับ" ? " (สถานะ \"รอรับ\")" : lotStatus === "พร้อมขาย" ? " (สถานะ \"พร้อมขาย\")" : " (สถานะตามแบรนด์)"}</p>
              {savedMto > 0 && (
                <p className="text-sm text-violet-700 mt-1">
                  ในนี้เป็น <b>รถสั่งผลิต (KD) {savedMto} คัน</b> — สถานะ &ldquo;สั่งผลิต&rdquo; · คาดได้ SN {kdFrom ? thaiDate(kdFrom) : "?"} ถึง {kdTo ? thaiDate(kdTo) : "?"}
                </p>
              )}
              {skipped > 0 && (
                <p className="text-sm text-amber-600 mt-1">
                  ข้าม {skipped} คัน — <b>SN ซ้ำกับที่มีในสต็อกแล้ว</b> ไม่นำเข้าซ้ำ<br />
                  <span className="text-xs text-amber-500">SN ที่ข้าม: {skippedSns.join(", ")}</span>
                </p>
              )}
              <div className="flex items-center justify-center gap-2 mt-5">
                {importedIds.length > 0 && (
                  <button onClick={undoImport} className="px-4 py-2 rounded-xl text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 flex items-center gap-1.5">
                    <Undo2 className="w-4 h-4" />ยกเลิกการนำเข้า
                  </button>
                )}
                <button onClick={onClose} className="px-5 py-2 rounded-xl text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700">เสร็จสิ้น</button>
              </div>
            </div>
          ) : (
            <>
              {/* dropzone */}
              <label className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/40 transition-all">
                <input type="file" accept="application/pdf,.xlsx,.xls,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
                {busy ? <Loader2 className="w-8 h-8 mx-auto text-emerald-600 animate-spin" />
                  : <Upload className="w-8 h-8 mx-auto text-slate-400" />}
                <p className="text-sm font-semibold text-slate-600 mt-2">
                  {ocr ? `🔍 กำลังอ่านรูป "${ocr.name}"... ${ocr.pct}%` : busy ? "กำลังอ่าน..." : "ลากไฟล์มาวาง หรือกดเลือก"}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">PDF (HELI/HANGCHA/ROCKMAN) · Excel Serial List (STAXX) · รูป JPEG/PNG (OCR ในเครื่อง) · หลายไฟล์พร้อมกันได้</p>
                {ocr && <p className="text-[11px] text-slate-400 mt-1">อ่านในเครื่อง 100% · ครั้งแรกโหลดภาษาไทยอาจนานสักครู่</p>}
              </label>

              {notice && <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{notice}</div>}

              {/* เพิ่มรถเอง — สำรองตอน PDF อ่านไม่ได้ (กรอกมือทีละคัน) */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs text-slate-400">อ่านไฟล์ไม่ได้? เพิ่มรถเองแล้วกรอกข้อมูลในตารางได้เลย</p>
                <button onClick={addBlankRow}
                  className="flex items-center gap-1.5 text-sm font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl px-3.5 py-2 transition-all">
                  <Plus className="w-4 h-4" />เพิ่มรถเอง (กรอกมือ)
                </button>
              </div>

              {rows.length > 0 && (
                <>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="text-sm font-semibold text-slate-700">อ่านได้ {rows.length} คัน — ตรวจ/แก้ก่อนบันทึก</p>
                    {dupCount > 0 && <span className="text-xs text-red-600 font-semibold">⚠️ {dupCount} คัน SN ซ้ำกับที่มีในสต็อก</span>}
                  </div>
                  {/* รถสั่งผลิต (KD) — เอกสารลงท้าย KD = ยังไม่มี SN ตอนนี้ ไม่ใช่ข้อผิดพลาด */}
                  {mtoCount > 0 && (
                    <div className="text-xs bg-violet-50 border border-violet-200 text-violet-800 rounded-xl px-3 py-2.5 flex items-start gap-2">
                      <Factory className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>
                        พบ <b>รถสั่งผลิต (KD) {mtoCount} คัน</b> — เอกสารลงท้าย &ldquo;KD&rdquo; คือรถที่ยังไม่ผลิต จึงยังไม่มี SN (ไม่ใช่ข้อผิดพลาด)<br />
                        บันทึกด้วยสถานะ <b>&ldquo;สั่งผลิต&rdquo;</b> · คาดได้ SN <b>{kdFrom ? thaiDate(kdFrom) : "?"}</b> ถึง <b>{kdTo ? thaiDate(kdTo) : "?"}</b> ({KD_LEAD_MIN_DAYS}-{KD_LEAD_MAX_DAYS} วันจาก{orderDate ? "วันสั่งรถ" : "วันนี้"})
                        {!orderDate && <> · <b>กรอก &ldquo;วันสั่งซื้อรถ&rdquo; ด้านบน</b>ให้ตรง วันคาดรับจะแม่นขึ้น</>}<br />
                        <span className="text-violet-600">เมื่อรถผลิตเสร็จ ผู้ขนส่งกรอก SN จริงตอนรับรถ ระบบเปลี่ยนรหัสให้เอง</span>
                      </span>
                    </div>
                  )}
                  {/* วันสั่งซื้อรถ — วันที่สั่งซื้อ/ออก PI (ใส่ให้ทั้งล็อต ไม่บังคับ) */}
                  <div className="flex items-center gap-2 bg-violet-50/60 border border-violet-100 rounded-xl px-3 py-2.5">
                    <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 whitespace-nowrap">🏭 วันสั่งซื้อรถ (ทั้งล็อต)</label>
                    <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)}
                      className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white" />
                    {orderDate && <button onClick={() => setOrderDate("")} className="text-xs text-slate-400 hover:text-red-500">ล้าง</button>}
                    <span className="text-[11px] text-slate-400">วันที่สั่งซื้อ/ออกเอกสาร PI</span>
                  </div>
                  {/* วันรับรถเข้า — ใส่ให้ทั้งล็อตพร้อมกัน (ไม่กรอกก็ได้ ค่อยมาเติมทีหลัง) */}
                  <div className="flex items-center gap-2 bg-emerald-50/60 border border-emerald-100 rounded-xl px-3 py-2.5">
                    <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 whitespace-nowrap">📅 วันรับรถเข้า (ทั้งล็อต)</label>
                    <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)}
                      className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white" />
                    {receivedDate && <button onClick={() => setReceivedDate("")} className="text-xs text-slate-400 hover:text-red-500">ล้าง</button>}
                    <span className="text-[11px] text-slate-400">ใส่ให้รถทุกคันในล็อตนี้</span>
                  </div>
                  {/* สถานะเริ่มต้นของทั้งล็อต — เลือกได้ว่าจะให้ต้องผ่านผู้รับรถ (รอรับ) หรือพร้อมขายเลย */}
                  <div className="flex items-center gap-2 bg-sky-50/60 border border-sky-100 rounded-xl px-3 py-2.5 flex-wrap">
                    <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 whitespace-nowrap">🏷️ สถานะเริ่มต้น (ทั้งล็อต)</label>
                    <div className="flex gap-1.5">
                      {([
                        ["auto", "อัตโนมัติ"],
                        ["รอรับ", "รอรับ (ผ่านผู้รับรถ)"],
                        ["พร้อมขาย", "พร้อมขายเลย"],
                      ] as const).map(([val, label]) => (
                        <button key={val} onClick={() => setLotStatus(val)}
                          className={`text-xs font-bold rounded-lg px-2.5 py-1.5 border transition-all ${lotStatus === val ? "bg-sky-600 text-white border-sky-600" : "bg-white text-slate-600 border-slate-200 hover:border-sky-300"}`}>{label}</button>
                      ))}
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {lotStatus === "auto" ? "รถสั่งผลิต (KD) → สั่งผลิต · STAXX/CNC (มีวันรับ) → พร้อมขาย · แบรนด์อื่น → รอรับ"
                        : lotStatus === "รอรับ" ? "ทุกคันต้องให้ผู้รับรถถ่ายรูปรับก่อนขึ้นขาย"
                        : "ทุกคันขึ้นขายทันที (ข้ามขั้นตอนรับรถ) — ใช้เมื่อรถอยู่ในคลังพร้อมแล้ว"}
                      {lotStatus !== "auto" && mtoCount > 0 && <b className="text-violet-600"> · รถสั่งผลิต {mtoCount} คันจะใช้สถานะนี้แทน &ldquo;สั่งผลิต&rdquo;</b>}
                    </span>
                  </div>
                  {/* การ์ดต่อคัน — ช่องกว้าง มีป้ายกำกับ อ่าน/แก้ง่ายกว่าตารางแคบ */}
                  <div className="flex flex-col gap-3">
                    {rows.map((v, i) => {
                      const dup = existingIds.has(toForklift(v, i).id);
                      const mto = isMto(v);
                      const flags = (v.flags ?? []).filter((f) => !(mto && f === "ไม่พบ SN")); // KD ยังไม่มี SN = ปกติ
                      return (
                        <div key={i} className={`rounded-2xl border p-4 ${dup ? "border-red-300 bg-red-50/50" : mto ? "border-violet-200 bg-violet-50/40" : "border-slate-200 bg-slate-50/60"}`}>
                          <div className="flex items-center justify-between gap-2 mb-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-slate-700">คันที่ {i + 1}</span>
                              {v.model?.trim() && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{categorizeModel(v.model)}</span>}
                              {dup && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">⚠️ SN ซ้ำในสต็อก</span>}
                              {/* กดสลับได้ — เผื่อเอกสารไม่ได้เขียน KD ไว้ หรืออ่านไม่เจอ · คันที่มี SN แล้วไม่ต้องถาม */}
                              {!String(v.SN ?? "").trim() && <button onClick={() => toggleMto(i)}
                                title={v.made_to_order ? "กดเพื่อยกเลิกการเป็นรถสั่งผลิต" : "กดถ้าคันนี้เป็นรถสั่งผลิต (SN มาทีหลัง)"}
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-all ${mto ? "bg-violet-100 text-violet-700 border-violet-200 hover:bg-violet-200" : "bg-white text-slate-400 border-slate-200 hover:border-violet-300 hover:text-violet-600"}`}>
                                {mto ? "🏭 รถสั่งผลิต (KD) · SN มาทีหลัง" : "🏭 ตั้งเป็นรถสั่งผลิต"}
                              </button>}
                            </div>
                            <button onClick={() => removeRow(i)} title="ลบคันนี้"
                              className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <Field label="แบรนด์" val={v.brand ?? ""} onChange={(x) => edit(i, "brand", x)} ph="เช่น HELI" />
                            <Field label="รุ่น" val={v.model} onChange={(x) => edit(i, "model", x)} ph="เช่น CDD12J-M300" />
                            <Field label={mto ? "SN (รอผลิต — เว้นว่างได้)" : "SN (เลขตัวถัง)"} val={v.SN ?? ""} onChange={(x) => edit(i, "SN", x)} ph={mto ? "SN มาตอนรถผลิตเสร็จ" : "SN จริงจากรถ"} />
                            <Field label="เลข PI" val={v.pi_no ?? ""} onChange={(x) => edit(i, "pi_no", x)} ph="เว้นได้ถ้ายังไม่มี" />
                            <Field label="พิกัดยก" val={v.capacity ?? ""} onChange={(x) => edit(i, "capacity", x)} ph="เช่น 2.5 ตัน" />
                            <Field label="พลังงาน" val={v.fuel ?? ""} onChange={(x) => edit(i, "fuel", x)} ph="ดีเซล / ไฟฟ้า" />
                            <Field label="เสา (MAST)" val={v.mast ?? ""} onChange={(x) => edit(i, "mast", x)} ph="เช่น 3M / Triplex 4.5M" />
                            <Field label="Valve" val={v.valve ?? ""} onChange={(x) => edit(i, "valve", x)} ph="เช่น 3 วาล์ว" />
                            <Field label="ราคาทุน" val={v.cost_price ? String(v.cost_price) : ""} onChange={(x) => edit(i, "cost_price", x)} ph="บาท" />
                          </div>
                          {mto && <p className="text-[11px] text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-2.5 py-1.5 mt-2.5">🏭 รถสั่งผลิต — บันทึกเป็นสถานะ &ldquo;สั่งผลิต&rdquo; · คาดได้ SN {kdFrom ? thaiDate(kdFrom) : "?"} ถึง {kdTo ? thaiDate(kdTo) : "?"} · รหัสชั่วคราว {v.pi_no || v.import_ref || "PI"}#{i + 1}</p>}
                          {flags.length ? <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-2.5">⚠️ {flags.join(" · ")}</p> : null}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* footer */}
        {!done && rows.length > 0 && (
          <div className="px-6 py-3 border-t border-slate-100 flex-shrink-0 flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100">ยกเลิก</button>
            <button onClick={save} className="px-5 py-2 rounded-xl text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4" />บันทึกเข้าสต็อก {rows.length} คัน
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, val, onChange, ph }: { label: string; val: string; onChange: (v: string) => void; ph?: string }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[11px] font-semibold text-slate-500">{label}</span>
      <input value={val} onChange={(e) => onChange(e.target.value)} placeholder={ph}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white placeholder:text-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 focus:outline-none" />
    </label>
  );
}
