import { ArrowLeft } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { SurveyResponseForm } from './SurveyResponseForm'

/**
 * 公演前アンケートだけの画面（招待ページの ?tab=survey）。
 * チャットの上の小さな枠で開くと回答できないという報告があったため（2026-10-05、ゲスト 2 件）、
 * 枠ではなく画面全体で開き、チャットの読み直しとも切り離す。
 */
export function SurveyScreen({ groupId, memberId, scenarioTitle, performanceDate, charAssignmentMethod, characters, onBack }: {
  groupId: string
  memberId: string
  scenarioTitle?: string | null
  performanceDate?: string
  charAssignmentMethod: string | null
  characters: Array<{ id: string; name: string; gender?: string }>
  onBack: () => void
}) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <div className="container mx-auto max-w-lg px-4 py-4 flex-1">
        <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="w-4 h-4" />
          チャットに戻る
        </button>
        {scenarioTitle && <p className="text-sm text-muted-foreground mb-3">{scenarioTitle}</p>}
        <SurveyResponseForm
          groupId={groupId}
          memberId={memberId}
          performanceDate={performanceDate}
          characters={characters}
          hideCharacterSelection={charAssignmentMethod !== 'survey'}
          explainEmptyState
        />
      </div>
    </div>
  )
}
