/**
 * ⋮ メニューから開く「写真の一覧」「ピン留めの一覧」（グループページ刷新 段階 2）。
 * 写真は参加中の本人にだけ発行される期限付き URL で読む（スタッフには出ない）。
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Loader2, Pin, X } from 'lucide-react'
import { fetchGroupPhotoUrls, type GroupPhoto } from '@/lib/privateGroupChat'
import { logger } from '@/utils/logger'
import { formatJstTime } from '@/utils/jstDate'
import type { PrivateGroupMessage } from '@/types'
import { formatChatDate } from '@/pages/PrivateGroupManage/components/groupChatMessages'
import { quoteText } from '@/pages/PrivateGroupManage/components/chat/chatModel'
import { PhotoViewer } from '@/pages/PrivateGroupManage/components/chat/PhotoViewer'

function BottomPanel({ title, onClose, children, testId }: { title: string; onClose: () => void; children: ReactNode; testId: string }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} data-testid={testId}>
      <div
        className="absolute bottom-0 left-0 right-0 lg:left-auto lg:right-4 lg:bottom-4 lg:w-[420px] bg-background rounded-t-2xl lg:rounded-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
          <h3 className="font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="p-2 hover:bg-muted rounded-full" aria-label="閉じる">
            <X className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  )
}

export function GroupPhotosSheet({ groupId, memberId, nameOf, onClose }: { groupId: string; memberId: string; nameOf: (memberId: string | null) => string; onClose: () => void }) {
  const [photos, setPhotos] = useState<GroupPhoto[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [viewing, setViewing] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    fetchGroupPhotoUrls(groupId, memberId)
      .then(r => { if (!cancelled) setPhotos(r.photos) })
      .catch(err => { logger.error('写真の一覧を読めませんでした', err); if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [groupId, memberId])
  return (
    <>
      <BottomPanel title={`写真の一覧${photos ? `（${photos.length}枚）` : ''}`} onClose={onClose} testId="group-photos-sheet">
        {failed ? (
          <p className="p-6 text-center text-sm text-muted-foreground">写真を読み込めませんでした。時間をおいて開き直してください。</p>
        ) : !photos ? (
          <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : photos.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">まだ写真はありません。チャットの入力欄のカメラ・写真ボタンから送れます。</p>
        ) : (
          <div className="grid grid-cols-3 gap-0.5 p-0.5">
            {photos.map((p, i) => (
              <button key={`${p.messageId}:${p.position}`} type="button" className="relative aspect-square bg-muted overflow-hidden" onClick={() => setViewing(i)} aria-label={`${nameOf(p.memberId)}さんの写真`}>
                <img src={p.url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </BottomPanel>
      {photos && viewing !== null && (
        <PhotoViewer
          photos={photos.map(p => ({ url: p.url, label: `${nameOf(p.memberId)}・${formatChatDate(p.createdAt)}` }))}
          startIndex={viewing}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  )
}

export function GroupPinsSheet({ pinned, nameOf, onJump, onClose }: { pinned: PrivateGroupMessage[]; nameOf: (memberId: string | null) => string; onJump: (messageId: string) => void; onClose: () => void }) {
  return (
    <BottomPanel title="ピン留めの一覧" onClose={onClose} testId="group-pins-sheet">
      {pinned.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">ピン留めはありません。主催者が発言を長押しして「ピン留め」にすると、こことチャットの上に出ます。</p>
      ) : (
        <ul className="divide-y divide-border">
          {pinned.map(m => (
            <li key={m.id}>
              <button type="button" className="w-full text-left px-4 py-3 hover:bg-muted flex gap-2.5" onClick={() => { onClose(); onJump(m.id) }}>
                <Pin className="w-4 h-4 text-purple-700 shrink-0 mt-0.5" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm break-words">{quoteText(nameOf(m.member_id), m)}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">{formatChatDate(m.created_at)} {formatJstTime(m.created_at)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </BottomPanel>
  )
}
