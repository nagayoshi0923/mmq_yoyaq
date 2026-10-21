/**
 * 参加中の人（会員・ゲスト）のグループページ（刷新 段階 1、スマホ優先）。
 * 上から: 見出し → いまの状態の箱 → タブ（概要／日程／メンバー／チャット） → 中身。
 * スマホ: 見出しの下はまとめて 1 つのスクロール。いまの状態の箱とタブも中身と一緒に流れ、箱が見えなくなったら
 *   1 行のバーだけを上に固定する（見本 GroupDates.dc.html。2026-10-20 staging 点検: 上半分が固定で中身が狭かった）。
 *   チャットタブは入力欄を下に置くため、1 行のバー＋タブを固定し、チャットだけをスクロールする。
 * PC（lg 以上）は同じ並びを左に広げ、チャットだけ右列に出す。チャットは 1 つだけ描き、置き場所を grid で切り替える。
 * 箱は、同じタブを見ている間は低くならない（全員回答で箱が縮んで表がずれ、押し間違いが起きたため。下に余白が残る）。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { GroupStatusBox } from './GroupStatusBox'
import { GroupTabBar } from './GroupTabBar'
import type { GroupStatusView, GroupTab, StatusAction } from './groupPageModel'

interface GroupMemberPageProps {
  header: ReactNode
  status: GroupStatusView
  /** 状態の箱の主ボタンの下に出すボタン（確定後の「カレンダーに登録」「地図を開く」） */
  statusExtra?: ReactNode
  onStatusAction: (action: StatusAction) => void
  activeTab: GroupTab
  /** PC で左に出す中身（チャットを選んでいるときの代わり） */
  desktopTab: GroupTab
  onTabChange: (tab: GroupTab) => void
  unread: number
  /** 並べるタブ（公演後は 思い出／メンバー／チャット） */
  tabs: ReadonlyArray<{ id: GroupTab; label: string }>
  panels: Partial<Record<Exclude<GroupTab, 'chat'>, ReactNode>>
  chat: ReactNode
}

/**
 * 箱の高さの最大（ページ × タブごと）。回答の保存後の読み直しでページが一度描き直されても（読み込み中の表示を挟む）、
 * 同じタブの間は覚えておく。別のタブに切り替えたら忘れる。
 */
const boxHeightMemory = new Map<string, number>()

const LG_GRID = "lg:grid lg:grid-cols-[minmax(0,1fr)_420px] lg:grid-rows-[auto_auto_minmax(0,1fr)] lg:gap-x-4 lg:px-4 lg:[grid-template-areas:'status_chat''tabs_chat''body_chat']"

export function GroupMemberPage({ header, status, statusExtra, onStatusAction, activeTab, desktopTab, onTabChange, unread, tabs, panels, chat }: GroupMemberPageProps) {
  const chatActive = activeTab === 'chat'
  const leftTab = chatActive ? desktopTab : activeTab
  const scrollRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const boxInnerRef = useRef<HTMLDivElement>(null)
  // スマホで箱がスクロールで見えなくなったか（1 行のバーを出す）
  const [boxOut, setBoxOut] = useState(false)
  // 箱の高さの最大（同じタブの間は箱を低くしない）
  const memoryKey = `${typeof window === 'undefined' ? '' : window.location.pathname}|${activeTab}`
  const [boxMinHeight, setBoxMinHeight] = useState(() => boxHeightMemory.get(memoryKey) ?? 0)

  useEffect(() => {
    setBoxOut(false)
    const el = boxRef.current
    if (chatActive || !el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setBoxOut(!entry.isIntersecting), { root: scrollRef.current, threshold: 0 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [chatActive])

  useEffect(() => {
    for (const key of [...boxHeightMemory.keys()]) if (key !== memoryKey) boxHeightMemory.delete(key)
    const el = boxInnerRef.current
    const remember = (height: number) => {
      const next = Math.max(boxHeightMemory.get(memoryKey) ?? 0, height)
      boxHeightMemory.set(memoryKey, next)
      setBoxMinHeight(next)
    }
    remember(el?.offsetHeight ?? 0)
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => remember(el.offsetHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [memoryKey])

  const showBar = chatActive || boxOut
  const openDetail = chatActive
    ? () => onTabChange(desktopTab)
    : () => scrollRef.current?.scrollTo?.({ top: 0, behavior: 'smooth' })

  return (
    <div className="h-[100dvh] flex flex-col bg-muted/40 overflow-hidden" data-testid="group-member-page" data-tab={activeTab}>
      <Header />
      <div className="hidden lg:block">
        <NavigationBar currentPage="/" />
      </div>
      <div className="flex-1 min-h-0 flex flex-col lg:max-w-6xl lg:mx-auto lg:w-full">
        {header}
        {showBar && (
          <div className="lg:hidden shrink-0">
            <GroupStatusBox view={status} onAction={onStatusAction} compact onOpenDetail={openDetail} />
          </div>
        )}
        <div
          ref={scrollRef}
          className={chatActive
            ? `flex-1 min-h-0 grid grid-cols-1 grid-rows-[auto_auto_minmax(0,1fr)] [grid-template-areas:'status''tabs''body'] ${LG_GRID}`
            : `flex-1 min-h-0 overflow-y-auto overscroll-contain lg:overflow-visible ${LG_GRID}`}
          data-testid="group-scroll"
          data-scroll={chatActive ? 'chat' : 'page'}
        >
          <div className="[grid-area:status]">
            <div ref={boxRef} className={`px-3.5 pt-3 lg:px-0 ${chatActive ? 'hidden lg:block' : ''}`}>
              <div style={boxMinHeight > 0 ? { minHeight: boxMinHeight } : undefined} data-testid="group-status-slot">
                <div ref={boxInnerRef}>
                  <GroupStatusBox view={status} onAction={onStatusAction} extra={statusExtra} />
                </div>
              </div>
            </div>
          </div>
          <div className={`[grid-area:tabs] px-3.5 lg:px-0 ${chatActive ? 'pt-2 lg:pt-3' : 'pt-3'}`}>
            <GroupTabBar active={activeTab} desktopActive={leftTab} onChange={onTabChange} unread={unread} tabs={tabs} />
          </div>
          <div className={`[grid-area:body] min-h-0 px-3.5 pt-3 pb-6 lg:px-0 lg:overflow-y-auto ${chatActive ? 'hidden lg:block' : ''}`} data-testid="group-tab-panel">
            {panels[leftTab as Exclude<GroupTab, 'chat'>]}
          </div>
          <div className={`min-h-0 flex-col [grid-area:body] lg:[grid-area:chat] lg:py-3 ${chatActive ? 'flex pt-2' : 'hidden lg:flex'}`} data-testid="group-chat-panel">
            <div className="flex-1 min-h-0 flex flex-col bg-card lg:border lg:border-border lg:rounded-lg overflow-hidden">
              {chat}
            </div>
          </div>
        </div>
      </div>
      <div className="lg:hidden shrink-0">
        <NavigationBar currentPage="/" />
      </div>
    </div>
  )
}
