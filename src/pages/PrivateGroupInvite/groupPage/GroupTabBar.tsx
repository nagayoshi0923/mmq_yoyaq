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

// 見本: 黒地の帯の下に並ぶ下線のタブ（選んでいるタブは白い太字と下線）
const ON = 'border-white text-white font-bold'
const OFF = 'border-transparent text-white/70 font-normal hover:text-white'
const LG_ON = 'lg:border-white lg:text-white lg:font-bold'
const LG_OFF = 'lg:border-transparent lg:text-white/70 lg:font-normal'

export function GroupTabBar({ active, desktopActive, onChange, unread, tabs = GROUP_TABS }: GroupTabBarProps) {
  return (
    <div role="tablist" aria-label="グループの表示" className="flex px-2" data-testid="group-tabs">
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
            className={`flex-1 border-b-[3px] py-3 px-1 text-sm ${on ? ON : OFF} ${tab.id === desktopActive ? LG_ON : LG_OFF} ${tab.id === 'chat' ? 'lg:hidden' : ''}`}
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
