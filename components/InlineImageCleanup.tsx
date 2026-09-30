"use client";

// components/InlineImageCleanup.tsx — เก็บกวาดรูปที่ยัง "ฝังเป็นข้อมูลดิบ" ให้ขึ้นที่เก็บไฟล์
//
// ที่มา (30 ก.ย. 2569): ระบบอัปรูปขึ้น Google Drive อยู่แล้ว และรูปส่วนใหญ่เป็นลิงก์เรียบร้อย
// แต่ครั้งไหนอัปไม่สำเร็จ โค้ดจะเก็บรูปดิบไว้แทนแบบเงียบ ๆ → ตกค้างสะสม
// ของที่ตกค้างทำให้ทุกคนต้องโหลดก้อนใหญ่ทุกครั้งที่เปิดแอป (เคยเป็นเหตุให้แท็บแครช)

import { useState } from "react";
import { useApp } from "@/lib/AppContext";
import { fmtBytes } from "@/lib/imageCleanup";
import { ImageUp, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

type Scan = { inspections: number; inspImages: number; sales: number; saleImages: number; bytes: number };

export function InlineImageCleanup() {
  const { scanInlineImages, liftInlineImages } = useApp();
  const [scan, setScan] = useState<Scan | null>(null);
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ done: number; failed: number; records: number } | null>(null);

  const doScan = async () => {
    setBusy("กำลังค้นหา…"); setResult(null);
    try { setScan(await scanInlineImages()); } finally { setBusy(""); }
  };

  const doLift = async () => {
    setBusy("กำลังอัปโหลด…"); setResult(null); setProgress({ done: 0, total: 0 });
    try {
      const r = await liftInlineImages((done, total) => setProgress({ done, total }));
      setResult(r);
      setScan(await scanInlineImages());
    } finally { setBusy(""); setProgress(null); }
  };

  const total = (scan?.inspImages ?? 0) + (scan?.saleImages ?? 0);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
        <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
          <ImageUp className="w-4 h-4 text-sky-600" />รูปที่ยังไม่ได้อัปขึ้นที่เก็บไฟล์
        </p>
        <button onClick={doScan} disabled={!!busy}
          className="text-[11px] font-bold bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg px-3 py-1.5 text-slate-700">
          {busy === "กำลังค้นหา…" ? "กำลังค้นหา…" : "ค้นหา"}
        </button>
      </div>
      <p className="text-[11px] text-slate-500">
        ปกติรูปจะถูกอัปขึ้น Google Drive แล้วเก็บแค่ลิงก์ · ครั้งไหนอัปไม่สำเร็จระบบจะเก็บรูปดิบไว้แทน
        ซึ่งทำให้ทุกคนต้องโหลดก้อนใหญ่ทุกครั้งที่เปิดแอป
      </p>

      {scan && (
        <div className="mt-2.5">
          {total === 0 ? (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
              ✓ ไม่มีรูปตกค้าง — รูปทั้งหมดเก็บเป็นลิงก์เรียบร้อย
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <Stat n={scan.inspImages} label={`รูปใบตรวจรับรถ (${scan.inspections} ใบ)`} />
                <Stat n={scan.saleImages} label={`รูปสลิปในใบขาย (${scan.sales} ใบ)`} />
                <Stat n={0} label={`ขนาดรวม ~${fmtBytes(scan.bytes)}`} plain />
              </div>
              <button onClick={doLift} disabled={!!busy}
                className="mt-2.5 flex items-center gap-1.5 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white text-sm font-bold rounded-xl px-4 py-2">
                {busy === "กำลังอัปโหลด…" ? <><Loader2 className="w-4 h-4 animate-spin" />กำลังอัปโหลด…</> : <>อัปขึ้นที่เก็บไฟล์ แล้วแทนที่ด้วยลิงก์</>}
              </button>
              {progress && progress.total > 0 && (
                <p className="text-[11px] text-slate-500 mt-1.5">ทำไปแล้ว {progress.done} จาก {progress.total} รายการ — อย่าปิดหน้านี้</p>
              )}
              <p className="text-[10px] text-slate-400 mt-1.5">
                * รูปที่อัปไม่สำเร็จจะเก็บของเดิมไว้ ไม่ทำข้อมูลหาย · กดซ้ำได้ถ้ายังเหลือ
              </p>
            </>
          )}
        </div>
      )}

      {result && (
        <p className={`mt-2 text-xs rounded-xl px-3 py-2 border flex items-start gap-2 ${result.failed ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-emerald-50 border-emerald-200 text-emerald-700"}`}>
          {result.failed ? <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />}
          <span>
            อัปขึ้นที่เก็บไฟล์แล้ว <b>{result.done} รูป</b> ใน {result.records} รายการ
            {result.failed > 0 && <> · <b>อัปไม่สำเร็จ {result.failed} รูป</b> (เก็บของเดิมไว้ · ลองกดซ้ำอีกครั้ง)</>}
          </span>
        </p>
      )}
    </div>
  );
}

function Stat({ n, label, plain }: { n: number; label: string; plain?: boolean }) {
  return (
    <div className="bg-sky-50 border border-sky-200 rounded-xl px-3 py-2">
      {!plain && <p className="text-lg font-bold leading-none text-sky-700">{n}</p>}
      <p className={`text-[11px] text-sky-700 ${plain ? "font-bold" : "mt-0.5"}`}>{label}</p>
    </div>
  );
}
