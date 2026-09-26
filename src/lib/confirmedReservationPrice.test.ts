import { describe, expect, it } from 'vitest'
import { confirmedReservationPrice } from '../../supabase/functions/_shared/confirmed-reservation-price'
describe('予約確認メールの確定金額',()=>{
 it('クーポン割引後の保存額を使用する',()=>{expect(confirmedReservationPrice({total_price:5000,discount_amount:1000,final_price:4000})).toBe(4000)})
 it('全額割引の0円を元の金額へ戻さない',()=>{expect(confirmedReservationPrice({total_price:5000,discount_amount:5000,final_price:0})).toBe(0)})
 it('旧予約の最終金額未設定は保存された合計と割引から算出する',()=>{expect(confirmedReservationPrice({total_price:5000,discount_amount:1000})).toBe(4000)})
 it.each([{}, {final_price:-1},{final_price:NaN}])('確定額のない予約を金額0として案内しない',reservation=>{expect(()=>confirmedReservationPrice(reservation)).toThrow('確定金額')})
})
