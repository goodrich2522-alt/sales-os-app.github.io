"use client";

// components/UpdateReady.tsx — บอกเมื่อมีโค้ดเวอร์ชันใหม่บนเซิร์ฟเวอร์
//
// ที่มา (21 ต.ค. 2569): แก้บั๊กแล้ว deploy แล้ว แต่ผู้ใช้ยังเจออาการเดิม
// เพราะเบราว์เซอร์ใช้ไฟล์เก่าที่แคชไว้ (GitHub Pages ให้ HTML แคชได้ 10 นาที)
// เสียเวลาไล่กันหลายรอบ ทั้งที่โค้ดใหม่ขึ้นเว็บไปแล้ว
// ผู้ใช้ไม่มีทางรู้เองว่าต้องกด Ctrl+Shift+R → ให้แอปเทียบเวอร์ชันแล้วบอกเอง
//
// ขึ้นเฉพาะตอน "มีตัวใหม่จริง" เท่านั้น — ไม่ใช่แถบที่เด้งบ่อย ๆ
// ปิดได้ และจะไม่ขึ้นซ้ำสำหรับเวอร์ชันเดิมที่ปิดไปแล้ว

import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";

const HERE = process.env.NEXT_PUBLIC_BUILD ?? "";

export default function UpdateReady() {
  const [fresh, setFresh] = useState("");

  useEffect(() => {
    if (!HERE) return;
    let dead = false;

    const check = async () => {
      try {
        // ต้องกันแคชทุกชั้น ไม่งั้นได้ไฟล์เวอร์ชันเก่ามาเทียบเอง
        const base = window.location.pathname.split("/").slice(0, 2).join("/");
        const r = await fetch(`${base}/version.txt?t=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) return;
        const v = (await r.text()).trim();
        if (dead || !v || v === HERE) return;
        if (sessionStorage.getItem("skip-update") === v) return;   // ผู้ใช้ปิดไปแล้วสำหรับเวอร์ชันนี้
        setFresh(v);
      } catch { /* ออฟไลน์/เน็ตสะดุด — ไม่ต้องทำอะไร */ }
    };

    const t = setTimeout(check, 8000);                       // อย่าเพิ่งยิงตอนเปิดหน้าใหม่ ๆ
    const iv = setInterval(check, 10 * 60 * 1000);           // ทุก 10 นาที (ไฟล์เล็กมาก)
    const onFocus = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => { dead = true; clearTimeout(t); clearInterval(iv); document.removeEventListener("visibilitychange", onFocus); };
  }, []);

  if (!fresh) return null;

  const update = () => {
    const u = new URL(window.location.href);
    u.searchParams.set("v", String(Date.now()));   // บังคับให้โหลดไฟล์ชุดใหม่
    window.location.href = u.toString();
  };
  const dismiss = () => { try { sessionStorage.setItem("skip-update", fresh); } catch { /* ข้าม */ } setFresh(""); };

  return (
    <div className="fixed bottom-4 inset-x-0 z-[90] flex justify-center px-3 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 bg-slate-900 text-white rounded-2xl shadow-xl px-4 py-3 max-w-md">
        <RefreshCw className="w-4 h-4 flex-shrink-0 text-sky-300" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">มีเวอร์ชันใหม่แล้ว</p>
          <p className="text-[11px] text-slate-300">เครื่องนี้ยังใช้ของเก่าอยู่ — กดอัปเดตเพื่อให้ได้ตัวที่แก้ล่าสุด</p>
        </div>
        <button onClick={update}
          className="flex-shrink-0 text-sm font-bold bg-sky-500 hover:bg-sky-400 text-white px-3.5 py-2 rounded-xl transition-all active:scale-95">
          อัปเดต
        </button>
        <button onClick={dismiss} title="ไว้ก่อน" className="flex-shrink-0 text-slate-400 hover:text-white p-1">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
