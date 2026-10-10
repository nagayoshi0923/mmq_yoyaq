/**
 * グループページのタブ（概要／日程／メンバー／チャット。公演後は 思い出／メンバー／チャット）。チャットには未読数の赤丸。
 * PC（lg 以上）ではチャットを右列に出すのでチャットのタブを隠し、左に出している中身（desktopActive）を選択中にする。
 */
import { GROUP_TABS, type GroupTab } from './groupPageModel'

interface GroupTabBarProps {
  active: GroupTab
  /** PC で左に出している中身（チャット以外） */
  desktopActive: GroupTab
  onChange: (tab: GroupTab) => void
  unread: number
  /** 並べるタブ（既定は公演前の 4 つ） */
  tabs?: ReadonlyArray<{ id: GroupTab; label: string }>
}

const ON = 'bg-violet-600 text-white font-bold'
const OFF = 'bg-card text-foreground/80 font-normal hover:bg-muted'
const LG_ON = 'lg:bg-violet-600 lg:text-white lg:font-bold'
const LG_OFF = 'lg:bg-card lg:text-foreground/80 lg:font-normal'

export function GroupTabBar({ active, desktopActive, onChange, unread, tabs = GROUP_TABS }: GroupTabBarProps) {
  return (
    <div role="tablist" aria-label="グループの表示" className="flex bg-card border border-border rounded-lg overflow-hidden" data-testid="group-tabs">
      {tabs.map(tab => {
        const on = tab.id === active
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={on}
            data-tab={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex-1 py-2.5 px-1 text-sm border-r border-border lg:[&:nth-last-child(2)]:border-r-0 last:border-r-0 ${on ? ON : OFF} ${tab.id === desktopActive ? LG_ON : LG_OFF} ${tab.id === 'chat' ? 'lg:hidden' : ''}`}
          >
            {tab.label}
            {tab.id === 'chat' && unread > 0 && (
              <span className="ml-1 inline-block min-w-4 rounded-full bg-red-600 px-1.5 text-xs font-bold leading-4 text-white" aria-label={`未読 ${unread} 件`}>
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
