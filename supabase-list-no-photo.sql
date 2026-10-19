-- supabase-list-no-photo.sql — รายชื่อรถที่ยังไม่มีรูป (ไม่มีใบตรวจรับ/ส่งรถเลย)
--
-- ที่มา (19 ต.ค. 2569): เช็ครถ 53514M0262 แล้วพบว่าไม่มีรูปเลย
-- ดูภาพรวมแล้วทั้งระบบมีใบตรวจแค่ 113 ใบ ครอบคลุมรถ 108 คัน จากสต็อก ~1,139 คัน
-- → รถส่วนใหญ่ยังไม่มีรูป ต้องรู้ว่าคันไหนบ้างถึงจะตามเก็บได้
--
-- อ่านอย่างเดียว ไม่แก้ข้อมูลอะไรเลย
-- ชื่อคอลัมน์ตรวจกับตารางจริงแล้ว: inspections.unit_no · inspections.deleted_at · forklifts."SN"
--
-- วิธีใช้: Supabase → SQL Editor → วาง → Run → ปุ่ม Export → CSV

select
  -- จัดลำดับความสำคัญ: รถพร้อมขายต้องมีรูปไว้เสนอลูกค้าก่อนเพื่อน
  case
    when f.status = 'พร้อมขาย'                    then '1 · พร้อมขาย — ควรมีรูปไว้เสนอลูกค้า'
    when f.status in ('รอรับ', 'สั่งผลิต',
                      'รอยืนยันนำเข้าสต็อก')      then '2 · กำลังเข้าคลัง — ถ่ายตอนรับได้เลย'
    when f.status in ('ปิดการขายแล้ว', 'ส่งมอบแล้ว',
                      'ขายแล้ว')                  then '4 · ขายไปแล้ว — เก็บย้อนหลังถ้าจำเป็น'
    else                                               '3 · อื่น ๆ'
  end                                                       as ลำดับความสำคัญ,
  f.id                                                      as รหัสรถ,
  f."SN"                                                    as sn,
  f.brand                                                   as ยี่ห้อ,
  f.model                                                   as รุ่น,
  f.status                                                  as สถานะ,
  f.vehicle_category                                        as ประเภทรถ,
  f.pi_no                                                   as เลข_pi,
  f.received_date                                           as วันรับรถ,
  f.custom_fields ->> 'รหัสอ้างอิงนำเข้า'                   as รหัสอ้างอิงนำเข้า
from public.forklifts f
where not exists (
  select 1
  from public.inspections i
  where i.deleted_at is null                       -- ใบที่ถูกลบไปแล้วไม่นับว่ามีรูป
    and (
      upper(btrim(i.unit_no)) = upper(btrim(f."SN"))
      or upper(btrim(i.unit_no)) = upper(btrim(f.id))
    )
)
order by ลำดับความสำคัญ, f.received_date desc nulls last;


-- ═════════════════════════════════════════════════════════════════════════
-- อยากดูแค่ยอดรวมแยกตามสถานะ ให้ลากคลุมเฉพาะคำสั่งข้างล่างนี้แล้วกด Run
-- ═════════════════════════════════════════════════════════════════════════
-- select f.status as สถานะ, count(*) as ยังไม่มีรูป
-- from public.forklifts f
-- where not exists (
--   select 1 from public.inspections i
--   where i.deleted_at is null
--     and (upper(btrim(i.unit_no)) = upper(btrim(f."SN"))
--       or upper(btrim(i.unit_no)) = upper(btrim(f.id)))
-- )
-- group by f.status
-- order by count(*) desc;
