/**
 * ImportScheduleModal のプレビューフェーズ表示（予約台帳リファクタ Phase 5-2d）。
 * ImportScheduleModal.tsx から JSX を逐語抽出・props 注入。挙動不変。
 */
import type { Dispatch, SetStateAction, RefObject } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { MultiSelect } from '@/components/ui/multi-select'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import type { PreviewEvent } from './types'

const CATEGORY_OPTIONS = [
  { value: 'open', label: '募集' },
  { value: 'private', label: '貸切' },
  { value: 'gmtest', label: 'GMテスト' },
  { value: 'testplay', label: 'テストプレイ' },
  { value: 'offsite', label: '出張' },
  { value: 'venue_rental', label: '場所貸し' },
  { value: 'venue_rental_free', label: '場所貸し(無料)' },
  { value: 'package', label: 'パッケージ' },
  { value: 'mtg', label: 'MTG' },
  { value: 'memo', label: 'メモ' },
]

const GM_ROLE_OPTIONS = [
  { value: 'main', label: 'メインGM', color: 'bg-gray-100 text-gray-800' },
  { value: 'sub', label: 'サブGM', color: 'bg-blue-100 text-blue-800' },
  { value: 'reception', label: '受付', color: 'bg-orange-100 text-orange-800' },
  { value: 'staff', label: 'スタッフ', color: 'bg-green-100 text-green-800' },
  { value: 'observer', label: '見学', color: 'bg-indigo-100 text-indigo-800' },
]

interface ImportPreviewProps {
  importTargetMonth: { year: number; month: number } | null
  replaceExisting: boolean
  previewEvents: PreviewEvent[]
  setPreviewEvents: Dispatch<SetStateAction<PreviewEvent[]>>
  previewErrors: string[]
  scenarioList: Array<{ id: string; title: string }>
  scenarioOptions: Array<{ value: string; label: string }>
  staffList: Array<{ id: string; name: string }>
  tableContainerRef: RefObject<HTMLDivElement>
}

