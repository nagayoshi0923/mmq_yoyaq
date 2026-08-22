import React, { useState, useEffect, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { MultiSelect, MultiSelectOption } from '@/components/ui/multi-select'
import { StoreMultiSelect } from '@/components/ui/store-multi-select'
import { Link2, Unlink, Trash2, X, Loader2, Copy } from 'lucide-react'
import type { Staff, Store, Scenario } from '@/types'
import { assignmentApi } from '@/lib/assignmentApi'
import { formatJstDateTime } from '@/utils/jstDate'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { EmptyState } from '@/components/patterns/list'
import '@/components/modals/ScenarioEditDialogV2.css'

type AssignmentHistoryRow = {
  id: string
  scenario_master_id: string
  scenario_title: string
  action: 'added' | 'removed'
  changed_by: string | null
  changed_at: string
  source: string
}

// 担当変更履歴（直近20件）。スタッフ詳細でそのスタッフの担当がいつ増減したかを可視化する。
function AssignmentHistoryList({ staffId }: { staffId: string }) {
  const [rows, setRows] = useState<AssignmentHistoryRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    assignmentApi
      .getStaffAssignmentHistory(staffId, 20)
      .then((data) => {
        if (!cancelled) setRows(data ?? [])
      })
      .catch((err) => {
        logger.error('担当変更履歴の取得に失敗:', err)
        if (!cancelled) setRows([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [staffId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (rows.length === 0) {
    return <EmptyState title="担当の変更履歴はまだありません" />
  }

  return (
    <ul className="space-y-1 max-h-64 overflow-y-auto">
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex items-center justify-between gap-2 py-1.5 px-2 rounded border bg-muted/30"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`inline-flex shrink-0 items-center py-0.5 px-1.5 rounded border text-muted-foreground ${
                row.action === 'added'
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-orange-50 border-orange-200'
              }`}
            >
              {row.action === 'added' ? '追加' : '解除'}
            </span>
            <span className="truncate text-muted-foreground">{row.scenario_title}</span>
          </div>
          <span className="shrink-0 text-muted-foreground">
            {formatJstDateTime(row.changed_at)}
          </span>
        </li>
      ))}
    </ul>
  )
}

interface StaffEditFormProps {
  staff: Staff | null
  stores: Store[]
  scenarios: Scenario[]
  onSave: (staff: Staff) => void
  onCancel: () => void
  onLink?: () => void
  onUnlink?: () => void
  onDelete?: () => void
}

const roleOptions: MultiSelectOption[] = [
  { id: 'gm', name: 'GM', displayInfo: 'ゲームマスター' },
  { id: 'manager', name: 'マネージャー', displayInfo: '店舗管理' },
  { id: 'staff', name: 'スタッフ', displayInfo: '一般スタッフ' },
  { id: 'trainee', name: '研修生', displayInfo: '新人研修中' },
  { id: 'admin', name: '管理者', displayInfo: 'システム管理' }
]

const statusOptions = [
  { value: 'active', label: 'アクティブ' },
  { value: 'inactive', label: '非アクティブ' },
  { value: 'on_leave', label: '休職中' },
  { value: 'resigned', label: '退職' }
]

const BASE_TABS = [
  { id: 'basic', label: '基本情報' },
  { id: 'role', label: '役割・店舗' },
  { id: 'scenarios', label: '担当シナリオ' },
  { id: 'notes', label: '備考' },
] as const

const HISTORY_TAB = { id: 'history', label: '担当変更履歴' } as const

type StaffTabId = typeof BASE_TABS[number]['id'] | typeof HISTORY_TAB['id']

function formatAssignedScenarioCopyLine(scenario: Scenario): string {
  const min = scenario.player_count_min || 0
  const max = scenario.player_count_max || 0
  const playerLabel = min > 0 && min !== max ? `${min}〜${max}人` : `${max}人`
  const minutes = scenario.duration || 0
  const hours = minutes / 60
  const hoursLabel = minutes <= 0
    ? '時間未設定'
    : hours % 1 === 0
      ? `${hours}時間`
      : `${Number(hours.toFixed(1))}時間`
  return `${scenario.title}/${playerLabel}/${hoursLabel}`
}

function sortScenarioIdsByPlayerCount(
  ids: string[],
  scenarioById: Map<string, Scenario>,
  scenarioIdToTitle: Map<string, string>
): string[] {
  return [...ids].sort((a, b) => {
    const scenarioA = scenarioById.get(a)
    const scenarioB = scenarioById.get(b)
    const minA = scenarioA?.player_count_min || scenarioA?.player_count_max || 0
    const minB = scenarioB?.player_count_min || scenarioB?.player_count_max || 0
    if (minA !== minB) return minA - minB
    const maxA = scenarioA?.player_count_max || 0
    const maxB = scenarioB?.player_count_max || 0
    if (maxA !== maxB) return maxA - maxB
    const titleA = scenarioA?.title || scenarioIdToTitle.get(a) || a
    const titleB = scenarioB?.title || scenarioIdToTitle.get(b) || b
    return titleA.localeCompare(titleB, 'ja')
  })
}

export function StaffEditForm({ staff, stores, scenarios, onSave, onCancel, onLink, onUnlink, onDelete }: StaffEditFormProps) {
  const [formData, setFormData] = useState<Partial<Staff> & { experienced_scenarios?: string[] }>({
    name: '',
    x_account: '',
    discord_id: '',
    discord_channel_id: '',
    email: '',
    phone: '',
    line_name: '',
    role: [],
    stores: [],
    status: 'active',
    special_scenarios: [],
    experienced_scenarios: [],
    notes: '',
  })
  const [activeTab, setActiveTab] = useState<StaffTabId>('basic')

  useEffect(() => {
    if (staff) {
      setFormData({
        ...staff,
        role: staff.role || [],
        stores: staff.stores || [],
        special_scenarios: staff.special_scenarios || [],
        experienced_scenarios: staff.experienced_scenarios || []
      })
    }
  }, [staff])

  // 別のスタッフを開いたときは先頭セクションへ戻す
  useEffect(() => {
    setActiveTab('basic')
  }, [staff?.id])

  const tabs = useMemo(
    () => (staff?.id ? [...BASE_TABS, HISTORY_TAB] : [...BASE_TABS]),
    [staff?.id]
  )

  // 履歴タブを表示中に新規作成へ切り替わっても空表示にならないようフォールバック
  const currentTab: StaffTabId = tabs.some((tab) => tab.id === activeTab) ? activeTab : 'basic'

  // 担当シナリオ変更時：体験済みにも自動追加（担当=体験済み）
  const handleSpecialScenariosChange = (values: string[]) => {
    // 新しく追加されたシナリオを体験済みにも追加
    const currentExperienced = formData.experienced_scenarios || []
    const newExperienced = [...new Set([...currentExperienced, ...values])]
    
    setFormData({ 
      ...formData, 
      special_scenarios: values,
      experienced_scenarios: newExperienced
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(formData as Staff)
  }

  // シナリオID→本体のマッピング（scenario.idとscenario_master_id両方に対応）
  const scenarioById = useMemo(() => {
    const map = new Map<string, Scenario>()
    scenarios.forEach(scenario => {
      map.set(scenario.id, scenario)
      if (scenario.scenario_master_id) {
        map.set(scenario.scenario_master_id, scenario)
      }
    })
    return map
  }, [scenarios])

  const scenarioIdToTitle = useMemo(() => {
    const map = new Map<string, string>()
    scenarioById.forEach((scenario, id) => {
      map.set(id, scenario.title)
    })
    return map
  }, [scenarioById])

  const assignedScenarioIdsByPlayerCount = useMemo(
    () => sortScenarioIdsByPlayerCount(
      formData.special_scenarios || [],
      scenarioById,
      scenarioIdToTitle
    ),
    [formData.special_scenarios, scenarioById, scenarioIdToTitle]
  )

  const handleCopyAssignedScenarios = async () => {
    if (assignedScenarioIdsByPlayerCount.length === 0) {
      showToast.warning('担当シナリオがありません')
      return
    }

    const lines = assignedScenarioIdsByPlayerCount.map((id) => {
      const scenario = scenarioById.get(id)
      if (!scenario) {
        return `${scenarioIdToTitle.get(id) || id}/人数不明/時間不明`
      }
      return formatAssignedScenarioCopyLine(scenario)
    })

    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      showToast.success(`${lines.length}件の担当シナリオをコピーしました`)
    } catch (err) {
      logger.error('担当シナリオのコピーに失敗:', err)
      showToast.error('コピーに失敗しました')
    }
  }

  const scenarioOptions: MultiSelectOption[] = scenarios.map(scenario => ({
    id: scenario.id,
    name: scenario.title,
    displayInfo: `${scenario.player_count_min || 0}-${scenario.player_count_max || 0}人`
  }))

  const renderSection = (tabId: StaffTabId) => {
    switch (tabId) {
      case 'basic':
        return (
          <>
            <div className="scenario-edit-card">
              <div>
                <Label htmlFor="name">名前 *</Label>
                <Input
                  id="name"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div>
                <Label htmlFor="status">ステータス</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value as Staff['status'] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="scenario-edit-card">
              <p className="scenario-edit-card__title">連絡先情報</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="email">メールアドレス</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="phone">電話番号</Label>
                  <Input
                    id="phone"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="line_name">LINE名</Label>
                  <Input
                    id="line_name"
                    value={formData.line_name || ''}
                    onChange={(e) => setFormData({ ...formData, line_name: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="x_account">X (Twitter)</Label>
                  <Input
                    id="x_account"
                    value={formData.x_account || ''}
                    onChange={(e) => setFormData({ ...formData, x_account: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="discord_id">Discord ID</Label>
                  <Input
                    id="discord_id"
                    value={formData.discord_id || ''}
                    onChange={(e) => setFormData({ ...formData, discord_id: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="discord_channel_id">Discord チャンネルID</Label>
                  <Input
                    id="discord_channel_id"
                    value={formData.discord_channel_id || ''}
                    onChange={(e) => setFormData({ ...formData, discord_channel_id: e.target.value })}
                    placeholder="シフト通知用のチャンネルID"
                  />
                </div>
              </div>
            </div>
          </>
        )

      case 'role':
        return (
          <div className="scenario-edit-card">
            <div>
              <Label>役割</Label>
              <MultiSelect
                options={roleOptions}
                selectedValues={formData.role || []}
                onSelectionChange={(values) => setFormData({ ...formData, role: values })}
                placeholder="役割を選択"
                searchPlaceholder="役割を検索..."
                emptyText="役割がありません"
                emptySearchText="役割が見つかりません"
                useIdAsValue={true}
                showBadges={true}
              />
            </div>

            <div>
              <Label>担当店舗</Label>
              <StoreMultiSelect
                stores={stores}
                selectedStoreIds={formData.stores || []}
                onStoreIdsChange={(storeIds) => setFormData({ ...formData, stores: storeIds })}
                hideLabel={true}
                placeholder="全店舗担当"
              />
            </div>
          </div>
        )

      case 'scenarios':
        return (
          <>
            <div className="scenario-edit-card">
              <div className="flex items-center justify-between gap-2">
                <Label>担当シナリオ（GM可能）</Label>
                <button
                  type="button"
                  className="scenario-edit-dialog__btn"
                  onClick={handleCopyAssignedScenarios}
                  disabled={(formData.special_scenarios || []).length === 0}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  リストをコピー
                </button>
              </div>
              <MultiSelect
                options={scenarioOptions}
                selectedValues={formData.special_scenarios || []}
                onSelectionChange={handleSpecialScenariosChange}
                placeholder="GM可能なシナリオを選択"
                searchPlaceholder="シナリオ名で検索..."
                emptyText="シナリオがありません"
                emptySearchText="シナリオが見つかりません"
                useIdAsValue={true}
                showBadges={false}
              />
              {/* カスタムバッジ表示（scenario_master_id対応） */}
              {assignedScenarioIdsByPlayerCount.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {assignedScenarioIdsByPlayerCount.map(id => (
                    <span key={id} className="inline-flex items-center gap-0.5 text-xs py-0.5 px-1.5 rounded border bg-blue-50 border-blue-200 text-blue-700">
                      {scenarioIdToTitle.get(id) || id}
                      <button
                        type="button"
                        className="ml-0.5 hover:bg-red-100 p-0.5"
                        onClick={() => handleSpecialScenariosChange((formData.special_scenarios || []).filter(v => v !== id))}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <p className="scenario-edit-card__note">※追加すると体験済みにも自動追加されます</p>
            </div>

            <div className="scenario-edit-card">
              <Label>体験済みシナリオ</Label>
              <MultiSelect
                options={scenarioOptions}
                selectedValues={formData.experienced_scenarios || []}
                onSelectionChange={(values) => setFormData({ ...formData, experienced_scenarios: values })}
                placeholder="体験済みシナリオを選択"
                searchPlaceholder="シナリオ名で検索..."
                emptyText="シナリオがありません"
                emptySearchText="シナリオが見つかりません"
                useIdAsValue={true}
                showBadges={false}
              />
              {/* カスタムバッジ表示（scenario_master_id対応） */}
              {(formData.experienced_scenarios || []).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {(formData.experienced_scenarios || []).map(id => (
                    <span key={id} className="inline-flex items-center gap-0.5 text-xs py-0.5 px-1.5 rounded border bg-green-50 border-green-200 text-green-700">
                      {scenarioIdToTitle.get(id) || id}
                      <button
                        type="button"
                        className="ml-0.5 hover:bg-red-100 p-0.5"
                        onClick={() => setFormData({ ...formData, experienced_scenarios: (formData.experienced_scenarios || []).filter(v => v !== id) })}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <p className="scenario-edit-card__note">※GMはできないが体験したシナリオ</p>
            </div>
          </>
        )

      case 'notes':
        return (
          <div className="scenario-edit-card">
            <Label htmlFor="notes">備考</Label>
            <Textarea
              id="notes"
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="メモ・特記事項"
              className="scenario-edit-card__textarea"
            />
          </div>
        )

      case 'history':
        return staff?.id ? (
          <div className="scenario-edit-card">
            <AssignmentHistoryList staffId={staff.id} />
          </div>
        ) : null

      default:
        return null
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col min-h-0 overflow-hidden">
      <header className="scenario-edit-dialog__header">
        <div className="scenario-edit-dialog__header-left">
          <span className="scenario-edit-dialog__title">
            {staff?.id ? 'スタッフ編集' : '新規スタッフ作成'}
          </span>
          {formData.name && (
            <span className="scenario-edit-dialog__scenario">{formData.name}</span>
          )}
        </div>
        <button type="button" className="scenario-edit-dialog__close" onClick={onCancel}>
          閉じる
        </button>
      </header>

      <div className="scenario-edit-dialog__body">
        <nav className="scenario-edit-dialog__nav" aria-label="スタッフ編集セクション">
          {tabs.map((tab) => {
            const selected = currentTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-current={selected ? 'page' : undefined}
                className={selected ? 'scenario-edit-dialog__nav-item is-selected' : 'scenario-edit-dialog__nav-item'}
              >
                {tab.label}
              </button>
            )
          })}
        </nav>

        <div key={currentTab} className="scenario-edit-dialog__content">
          <h2 className="scenario-edit-dialog__page-title">
            {tabs.find((tab) => tab.id === currentTab)?.label}
          </h2>
          {renderSection(currentTab)}
        </div>
      </div>

      <footer className="scenario-edit-dialog__footer">
        <div className="scenario-edit-dialog__meta">
          <span>{formData.name || '(未設定)'}</span>
        </div>
        <div className="scenario-edit-dialog__actions">
          {staff?.id && onLink && (
            <button type="button" className="scenario-edit-dialog__btn" onClick={onLink}>
              <Link2 className="h-4 w-4 mr-1" />
              連携
            </button>
          )}
          {staff?.id && onUnlink && (
            <button type="button" className="scenario-edit-dialog__btn" onClick={onUnlink}>
              <Unlink className="h-4 w-4 mr-1" />
              連携解除
            </button>
          )}
          {staff?.id && onDelete && (
            <button type="button" className="scenario-edit-dialog__btn" onClick={onDelete}>
              <Trash2 className="h-4 w-4 mr-1" />
              削除
            </button>
          )}
          <button type="button" className="scenario-edit-dialog__btn" onClick={onCancel}>
            キャンセル
          </button>
          <button type="submit" className="scenario-edit-dialog__btn-primary">
            保存
          </button>
        </div>
      </footer>
    </form>
  )
}
