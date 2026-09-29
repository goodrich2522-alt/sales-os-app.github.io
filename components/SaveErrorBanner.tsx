"use client";

// components/SaveErrorBanner.tsx — เตือนเมื่อ "บันทึกขึ้นเซิร์ฟเวอร์ไม่สำเร็จ"
//
// ที่มา (29 ก.ย. 2569): เดิมถ้าบันทึกไม่เข้าเซิร์ฟเวอร์ ระบบจะเงียบสนิท
// หน้าจอยังโชว์ข้อมูลที่เพิ่งกรอก (เพราะอยู่ในหน่วยความจำของเบราว์เซอร์)
// แต่พอรีเฟรชข้อมูลก็หาย โดยไม่มีอะไรบอกว่าเกิดอะไรขึ้น
// → ขึ้นแถบแดงค้างไว้ พร้อมบอกว่าให้ทำอะไรต่อ

import { useApp } from "@/lib/AppContext";
import { AlertTriangle, X } from "lucide-react";

export function SaveErrorBanner() {
  const { saveError, clearSaveError } = useApp();
  if (!saveError) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[110] w-[min(92vw,560px)] bg-red-600 text-white rounded-2xl shadow-2xl px-4 py-3 flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold">บันทึกขึ้นเซิร์ฟเวอร์ไม่สำเร็จ</p>
        <p className="text-[11px] opacity-90 mt-0.5 break-words">
          {saveError.what} — {saveError.msg || "ไม่ทราบสาเหตุ"}
        </p>
        <p className="text-[11px] opacity-90 mt-1">
          ข้อมูลที่เพิ่งกรอกยัง<b>อยู่แค่ในเครื่องนี้</b> · <b>อย่าเพิ่งรีเฟรช</b> —
          เช็กอินเทอร์เน็ตแล้วลองบันทึกใหม่ ถ้ายังไม่ได้ให้แจ้งผู้ดูแลระบบพร้อมข้อความนี้
        </p>
      </div>
      <button onClick={clearSaveError} className="p-1 hover:bg-white/20 rounded-lg flex-shrink-0" aria-label="ปิด">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
