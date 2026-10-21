import { supabase } from '@/lib/supabase'
import { getPrivateGroupGuestToken } from '@/lib/privateGroupGuestSession'

/**
 * 事前配役アンケートを開いた参加者の画面の状態を記録する（2026-10-05、ゲストが回答できない報告の原因特定用）。
 * 回答の中身は送らない。記録に失敗しても画面の動きは止めない。1 画面あたりの送信数に上限を付ける。
 */
export type SurveyClientEvent = 'open' | 'loaded' | 'load_error' | 'layout' | 'submit' | 'submitted' | 'submit_error' | 'js_error'

const MAX_EVENTS_PER_PAGE = 40
let sentCount = 0

function pageContext() {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')
  return {
    ua: navigator.userAgent.slice(0, 300),
    vw: window.innerWidth,
    vh: window.innerHeight,
    dpr: window.devicePixelRatio,
    path: window.location.pathname.slice(0, 120),
    // どの版の画面が動いていたか（古い版が残っていないかの確認用）
    build: script?.src.split('/').pop()?.slice(0, 60) ?? null,
  }
}

export function reportSurveyEvent(groupId: string, memberId: string, event: SurveyClientEvent, detail: Record<string, unknown> = {}) {
  if (sentCount >= MAX_EVENTS_PER_PAGE) return
  sentCount++
  try {
    void supabase.rpc('record_private_group_survey_event', {
      p_group_id: groupId,
      p_member_id: memberId,
      p_guest_token: getPrivateGroupGuestToken(groupId),
      p_event: event,
      p_detail: { ...pageContext(), ...detail },
    }).then(() => undefined, () => undefined)
  } catch {
    // 記録の失敗は無視する
  }
}

/** 試験用: 送信数の上限を戻す */
export function resetSurveyEventCountForTest() {
  sentCount = 0
}
