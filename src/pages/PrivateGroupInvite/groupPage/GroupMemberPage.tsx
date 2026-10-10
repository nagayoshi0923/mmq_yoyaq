/**
 * 参加中の人（会員・ゲスト）のグループページ（刷新 段階 1、スマホ優先）。
 * 上から: 見出し → いまの状態の箱（固定） → タブ（概要／日程／メンバー／チャット） → 中身。
 * PC（lg 以上）は同じ並びを左に広げ、チャットだけ右列に出す。チャットは 1 つだけ描き、置き場所を grid で切り替える。
 */
import type { ReactNode } from 'react'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { GroupStatusBox } from './GroupStatusBox'
import { GroupTabBar } from './GroupTabBar'
import type { GroupStatusView, GroupTab, StatusAction } from './groupPageModel'

interface GroupMemberPageProps {
  header: ReactNode
  status: GroupStatusView
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

export function GroupMemberPage({ header, status, onStatusAction, activeTab, desktopTab, onTabChange, unread, tabs, panels, chat }: GroupMemberPageProps) {
  const chatActive = activeTab === 'chat'
  const leftTab = chatActive ? desktopTab : activeTab
  return (
    <div className="h-[100dvh] flex flex-col bg-muted/40 overflow-hidden" data-testid="group-member-page" data-tab={activeTab}>
      <Header />
      <div className="hidden lg:block">
        <NavigationBar currentPage="/" />
      </div>
      <div className="flex-1 min-h-0 flex flex-col lg:max-w-6xl lg:mx-auto lg:w-full">
        {header}
        <div className="flex-1 min-h-0 grid grid-cols-1 grid-rows-[auto_auto_minmax(0,1fr)] [grid-template-areas:'status''tabs''body'] lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-x-4 lg:px-4 lg:[grid-template-areas:'status_chat''tabs_chat''body_chat']">
          <div className="[grid-area:status]">
            {chatActive && (
              <div className="lg:hidden">
                <GroupStatusBox view={status} onAction={onStatusAction} compact onOpenDetail={() => onTabChange(desktopTab)} />
              </div>
            )}
            <div className={`px-3.5 pt-3 lg:px-0 ${chatActive ? 'hidden lg:block' : ''}`}>
              <GroupStatusBox view={status} onAction={onStatusAction} />
            </div>
          </div>
          <div className={`[grid-area:tabs] px-3.5 lg:px-0 ${chatActive ? 'pt-2 lg:pt-3' : 'pt-3'}`}>
            <GroupTabBar active={activeTab} desktopActive={leftTab} onChange={onTabChange} unread={unread} tabs={tabs} />
          </div>
          <div className={`[grid-area:body] min-h-0 overflow-y-auto px-3.5 pt-3 pb-6 lg:px-0 ${chatActive ? 'hidden lg:block' : ''}`} data-testid="group-tab-panel">
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
