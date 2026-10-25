/**
 * 「公演を作成」で開く公演ダイアログの試作。
 * 本物の PerformanceModal と同じ枠（scenario-edit-dialog）と、同じ入力の部品
 * （CategorySelectSection / DateLocationSection / PerformanceContentSection）を架空データで描く。
 * 本物の PerformanceModal は開くと営業時間・キット・時間帯設定などを実 API で読むため、ここでは使わない。
 * 保存は実 API を呼ばず「試作のため保存しません」と出すだけ。
 */
import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import '@/components/modals/ScenarioEditDialogV2.css'
import '@/components/schedule/PerformanceModal.css'
import { CategorySelectSection } from '@/components/schedule/performanceModal/sections/CategorySelectSection'
import { DateLocationSection } from '@/components/schedule/performanceModal/sections/DateLocationSection'
import { PerformanceFooter } from '@/components/schedule/performanceModal/sections/PerformanceFooter'
import { PerformanceContentSection } from '@/components/schedule/performanceModal/sections/PerformanceContentSection'
import { CATEGORY_TONE, timeOptions } from '@/components/schedule/performanceModal/constants'
import { buildScenarioSelectOptions } from '@/components/schedule/performanceModal/scenarioSelectOptions'
import type { Scenario, Store } from '@/types'
import type { EventFormData } from '@/types/schedule'
import { PROTO_SCENARIOS, PROTO_STORES } from './fixtures'

type Slot = 'morning' | 'afternoon' | 'evening'
const SLOT_DEFAULTS = {
  morning: { start_time: '10:00', end_time: '14:00', label: '朝公演' },
  afternoon: { start_time: '13:00', end_time: '16:30', label: '昼公演' },
  evening: { start_time: '19:00', end_time: '22:30', label: '夜公演' },
}

// 本物の部品に渡すための架空の店舗・作品（足りない項目は使われない）
const STORES = PROTO_STORES.map((s) => ({ ...s, status: 'active' })) as unknown as Store[]
const SCENARIOS = PROTO_SCENARIOS.map((s) => ({
  id: s.id, title: s.title, player_count_min: s.playerMin, player_count_max: s.playerMax, duration: s.durationMinutes,
  participation_fee: s.fee, available_stores: [], status: 'available',
})) as unknown as Scenario[]

export interface PrototypePerformanceDialogProps {
  open: boolean
  onClose: () => void
  draft: EventFormData | null
  /** 引き継ぎ元の説明（作品・希望件数・参加希望人数・候補の月） */
  sourceSummary: string
}

export function PrototypePerformanceDialog({ open, onClose, draft, sourceSummary }: PrototypePerformanceDialogProps) {
  const [formData, setFormData] = useState<EventFormData | null>(draft)
  const [timeSlot, setTimeSlot] = useState<Slot>('afternoon')
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  useEffect(() => {
    if (open) { setFormData(draft); setTimeSlot('afternoon'); setSaveMessage(null) }
  }, [open, draft])

  if (!formData) return null
  const setForm = setFormData as React.Dispatch<React.SetStateAction<EventFormData>>
  const tone = CATEGORY_TONE[formData.category]

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent
        size="xl"
        data-perf-modal=""
        overlayClassName="scenario-edit-dialog-overlay"
        className="scenario-edit-dialog-host [&>button]:hidden"
        style={tone ? ({ ['--perf-tone-bg' as string]: tone.bg, ['--perf-tone-section' as string]: tone.section, ['--perf-tone-border' as string]: tone.border, ['--input-bg' as string]: tone.bg, backgroundColor: tone.bg, borderColor: tone.border } as React.CSSProperties) : undefined}
      >
        <DialogTitle className="sr-only">公演を追加（試作）</DialogTitle>
        <DialogDescription className="sr-only">開催リクエストから引き継いだ内容で公演の作成画面を開いています。試作のため保存しません。</DialogDescription>
        <header className="scenario-edit-dialog__header">
          <div className="scenario-edit-dialog__header-left">
            <span className="scenario-edit-dialog__title">公演を追加（試作）</span>
            {formData.scenario ? <span className="scenario-edit-dialog__scenario">{formData.scenario}</span> : null}
          </div>
          <button type="button" className="scenario-edit-dialog__close" onClick={onClose}>閉じる</button>
        </header>
        <div className="scenario-edit-dialog__body">
          <div className="scenario-edit-dialog__content">
            <h2 className="scenario-edit-dialog__page-title">公演情報</h2>
            <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900" data-testid="proto-dialog-source">
              <p className="font-medium">開催リクエストから引き継ぎ（試作・架空データ）</p>
              <p>{sourceSummary}</p>
              <p>参加希望人数は予約人数・残席に入りません。公演を公開しても、リクエストした方の予約にはなりません。</p>
            </div>
            {saveMessage ? (
              <p role="status" data-testid="proto-dialog-save-message" className="mb-3 rounded-md border border-slate-400 bg-background p-2 text-sm font-medium">{saveMessage}</p>
            ) : null}
            <div className="space-y-3 pb-2 sm:pb-0">
              <CategorySelectSection formData={formData} setFormData={setForm} />
              <DateLocationSection
                formData={formData}
                setFormData={setForm}
                CATEGORY_TONE={CATEGORY_TONE}
                getStoreName={(id) => STORES.find((s) => s.id === id)?.name ?? id}
                stores={STORES}
                timeSlot={timeSlot}
                handleTimeSlotChange={(slot) => { setTimeSlot(slot); setForm((prev) => ({ ...prev, start_time: SLOT_DEFAULTS[slot].start_time, end_time: SLOT_DEFAULTS[slot].end_time })) }}
                timeSlotDefaults={SLOT_DEFAULTS}
                handleStartTimeChange={(start) => setForm((prev) => ({ ...prev, start_time: start }))}
                timeConflictTriggerClass=""
                timeOptions={timeOptions}
                timeConflict={null}
              />
              <PerformanceContentSection
                kitShortage={null}
                CATEGORY_TONE={CATEGORY_TONE}
                formData={formData}
                setFormData={setForm}
                localCurrentParticipants={0}
                mode="add"
                setPendingScenarioTitle={() => {}}
                applyScenarioChange={(title) => setForm((prev) => ({ ...prev, scenario: title }))}
                scenarioOptions={buildScenarioSelectOptions(SCENARIOS, formData.venue, [], [])}
                setIsScenarioDialogOpen={() => {}}
                scenarios={SCENARIOS}
                isScenarioAvailableAtVenue={() => true}
                stores={STORES}
                kitStoreIds={STORES.map((s) => s.id)}
                setEditingScenarioId={() => {}}
              />
            </div>
          </div>
        </div>
        <footer className="scenario-edit-dialog__footer">
          <div className="scenario-edit-dialog__meta text-xs">
            <span>試作: 保存しても公演は作られません</span>
          </div>
          <PerformanceFooter
            readOnly={false}
            mode="add"
            setDeleteConfirming={() => {}}
            onClose={onClose}
            handleSave={async () => { setSaveMessage('試作のため保存しません（公演は作られていません・実 API は呼んでいません）') }}
            isFormInitializing={false}
          />
        </footer>
      </DialogContent>
    </Dialog>
  )
}