export function ImportPreview({
  importTargetMonth,
  replaceExisting,
  previewEvents,
  setPreviewEvents,
  previewErrors,
  scenarioList,
  scenarioOptions,
  staffList,
  tableContainerRef,
}: ImportPreviewProps) {
  return (
              <div className="border rounded-lg p-3 bg-gray-50 flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-sm">インポートプレビュー</h3>
                    {importTargetMonth && (
                      <span className="text-xs text-blue-600">
                        対象: {importTargetMonth.year}年{importTargetMonth.month}月
                        {replaceExisting && ' （既存データ削除後にインポート）'}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-600">
                    {previewEvents.length}件のイベント
                    （上書き: {previewEvents.filter(e => e.hasExisting).length}件）
                  </span>
                </div>
                
                {previewErrors.length > 0 && (
                  <Alert variant="destructive" className="mb-3">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <div className="text-xs">
                        {previewErrors.map((err, i) => (
                          <div key={i}>{err}</div>
                        ))}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
                
                <div ref={tableContainerRef} className="flex-1 overflow-y-auto min-h-0">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-100">
                      <tr>
                        <th className="text-left p-1 border-b">日付</th>
                        <th className="text-left p-1 border-b">店舗</th>
                        <th className="text-left p-1 border-b">時間帯</th>
                        <th className="text-left p-1 border-b">カテゴリ</th>
                        <th className="text-left p-1 border-b">シナリオ</th>
                        <th className="text-left p-1 border-b">GM</th>
                        <th className="text-left p-1 border-b">状態</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewEvents.map((event, i) => (
                        <tr 
                          key={i} 
                          className={event.hasExisting ? 'bg-yellow-50' : event.isMemo ? 'bg-blue-50' : ''}
                          style={{ contentVisibility: 'auto', containIntrinsicSize: '0 60px' }}
                        >
                          <td className="p-1 border-b text-nowrap align-top">
                            <div className="min-h-[14px]">&nbsp;</div>
                            <div>{event.date}</div>
                          </td>
                          <td className="p-1 border-b text-nowrap align-top">
                            <div className="min-h-[14px]">&nbsp;</div>
                            <div>{event.venue}</div>
                          </td>
                          <td className="p-1 border-b text-nowrap align-top">
                            <div className="min-h-[14px]">&nbsp;</div>
                            <div>{event.timeSlot}</div>
                          </td>
                          <td className="p-1 border-b min-w-[80px] align-top">
                            <div className="min-h-[14px]">&nbsp;</div>
                            <Select
                              value={event.category}
                              onValueChange={(value) => {
                                setPreviewEvents(prev => {
                                  const newPreview = [...prev]
                                  const updatedEvent = { ...newPreview[i], category: value }
                                  
                                  // メモを選択したら、シナリオをnotesに移動してisMemo=true
                                  if (value === 'memo') {
                                    updatedEvent.isMemo = true
                                    if (updatedEvent.scenario && !updatedEvent.notes) {
                                      updatedEvent.notes = updatedEvent.scenario
                                    }
                                  } else {
                                    updatedEvent.isMemo = false
                                  }
                                  
                                  // テストプレイを選択したら、GMの役割をすべて「参加」に設定
                                  if (value === 'test') {
                                    const newRoles: Record<string, string> = {}
                                    updatedEvent.gms.forEach(gm => {
                                      newRoles[gm] = 'staff'
                                    })
                                    updatedEvent.gmRoles = newRoles
                                  }
                                  
                                  newPreview[i] = updatedEvent
                                  return newPreview
                                })
                              }}
                            >
                              <SelectTrigger className="h-6 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CATEGORY_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="p-1 border-b min-w-[180px] align-top">
                            {event.isMemo ? (
                              <span className="text-gray-500">{event.scenario}</span>
                            ) : (() => {
                              // シナリオがマスタに存在するかチェック
                              const isLinked = event.scenario && scenarioList.some(s => s.title === event.scenario)
                              const hasOriginal = event.originalScenario && event.originalScenario.trim().length > 0
                              return (
                                <div className={`rounded p-1 ${isLinked ? 'bg-green-50 border border-green-200' : hasOriginal ? 'bg-orange-50 border border-orange-200' : ''}`}>
                                  <div className="text-[10px] mb-0.5 min-h-[14px] flex items-center gap-1">
                                    {isLinked ? (
                                      <CheckCircle2 className="h-3 w-3 text-green-600 flex-shrink-0" />
                                    ) : hasOriginal ? (
                                      <AlertCircle className="h-3 w-3 text-orange-500 flex-shrink-0" />
                                    ) : null}
                                    <span className="text-purple-600 truncate">
                                      {event.originalScenario || '\u00A0'}
                                    </span>
                                  </div>
                                  <SearchableSelect
                                    options={scenarioOptions}
                                    value={event.scenario || '__none__'}
                                    onValueChange={(value) => {
                                      setPreviewEvents(prev => {
                                        const newPreview = [...prev]
                                        newPreview[i] = { ...newPreview[i], scenario: value === '__none__' ? '' : value, scenarioMapped: true }
                                        return newPreview
                                      })
                                    }}
                                    placeholder="シナリオを選択"
                                    searchPlaceholder="シナリオ検索..."
                                    className="h-6 text-xs"
                                  />
                                </div>
                              )
                            })()}
                          </td>
                          <td className="p-1 border-b min-w-[140px] align-top">
                            <div className="space-y-1">
                              <div className="text-[10px] text-purple-600 min-h-[14px]">
                                {event.originalGms || '\u00A0'}
                              </div>
                              <MultiSelect
                                options={staffList.map(s => s.name)}
                                selectedValues={event.gms}
                                onSelectionChange={(values) => {
                                  setPreviewEvents(prev => {
                                    const newPreview = [...prev]
                                    const newRoles = { ...newPreview[i].gmRoles }
                                    values.forEach(gm => {
                                      if (!newRoles[gm]) newRoles[gm] = 'main'
                                    })
                                    Object.keys(newRoles).forEach(gm => {
                                      if (!values.includes(gm)) delete newRoles[gm]
                                    })
                                    newPreview[i] = { ...newPreview[i], gms: values, gmRoles: newRoles }
                                    return newPreview
                                  })
                                }}
                                placeholder="GMを選択"
                                searchPlaceholder="スタッフ検索..."
                                className="text-xs"
                                showBadges={false}
                              />
                              {/* 選択済みGM（クリックで役割変更、×で削除） */}
                              {event.gms.length > 0 && (
                                <div className="flex flex-wrap gap-0.5">
                                  {event.gms.map((gm, gmIdx) => {
                                    const role = event.gmRoles[gm] || 'main'
                                    const roleOption = GM_ROLE_OPTIONS.find(r => r.value === role) || GM_ROLE_OPTIONS[0]
                                    const shortLabel = role === 'main' ? '' : role === 'sub' ? 'サブ' : role === 'reception' ? '受付' : role === 'staff' ? '参加' : '見学'
                                    return (
                                      <span
                                        key={gmIdx}
                                        className={`text-[10px] px-1 py-0 rounded inline-flex items-center gap-0.5 ${roleOption.color}`}
                                      >
                                        <span
                                          className="cursor-pointer hover:opacity-70"
                                          onClick={() => {
                                            const currentIdx = GM_ROLE_OPTIONS.findIndex(r => r.value === role)
                                            const nextIdx = (currentIdx + 1) % GM_ROLE_OPTIONS.length
                                            const nextRole = GM_ROLE_OPTIONS[nextIdx].value
                                            setPreviewEvents(prev => {
                                              const newPreview = [...prev]
                                              newPreview[i] = {
                                                ...newPreview[i],
                                                gmRoles: { ...newPreview[i].gmRoles, [gm]: nextRole }
                                              }
                                              return newPreview
                                            })
                                          }}
                                          title="クリックで役割変更"
                                        >
                                          {gm}{shortLabel && `(${shortLabel})`}
                                        </span>
                                        <span
                                          className="cursor-pointer opacity-50 hover:opacity-100 hover:text-red-600"
                                          onClick={() => {
                                            setPreviewEvents(prev => {
                                              const newPreview = [...prev]
                                              const newGms = newPreview[i].gms.filter(g => g !== gm)
                                              const newRoles = { ...newPreview[i].gmRoles }
                                              delete newRoles[gm]
                                              newPreview[i] = { ...newPreview[i], gms: newGms, gmRoles: newRoles }
                                              return newPreview
                                            })
                                          }}
                                          title="削除"
                                        >×</span>
                                      </span>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-1 border-b text-nowrap align-top">
                            <div className="min-h-[14px]">&nbsp;</div>
                            <div>
                              {event.isMemo ? (
                                <span className="text-blue-600">メモ</span>
                              ) : event.hasExisting ? (
                                <span className="text-yellow-600">上書き</span>
                              ) : (
                                <span className="text-green-600">新規</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {/* 件数表示 */}
                <div className="text-xs text-gray-500 mt-2 px-2">
                  全{previewEvents.length}件
                </div>
                
                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                  <span className="font-semibold text-gray-600">行:</span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-3 h-3 bg-white border border-gray-300 rounded"></span>
                    新規追加
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-3 h-3 bg-yellow-100 border border-yellow-300 rounded"></span>
                    既存を上書き
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-3 h-3 bg-blue-100 border border-blue-300 rounded"></span>
                    メモ
                  </span>
                  <span className="mx-2 border-l border-gray-300"></span>
                  <span className="font-semibold text-gray-600">シナリオ:</span>
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                    紐付け成功
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 text-orange-500" />
                    未紐付け
                  </span>
                </div>
              </div>
  )
}
