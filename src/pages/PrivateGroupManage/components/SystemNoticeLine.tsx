/**
 * 自動のお知らせを灰色の小さな 1 行で出す（グループページ刷新 段階 1 → 2026-10-11 すべてのお知らせをこの形に）。
 * 続けて届いたお知らせは「・」でつないで 1 行にまとめる。行動が要るものだけ、末尾に小さなリンクを 1 つ。
 */
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { NoticeLine } from './groupChatMessages'
import { renderMessageWithLinks } from './renderMessageWithLinks'

export interface NoticeLinkHandlers {
  onGoToSchedule?: () => void
  onGoToOverview?: () => void
  /** 概要タブの「配役」欄へ（?tab=overview#casting） */
  onGoToCasting?: () => void
  /** 配役の全画面シートを開く（?sheet=casting-method / casting-pick） */
  onOpenCastingSheet?: (sheet: 'casting-method' | 'casting-pick') => void
  onOpenSurvey?: () => void
  onOpenHandover?: (requestId: string) => void
}

function handlerOf(link: NonNullable<NoticeLine['link']>, h: NoticeLinkHandlers): (() => void) | null {
  switch (link.target) {
    case 'dates': return h.onGoToSchedule ?? null
    case 'overview': return h.onGoToOverview ?? null
    case 'casting': return h.onGoToCasting ?? h.onGoToOverview ?? null
    case 'casting-method':
    case 'casting-pick': {
      const open = h.onOpenCastingSheet
      const sheet = link.target
      return open ? () => open(sheet) : null
    }
    case 'survey': return h.onOpenSurvey ?? null
    case 'handover': return h.onOpenHandover && link.requestId ? () => h.onOpenHandover!(link.requestId!) : null
    default: return null
  }
}

export function SystemNoticeLine({ lines, handlers = {} }: { lines: NoticeLine[]; handlers?: NoticeLinkHandlers }) {
  const [open, setOpen] = useState(false)
  const last = lines[lines.length - 1]
  const link = last?.link
  const detail = lines.length === 1 ? last.detail : undefined
  const linkClass = 'ml-1 whitespace-nowrap font-medium text-primary underline-offset-2 hover:underline'
  let action: ReactNode = null
  if (link?.target === 'expand' && detail) {
    action = (
      <button type="button" className={linkClass} aria-expanded={open} onClick={() => setOpen(v => !v)} data-testid="system-notice-link">
        › {open ? '閉じる' : link.label}
      </button>
    )
  } else if (link?.target === 'invite' && link.inviteCode) {
    action = <Link to={`/group/invite/${link.inviteCode}`} className={linkClass} data-testid="system-notice-link">› {link.label}</Link>
  } else if (link) {
    const onClick = handlerOf(link, handlers)
    if (onClick) action = <button type="button" className={linkClass} onClick={onClick} data-testid="system-notice-link">› {link.label}</button>
  }
  return (
    <div className="my-2 px-4 text-center" data-testid="system-notice-line" data-personal={last?.personal ? 'true' : undefined} title={last?.personal ? 'あなただけに表示されています' : undefined}>
      <p className="text-xs text-muted-foreground leading-snug">
        {lines.map(l => l.text).join(' ・ ')}
        {action}
      </p>
      {open && detail && (
        <p className="mx-auto mt-1.5 max-w-sm whitespace-pre-wrap break-all text-left text-xs leading-relaxed text-muted-foreground" data-testid="system-notice-detail">
          {renderMessageWithLinks(detail)}
        </p>
      )}
    </div>
  )
}
