"use client";

// components/AuthExpiredBanner.tsx — เตือนเมื่อ "เซสชันหมดอายุ อ่านข้อมูลไม่ได้"
//
// ที่มา (20 ต.ค. 2569): ผู้ใช้เปิดหน้าสต็อกแล้วเห็นข้อมูล "หายหมด" ทุกช่องเป็น 0
// ที่จริงข้อมูลอยู่ครบ 1,172 คัน แต่ฐานข้อมูลตอบกลับมาว่างทุกตาราง
// → RLS ตอบ 200 พร้อมผลลัพธ์ว่าง ซึ่งไม่ใช่ error เลยไม่มีอะไรฟ้อง
// ชื่อผู้ใช้ยังค้างอยู่บนหัวจอ (ล็อกอินของแอปเก็บแยกใน localStorage) ยิ่งทำให้เข้าใจผิดว่าข้อมูลถูกลบ

import { useApp } from "@/lib/AppContext";
import { AlertTriangle } from "lucide-react";

export default function AuthExpiredBanner() {
  const { authExpired } = useApp();
  if (!authExpired) return null;

  const relogin = () => {
    try {
      // ล้างสำเนาข้อมูลเก่าในเครื่อง (อาจค้างไม่ครบ) แล้วบังคับโหลดสดจากฐานข้อมูล
      // ไม่แตะการล็อกอิน — ปัญหานี้ไม่เกี่ยวกับการล็อกอิน
      Object.keys(localStorage).filter(k => k.startsWith("salesos_")).forEach(k => localStorage.removeItem(k));
    } catch { /* เบราว์เซอร์บางตัวห้ามแตะ localStorage */ }
    location.href = location.pathname + "?nolocal=1&v=" + Date.now();   // กันทั้งแคชไฟล์และสำเนาในเครื่อง
  };

  return (
    <div className="fixed inset-x-0 top-0 z-[100] px-3 pt-3">
      <div className="mx-auto max-w-3xl rounded-2xl border border-amber-300 bg-amber-50 shadow-lg p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-900">ยังโหลดข้อมูลไม่ได้</p>
            <p className="text-[12px] text-amber-800 mt-1 leading-relaxed">
              <b>ข้อมูลไม่ได้หายนะครับ</b> ยังอยู่ครบในฐานข้อมูล แต่ตอนนี้แอปติดต่อฐานข้อมูลแล้วได้ผลลัพธ์ว่าง
              จึงดึงข้อมูลไม่ได้ ทุกช่องเลยขึ้นเป็น 0 · ลองกดปุ่มข้างล่างเพื่อโหลดใหม่
            </p>
            <p className="text-[11px] text-amber-700 mt-1.5">
              ระหว่างนี้<b>อย่าเพิ่งกดแก้ไขหรือบันทึกอะไร</b> — รอเข้าสู่ระบบใหม่ให้ข้อมูลขึ้นครบก่อน
            </p>
          </div>
          <button onClick={relogin}
            className="flex-shrink-0 text-sm font-bold bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-xl transition-all active:scale-95">
            โหลดใหม่
          </button>
        </div>
      </div>
    </div>
  );
}
