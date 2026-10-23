-- เติมราคาทุนแฮนด์ลิฟท์ STAXX ตามรุ่น (จากไฟล์ กรอกราคาทุน_แฮนด์ลิฟท์231คัน.xlsx)
-- สร้าง 23 ต.ค. 2569
--
-- ปลอดภัย: อัปเดตเฉพาะคันที่ทุนยังเป็น 0 เท่านั้น (coalesce(cost_price,0) = 0)
--          คันที่มีทุนอยู่แล้วไม่ถูกแตะ แม้รุ่นจะตรงกัน
--
-- วิธีใช้: Supabase -> SQL Editor -> วางทั้งไฟล์ -> Run
--          ผลลัพธ์ท้ายไฟล์จะบอกว่าเหลือคันที่ยังไม่มีทุนกี่คัน

-- ดูก่อนว่าจะกระทบกี่คัน (ยังไม่แก้อะไร)
select f.model as รุ่น, count(*) as จะเติมทุนให้
from public.forklifts f
where upper(btrim(f.brand)) = 'STAXX'
  and coalesce(f.cost_price, 0) = 0
  and upper(btrim(f.model)) in (
    'PWH20-III (520PD)',
    'PWH20-III (550PD)',
    'PWH20-III (685PD)',
    'BF25 (685ND)-H',
    'BF25 (685PD)-H',
    'PWH25-II (520PD)',
    'BF30 (685ND)-H',
    'BF30 (685PD)-H',
    'PWH30-II (520PD)',
    'AC50 (685)-H'
  )
group by f.model
order by count(*) desc;


-- ── เติมทุน ─────────────────────────────────────────────────────────────

-- 1. PWH20-III (520PD)  (ในไฟล์ 12 คัน)
update public.forklifts
   set cost_price = 6255
 where upper(btrim(brand)) = 'STAXX'
   and upper(btrim(model)) = 'PWH20-III (520PD)'
   and coalesce(cost_price, 0) = 0;

-- 2. PWH20-III (550PD)  (ในไฟล์ 6 คัน)
update public.forklifts
   set cost_price = 6255
 where upper(btrim(brand)) = 'STAXX'
   and upper(btrim(model)) = 'PWH20-III (550PD)'
   and coalesce(cost_price, 0) = 0;

-- 3. PWH20-III (685PD)  (ในไฟล์ 11 คัน)
update public.forklifts
   set cost_price = 6290
 where upper(btrim(brand)) = 'STAXX'
   and upper(btrim(model)) = 'PWH20-III (685PD)'
   and coalesce(cost_price, 0) = 0;

-- 4. BF25 (685ND)-H  (ในไฟล์ 32 คัน)
update public.forklifts
   set cost_price = 6745
 where upper(btrim(brand)) = 'STAXX'
   and upper(btrim(model)) = 'BF25 (685ND)-H'
   and coalesce(cost_price, 0) = 0;

-- 5. BF25 (685PD)-H  (ในไฟล์ 29 คัน)
update public.forklifts
   set cost_price = 6745
 where upper(btrim(brand)) = 'STAXX'
   and upper(btrim(model)) = 'BF25 (685PD)-H'
   and coalesce(cost_price, 0) = 0;

-- 6. PWH25-II (520PD)  (ในไฟล์ 26 คัน)
update public.forklifts
   set cost_price = 6080
 where upper(btrim(brand)) = 'STAXX'
   and upper(btrim(model)) = 'PWH25-II (520PD)'
   and coalesce(cost_price, 0) = 0;

-- 7. BF30 (685ND)-H  (ในไฟล์ 35 คัน)
update public.forklifts
   set cost_price = 6920
 where upper(btrim(brand)) = 'STAXX'
   and upper(btrim(model)) = 'BF30 (685ND)-H'
   and coalesce(cost_price, 0) = 0;

-- 8. BF30 (685PD)-H  (ในไฟล์ 31 คัน)
update public.forklifts
   set cost_price = 6640
 where upper(btrim(brand)) = 'STAXX'
   and upper(btrim(model)) = 'BF30 (685PD)-H'
   and coalesce(cost_price, 0) = 0;

-- 9. PWH30-II (520PD)  (ในไฟล์ 37 คัน)
update public.forklifts
   set cost_price = 6920
 where upper(btrim(brand)) = 'STAXX'
   and upper(btrim(model)) = 'PWH30-II (520PD)'
   and coalesce(cost_price, 0) = 0;

-- 10. AC50 (685)-H  (ในไฟล์ 12 คัน)
update public.forklifts
   set cost_price = 7375
 where upper(btrim(brand)) = 'STAXX'
   and upper(btrim(model)) = 'AC50 (685)-H'
   and coalesce(cost_price, 0) = 0;


-- ── ตรวจผลหลังรัน ───────────────────────────────────────────────────────
select
  count(*) filter (where coalesce(cost_price,0) = 0)  as ยังไม่มีทุน,
  count(*) filter (where coalesce(cost_price,0) > 0)  as มีทุนแล้ว,
  count(*)                                            as รวมแฮนด์ลิฟท์_staxx
from public.forklifts
where upper(btrim(brand)) = 'STAXX';
