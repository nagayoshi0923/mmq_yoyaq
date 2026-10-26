import type { ReactNode } from 'react'
import type { ScenarioCardData } from './scenarioCards'
import type { NextEventsState } from './newArrivalNextEvents'

/**
 * 新作のカードの次回公演がまだ無いときの欄（2026-10-26 点検 R1247-B: 次回公演を読めなかったのに「公演予定未定」と出ていた）。
 * 読み込み中は「公演日を確認中…」、読めなかったら理由と「再読み込み」。読めて 0 件なら従来どおり（貸切受付中なら「公演予定未定」）
 */
export function nextEventsNote(card: ScenarioCardData, state: NextEventsState, retry: () => void): { note?: ReactNode } {
  if (card.events.length > 0 || state === 'ready') return {}
  if (state === 'loading') return { note: <p className="ts-11 text-muted-foreground" data-testid="new-arrival-next-loading">公演日を確認中…</p> }
  return {
    note: (
      <p className="flex flex-wrap items-center gap-x-2 ts-11 text-muted-foreground" role="alert" data-testid="new-arrival-next-error">
        公演日を読み込めませんでした
        <button
          type="button"
          className="font-medium text-booking-primary underline"
          onClick={(e) => { e.stopPropagation(); retry() }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          再読み込み
        </button>
      </p>
    ),
  }
}
