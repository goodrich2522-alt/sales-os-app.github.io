"use client";

// components/ErrorReport.tsx — หน้าจอเวลาแอปพัง ให้ "บอกสาเหตุได้" ไม่ใช่จอขาว
//
// ที่มา (28 ก.ย. 2569): ผู้ใช้เข้าหน้าสต็อกไม่ได้ เบราว์เซอร์ขึ้นแค่ "This page couldn't load"
// ซึ่งไม่บอกอะไรเลย ต้องเดาสาเหตุหลายรอบ → ทำหน้าของเราเองที่โชว์ข้อความ error จริง
// พร้อมปุ่มคัดลอก จะได้ส่งต่อให้คนแก้ได้ทันที
//
// ⚠️ ข้อจำกัดที่ต้องรู้: ถ้าแท็บ "แครชเพราะหน่วยความจำเต็ม" หน้านี้จะไม่ทำงาน
//    (โปรเซสตาย React จับไม่ได้) — กรณีนั้นเบราว์เซอร์จะขึ้นหน้าของมันเองเหมือนเดิม
//    หน้านี้ช่วยกรณี "โค้ดพัง/ข้อมูลเพี้ยน" ซึ่งเป็นสาเหตุที่พบบ่อยกว่า

import { useEffect, useState } from "react";
import { AlertTriangle, Copy, Check, RefreshCw, Home, Eraser } from "lucide-react";

export function ErrorReport({ error, reset, where }: { error: Error & { digest?: string }; reset?: () => void; where: string }) {
  const [copied, setCopied] = useState(false);
  const [cleared, setCleared] = useState(false);

  // เก็บไว้ใน console ด้วย เผื่อผู้ใช้เปิด F12 อยู่แล้ว
  useEffect(() => { console.error(`[SalesOS] ${where}`, error); }, [error, where]);

  const report = [
    `หน้า: ${where}`,
    `เวลา: ${new Date().toLocaleString("th-TH")}`,
    typeof window !== "undefined" ? `URL: ${window.location.href}` : "",
    error.digest ? `รหัส: ${error.digest}` : "",
    `ข้อความ: ${error.message || "(ไม่มีข้อความ)"}`,
    "",
    (error.stack ?? "").split("\n").slice(0, 12).join("\n"),
  ].filter(Boolean).join("\n");

  const copy = async () => {
    try { await navigator.clipboard.writeText(report); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { /* คัดลอกไม่ได้ก็ให้ผู้ใช้ลากเลือกเอาเอง */ }
  };

  // ล้างแคชในเครื่อง (ข้อมูลจริงอยู่บนเซิร์ฟเวอร์ ไม่หาย) — แก้อาการที่มาจากข้อมูลค้างในเบราว์เซอร์
  const clearCache = () => {
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith("salesos_"))
        .forEach(k => localStorage.removeItem(k));
      setCleared(true);
    } catch { /* ลบไม่ได้ก็ข้าม */ }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-red-200 max-w-2xl w-full my-8 overflow-hidden">
        <div className="bg-red-50 border-b border-red-100 px-5 py-4 flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h1 className="text-base font-bold text-red-800">หน้านี้เปิดไม่สำเร็จ</h1>
            <p className="text-xs text-red-700 mt-0.5">ข้อมูลของคุณไม่หาย — ทุกอย่างอยู่บนเซิร์ฟเวอร์ · ลองตามขั้นตอนด้านล่าง</p>
          </div>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {reset && (
              <button onClick={reset} className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold rounded-xl px-4 py-2.5">
                <RefreshCw className="w-4 h-4" />ลองใหม่
              </button>
            )}
            <button onClick={clearCache} disabled={cleared}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:bg-emerald-600 text-white text-sm font-bold rounded-xl px-4 py-2.5">
              {cleared ? <><Check className="w-4 h-4" />ล้างแล้ว — กดลองใหม่</> : <><Eraser className="w-4 h-4" />ล้างข้อมูลค้างในเครื่อง</>}
            </button>
            <a href="../../" className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-bold rounded-xl px-4 py-2.5">
              <Home className="w-4 h-4" />กลับหน้าแรก
            </a>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-xs font-bold text-slate-500">รายละเอียดปัญหา — ส่งข้อความนี้ให้คนดูแลระบบ</p>
              <button onClick={copy} className="flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg px-2.5 py-1">
                {copied ? <><Check className="w-3 h-3" />คัดลอกแล้ว</> : <><Copy className="w-3 h-3" />คัดลอก</>}
              </button>
            </div>
            <pre className="text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-words max-h-72 overflow-y-auto">{report}</pre>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            ถ้ากด &ldquo;ลองใหม่&rdquo; แล้วยังไม่ได้ ให้เปิดลิงก์เดิมแล้วเติม <b>?nolocal=1</b> ต่อท้าย —
            เป็นโหมดที่ไม่ใช้ข้อมูลค้างในเครื่องเลย ถ้าเปิดได้แปลว่าปัญหามาจากข้อมูลค้าง ไม่ใช่ตัวแอป
          </p>
        </div>
      </div>
    </div>
  );
}
