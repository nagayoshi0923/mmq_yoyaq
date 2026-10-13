import { SurveyResponseForm } from './SurveyResponseForm'
import type { SurveyCharacter } from './useSurveyResponse'

/**
 * 事前配役アンケートの回答シート（招待ページの ?tab=survey、または ?sheet=survey）。
 * チャットの上の小さな枠で開くと回答できないという報告があったため（2026-10-05、ゲスト 2 件）、
 * 画面全体のシートで開き、チャットの読み直しとも切り離す。会員・ゲスト（PIN）とも同じ。
 */
export function SurveyScreen({ groupId, memberId, scenarioTitle, performance, charAssignmentMethod, characters, onSubmitted, onBack }: {
  groupId: string
  memberId: string
  scenarioTitle?: string | null
  performance?: { date: string; start_time?: string | null; store_name?: string | null } | null
  charAssignmentMethod: string | null
  characters: SurveyCharacter[]
  /** 送ったあと（状態の箱・概要の配役欄を読み直す） */
  onSubmitted: () => void
  onBack: () => void
}) {
  return (
    <SurveyResponseForm
      groupId={groupId}
      memberId={memberId}
      scenarioTitle={scenarioTitle}
      performanceDate={performance?.date}
      startTime={performance?.start_time}
      storeName={performance?.store_name}
      characters={characters}
      hideCharacterSelection={charAssignmentMethod !== 'survey'}
      onSubmitted={onSubmitted}
      onClose={onBack}
    />
  )
}
