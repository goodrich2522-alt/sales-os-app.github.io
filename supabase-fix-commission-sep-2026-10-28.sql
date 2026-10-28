-- supabase-fix-commission-sep-2026-10-28.sql
-- แก้ข้อมูลค่าคอมไหมแก้ว งวด ก.ย. 2569 ตามไฟล์ งานค้างค่าคอม-ไหมแก้ว-ก.ย.2569.xlsx
--
-- วิธีใช้: รันเป็น "ส่วน" ไป ส่วนที่ 1–3 เป็นคำสั่งอ่าน ดูผลก่อน
--          ส่วนที่ 4–5 เป็นคำสั่งแก้ ถูกคอมเมนต์ไว้ — เอา /* */ ออกเมื่อดูผลข้างบนแล้วว่าตรง
--
-- ⚠️ ห้ามแก้ payment_received_date ในนี้ — วันรับเงินมาจากไฟล์บัญชีที่เจ้าของอัปโหลดเท่านั้น


-- ══════════════════════════════════════════════════════════════
-- ส่วนที่ 1 · ดูดีลไหมแก้วทั้งหมดที่เงินเข้าเดือน ก.ย. 2569
-- เทียบจำนวนกับบัญชี: ควรได้ 28 ใบ (บัญชีมี 35 คัน)
-- ══════════════════════════════════════════════════════════════
select
  id,
  customer_name,
  forklift_brand || ' ' || forklift_model as รถ,
  forklift_unit_no as sn,
  actual_sale,
  delivery_date  as วันปิด,
  payment_received_date as วันรับเงิน,
  sale_status
from sales
where sales_staff like '%ไหมแก้ว%'
  and payment_received_date >= '2026-09-01'
  and payment_received_date <= '2026-09-30'
order by payment_received_date, customer_name;


-- ══════════════════════════════════════════════════════════════
-- ส่วนที่ 2 · หาแถวที่สงสัยว่าลงซ้ำ (ลูกค้า+รุ่น+วัน+ราคา เหมือนกันเป๊ะ)
-- คาดว่าจะเจอ: ไทยเฉิงไฮ (05/09) · ออลไทม์ (28–29/09) · เจ.เอ็น.ที./เจ.เอ็ม.ที. (14/09)
-- ดูคอลัมน์ sn ด้วย — ถ้า SN ต่างกันคือรถ 2 คันจริง ไม่ใช่ซ้ำ
-- ══════════════════════════════════════════════════════════════
select
  customer_name,
  forklift_model,
  delivery_date,
  actual_sale,
  count(*)                              as จำนวนแถว,
  string_agg(coalesce(forklift_unit_no, '(ไม่มี SN)'), ' | ') as sn_ทั้งหมด,
  string_agg(id::text, ' | ')           as รหัสใบขาย
from sales
where sales_staff like '%ไหมแก้ว%'
  and payment_received_date >= '2026-09-01'
  and payment_received_date <= '2026-09-30'
group by customer_name, forklift_model, delivery_date, actual_sale
having count(*) > 1
order by customer_name;


-- ══════════════════════════════════════════════════════════════
-- ส่วนที่ 3 · ดูชื่อลูกค้า 3 รายที่สะกดไม่ตรงบิล (ก่อนแก้)
-- ══════════════════════════════════════════════════════════════
select 'sales' as ตาราง, id::text as รหัส, customer_name, payment_received_date
from sales
where customer_name like '%ไดหยวน%'
   or customer_name like '%ไดเหวยหยวน%'
   or customer_name like '%เจ.เอ็ม.ที%'
   or customer_name like '%เจ.เอ็น.ที%'
   or customer_name like '%เทียนเฉิง%'
union all
select 'customers', id::text, name, null
from customers
where name like '%ไดหยวน%'
   or name like '%ไดเหวยหยวน%'
   or name like '%เจ.เอ็ม.ที%'
   or name like '%เจ.เอ็น.ที%'
   or name like '%เทียนเฉิง%'
order by 1, 3;


