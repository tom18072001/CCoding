# cart

- toCents(x): số tiền (đơn vị đồng chính, có thể có phần lẻ) → số nguyên xu, làm tròn gần nhất. Số âm hoặc không hữu hạn → RangeError.
- total(items): items = [{price, quantity}], trả tổng theo xu (cộng từng dòng toCents(price) * quantity).
- applyCoupon(totalCents, coupon): trả xu sau giảm, số nguyên.
  - {type:'percent', value:v}, 0<=v<=100: totalCents*(100-v)/100 làm tròn nửa lên (Math.round).
  - {type:'fixed', value:c}, c là xu nguyên >= 0: max(0, totalCents-c).
  - coupon sai kiểu, percent ngoài [0,100], fixed âm hoặc không nguyên → RangeError.
