/**
 * 思い出タブ（公演後、グループページ刷新 段階 4。見本 GroupAfter.dc.html）。
 * 写真（このグループのチャットの写真すべて）・公演の記録（概要タブの中身を畳んだもの）・公演後アンケート（感想）。
 */
import { useMemo, useState, type ReactNode } from 'react'
import { ImageIcon, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { GroupPhoto, GroupAfterInfo } from '@/lib/privateGroupChat'
import { formatChatDate } from '@/pages/PrivateGroupManage/components/groupChatMessages'
import { PhotoViewer } from '@/pages/PrivateGroupManage/components/chat/PhotoViewer'
import { savePhotos } from '@/pages/PrivateGroupManage/components/chat/chatDom'
import { performanceLabel, photoSummary } from './groupPageModel'
import type { AlbumState } from './useGroupMemories'

interface GroupMemoriesTabProps {
  title: string
  imageUrl: string | null
  photos: GroupPhoto[] | null
  photosFailed: boolean
  myMemberId: string
  nameOf: (memberId: string | null) => string
  sending: boolean
  onShare: () => void
  /** 自分の投稿（写真の発言）を消す。確認は呼ぶ側 */
  onDeleteMessage: (messageId: string, photoCount: number) => void
  after: GroupAfterInfo | null
  memberCount: number
  albumState: AlbumState | null
  registering: boolean
  onRegisterAlbum: () => void
  onOpenFeedback: () => void
  onOpenScenario?: () => void
}

function Section({ title, aside, children, label }: { title: ReactNode; aside?: ReactNode; children: ReactNode; label: string }) {
  return (
    <section className="bg-card border border-border rounded-lg p-3" aria-label={label}>
      <h2 className="mb-2 text-sm font-bold flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">{title}</span>
        {aside}
      </h2>
      {children}
    </section>
  )
}

export function GroupMemoriesTab(props: GroupMemoriesTabProps) {
  const { title, imageUrl, photos, photosFailed, myMemberId, nameOf, sending, onShare, onDeleteMessage, after, memberCount, albumState, registering, onRegisterAlbum, onOpenFeedback, onOpenScenario } = props
  const [viewing, setViewing] = useState<number | null>(null)
  const [saving, setSaving] = useState<number | null>(null)
  const perf = after?.performance ?? null
  const summary = useMemo(() => (photos ? photoSummary(photos, nameOf) : ''), [photos, nameOf])
  const participants = perf?.participant_count ?? after?.joined_count ?? memberCount

  const saveAll = async () => {
    if (!photos?.length || saving !== null) return
    setSaving(0)
    const count = await savePhotos(
      [...photos].reverse().map((p, i) => ({ url: p.url, name: `${title}-${String(i + 1).padStart(2, '0')}.jpg` })),
      done => setSaving(done),
    )
    setSaving(null)
    if (count === 0) toast.error('写真を保存できませんでした')
  }

  return (
    <div className="flex flex-col gap-3" data-testid="group-memories-tab">
      <Section label="写真" title="写真" aside={photos && photos.length > 0 ? <span className="text-xs font-normal text-muted-foreground truncate" data-testid="memories-photo-summary">{summary}</span> : null}>
        {photosFailed ? (
          <p className="py-4 text-center text-sm text-muted-foreground">写真を読み込めませんでした。時間をおいて開き直してください。</p>
        ) : !photos ? (
          <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" aria-label="読み込み中" /></div>
        ) : photos.length === 0 ? (
          <div className="py-4 flex flex-col items-center gap-2 text-center">
            <ImageIcon className="w-8 h-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">まだ写真はありません。当日の写真を共有しましょう。</p>
            <Button type="button" size="sm" onClick={onShare} disabled={sending} className="bg-green-700 hover:bg-green-800 text-white">
              {sending ? '送信中…' : '写真を共有する'}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-3 lg:grid-cols-5 gap-1.5" data-testid="memories-photo-grid">
            {photos.map((p, i) => (
              <button
                key={`${p.messageId}:${p.position}`}
                type="button"
                className="relative aspect-square rounded-md bg-muted overflow-hidden"
                onClick={() => setViewing(i)}
                aria-label={`${nameOf(p.memberId)}さんの写真を拡大`}
              >
                <img src={p.thumbUrl ?? p.url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
              </button>
            ))}
          </div>
        )}
        {photos && photos.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-muted-foreground">
            <button type="button" onClick={() => void saveAll()} disabled={saving !== null} className="text-violet-700 font-bold hover:underline disabled:opacity-60" data-testid="memories-save-all">
              {saving !== null ? `保存の準備中…（${saving}/${photos.length}）` : 'まとめて保存'}
            </button>
            <span aria-hidden="true">・</span>
            <span>自分の投稿は削除できます</span>
            <span aria-hidden="true">・</span>
            <span>公開範囲はこのグループのメンバーだけ</span>
          </div>
        )}
      </Section>

      <Section label="公演の記録" title="公演の記録">
        <div className="flex gap-3">
          {imageUrl && <img src={imageUrl} alt="" className="w-16 h-[5.5rem] shrink-0 rounded-md object-cover bg-muted cursor-pointer" onClick={onOpenScenario} />}
          <dl className="flex-1 min-w-0 text-sm grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1">
            <dt className="text-xs text-muted-foreground pt-0.5">作品</dt>
            <dd className="font-bold">{title}</dd>
            {perf && (
              <>
                <dt className="text-xs text-muted-foreground pt-0.5">開催</dt>
                <dd>{performanceLabel({ date: perf.date, start_time: perf.start_time, store_name: null })}{perf.end_time ? `〜${perf.end_time.slice(0, 5)}` : ''}</dd>
                {perf.store_name && (
                  <>
                    <dt className="text-xs text-muted-foreground pt-0.5">店舗</dt>
                    <dd>{perf.store_name}</dd>
                  </>
                )}
              </>
            )}
            <dt className="text-xs text-muted-foreground pt-0.5">参加</dt>
            <dd>{participants}名</dd>
          </dl>
        </div>
        {albumState === 'registered' && (
          <p className="mt-2 text-xs text-green-800 bg-green-50 rounded-md px-2.5 py-1.5" data-testid="memories-album-registered">マイページの「アルバム」に体験済みとして登録済みです</p>
        )}
        {albumState === 'not_registered' && perf && (
          <div className="mt-2 flex flex-wrap items-center gap-2 bg-muted rounded-md px-2.5 py-2">
            <p className="flex-1 min-w-0 text-xs text-muted-foreground">マイページの「アルバム」にまだ入っていません。登録すると体験済みの作品に並び、この写真も表示されます。</p>
            <Button type="button" size="sm" variant="outline" onClick={onRegisterAlbum} disabled={registering} data-testid="memories-album-register">
              {registering ? '登録中…' : 'アルバムに登録する'}
            </Button>
          </div>
        )}
      </Section>

      <Section
        label="公演後アンケート"
        title={<>公演後アンケート <span className="text-xs font-normal rounded-full px-2 py-0.5 bg-muted text-muted-foreground">任意</span></>}
      >
        <p className="text-xs text-muted-foreground leading-snug">店舗からのお願いです。感想は店舗と GM に届きます（メンバーには見えません）。</p>
        {after?.my_feedback && (
          <p className="mt-1.5 text-xs text-green-800" data-testid="memories-feedback-sent">
            回答済み（{formatChatDate(after.my_feedback.updated_at)}・満足度 {after.my_feedback.rating}/5）
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onOpenFeedback} disabled={!perf?.ended} data-testid="memories-feedback-open">
            {after?.my_feedback ? '回答を直す' : '回答する'}
          </Button>
          {after?.post_survey_url && (
            <Button asChild size="sm" variant="outline">
              <a href={after.post_survey_url} target="_blank" rel="noopener noreferrer">店舗のアンケートを開く</a>
            </Button>
          )}
        </div>
      </Section>

      {photos && viewing !== null && (
        <PhotoViewer
          photos={photos.map(p => ({ url: p.url, label: `${nameOf(p.memberId)}・${formatChatDate(p.createdAt)}` }))}
          startIndex={viewing}
          onClose={() => setViewing(null)}
          canDelete={i => photos[i]?.memberId === myMemberId}
          onDelete={i => {
            const target = photos[i]
            if (!target) return
            setViewing(null)
            onDeleteMessage(target.messageId, photos.filter(p => p.messageId === target.messageId).length)
          }}
        />
      )}
    </div>
  )
}
