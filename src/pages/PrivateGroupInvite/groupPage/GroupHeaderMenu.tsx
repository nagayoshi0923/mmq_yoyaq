/**
 * 見出し右上の ⋮ メニュー（グループページ刷新 段階 2）。
 * メンバー（人数）・招待リンク／写真の一覧／ピン留めの一覧／操作（段階 1 のまま: 主催者はマイページと同じ操作メニュー、
 * メンバー・ゲストはグループ設定）。段階 3 で 通知 ON／OFF（会員だけ。ゲストはプッシュが無い）を足した。
 */
import { useState, type ReactNode } from 'react'
import { Bell, BellOff, Images, MoreVertical, Pin, Settings2, Users } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

interface GroupHeaderMenuProps {
  memberCount: number
  pinnedCount: number
  onMembers: () => void
  onPhotos: () => void
  onPins: () => void
  onActions: () => void
  /** 主催者の操作メニュー（⋮ の位置に重ねて開く）。メンバー・ゲストは無し */
  actionsMenu?: ReactNode
  /** 通知 ON／OFF（このグループ・この端末）。会員だけ。無ければ出さない */
  push?: { on: boolean; busy: boolean; onToggle: () => void } | null
}

export function GroupHeaderMenu({ memberCount, pinnedCount, onMembers, onPhotos, onPins, onActions, actionsMenu, push }: GroupHeaderMenuProps) {
  const [open, setOpen] = useState(false)
  const item = 'gap-2.5 py-2.5'
  return (
    <div className="relative shrink-0">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button type="button" className="w-9 h-9 flex items-center justify-center rounded-md border border-zinc-300 bg-background hover:bg-muted" aria-label="グループのメニュー" title="グループのメニュー" data-testid="group-settings">
            <MoreVertical className="w-4 h-4" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 rounded-lg p-1.5" data-testid="group-header-menu">
          <DropdownMenuItem className={item} onSelect={onMembers} data-menu-item="members">
            <Users className="w-4 h-4 text-muted-foreground" aria-hidden="true" />メンバー（{memberCount}名）・招待リンク
          </DropdownMenuItem>
          <DropdownMenuItem className={item} onSelect={onPhotos} data-menu-item="photos">
            <Images className="w-4 h-4 text-muted-foreground" aria-hidden="true" />写真の一覧
          </DropdownMenuItem>
          <DropdownMenuItem className={item} onSelect={onPins} data-menu-item="pins">
            <Pin className="w-4 h-4 text-muted-foreground" aria-hidden="true" />ピン留めの一覧{pinnedCount > 0 ? `（${pinnedCount}）` : ''}
          </DropdownMenuItem>
          {push && (
            <DropdownMenuItem className={item} onSelect={push.onToggle} disabled={push.busy} data-menu-item="push" data-state-on={push.on ? 'true' : 'false'}>
              {push.on ? <Bell className="w-4 h-4 text-muted-foreground" aria-hidden="true" /> : <BellOff className="w-4 h-4 text-muted-foreground" aria-hidden="true" />}
              <span className="flex-1">通知</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${push.on ? 'bg-purple-100 text-purple-700' : 'bg-muted text-muted-foreground'}`}>{push.on ? 'ON' : 'OFF'}</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem className={item} onSelect={() => window.setTimeout(onActions, 0)} data-menu-item="actions">
            <Settings2 className="w-4 h-4 text-muted-foreground" aria-hidden="true" />操作（候補日・店舗・問い合わせなど）
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {actionsMenu && <div className="absolute inset-0 pointer-events-none">{actionsMenu}</div>}
    </div>
  )
}
