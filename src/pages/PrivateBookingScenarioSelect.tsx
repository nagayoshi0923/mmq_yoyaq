import { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { Header } from '@/components/layout/Header'
import { ArrowLeft, MapPin } from 'lucide-react'
import { scenarioApi, storeApi } from '@/lib/api'
import { formatJstDateJa } from '@/utils/jstDate'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { BookingNotice } from './ScenarioDetailPage/components/BookingNotice'
import { saveScrollPositionForCurrentUrl } from '@/hooks/useScrollRestoration'
import { useReportRouteScrollRestoration } from '@/contexts/RouteScrollRestorationContext'
import { isScenarioAcceptingPrivateBooking } from '@/lib/privateBookingAcceptance'
import { resolveOrganizationFromPathSegment } from '@/lib/organization'
import { privateGuidePath } from '@/pages/static/guide/privateGuidePath'
import { PrivateScenarioGrid, type PrivateScenario } from '@/components/private-booking/PrivateScenarioGrid'

interface Scenario {
  id: string
  slug?: string | null
  title: string
  author: string
  duration: number
  player_count_min: number
  player_count_max: number
  key_visual_url?: string
  synopsis?: string
  genre?: string[]
  participation_fee?: number
  available_stores?: string[]
  booking_start_date?: string | null
  booking_end_date?: string | null
  scenario_kind?: string | null
  accepts_private_booking?: boolean | null
}

interface PrivateBookingScenarioSelectProps {
  organizationSlug?: string
}

function getTodayJST(): string {
  const now = new Date()
  const jstOffset = 9 * 60
  const jstNow = new Date(now.getTime() + (jstOffset + now.getTimezoneOffset()) * 60 * 1000)
  return `${jstNow.getFullYear()}-${String(jstNow.getMonth() + 1).padStart(2, '0')}-${String(jstNow.getDate()).padStart(2, '0')}`
}

function isScenarioBookingOpen(scenario: Scenario): boolean {
  const { booking_start_date, booking_end_date } = scenario
  if (!booking_start_date && !booking_end_date) return true
  const today = getTodayJST()
  if (booking_start_date && today < booking_start_date) return false
  if (booking_end_date && today > booking_end_date) return false
  return true
}

export function PrivateBookingScenarioSelect({ organizationSlug }: PrivateBookingScenarioSelectProps) {
  const navigate = useNavigate()
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [selectedParticipantCount, setSelectedParticipantCount] = useState<number | null>(null)
  const [allStores, setAllStores] = useState<any[]>([])
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([])

  const detailRef = useRef<HTMLDivElement>(null)

  // URLパラメータから日付、店舗、時間帯を取得（パスベース）
  const urlParams = new URLSearchParams(window.location.search)
  const preselectedDate = urlParams.get('date') || ''
  const preselectedStoreParam = urlParams.get('store') || ''
  const preselectedSlot = urlParams.get('slot') || ''
  const preselectedTime = urlParams.get('time') || ''
  // MMQ 全体トップの「貸切する店舗を選ぶ」から来たとき（from=mmq）は、店舗を選び直せるように戻り先を出す
  const fromPlatformTop = urlParams.get('from') === 'mmq'
  
  // URLの店舗パラメータ（カンマ区切り対応）
  const preselectedStoreIds = useMemo(() => 
    preselectedStoreParam.split(',').filter(id => id.length > 0),
    [preselectedStoreParam]
  )
  
  const slotLabels: { [key: string]: string } = {
    morning: '午前',
    afternoon: '午後',
    evening: '夜'
  }

  // 日付・時間帯があるのはカレンダー・リストの貸切申込チップから来たとき。無ければ作品から始める入口（作品ページの貸切タブへ）
  const hasDateTime = preselectedDate.length > 0 && preselectedSlot.length > 0
  const dateTimeLabel = hasDateTime
    ? `${formatJstDateJa(preselectedDate, true) || preselectedDate} ${slotLabels[preselectedSlot] || preselectedSlot}`
    : ''
  const basePath = organizationSlug ? `/${organizationSlug}` : ''

  const gridScenarios = useMemo<PrivateScenario[]>(
    () => scenarios.map((s) => ({ ...s, closed: !isScenarioBookingOpen(s) })),
    [scenarios],
  )
  const scenarioPagePath = (s: PrivateScenario) => `${basePath}/scenario/${encodeURIComponent(s.slug || s.id)}?tab=private`

  // 表示する全有効店舗（オフィス除外）
  const displayStores = useMemo(() => {
    return allStores.filter((s) =>
      s.ownership_type !== 'office' && s.status === 'active'
    )
  }, [allStores])

  // 地域ごとに店舗をグループ化
  const storesByRegion = useMemo(() => {
    const groups = new Map<string, any[]>()
    displayStores.forEach((store) => {
      const region = store.region || extractRegionFromAddress(store.address) || 'その他'
      if (!groups.has(region)) {
        groups.set(region, [])
      }
      groups.get(region)!.push(store)
    })
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [displayStores])

  // 選択中シナリオの対応店舗IDセット（空 = 全店舗対応）
  const scenarioAvailableStoreIds = useMemo(() => {
    if (!selectedScenarioId) return null
    const scenario = scenarios.find(s => s.id === selectedScenarioId)
    if (scenario?.available_stores && scenario.available_stores.length > 0) {
      return new Set(scenario.available_stores)
    }
    return null // null = 全店舗対応
  }, [selectedScenarioId, scenarios])

  const allAvailableStoreIds = useMemo(() => {
    if (!scenarioAvailableStoreIds) return displayStores.map((s) => s.id)
    return displayStores.filter((s) => scenarioAvailableStoreIds.has(s.id)).map((s) => s.id)
  }, [displayStores, scenarioAvailableStoreIds])

  const allAvailableSelected = allAvailableStoreIds.length > 0 && allAvailableStoreIds.every(id => selectedStoreIds.includes(id))

  useReportRouteScrollRestoration('private-booking-scenario-select', { isLoading: loading })

  useEffect(() => {
    let cancelled = false

    const loadScenarios = async () => {
      try {
        setLoading(true)
        let orgId: string | undefined
        if (organizationSlug) {
          const org = await resolveOrganizationFromPathSegment(organizationSlug, { requireActive: true })
          orgId = org?.id
          if (!orgId) throw new Error('指定された運営組織を確認できません')
        }

        let rows: Scenario[] = []
        if (orgId) {
          rows = await scenarioApi.getPublic(orgId) as Scenario[]
        } else {
          const data = await scenarioApi.getAll()
          rows = data.filter((s) => s.status === 'available') as Scenario[]
        }

        if (!cancelled) {
          setScenarios(rows.filter((s) => isScenarioAcceptingPrivateBooking(s)))
        }
      } catch (error) {
        logger.error('シナリオの読み込みエラー:', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    const loadStores = async () => {
      try {
        const org = organizationSlug
          ? await resolveOrganizationFromPathSegment(organizationSlug, { requireActive: true })
          : null
        if (organizationSlug && !org?.id) throw new Error('指定された運営組織を確認できません')
        const data = org?.id ? await storeApi.getAllPublicForCustomer(org.id) : await storeApi.getAll()
        if (cancelled) return
        setAllStores(data)

        if (preselectedStoreIds.length > 0) {
          const validIds = preselectedStoreIds.filter(id =>
            data.some((s) => s.id === id && s.ownership_type !== 'office' && s.status === 'active')
          )
          if (validIds.length > 0) {
            setSelectedStoreIds(validIds)
          }
        }
      } catch (error) {
        logger.error('店舗の読み込みエラー:', error)
      }
    }

    void loadScenarios()
    void loadStores()
    return () => {
      cancelled = true
    }
  }, [organizationSlug, preselectedStoreIds])

  const handleSelectScenario = (id: string) => {
    setSelectedScenarioId(id)
    setSelectedParticipantCount(null)
    // シナリオ変更時、店舗選択をリセット（URL の店舗のうち、その作品に対応する店舗だけ残す）
    const newScenario = scenarios.find(s => s.id === id)
    const validStoreIds = allStores
      .filter((s) => s.ownership_type !== 'office' && s.status === 'active')
      .map((s) => s.id)
    const restored = preselectedStoreIds.filter(storeId => validStoreIds.includes(storeId))
    const hasLimit = newScenario?.available_stores && newScenario.available_stores.length > 0
    setSelectedStoreIds(hasLimit ? restored.filter(storeId => newScenario!.available_stores!.includes(storeId)) : restored)
    // スマホでは一覧が長いので、選んだ作品の確認欄まで送る
    requestAnimationFrame(() => detailRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }))
  }

  const handleProceed = () => {
    if (!selectedScenarioId) {
      showToast.warning('シナリオを選択してください')
      return
    }
    // 店舗は任意（後から選択可能）
    
    // 貸切リクエスト確認ページへ遷移（組織slugがあれば予約サイト形式）
    // 複数店舗はカンマ区切りで渡す
    const storeParam = selectedStoreIds.join(',')
    saveScrollPositionForCurrentUrl()
    const timeQuery = preselectedTime ? `&time=${encodeURIComponent(preselectedTime)}` : ''
    navigate(
      `${basePath}/private-booking-request?scenario=${selectedScenarioId}&date=${preselectedDate}&store=${storeParam}&slot=${preselectedSlot}&participants=${selectedParticipantCount ?? scenarios.find(s => s.id === selectedScenarioId)?.player_count_max ?? ""}${timeQuery}`
    )
  }

  return (
    <div className="min-h-screen bg-background overflow-x-clip">
      <Header />
      
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* 戻るボタン */}
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          戻る
        </button>

        <Card>
          <CardHeader>
            <CardTitle>{hasDateTime ? `${dateTimeLabel} の貸切: 作品を選ぶ` : '貸切できる作品'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {hasDateTime ? (
              <div className="bg-muted/50 p-4 rounded-lg space-y-1" data-testid="selected-datetime">
                <h3 className="text-sm">選んだ日時</h3>
                <p className="text-xs text-muted-foreground">{dateTimeLabel}</p>
                <p className="text-xs text-muted-foreground">作品を選ぶと、下に人数・料金・希望店舗が出ます。</p>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground space-y-1">
                <p>作品を押すと、作品ページの「貸切リクエスト」が開きます。そこで「まずはメンバーを招待して貸切グループを作成」からグループを作り、メンバーと候補日を決めて店舗に申し込みます。</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {fromPlatformTop && (
                    <Link to="/?pick=private" className="text-xs text-purple-700 underline" data-testid="choose-another-store">別の店舗を選ぶ</Link>
                  )}
                  <Link to={privateGuidePath(organizationSlug)} className="text-xs text-purple-700 underline">貸切の流れを見る</Link>
                </div>
              </div>
            )}

            <PrivateScenarioGrid
              scenarios={gridScenarios}
              loading={loading}
              pathFor={scenarioPagePath}
              selectedId={hasDateTime ? selectedScenarioId : undefined}
              onOpen={(s) => {
                if (hasDateTime) {
                  handleSelectScenario(s.id)
                  return
                }
                saveScrollPositionForCurrentUrl()
                navigate(scenarioPagePath(s))
              }}
            />

            {/* 選択されたシナリオの詳細（日時ありのときだけ） */}
            {hasDateTime && selectedScenarioId && (() => {
              const scenario = scenarios.find(s => s.id === selectedScenarioId)
              if (!scenario) return null
              
              const participationFee = scenario.participation_fee || 0
              const isVariablePlayerCount = scenario.player_count_min !== scenario.player_count_max
              // 可変人数の場合は選択された人数、固定の場合は最大人数を使用
              const participantCount = selectedParticipantCount || scenario.player_count_max
              const totalPrice = participationFee * participantCount
              
              return (
                <>
                  <div ref={detailRef} className="border rounded-lg overflow-hidden bg-card scroll-mt-20">
                    <div className="flex gap-4 p-4">
                      {/* キービジュアル（左側・コンパクト） */}
                      {scenario.key_visual_url && (
                        <div className="flex-shrink-0 w-24 h-32 bg-gradient-to-br from-gray-200 to-gray-300 rounded overflow-hidden">
                          <OptimizedImage
                            src={scenario.key_visual_url}
                            alt={scenario.title}
                            className="w-full h-full object-cover"
                            responsive={false}
                            useWebP={true}
                            quality={80}
                          />
                        </div>
                      )}
                      
                      {/* シナリオ情報（右側） */}
                      <div className="flex-1 min-w-0 space-y-2">
                        <div>
                          <h3 className="text-base font-medium mb-0.5">{scenario.title}</h3>
                          <p className="text-xs text-muted-foreground">作者: {scenario.author}</p>
                        </div>
                        
                        {/* 基本情報 */}
                        <div className="flex gap-4 text-sm">
                          <div>
                            <span className="text-xs text-muted-foreground">所要時間: </span>
                            <span>{scenario.duration}分</span>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground">人数: </span>
                            <span>
                              {scenario.player_count_min === scenario.player_count_max
                                ? `${scenario.player_count_max}名`
                                : `${scenario.player_count_min}〜${scenario.player_count_max}名`}
                            </span>
                          </div>
                        </div>
                        
                        {/* ジャンル */}
                        {scenario.genre && scenario.genre.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {scenario.genre.map((g, i) => (
                              <span
                                key={i}
                                className="px-1.5 py-0.5 text-xs bg-muted rounded"
                              >
                                {g}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* 募集期間表示 */}
                        {(scenario.booking_start_date || scenario.booking_end_date) && (
                          <div className="text-xs text-muted-foreground">
                            募集期間: {scenario.booking_start_date || '—'} 〜 {scenario.booking_end_date || '—'}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* あらすじ（下部） */}
                    {scenario.synopsis && (
                      <div className="px-4 pb-4 pt-0">
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                          {scenario.synopsis}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* 人数選択（可変人数シナリオの場合） */}
                  {isVariablePlayerCount && (
                    <div className="border rounded-lg p-4 space-y-2">
                      <h3 className="text-sm font-medium">参加人数を選択</h3>
                      <Select 
                        value={participantCount.toString()} 
                        onValueChange={(val) => setSelectedParticipantCount(parseInt(val))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="人数を選択..." />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from(
                            { length: scenario.player_count_max - scenario.player_count_min + 1 },
                            (_, i) => scenario.player_count_min + i
                          ).map((count) => (
                            <SelectItem key={count} value={count.toString()}>
                              {count}名
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        このシナリオは{scenario.player_count_min}〜{scenario.player_count_max}名でプレイ可能です
                      </p>
                    </div>
                  )}

                  {/* 料金情報 */}
                  <div className="border rounded-lg bg-purple-50 p-4 space-y-2">
                    <h3 className="text-sm font-medium text-purple-800">料金</h3>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">参加費（1名）</span>
                        <span>¥{participationFee.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">人数</span>
                        <span>{participantCount}名</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-purple-200">
                        <span className="font-medium">合計</span>
                        <span className="text-purple-600 font-bold">¥{totalPrice.toLocaleString()}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      ※ 実際の料金は店舗との調整により変動する場合があります
                    </p>
                  </div>
                  {/* 希望店舗選択 */}
                  <div className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium">希望店舗を選択（任意）</h3>
                      {displayStores.length > 0 && (
                        <button
                          type="button"
                          className="text-xs text-purple-600 hover:text-purple-800 hover:underline"
                          onClick={() => {
                            if (allAvailableSelected) {
                              setSelectedStoreIds([])
                            } else {
                              setSelectedStoreIds([...allAvailableStoreIds])
                            }
                          }}
                        >
                          {allAvailableSelected ? 'すべて解除' : 'すべて選択'}
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      希望する店舗を選択してください。未選択の場合は、後から選択できます。
                    </p>
                    <div className="space-y-4">
                      {storesByRegion.map(([region, regionStores]) => {
                        const availableInRegion = regionStores.filter((s) => 
                          scenarioAvailableStoreIds === null || scenarioAvailableStoreIds.has(s.id)
                        )
                        const availableRegionIds = availableInRegion.map((s) => s.id)
                        const allRegionSelected = availableRegionIds.length > 0 && availableRegionIds.every(id => selectedStoreIds.includes(id))

                        return (
                          <div key={region}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{region}</span>
                              {availableRegionIds.length > 1 && (
                                <button
                                  type="button"
                                  className="text-xs text-purple-600 hover:text-purple-800 hover:underline"
                                  onClick={() => {
                                    if (allRegionSelected) {
                                      setSelectedStoreIds(prev => prev.filter(id => !availableRegionIds.includes(id)))
                                    } else {
                                      setSelectedStoreIds(prev => [...new Set([...prev, ...availableRegionIds])])
                                    }
                                  }}
                                >
                                  {allRegionSelected ? '解除' : 'すべて選択'}
                                </button>
                              )}
                            </div>
                            <div className="space-y-2">
                              {regionStores.map((store) => {
                                const isSelected = selectedStoreIds.includes(store.id)
                                const isUnavailable = scenarioAvailableStoreIds !== null && !scenarioAvailableStoreIds.has(store.id)
                                
                                return (
                                  <label
                                    key={store.id}
                                    className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                                      isUnavailable
                                        ? 'border-gray-200 bg-gray-100 opacity-60 cursor-not-allowed'
                                        : isSelected
                                          ? 'border-purple-300 bg-purple-50 cursor-pointer'
                                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 cursor-pointer'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      disabled={isUnavailable}
                                      onChange={() => {
                                        if (isUnavailable) return
                                        setSelectedStoreIds(prev =>
                                          isSelected
                                            ? prev.filter(id => id !== store.id)
                                            : [...prev, store.id]
                                        )
                                      }}
                                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 disabled:opacity-50"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <MapPin className={`w-3.5 h-3.5 flex-shrink-0 ${isUnavailable ? 'text-gray-400' : 'text-muted-foreground'}`} />
                                        <span className={`text-sm font-medium ${isUnavailable ? 'text-gray-400' : ''}`}>{store.name}</span>
                                        {isUnavailable && (
                                          <span className="text-xs px-1.5 py-0.5 bg-gray-200 text-gray-500 rounded">対応不可</span>
                                        )}
                                      </div>
                                      {store.address && (
                                        <p className={`text-xs mt-0.5 ml-5.5 ${isUnavailable ? 'text-gray-400' : 'text-muted-foreground'}`}>{store.address}</p>
                                      )}
                                    </div>
                                  </label>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {selectedStoreIds.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {selectedStoreIds.length}店舗を選択中 ・ 最終的な開催店舗は、候補日時と合わせて店舗側が決定します
                      </p>
                    )}
                  </div>
                </>
              )
            })()}

            {hasDateTime && (
            <>
            {/* 注意事項（DBから取得） */}
            <BookingNotice
              reservationDeadlineHours={0}
              hasPreReading={false}
              mode="private"
              storeId={selectedStoreIds.length === 1 ? selectedStoreIds[0] : null}
            />

            {/* 確認ボタン */}
            <Button
              className="w-full bg-purple-600 hover:bg-purple-700 text-white"
              onClick={handleProceed}
              disabled={!selectedScenarioId || selectedStoreIds.length === 0 || loading}
            >
              貸切リクエスト確認へ
            </Button>
            </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function extractRegionFromAddress(address?: string): string | null {
  if (!address) return null
  const prefectureMatch = address.match(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/)
  if (!prefectureMatch) return null
  const prefecture = prefectureMatch[1]
  if (prefecture === '東京都') {
    const wardMatch = address.match(/東京都(.+?[区市])/)
    return wardMatch ? `東京・${wardMatch[1]}` : '東京都'
  }
  return prefecture
}
