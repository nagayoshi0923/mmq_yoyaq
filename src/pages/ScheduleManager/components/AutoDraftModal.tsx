/**
 * 公演の下書きを自動で作る（QW-20261113-001）。
 *
 * 1. 固定枠: 店舗ごとに「この曜日のこの時間帯は開ける／開けない」を決める（管理者のみ保存できる）
 * 2. 下書き案: 固定枠の空いている枠に作品を当てた案を出す。作品は入れ替えられる
 * 3. 登録: 選んだ案を「オープン公演・GM未定・予約受付OFF」で作る（公開は今までどおり公演ごと）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { showToast } from '@/utils/toast'
import { useTimeSlotSettings } from '@/hooks/useTimeSlotSettings'
import { useCustomHolidays } from '@/hooks/useCustomHolidays'
import { formatJstMonthDay, getJstWeekdayIndex } from '@/utils/jstDate'
import { timeSlotEnToLabel, type TimeSlotEn } from '@/lib/timeSlot'
import { useAutoDraft, type AutoDraftStore } from '../hooks/useAutoDraft'
import { AUTO_DRAFT_SLOTS, HOLIDAY_WEEKDAY, findSelectionConflicts, resolveEndTime, type DraftProposal, type DraftScenario } from '../utils/autoDraft'

const WEEKDAY_COLUMNS: Array<{ value: number; label: string }> = [
  { value: 1, label: '月' },
  { value: 2, label: '火' },
  { value: 3, label: '水' },
  { value: 4, label: '木' },
  { value: 5, label: '金' },
  { value: 6, label: '土' },
  { value: 0, label: '日' },
  { value: HOLIDAY_WEEKDAY, label: '祝' },
]

type CellState = boolean | null

const NO_SCENARIO = '__none__'

interface AutoDraftModalProps {
  open: boolean
  onClose: () => void
  organizationId: string | null | undefined
  stores: AutoDraftStore[]
  /** 管理者だけ固定枠を保存できる */
  canEditRules: boolean
  defaultYear: number
  defaultMonth: number
  /** 下書きを登録したあとにスケジュールを読み直す */
  onCreated: () => void
}

function cellKey(weekday: number, slot: TimeSlotEn) {
  return `${weekday}|${slot}`
}

function nextCellState(state: CellState): CellState {
  if (state === null) return true
  if (state === true) return false
  return null
}

function defaultStoreId(stores: AutoDraftStore[]): string {
  return stores.find(s => s.name.includes('大久保'))?.id ?? stores[0]?.id ?? ''
}

function monthOptions(year: number, month: number) {
  return [0, 1, 2, 3].map(offset => {
    const index = (month - 1) + offset
    const y = year + Math.floor(index / 12)
    const m = (index % 12) + 1
    return { value: `${y}-${m}`, label: `${y}年${m}月`, year: y, month: m }
  })
}

