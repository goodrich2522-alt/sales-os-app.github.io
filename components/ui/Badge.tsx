// components/ui/Badge.tsx — ป้ายสถานะ/แท็ก ที่ใช้ร่วมทั้งแอป (เฟส 1)
import { statusBadgeClass, saleStatusBadgeClass, contactSourceClass } from "@/lib/constants";

const SIZE = {
  sm: "text-[10px] px-1.5 py-0.5",
  md: "text-xs px-2.5 py-1",
  lg: "text-xs px-3 py-1",
} as const;

/** ป้ายสถานะรถ — สีมาจาก constants ทุกหน้าใช้ชุดเดียวกัน */
/**
 * @param note ข้อความต่อท้ายในป้ายเดียวกัน เช่น รหัสรถเช่า "GR-111" → "รถเช่า · GR-111"
 *             สีป้ายยังอิงสถานะหลักเสมอ · ว่าง = ไม่โชว์จุดคั่น (กันขยะ "รถเช่า ·" ลอย ๆ)
 */
export function StatusBadge({ status, note, size = "md" }: { status: unknown; note?: unknown; size?: keyof typeof SIZE }) {
  const s = String(status ?? "").trim();
  if (!s) return null;
  const n = String(note ?? "").trim();
  return (
    <span className={`inline-block font-semibold rounded-full border whitespace-nowrap ${SIZE[size]} ${statusBadgeClass(s)}`}>
      {n ? `${s} · ${n}` : s}
    </span>
  );
}

/** ป้ายสถานะการขาย (ดีล) */
export function SaleStatusBadge({ status, size = "md" }: { status: unknown; size?: keyof typeof SIZE }) {
  const s = String(status ?? "ขายแล้ว").trim();
  return (
    <span className={`inline-block font-semibold rounded-full border whitespace-nowrap ${SIZE[size]} ${saleStatusBadgeClass(s)}`}>
      {s}
    </span>
  );
}

/** แท็กแหล่งที่มาลูกค้า (Line/Facebook/...) */
export function ContactSourceTag({ source, size = "md" }: { source: unknown; size?: keyof typeof SIZE }) {
  const s = String(source ?? "").trim();
  if (!s) return null;
  return (
    <span className={`inline-block font-bold rounded-full whitespace-nowrap ${SIZE[size]} ${contactSourceClass(s)}`}>
      {s}
    </span>
  );
}
