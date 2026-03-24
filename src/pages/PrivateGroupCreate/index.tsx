import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Users, MapPin, ArrowLeft, CheckCircle2, AlertCircle, Copy } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { usePrivateGroup } from '@/hooks/usePrivateGroup'
import { supabase } from '@/lib/supabase'
import {
  getCurrentOrganizationId,
  QUEENS_WALTZ_ORG_ID,
  resolveOrganizationFromPathSegment,
} from '@/lib/organization'
import { logger } from '@/utils/logger'

export function PrivateGroupCreate() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const { createGroup, loading: groupLoading, error: groupError } = usePrivateGroup()

  const scenarioId = searchParams.get('scenarioId')
  const organizationSlug = searchParams.get('org')
  const mode = searchParams.get('mode')

  const [scenario, setScenario] = useState<any>(null)
  const [stores, setStores] = useState<any[]>([])
  const [loadingData, setLoadingData] = useState(true)

  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([])
  const [groupName, setGroupName] = useState('')
  const [notes, setNotes] = useState('')

  const [createdGroup, setCreatedGroup] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const bookingBasePath = organizationSlug ? `/${organizationSlug}` : '/queens-waltz'

  useEffect(() => {
    const fetchData = async () => {
      if (!scenarioId) {
        setLoadingData(false)
        return
      }

      try {
        // organizationSlug がある場合はそれから organization_id を取得
        let organizationId: string | null = null
        if (organizationSlug) {
          const orgData = await resolveOrganizationFromPathSegment(organizationSlug, {
            requireActive: false,
          })
          organizationId = orgData?.id || null
        }
        if (!organizationId) {
          organizationId = await getCurrentOrganizationId() || QUEENS_WALTZ_ORG_ID
        }

        const { data: scenarioData, error: scenarioError } = await supabase
          .from('organization_scenarios_with_master')
          .select(
            'id, organization_id, scenario_master_id, title, key_visual_url, player_count_min, player_count_max, available_stores'
          )
          .eq('scenario_master_id', scenarioId)
          .eq('organization_id', organizationId)
          .single()

        if (scenarioError) throw scenarioError
        setScenario(scenarioData)

        const { data: storesData, error: storesError } = await supabase
          .from('stores')
          .select('id, name, address, region')
          .eq('organization_id', organizationId)
          .eq('status', 'active')
          .neq('is_temporary', true)
          .or('ownership_type.neq.office,ownership_type.is.null')

        if (storesError) throw storesError
        setStores(storesData || [])

      } catch (err) {
        logger.error('Failed to fetch data', err)
        setError('データの取得に失敗しました')
      } finally {
        setLoadingData(false)
      }
    }

    fetchData()
  }, [scenarioId, organizationSlug])

  /** シナリオ設定で公演店舗が限定されているか（空配列・未設定は全店舗可） */
  const scenarioStoreAllowlist = useMemo(() => {
    const raw = scenario?.available_stores
    if (!Array.isArray(raw) || raw.length === 0) return null
    const ids = raw.filter((id): id is string => typeof id === 'string' && id.length > 0)
    return ids.length > 0 ? new Set(ids) : null
  }, [scenario?.available_stores])

  const eligibleStores = useMemo(() => {
    if (!scenarioStoreAllowlist) return stores
    return stores.filter((s) => scenarioStoreAllowlist.has(s.id))
  }, [stores, scenarioStoreAllowlist])

  useEffect(() => {
    setSelectedStoreIds((prev) => prev.filter((id) => eligibleStores.some((s) => s.id === id)))
  }, [eligibleStores])

  /** 貸切グループの定員はシナリオ最大人数に固定（主催が別数値を選ばない） */
  const scenarioParticipantMax = useMemo(() => {
    const mx = scenario?.player_count_max
    return typeof mx === 'number' && mx > 0 ? mx : null
  }, [scenario?.player_count_max])

  const handleStoreToggle = (storeId: string) => {
    setSelectedStoreIds(prev =>
      prev.includes(storeId)
        ? prev.filter(id => id !== storeId)
        : [...prev, storeId]
    )
  }

  // 地域ごとに店舗をグループ化（シナリオ限定時は eligible のみ）
  const storesByRegion = useMemo(() => {
    const groups = new Map<string, typeof eligibleStores>()
    eligibleStores.forEach(store => {
      const region = store.region || extractRegionFromAddress(store.address) || 'その他'
      if (!groups.has(region)) {
        groups.set(region, [])
      }
      groups.get(region)!.push(store)
    })
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [eligibleStores])

  const allStoreIds = useMemo(() => eligibleStores.map(s => s.id), [eligibleStores])
  const allSelected = allStoreIds.length > 0 && allStoreIds.every(id => selectedStoreIds.includes(id))

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedStoreIds([])
    } else {
      setSelectedStoreIds([...allStoreIds])
    }
  }

  const handleSelectRegion = (regionStores: typeof eligibleStores) => {
    const regionIds = regionStores.map(s => s.id)
    const allRegionSelected = regionIds.every(id => selectedStoreIds.includes(id))
    if (allRegionSelected) {
      setSelectedStoreIds(prev => prev.filter(id => !regionIds.includes(id)))
    } else {
      setSelectedStoreIds(prev => [...new Set([...prev, ...regionIds])])
    }
  }

  const handleSubmit = async () => {
    setError(null)

    if (!user) {
      setError('ログインが必要です')
      return
    }

    if (!scenarioId) {
      setError('シナリオが選択されていません')
      return
    }

    if (scenarioParticipantMax == null) {
      setError('シナリオの最大人数が取得できません。ページを再読み込みしてください。')
      return
    }

    try {
      const group = await createGroup({
        scenarioId,
        name: groupName || undefined,
        targetParticipantCount: scenarioParticipantMax,
        preferredStoreIds: selectedStoreIds,
        candidateDates: [],
        notes: notes || undefined,
      })

      if (mode === 'no-dates') {
        navigate(`/group/invite/${group.invite_code}`)
      } else {
        setCreatedGroup(group)
      }
    } catch (err: any) {
      setError(err.message || '貸切リクエストの作成に失敗しました')
    }
  }

  const getInviteUrl = () => {
    if (!createdGroup) return ''
    return `${window.location.origin}/group/invite/${createdGroup.invite_code}`
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(getInviteUrl())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      logger.error('Failed to copy')
    }
  }

  const handleShareLine = () => {
    const text = `貸切マーダーミステリーに参加しませんか？\n\n🎭 ${scenario?.title}\n👥 最大${scenarioParticipantMax ?? ''}名まで\n\n以下のリンクから参加・日程回答をお願いします👇`
    const url = getInviteUrl()
    window.open(`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank')
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage={bookingBasePath} />
        <div className="container mx-auto max-w-3xl px-4 py-12">
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
              <h2 className="text-lg font-medium mb-2">ログインが必要です</h2>
              <p className="text-sm text-muted-foreground mb-4">
                貸切リクエストを作成するにはログインしてください
              </p>
              <Button onClick={() => navigate('/login')}>
                ログイン
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (loadingData) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage={bookingBasePath} />
        <div className="container mx-auto max-w-3xl px-4 py-12">
          <div className="text-center text-muted-foreground">読み込み中...</div>
        </div>
      </div>
    )
  }

  if (!scenarioId || !scenario) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage={bookingBasePath} />
        <div className="container mx-auto max-w-3xl px-4 py-12">
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
              <h2 className="text-lg font-medium mb-2">シナリオが見つかりません</h2>
              <p className="text-sm text-muted-foreground mb-4">
                シナリオを選択してからグループを作成してください
              </p>
              <Button onClick={() => navigate(bookingBasePath)}>
                シナリオ一覧へ
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (createdGroup) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage={bookingBasePath} />
        <div className="container mx-auto max-w-3xl px-4 py-12">
          <Card className="border-2 border-purple-200 bg-purple-50">
            <CardContent className="p-8 text-center space-y-6">
              <CheckCircle2 className="w-16 h-16 text-purple-600 mx-auto" />
              <div>
                <h2 className="text-lg text-purple-800 font-medium">グループを作成しました！</h2>
                <p className="text-sm text-purple-700 mt-2">
                  グループ管理画面で候補日時を追加し、招待リンクを友達に共有しましょう
                </p>
              </div>

              <div className="bg-white rounded-lg p-4 border border-purple-200">
                <p className="text-xs text-muted-foreground mb-2">招待リンク</p>
                <div className="flex items-center gap-2">
                  <Input
                    value={getInviteUrl()}
                    readOnly
                    className="text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopyLink}
                    className="shrink-0"
                  >
                    {copied ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={handleShareLine}
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                    <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
                  </svg>
                  LINEで共有
                </Button>
                <Button
                  className="gap-2 bg-purple-600 hover:bg-purple-700"
                  onClick={() => navigate(`/group/manage/${createdGroup.id}`)}
                >
                  <Users className="w-4 h-4" />
                  グループ管理へ
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background overflow-x-clip">
      <Header />
      <NavigationBar currentPage={bookingBasePath} />

      <div className="bg-background border-b">
        <div className="container mx-auto max-w-5xl px-4 py-2">
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 hover:bg-accent h-8 px-2 text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            戻る
          </Button>
        </div>
      </div>

      <div className="container mx-auto max-w-5xl px-4 py-6">
        <h1 className="text-xl font-bold mb-6">貸切リクエストを作成</h1>

        {(error || groupError) && (
          <Card className="mb-6 border-2 border-red-200 bg-red-50">
            <CardContent className="p-4 flex items-center gap-2 text-red-800 text-sm">
              <AlertCircle className="w-5 h-5" />
              <span>{error || groupError}</span>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            {/* シナリオ情報 */}
            <div>
              <h2 className="text-base font-semibold mb-3">シナリオ</h2>
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex gap-4">
                    {scenario.key_visual_url && (
                      <img
                        src={scenario.key_visual_url}
                        alt={scenario.title}
                        className="w-20 h-28 object-cover rounded"
                      />
                    )}
                    <div className="flex-1">
                      <h3 className="text-base font-medium">{scenario.title}</h3>
                      <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                        <Users className="w-4 h-4" />
                        <span>{scenario.player_count_min}〜{scenario.player_count_max}名</span>
                      </div>
                      <Badge variant="outline" className="mt-2 bg-purple-100 text-purple-800 border-purple-200 text-xs">
                        貸切リクエスト
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 希望店舗 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold">希望店舗（任意）</h2>
                {eligibleStores.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={handleSelectAll}
                  >
                    {allSelected ? 'すべて解除' : 'すべて選択'}
                  </Button>
                )}
              </div>
              <Card>
                <CardContent className="p-4 space-y-4">
                  <p className="text-xs text-muted-foreground">
                    希望する店舗を選択してください。未選択の場合は、後からグループ管理画面で選択できます。
                  </p>
                  {scenarioStoreAllowlist && (
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-2">
                      このシナリオは設定により、公演可能な店舗のみ選択できます。
                    </p>
                  )}
                  {stores.length > 0 && eligibleStores.length === 0 ? (
                    <p className="text-sm text-amber-800">
                      シナリオに設定された公演店舗が、現在の店舗一覧と一致しません。管理者にシナリオの公演店舗設定をご確認ください。
                    </p>
                  ) : eligibleStores.length === 0 ? (
                    <p className="text-sm text-muted-foreground">利用可能な店舗がありません</p>
                  ) : (
                    <div className="space-y-4">
                      {storesByRegion.map(([region, regionStores]) => {
                        const regionIds = regionStores.map(s => s.id)
                        const allRegionSelected = regionIds.every(id => selectedStoreIds.includes(id))
                        const someRegionSelected = regionIds.some(id => selectedStoreIds.includes(id))

                        return (
                          <div key={region}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{region}</span>
                              <button
                                type="button"
                                className="text-xs text-purple-600 hover:text-purple-800 hover:underline"
                                onClick={() => handleSelectRegion(regionStores)}
                              >
                                {allRegionSelected ? '解除' : 'すべて選択'}
                              </button>
                            </div>
                            <div className="space-y-2">
                              {regionStores.map((store) => (
                                <div
                                  key={store.id}
                                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                    selectedStoreIds.includes(store.id)
                                      ? 'border-purple-300 bg-purple-50'
                                      : 'border-gray-200 hover:border-purple-200'
                                  }`}
                                  onClick={() => handleStoreToggle(store.id)}
                                >
                                  <Checkbox
                                    checked={selectedStoreIds.includes(store.id)}
                                    onCheckedChange={() => handleStoreToggle(store.id)}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                                      <span className="text-sm font-medium">{store.name}</span>
                                    </div>
                                    {store.address && (
                                      <p className="text-xs mt-0.5 ml-5.5 text-muted-foreground">{store.address}</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {selectedStoreIds.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {selectedStoreIds.length}店舗を選択中 ・ 最終的な開催店舗は、候補日時と合わせて店舗側が決定します
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* グループ設定 */}
            <div>
              <h2 className="text-base font-semibold mb-3">グループ設定</h2>
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">グループ名（任意）</Label>
                    <Input
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      placeholder="例: ○○さん歓迎会"
                      className="text-sm"
                    />
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">メモ（任意）</Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="参加者への連絡事項など"
                      rows={3}
                      className="text-sm"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* 右側サイドバー */}
          <div className="space-y-6">
            <Card className="sticky top-4">
              <CardContent className="p-4 space-y-4">
                <h3 className="font-semibold">グループ作成の流れ</h3>
                {scenarioParticipantMax != null && (
                  <p className="text-xs text-muted-foreground leading-snug pb-2 border-b border-border">
                    参加人数の上限はこの作品の<strong>最大{scenarioParticipantMax}名</strong>に固定されます（シナリオ設定に準じます）。
                  </p>
                )}

                <ol className="text-sm text-muted-foreground space-y-2">
                  <li className="flex gap-2">
                    <span className="bg-purple-100 text-purple-800 w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium shrink-0">1</span>
                    グループを作成
                  </li>
                  <li className="flex gap-2">
                    <span className="bg-purple-100 text-purple-800 w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium shrink-0">2</span>
                    候補日時を追加
                  </li>
                  <li className="flex gap-2">
                    <span className="bg-purple-100 text-purple-800 w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium shrink-0">3</span>
                    招待リンクを友達に共有
                  </li>
                  <li className="flex gap-2">
                    <span className="bg-purple-100 text-purple-800 w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium shrink-0">4</span>
                    メンバーが日程に回答
                  </li>
                  <li className="flex gap-2">
                    <span className="bg-purple-100 text-purple-800 w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium shrink-0">5</span>
                    貸切を申込
                  </li>
                </ol>

                <Button
                  onClick={handleSubmit}
                  disabled={groupLoading}
                  className="w-full bg-purple-600 hover:bg-purple-700"
                >
                  {groupLoading ? '作成中...' : 'グループを作成'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
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