export function AutoDraftModal({ open, onClose, organizationId, stores, canEditRules, defaultYear, defaultMonth, onCreated }: AutoDraftModalProps) {
  const { settings: timeSlotSettings } = useTimeSlotSettings()
  const { customHolidays } = useCustomHolidays()
  // 土日祝の判定は下書き生成と同じもの（独自休日と祝日）を使う
  const slotTimes = useCallback(
    (_date: string, slot: TimeSlotEn, holiday: boolean) => (holiday ? timeSlotSettings.holiday : timeSlotSettings.weekday)[slot],
    [timeSlotSettings],
  )
  const draft = useAutoDraft({ organizationId, slotTimes })
  const { loadRules } = draft

  const [tab, setTab] = useState<'rules' | 'drafts'>('rules')
  const [storeId, setStoreId] = useState(() => defaultStoreId(stores))
  const months = useMemo(() => monthOptions(defaultYear, defaultMonth), [defaultYear, defaultMonth])
  const [monthValue, setMonthValue] = useState(months[0]?.value ?? '')
  const [cells, setCells] = useState<Record<string, CellState>>({})
  const [isSavingRules, setIsSavingRules] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [chosenScenario, setChosenScenario] = useState<Record<string, string>>({})
  /** 登録に失敗した案だけを残すときは、選んだ作品とチェックをそのまま保つ（登録し直しで内容が変わらないように） */
  const keepChoicesRef = useRef(false)

  useEffect(() => {
    if (!open) return
    setTab('rules')
    setStoreId(defaultStoreId(stores))
    setMonthValue(months[0]?.value ?? '')
    draft.setProposals([])
    void loadRules()
    // 開いたときだけ初期化する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    const next: Record<string, CellState> = {}
    for (const r of draft.rules) {
      if (r.store_id === storeId) next[cellKey(r.weekday, r.time_slot)] = r.is_open
    }
    setCells(next)
  }, [draft.rules, storeId])

  useEffect(() => {
    if (keepChoicesRef.current) {
      keepChoicesRef.current = false
      return
    }
    setSelectedKeys(new Set(draft.proposals.filter(p => p.scenario).map(p => p.key)))
    setChosenScenario(Object.fromEntries(draft.proposals.map(p => [p.key, p.scenario?.scenario_master_id ?? NO_SCENARIO])))
  }, [draft.proposals])

  const storeName = useCallback((id: string) => stores.find(s => s.id === id)?.name ?? '', [stores])
  const openCount = Object.values(cells).filter(v => v === true).length

  const handleSaveRules = async () => {
    if (!storeId) return
    setIsSavingRules(true)
    try {
      const payload = WEEKDAY_COLUMNS.flatMap(col => AUTO_DRAFT_SLOTS.map(slot => ({
        weekday: col.value,
        time_slot: slot,
        is_open: cells[cellKey(col.value, slot)] ?? null,
      })))
      await draft.saveStoreRules(storeId, payload)
      showToast.success(`${storeName(storeId)}の固定枠を保存しました`)
    } catch (e) {
      showToast.error(`固定枠を保存できませんでした：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setIsSavingRules(false)
    }
  }

  const handleGenerate = async () => {
    const month = months.find(m => m.value === monthValue)
    if (!month || !storeId) return
    setTab('drafts')
    await draft.generate({ year: month.year, month: month.month, storeIds: [storeId], customHolidays })
  }

  const scenarioFor = (p: DraftProposal): DraftScenario | null => {
    const id = draft.pendingScenarioByKey[p.key] ?? chosenScenario[p.key]
    if (!id || id === NO_SCENARIO) return null
    return [p.scenario, ...p.alternatives].find(s => s?.scenario_master_id === id) ?? null
  }

  const selectedTargets = draft.proposals
    .filter(p => selectedKeys.has(p.key))
    .map(p => ({ proposal: p, scenario: scenarioFor(p) }))
    .filter((t): t is { proposal: DraftProposal; scenario: DraftScenario } => t.scenario !== null)
  // 作品を入れ替えると、案どうしの間隔・キット数・時間の重なりが崩れることがあるので、登録前に確かめ直す
  const conflicts = findSelectionConflicts(selectedTargets, draft.existingEvents)
  const createTargets = selectedTargets.filter(t => !conflicts.has(t.proposal.key))

  const handleCreate = async () => {
    if (createTargets.length === 0) return
    const result = await draft.createDrafts(createTargets.map(t => ({ ...t, storeName: storeName(t.proposal.store_id) })))
    if (result.created > 0) onCreated()
    if (result.failed.length === 0) {
      showToast.success(`${result.created}件の下書きを登録しました（GM未定・予約受付OFF）`)
      onClose()
      return
    }
    showToast.error(`${result.created}件を登録し、${result.failed.length}件は登録できませんでした：${result.failed[0].message}`)
    const failedKeys = new Set(result.failed.map(f => f.key))
    keepChoicesRef.current = true
    setSelectedKeys(prev => new Set([...prev].filter(k => failedKeys.has(k))))
    draft.setProposals(draft.proposals.filter(p => failedKeys.has(p.key)))
  }

  const toggleSelected = (key: string, checked: boolean) => {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={value => { if (!value) onClose() }}>
      <DialogContent fixedSize="editor">
        <DialogHeader data-dialog-header>
          <DialogTitle>公演の下書きを自動で作る</DialogTitle>
          <DialogDescription>
            固定枠の空いている枠に、予約の入りやすさ・新作・その店舗で回せるか・同じ作品が続かないかを見て作品を入れます。
            下書きはGM未定・予約受付OFFで登録され、お客様には見えません。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>店舗</Label>
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger className="w-56"><SelectValue placeholder="店舗を選ぶ" /></SelectTrigger>
              <SelectContent>
                {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>対象の月</Label>
            <Select value={monthValue} onValueChange={setMonthValue}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerate} disabled={!storeId || draft.isGenerating || openCount === 0}>
            {draft.isGenerating ? '案を作っています…' : '下書き案を作る'}
          </Button>
          {openCount === 0 && draft.rulesLoaded && <span className="text-muted-foreground">先に固定枠で「開ける」枠を決めてください</span>}
        </div>

        {draft.error && <p className="text-destructive">{draft.error}</p>}

        <Tabs value={tab} onValueChange={v => setTab(v as 'rules' | 'drafts')} className="min-h-0 flex-1">
          <TabsList>
            <TabsTrigger value="rules">固定枠</TabsTrigger>
            <TabsTrigger value="drafts">下書き案{draft.proposals.length > 0 ? `（${draft.proposals.length}）` : ''}</TabsTrigger>
          </TabsList>

          <TabsContent value="rules" className="space-y-3">
            <p className="text-muted-foreground">
              枠を押すたびに「未設定 → 開ける → 開けない」と切り替わります。祝日の行が未設定なら、その日の曜日の決まりを使います。
            </p>
            <div className="overflow-x-auto">
              <table className="border-collapse">
                <thead>
                  <tr>
                    <th className="p-2" />
                    {WEEKDAY_COLUMNS.map(col => <th key={col.value} className="p-2 w-16">{col.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {AUTO_DRAFT_SLOTS.map(slot => (
                    <tr key={slot}>
                      <th className="p-2 text-left">{timeSlotEnToLabel(slot)}</th>
                      {WEEKDAY_COLUMNS.map(col => {
                        const state = cells[cellKey(col.value, slot)] ?? null
                        return (
                          <td key={col.value} className="p-1">
                            <Button
                              type="button"
                              size="sm"
                              variant={state === true ? 'default' : 'outline'}
                              className="w-16"
                              disabled={!canEditRules}
                              aria-label={`${col.label}曜 ${timeSlotEnToLabel(slot)}`}
                              onClick={() => setCells(prev => ({ ...prev, [cellKey(col.value, slot)]: nextCellState(state) }))}
                            >
                              {state === true ? '開ける' : state === false ? '開けない' : '—'}
                            </Button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canEditRules
              ? <Button onClick={handleSaveRules} disabled={isSavingRules || !storeId}>{isSavingRules ? '保存しています…' : '固定枠を保存'}</Button>
              : <p className="text-muted-foreground">固定枠の変更は管理者だけができます。</p>}
          </TabsContent>

          <TabsContent value="drafts" className="space-y-2">
            {draft.proposals.length === 0 && !draft.isGenerating && (
              <p className="text-muted-foreground">「下書き案を作る」を押すと、ここに案が並びます。固定枠で開ける枠がすべて埋まっているときは案が出ません。</p>
            )}
            {draft.proposals.map(p => {
              const options = [p.scenario, ...p.alternatives].filter((s): s is DraftScenario => s !== null)
              const weekday = WEEKDAY_COLUMNS.find(c => c.value === getJstWeekdayIndex(p.date))?.label ?? ''
              return (
                <div key={p.key} className="flex flex-wrap items-center gap-3 border-b py-2">
                  <Checkbox
                    checked={selectedKeys.has(p.key)}
                    disabled={options.length === 0}
                    onCheckedChange={checked => toggleSelected(p.key, checked === true)}
                    aria-label={`${p.date} ${timeSlotEnToLabel(p.time_slot)} を登録する`}
                  />
                  <span className="w-28">{formatJstMonthDay(p.date)}（{weekday}）</span>
                  <span className="w-32">
                    {timeSlotEnToLabel(p.time_slot)} {p.start_time}〜{(() => {
                      const s = scenarioFor(p)
                      return s ? resolveEndTime(p.start_time, p.slot_end_time, s, p.is_weekend) : ''
                    })()}
                  </span>
                  {options.length > 0 ? (
                    <Select
                      value={draft.pendingScenarioByKey[p.key] ?? chosenScenario[p.key] ?? NO_SCENARIO}
                      onValueChange={v => setChosenScenario(prev => ({ ...prev, [p.key]: v }))}
                      disabled={p.key in draft.pendingScenarioByKey}
                    >
                      <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {options.map(s => <SelectItem key={s.scenario_master_id} value={s.scenario_master_id}>{s.title}</SelectItem>)}
                        <SelectItem value={NO_SCENARIO}>入れない</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="w-72 text-muted-foreground">条件に合う作品がありません</span>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {p.reasons.map(r => <Badge key={r} variant="outline">{r}</Badge>)}
                  </div>
                  {p.key in draft.pendingScenarioByKey && (
                    <p className="w-full text-muted-foreground">前回の登録が作成されたか確認できていないため、作品は変えられません。もう一度登録すると、作成済みなら二重には作りません</p>
                  )}
                  {conflicts.has(p.key) && (
                    <p className="w-full text-destructive">登録できません：{conflicts.get(p.key)}。別の作品を選ぶか「入れない」にしてください</p>
                  )}
                </div>
              )
            })}
          </TabsContent>
        </Tabs>

        <DialogFooter data-dialog-footer>
          <Button variant="outline" onClick={onClose} disabled={draft.isCreating}>閉じる</Button>
          {tab === 'drafts' && (
            <Button onClick={handleCreate} disabled={draft.isCreating || createTargets.length === 0}>
              {draft.isCreating ? '登録しています…' : `選んだ${createTargets.length}件を下書きとして登録`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
