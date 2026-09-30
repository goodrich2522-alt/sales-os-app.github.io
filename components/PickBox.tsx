"use client";

// components/PickBox.tsx — ช่องเลือกที่ "เห็นรายการทั้งหมด + พิมพ์กรองได้ + เพิ่มของใหม่ท้ายรายการ"
//
// ที่มา (30 ก.ย. 2569): เดิมใช้ <datalist> ซึ่งเบราว์เซอร์จะกรองรายการตามสิ่งที่พิมพ์ไว้แล้วเท่านั้น
// ช่องยี่ห้อมีค่าตั้งต้น "HELI" อยู่ → กดแล้วเห็นแค่ HELI ยี่ห้อเดียว เหมือนระบบมีแบรนด์เดียว
// → ทำเป็นรายการของเราเอง: กดลูกศรเห็นทั้งหมด · พิมพ์แล้วค่อยกรอง · ของใหม่กดเพิ่มได้ท้ายรายการ

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, Check } from "lucide-react";

export function PickBox({
  label, value, onChange, options, placeholder, onAddNew, newWord, warnNew = true,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  onAddNew?: (v: string) => void;   // มี = ให้เพิ่มของใหม่ได้
  newWord?: string;                 // คำเรียกสิ่งที่เพิ่ม เช่น "ยี่ห้อ" / "รุ่น"
  warnNew?: boolean;                // เตือนเมื่อค่าที่พิมพ์ยังไม่เคยมี
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false);   // พิมพ์เองหรือยัง — ยังไม่พิมพ์ = โชว์ทั้งหมด
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const v = String(value ?? "").trim();
  const known = options.some(o => o.trim().toUpperCase() === v.toUpperCase());
  const isNew = !!v && options.length > 0 && !known;
  // ยังไม่ได้พิมพ์ (เช่น มีค่าตั้งต้นมาก่อน) → โชว์ทุกตัวเลือก ไม่กรองด้วยค่าที่ค้างอยู่
  const q = typed ? v.toUpperCase() : "";
  const shown = (q ? options.filter(o => o.toUpperCase().includes(q)) : options).slice(0, 300);

  const pick = (o: string) => { onChange(o); setTyped(false); setOpen(false); };

  return (
    <div className="flex flex-col gap-1 min-w-0" ref={box}>
      {label && <span className="text-[11px] font-semibold text-slate-500">{label}</span>}
      <div className="relative">
        <input
          value={value}
          onChange={e => { onChange(e.target.value); setTyped(true); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className={`w-full border rounded-lg pl-3 pr-8 py-2 text-sm text-slate-800 bg-white placeholder:text-slate-300 focus:ring-2 focus:outline-none ${isNew && warnNew ? "border-amber-400 focus:border-amber-500 focus:ring-amber-200" : "border-slate-300 focus:border-emerald-500 focus:ring-emerald-200"}`}
        />
        <button type="button" tabIndex={-1}
          onClick={() => { setTyped(false); setOpen(o => !o); }}
          className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700"
          aria-label="เปิดรายการ">
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="absolute z-30 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg">
            {shown.length === 0 && !isNew && (
              <p className="px-3 py-2 text-[11px] text-slate-400">ไม่มีตัวเลือก</p>
            )}
            {shown.map(o => (
              <button key={o} type="button" onClick={() => pick(o)}
                className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-emerald-50 flex items-center gap-1.5">
                {o.toUpperCase() === v.toUpperCase() && <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />}
                <span className="truncate">{o}</span>
              </button>
            ))}
            {isNew && (
              <button type="button"
                onClick={() => { onAddNew?.(v); setTyped(false); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border-t border-amber-200 flex items-center gap-1.5 sticky bottom-0">
                <Plus className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">เพิ่ม &ldquo;{v}&rdquo; เป็น{newWord ?? "ค่า"}ใหม่</span>
              </button>
            )}
          </div>
        )}
      </div>
      {isNew && warnNew && !open && (
        <span className="text-[10px] text-amber-700">ยังไม่เคยมีในระบบ — พิมพ์ถูกไหม? (กดลูกศรเพื่อเลือกจากรายการ หรือกดเพิ่มเป็นของใหม่)</span>
      )}
    </div>
  );
}
