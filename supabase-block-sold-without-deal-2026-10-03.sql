-- supabase-block-sold-without-deal-2026-10-03.sql
-- ปิดช่องสุดท้าย: ห้ามตั้งรถเป็น "ขายแล้ว" ถ้าไม่มีใบขายผูกอยู่ — บังคับที่ตัวฐานข้อมูล
--
-- ที่มา (3 ต.ค. 2569): รถ 010253T1376 ขึ้น "ปิดการขายแล้ว" แต่ไม่มีดีลผูก และไม่มีบิลในไฟล์บัญชีเลย
-- สาเหตุแก้ที่โค้ดแล้ว (ใบขายต้องลงสำเร็จก่อน ค่อยเปลี่ยนสถานะรถ)
-- แต่โค้ดกันได้แค่ทางที่ผ่านแอป — ถ้าแก้ผ่าน SQL Editor ตรง ๆ หรือมีโค้ดเส้นทางใหม่ในอนาคต ยังเกิดได้อีก
-- ด่านนี้อยู่ใต้สุด ทุกทางต้องผ่าน
--
-- ชื่อคอลัมน์ตรวจกับตารางจริงแล้ว: forklifts.id · forklifts."SN" (ตัวใหญ่) · sales.forklift_id · sales.forklift_unit_no
--
-- วิธีรัน: Supabase → SQL Editor → วางทั้งไฟล์ → Run
-- ปลอดภัยกับข้อมูลเก่า: ตรวจเฉพาะตอน "เปลี่ยนเข้า" สถานะขายแล้ว
--   → รถ 33 คันที่ค้างอยู่แล้วยังแก้สเปก/ยกสูง/ความยาวงาได้ปกติ ไม่ถูกบล็อก

-- ── 1) ให้การค้นหาใบขายเร็วพอจะใส่ไว้ใน trigger ──────────────────────────
create index if not exists sales_forklift_id_idx      on public.sales (forklift_id);
create index if not exists sales_forklift_unit_no_idx on public.sales (forklift_unit_no);

-- ── 2) ตัวตรวจ ───────────────────────────────────────────────────────────
create or replace function public.block_sold_without_deal()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  has_deal boolean;
  sold_list text[] := array['ปิดการขายแล้ว', 'ส่งมอบแล้ว', 'ขายแล้ว'];
begin
  -- แก้ฟิลด์อื่นโดยสถานะไม่เปลี่ยน → ปล่อยผ่าน (ของเก่าที่ค้างอยู่ยังกรอกสเปกได้)
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  -- ไม่ใช่สถานะขายแล้ว → ไม่เกี่ยว
  if not (new.status = any(sold_list)) then
    return new;
  end if;

  -- หาใบขายที่ผูกกับรถคันนี้ — ผูกด้วยรหัสรถ หรือด้วย SN (ดีลที่เปิดตอนรถมี SN แล้ว)
  select exists (
    select 1
    from public.sales s
    where s.forklift_id = new.id
       or (coalesce(new."SN", '') <> '' and s.forklift_unit_no = new."SN")
  ) into has_deal;

  if not has_deal then
    raise exception
      'ตั้งสถานะ "%" ให้รถ % ไม่ได้ — ยังไม่มีใบขายผูกอยู่ ให้บันทึกใบขาย (ชื่อเซลล์ · ลูกค้า · วันส่งมอบ) ก่อน',
      new.status, coalesce(nullif(new."SN", ''), new.id)
      using errcode = 'check_violation';
  end if;

  return new;
end
$fn$;

-- ── 3) ติดด่าน ───────────────────────────────────────────────────────────
drop trigger if exists trg_block_sold_without_deal on public.forklifts;
create trigger trg_block_sold_without_deal
  before insert or update on public.forklifts
  for each row execute function public.block_sold_without_deal();

-- ── 4) ตรวจว่าติดแล้วจริง ────────────────────────────────────────────────
select tgname as ชื่อด่าน, tgenabled as เปิดใช้
from pg_trigger
where tgrelid = 'public.forklifts'::regclass
  and not tgisinternal;


-- ═════════════════════════════════════════════════════════════════════════
-- ตรวจของเก่าที่ค้างอยู่ (ด่านนี้ไม่ย้อนแก้ให้ — ต้องไล่เองในแอป)
-- รันแยกได้ ไม่เปลี่ยนข้อมูลอะไร
-- ═════════════════════════════════════════════════════════════════════════
select
  f.id              as รหัสรถ,
  f."SN"            as sn,
  f.brand           as ยี่ห้อ,
  f.model           as รุ่น,
  f.status          as สถานะ,
  f.pi_no           as เลข_pi,
  f.received_date   as วันรับรถ,
  f.cost_price      as ทุน
from public.forklifts f
where f.status in ('ปิดการขายแล้ว', 'ส่งมอบแล้ว', 'ขายแล้ว')
  and not exists (
    select 1 from public.sales s
    where s.forklift_id = f.id
       or (coalesce(f."SN", '') <> '' and s.forklift_unit_no = f."SN")
  )
order by f.received_date desc nulls last;


-- ═════════════════════════════════════════════════════════════════════════
-- ถ้าต้องปิดด่านชั่วคราว (เช่น ย้ายข้อมูลเข้าทีเดียวเยอะ ๆ)
-- ═════════════════════════════════════════════════════════════════════════
-- alter table public.forklifts disable trigger trg_block_sold_without_deal;
--   ... ทำงานที่ต้องทำ ...
-- alter table public.forklifts enable  trigger trg_block_sold_without_deal;
