-- supabase-check-guard.sql — ตรวจว่าด่าน "ห้ามตั้งรถเป็นขายแล้วถ้าไม่มีใบขาย" ติดแล้วจริงไหม
--
-- อ่านอย่างเดียว ไม่แก้ข้อมูลอะไรเลย · ตอบกลับแถวเดียว 2 ช่อง
-- วิธีใช้: Supabase → SQL Editor → วาง → Run

select
  case
    when exists (
      select 1 from pg_trigger
      where tgrelid = 'public.forklifts'::regclass
        and tgname  = 'trg_block_sold_without_deal'
        and not tgisinternal
        and tgenabled <> 'D'                       -- 'D' = ถูกปิดไว้
    ) then 'ติดแล้ว เปิดใช้งานอยู่'
    else 'ยังไม่มีด่าน ต้องรันไฟล์ supabase-block-sold-without-deal-2026-10-03.sql อีกครั้ง'
  end as สถานะด่าน,

  (
    select count(*) from public.forklifts f
    where f.status in ('ปิดการขายแล้ว', 'ส่งมอบแล้ว', 'ขายแล้ว')
      and not exists (
        select 1 from public.sales s
        where s.forklift_id = f.id
           or (coalesce(f."SN", '') <> '' and s.forklift_unit_no = f."SN")
      )
  ) as รถที่ยังค้างต้องไล่แก้;
