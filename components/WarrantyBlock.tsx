"use client";
// components/WarrantyBlock.tsx — บริการหลังการขาย / รับประกัน (ใช้ร่วมหน้าขาย + สต็อก)
// forklift → เงื่อนไข + 4 รอบเช็ค (เดือน) · รถอื่น → เงื่อนไขรับประกันพิมพ์เอง (ไม่มีรอบ)
// เก็บ forklift.custom_fields["บริการหลังการขาย"] (JSON) + ประวัติการแก้ไข

import { useState, useEffect } from "react";
import { Wrench, History } from "lucide-react";
import { useApp } from "@/lib/AppContext";
import { Forklift } from "@/lib/types";
import { parseSvc, roundDue, emptySvcRounds, defaultWarrantyTerms, warrantyFilled, SvcData } from "@/lib/warranty";
import { isForkliftVehicle } from "@/lib/commission";

// รับประกันเริ่มต้นตามหมวดรถ — ใช้ตัวเดียวกับปุ่มเติมย้อนหลัง (lib/warranty.ts)
const defaultTerms = (f: Forklift, isFork: boolean): string => defaultWarrantyTerms(isFork, f.vehicle_category);
// defaultStart = วันส่งมอบที่กรอกในฟอร์มขาย (ยังไม่เคยบันทึก → ใช้เป็นวันเริ่มประกันให้เลย ไม่ต้องพิมพ์ซ้ำ)
const initSvc = (f: Forklift, isFork: boolean, defaultStart = ""): SvcData =>
  parseSvc(f) ?? { start: defaultStart || f.received_date || "", terms: defaultTerms(f, isFork), rounds: emptySvcRounds(), history: [] };

