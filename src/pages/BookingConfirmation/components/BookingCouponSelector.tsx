import { useBookingCoupon } from '../hooks/useBookingCoupon'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export function BookingCouponSelector({ state, disabled }: { state: ReturnType<typeof useBookingCoupon>; disabled: boolean }) {
  const { selectedCouponId, setSelectedCouponId, availableCoupons, couponsQuery, couponPreview, couponReady, couponDiscount } = state
  return <section className="space-y-2">
    <Label htmlFor="booking-coupon">クーポン</Label>
    <select id="booking-coupon" className="w-full rounded-md border bg-background p-2" value={selectedCouponId ?? ''}
      disabled={disabled || couponsQuery.isLoading} onChange={e => setSelectedCouponId(e.target.value || null)}>
      <option value="">利用しない</option>
      {availableCoupons.map(coupon => <option key={coupon.id} value={coupon.id}>{coupon.coupon_campaigns?.display_name || coupon.coupon_campaigns?.name || 'クーポン'}</option>)}
    </select>
    {couponsQuery.isLoading && <p role="status">クーポンを読み込み中…</p>}
    {couponsQuery.error && <div role="alert">クーポンを取得できませんでした。<Button variant="link" onClick={() => void couponsQuery.refetch()}>再読み込み</Button></div>}
    {selectedCouponId && couponPreview.isFetching && <p role="status">利用条件を確認中…</p>}
    {selectedCouponId && couponPreview.error && <p role="alert">{couponPreview.error.message}</p>}
    {selectedCouponId && couponReady && <p className="text-sm">{couponDiscount.toLocaleString()}円割引。予約確定時に利用します。</p>}
  </section>
}
