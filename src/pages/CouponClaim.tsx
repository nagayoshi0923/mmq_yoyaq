import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/apiClient'
import { Button } from '@/components/ui/button'
import { formatJstDateJa } from '@/utils/jstDate'

type ClaimInfo = { claim_expires_at: string; display_name?: string; name: string; discount_amount: number; customer_terms?: string }
export function CouponClaim() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [token] = useState(() => {
    const fromUrl = window.location.hash.slice(1)
    if (/^[a-f0-9]{64}$/.test(fromUrl)) sessionStorage.setItem('privateCouponClaimToken', fromUrl)
    return fromUrl || sessionStorage.getItem('privateCouponClaimToken') || ''
  })
  const [info, setInfo] = useState<ClaimInfo | null>(null)
  const [result, setResult] = useState<{ already_claimed: boolean; expires_at: string } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!user || !token) return
    let cancelled = false
    apiClient.post<ClaimInfo>('/api/coupons?action=private-claim-info', { token })
      .then(data => { if (!cancelled) setInfo(data) })
      .catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [user, token])
  const login = () => {
    sessionStorage.setItem('returnUrl', `/coupon-claim#${token}`)
    navigate('/login')
  }
  const claim = async () => {
    setBusy(true); setError('')
    try {
      setResult(await apiClient.post('/api/coupons?action=claim-private-coupon', { token }))
    } catch (e) { setError(e instanceof Error ? e.message : '受け取りに失敗しました') }
    finally { setBusy(false) }
  }
  return <main className="max-w-md mx-auto p-6 space-y-5">
    <h1 className="text-xl font-bold">公演中止のお詫びクーポン</h1>
    <p>この貸切に参加予定だったお客様は、ご自身のアカウントで1枚お受け取りください。</p>
    {!token ? <p>受け取りURLから開いてください。</p> : !user ?
      <Button onClick={login}>ログイン・新規登録して受け取る</Button> : <>
        {info && <><h2 className="font-semibold">{info.display_name || info.name}</h2>
          <p>{info.discount_amount.toLocaleString()}円分</p>
          <p>受け取り期限：{formatJstDateJa(info.claim_expires_at)}</p>
          <p className="text-sm text-muted-foreground">受け取り日から6か月有効。マーダーミステリー公演限定。ボードゲーム・箱開け会には使えません。</p>
          {info.customer_terms && <p className="text-sm">{info.customer_terms}</p>}</>}
        {result ? <><p>{result.already_claimed ? 'このアカウントでは受け取り済みです。' : 'クーポンを受け取りました。'}</p>
          <p>有効期限：{formatJstDateJa(result.expires_at)}</p>
          <Button onClick={() => navigate('/mypage')}>マイページで確認する</Button></> :
          <Button disabled={!info || busy} onClick={claim}>{busy ? '受け取り中…' : '自分のアカウントで1枚受け取る'}</Button>}
      </>}
    {error && <div role="alert"><p>{error}</p>
      {error.includes('プロフィール') && <Button variant="outline" onClick={() => navigate('/complete-profile?next='+encodeURIComponent(`/coupon-claim#${token}`))}>プロフィールを登録する</Button>}
    </div>}
  </main>
}