export function WarrantyBlock({ forklift, actor, onSaved, canEdit = true, defaultStart = "" }: {
  forklift: Forklift; actor: string; onSaved?: (f: Forklift) => void; canEdit?: boolean; defaultStart?: string;
}) {
  const { updateForklift } = useApp();
  const isFork = isForkliftVehicle(forklift.brand, forklift.model);
  const [svc, setSvc] = useState<SvcData>(() => initSvc(forklift, isFork, defaultStart));
  const [saved, setSaved] = useState(false);
  const [showHist, setShowHist] = useState(false);
  useEffect(() => { setSvc(initSvc(forklift, isForkliftVehicle(forklift.brand, forklift.model), defaultStart)); setSaved(false); }, [forklift, defaultStart]);

  const inp = "w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:bg-slate-50 disabled:text-slate-500";
  const setRound = (i: number, patch: Partial<{ date: string; done: boolean; note: string }>) => {
    setSvc({ ...svc, rounds: svc.rounds.map((r, j) => j === i ? { ...r, ...patch } : r) }); setSaved(false);
  };
  const doneCount = svc.rounds.filter(r => r.done).length;
  const filled = warrantyFilled(forklift);                 // สถานะที่บันทึกไว้ (ใช้กันจ่ายค่าคอม)
  const willFill = !!(svc.start.trim() && svc.terms.trim()); // สถานะปัจจุบันในฟอร์ม
  const hist = svc.history ?? [];

  const doSave = () => {
    // กติกา (25 ก.ย. 2569 · ผู้ใช้ยืนยัน): **วันส่งมอบ = วันเริ่มรับประกัน**
    // ไม่ได้กรอกวันเริ่มเอง → ใช้วันส่งมอบของดีลคันนั้นให้เลย (ไม่ต้องพิมพ์ซ้ำ)
    const start = svc.start.trim() || defaultStart || forklift.received_date || "";
    const svcWithStart = { ...svc, start };
    const newSvc: SvcData = { ...svcWithStart, history: [{ by: actor || "-", at: new Date().toLocaleString("th-TH") }, ...hist].slice(0, 10) };
    const cf = { ...(forklift.custom_fields || {}), "บริการหลังการขาย": JSON.stringify(newSvc) } as Record<string, string>;
    const u = { ...forklift, custom_fields: cf };
    updateForklift(u); setSvc(newSvc); setSaved(true); onSaved?.(u);
  };

  return (
    <div className="border border-teal-200 bg-teal-50/40 rounded-xl p-3">
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <p className="text-xs font-bold text-teal-700 flex items-center gap-1.5"><Wrench className="w-3.5 h-3.5" />บริการหลังการขาย / รับประกัน</p>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${filled ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-red-100 text-red-700 border-red-200"}`}>
          {filled ? "✓ ลงข้อมูลแล้ว" : "⚠️ ยังไม่ลงข้อมูล (มีผลกับค่าคอม ส.ค. 69 เป็นต้นไป)"}
        </span>
        {isFork && <span className="ml-auto text-[10px] font-semibold text-teal-700 bg-teal-100 border border-teal-200 px-1.5 py-0.5 rounded-full">เช็คแล้ว {doneCount}/{svc.rounds.length} รอบ</span>}
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-[11px] text-slate-500">วันเริ่มรับประกัน (วันส่งมอบ){!willFill && <span className="text-red-500"> *</span>}
          <input type="date" value={svc.start} disabled={!canEdit} onChange={e => { setSvc({ ...svc, start: e.target.value }); setSaved(false); }} className={inp} /></label>
        <label className="text-[11px] text-slate-500">{isFork ? "เงื่อนไขรับประกัน" : "การรับประกัน (พิมพ์เอง)"}{!willFill && <span className="text-red-500"> *</span>}
          <textarea rows={3} value={svc.terms} disabled={!canEdit} placeholder={isFork ? "" : "เช่น รับประกันมอเตอร์ 1 ปี / แบตเตอรี่ 6 เดือน ..."}
            onChange={e => { setSvc({ ...svc, terms: e.target.value }); setSaved(false); }} className={inp + " resize-none"} /></label>

        {isFork && (
          <div>
            <p className="text-[11px] font-semibold text-slate-500 mb-1">รอบเข้าเช็ค/บำรุงรักษา (ฟรี · ทุก 3 เดือน — รอบถัดไปนับจากวันเข้าครั้งก่อน)</p>
            <div className="flex flex-col gap-1.5">
              {svc.rounds.map((r, i) => {
                const due = roundDue(svc, i);
                return (
                  <div key={i} className={`rounded-lg border p-2 ${r.done ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-200"}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                        <input type="checkbox" checked={r.done} disabled={!canEdit} onChange={e => setRound(i, { done: e.target.checked })} className="w-4 h-4 accent-teal-600" />รอบที่ {i + 1}
                      </label>
                      <span className="text-[10px] text-slate-400">{i === 0 ? "กำหนด ~" : "ครบ +3 เดือน ~"}{due || "—"}</span>
                      <input type="date" value={r.date} disabled={!canEdit} onChange={e => setRound(i, { date: e.target.value })} title="วันเข้าเช็คจริง"
                        className="ml-auto border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 disabled:bg-slate-50" />
                    </div>
                    <input value={r.note} disabled={!canEdit} onChange={e => setRound(i, { note: e.target.value })} placeholder="หมายเหตุ (ช่าง/รายการที่เปลี่ยน)"
                      className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 disabled:bg-slate-50" />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {canEdit ? (
          <button onClick={doSave} className="mt-1 px-4 py-2 rounded-xl text-sm font-bold bg-teal-600 text-white hover:bg-teal-700">
            {saved ? "บันทึกแล้ว ✓" : "บันทึกบริการหลังการขาย"}
          </button>
        ) : filled && (
          <p className="mt-1 text-[11px] text-slate-500 bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
            🔒 ลงข้อมูลแล้ว — ล็อกไว้ แก้ไขไม่ได้ · หากต้องแก้ไข แจ้งฝ่ายสต็อก/แอดมิน
          </p>
        )}

        {/* ประวัติการแก้ไข */}
        {hist.length > 0 && (
          <div className="border-t border-teal-100 pt-1.5">
            <button onClick={() => setShowHist(v => !v)} className="text-[11px] text-slate-500 hover:text-slate-700 flex items-center gap-1">
              <History className="w-3 h-3" />แก้ไขล่าสุด: <b className="text-slate-600">{hist[0].by}</b> · {hist[0].at} {hist.length > 1 && <span className="text-slate-400">({showHist ? "ซ่อน" : `+${hist.length - 1} รายการ`})</span>}
            </button>
            {showHist && (
              <div className="mt-1 flex flex-col gap-0.5">
                {hist.slice(1).map((h, i) => <p key={i} className="text-[10px] text-slate-400">· {h.by} · {h.at}</p>)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
