import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/patterns/modal/ConfirmDialog'
import { formatJstDateJa, formatJstTime } from '@/utils/jstDate'

interface ResponseState {
  status: string
  can_withdraw?: boolean
  event: { scenario: string; date: string; start_time: string; store_name: string | null; deadline: string }
}

export default function RecruitmentResponse() {
  const [token] = useState(() => window.location.hash.slice(1))
  const [data, setData] = useState<ResponseState | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const request = useCallback(async (action: 'view' | 'withdraw') => {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/recruitment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action }), cache: 'no-store',
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        if (result.error === 'WITHDRAWAL_CLOSED') {
          setData(previous => previous ? { ...previous, can_withdraw: false } : previous)
          throw new Error('無料辞退の受付は終了しました。開催状況のご案内をご確認ください。')
        }
        throw new Error(result.error === 'INVALID_LINK' ? 'リンクを確認できません。ご案内メールの専用リンクから開いてください。' : '確認できませんでした。時間をおいて再度お試しください。')
      }
      setData(result)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '確認できませんでした。')
    } finally {
      setBusy(false)
    }
  }, [token])
  useEffect(() => { void request('view') }, [request])
  return <main className="container mx-auto max-w-xl px-4 py-8">
    <Card>
      <CardHeader><CardTitle>追加募集・開催状況のご案内</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        {error && <p role="alert" className="text-destructive">{error}</p>}
        {!data && !error && <p role="status">確認しています…</p>}
        {data && <>
          <div><h1 className="text-lg font-semibold">{data.event.scenario}</h1>
            <p>{formatJstDateJa(data.event.date, true)} {data.event.start_time.slice(0, 5)} 開演</p>
            <p>{data.event.store_name}</p></div>
          {data.status === 'withdrawn' ? <p role="status">参加の取りやめを受け付けました。キャンセル料は0円です。お支払い済みの場合の返金については店舗へお問い合わせください。</p> : <>
            <p>追加募集の期限：{formatJstDateJa(data.event.deadline)} {formatJstTime(data.event.deadline)}（日本時間・開演90分前）</p>
            <p>{data.status === 'confirmed' ? '開催が決定しました。' : data.status === 'cancelled' ? '公演は中止となりました。' : '開催可否は改めてご案内します。'}</p>
            {data.can_withdraw ? <>
              <p>開催判断をお待ちいただけない場合、判断待ちの間は無料で参加を取りやめられます。この予約に含まれる全員分がキャンセルされます。</p>
              <Button onClick={() => setConfirm(true)} disabled={busy}>無料で参加を取りやめる</Button>
            </> : <p>このページからの無料辞退の受付は終了しています。</p>}
          </>}
        </>}
        <Button variant="outline" onClick={() => void request('view')} disabled={busy}>最新の状況を確認</Button>
      </CardContent>
    </Card>
    <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="参加を取りやめますか？"
      message="この予約に含まれる全員分をキャンセルします。キャンセル料は0円です。元に戻すには改めて予約が必要です。"
      confirmLabel="無料で参加を取りやめる" cancelLabel="予約を残す" isLoading={busy}
      onConfirm={() => request('withdraw')} />
  </main>
}