-- ══════════════════════════════════════════════════════════════
-- ส่วนที่ 4 · แก้ชื่อลูกค้าให้ตรงบิล  ← เอา /* */ ออกเมื่อดูส่วนที่ 3 แล้ว
--
-- คู่ 1: ไดหยวน       → ไดเหวยหยวน (บิล IV-690929001)
-- คู่ 3: ไทย เทียนเฉิง → ชื่อเต็ม    (บิล IV-690925005)
--
-- คู่ 2 (เจ.เอ็ม.ที. → เจ.เอ็น.ที.) ยังไม่ใส่ให้
--   เพราะต้องรู้ก่อนว่าเป็นคันเดียวลงซ้ำหรือขาย 2 คันจริง — ดูส่วนที่ 2
--   ถ้าซ้ำ ให้ "ลบ" แถวเกิน ไม่ใช่ "เปลี่ยนชื่อ" (เปลี่ยนชื่อแล้วยอดยังเกินอยู่ 6,500)
-- ══════════════════════════════════════════════════════════════
/*
update sales
set customer_name = 'บริษัท ไดเหวยหยวน วิศวกรรมสิ่งแวดล้อม (ไทยแลนด์) จำกัด'
where customer_name like '%ไดหยวน%';

update customers
set name = 'บริษัท ไดเหวยหยวน วิศวกรรมสิ่งแวดล้อม (ไทยแลนด์) จำกัด'
where name like '%ไดหยวน%';

update sales
set customer_name = 'บริษัท ไทย เทียนเฉิง อิเล็กทรอนิก เทคโนโลยี จำกัด'
where customer_name like '%เทียนเฉิง%'
  and customer_name not like '%อิเล็กทรอนิก%';

update customers
set name = 'บริษัท ไทย เทียนเฉิง อิเล็กทรอนิก เทคโนโลยี จำกัด'
where name like '%เทียนเฉิง%'
  and name not like '%อิเล็กทรอนิก%';
*/


-- ══════════════════════════════════════════════════════════════
-- ส่วนที่ 5 · ลบแถวที่ลงซ้ำ  ← ใส่รหัสใบขายจริงจากส่วนที่ 2 ก่อน
--
-- ⚠️ ต้องยืนยันกับใบกำกับภาษีก่อนลบทุกครั้ง ว่าขายคันเดียวจริง
--    บัญชี: ไทยเฉิงไฮ IV-690905004 = 1 คัน · ออลไทม์ IV-690928022 = 1 คัน
-- ══════════════════════════════════════════════════════════════
/*
delete from sales where id in (
  '<ใส่รหัสใบขายที่ซ้ำของ ไทยเฉิงไฮ>',
  '<ใส่รหัสใบขายที่ซ้ำของ ออลไทม์>',
  '<ใส่รหัสใบขายที่ซ้ำของ เจ.เอ็ม.ที.>'
);
*/


-- ══════════════════════════════════════════════════════════════
-- ส่วนที่ 6 · ตรวจราคาทุนของคัน ไทย เทียนเฉิง (CPD25-XAJ4-I)
-- บัญชี: ทุน 298,000 ขาย 325,000 → กำไร 27,000 ได้ค่าคอม 500
-- แอป: กำไร 10,000 → ตกขั้น (ต้อง ≥25,000) ได้ 0
-- ดูว่าทุนในสต็อกสูงไป หรือมีค่าขนส่ง/ของแถม/อุปกรณ์เสริมหักอยู่ใน custom_fields
-- ══════════════════════════════════════════════════════════════
select
  s.id,
  s.customer_name,
  s.forklift_model,
  s.forklift_unit_no as sn,
  s.actual_sale      as ราคาขาย,
  f.cost_price       as ทุนในสต็อก,
  s.actual_sale - coalesce(f.cost_price, 0) as กำไรก่อนหัก,
  s.custom_fields
from sales s
left join forklifts f on f.id = s.forklift_id
where s.sales_staff like '%ไหมแก้ว%'
  and s.forklift_model like '%XAJ4%'
  and s.payment_received_date >= '2026-09-01'
  and s.payment_received_date <= '2026-09-30';
