import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { assignmentApi } from '@/lib/assignmentApi'
import { resolveStaffProfileGmSlotCount } from '@/lib/gmScenarioMode'
// scenarioApi は不要（organization_scenarios_with_master ビューを直接使用）
import { staffKeys } from '@/pages/StaffManagement/hooks/useStaffQuery'
import { scenarioKeys } from '@/pages/ScenarioManagement/hooks/useScenarioQuery'
import { Loader2, Search, BookOpen, Users, Check, UserCircle } from 'lucide-react'

// カスタム丸型チェックボックス
interface CircleCheckProps {
  checked: boolean
  onChange: () => void
  color: 'blue' | 'green'
  disabled?: boolean
}

function CircleCheck({ checked, onChange, color, disabled }: CircleCheckProps) {
  const colorClasses = {
    blue: checked 
      ? 'bg-blue-100 border-blue-400 text-blue-600' 
      : 'bg-gray-100 border-gray-300 text-gray-400',
    green: checked 
      ? 'bg-green-100 border-green-400 text-green-600' 
      : 'bg-gray-100 border-gray-300 text-gray-400'
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onChange}
      className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors ${colorClasses[color]} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      {checked && <Check className="w-4 h-4" />}
    </button>
  )
}

interface Scenario {
  id: string
  title: string
  author: string
  scenario_master_id: string
  /** 表示用の必要GM数（organization_scenarios.gm_count。未設定は1） */
  gm_slot_count: number
}

function needsTwoGmRoles(gmSlotCount: number): boolean {
  return gmSlotCount >= 2
}

interface Assignment {
  scenario_master_id: string
  can_main_gm: boolean
  can_sub_gm: boolean
  is_experienced: boolean
  scenario_masters?: {
    id: string
    title: string
    author: string
  }
}

export function StaffProfile() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [staffId, setStaffId] = useState<string | null>(null)
  const [staffName, setStaffName] = useState<string>('')
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  // スタッフ情報とアサインメントを読み込み
  useEffect(() => {
    const loadData = async () => {
      if (!user?.id) return

      try {
        setLoading(true)

        // ユーザーに紐づくスタッフを取得
        const { data: staffData, error: staffError } = await supabase
          .from('staff')
          .select('id, name')
          .eq('user_id', user.id)
          .single()

        if (staffError || !staffData) {
          logger.error('スタッフ情報が見つかりません')
          setLoading(false)
          return
        }

        setStaffId(staffData.id)
        setStaffName(staffData.name)

        // シナリオ一覧を organization_scenarios_with_master から取得
        // scenario_master_id が確実にキーになる
        const organizationId = await getCurrentOrganizationId()
        const { data: orgScenarios, error: orgError } = await supabase
          .from('organization_scenarios_with_master')
          .select('scenario_master_id, title, author, gm_count')
          .eq('organization_id', organizationId!)
          .order('title', { ascending: true })
        
        if (orgError) throw orgError
        
        const scenariosList: Scenario[] = (orgScenarios || [])
          .filter(s => s.scenario_master_id)
          .map(s => ({
            id: s.scenario_master_id,
            title: s.title || '',
            author: s.author || '',
            scenario_master_id: s.scenario_master_id,
            gm_slot_count: resolveStaffProfileGmSlotCount({ gm_count: s.gm_count }),
          }))
        setScenarios(scenariosList)

        const assignmentsData = await assignmentApi.getAllStaffAssignments(staffData.id)
        setAssignments(
          (assignmentsData || []).map((row) => {
            const r = row as Assignment
            return {
              scenario_master_id: r.scenario_master_id,
              can_main_gm: r.can_main_gm === true,
              can_sub_gm: r.can_sub_gm === true,
              is_experienced: r.is_experienced === true,
              scenario_masters: r.scenario_masters,
            }
          })
        )

      } catch (error) {
        logger.error('データ読み込みエラー:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [user?.id])

  // 検索フィルター
  const filteredScenarios = useMemo(() => {
    if (!searchTerm) return scenarios
    const term = searchTerm.toLowerCase()
    return scenarios.filter(s => 
      s.title.toLowerCase().includes(term) || 
      s.author.toLowerCase().includes(term)
    )
  }, [scenarios, searchTerm])

  // シナリオのアサインメント状態を取得
  const getAssignment = useCallback((scenarioId: string) => {
    return assignments.find(a => a.scenario_master_id === scenarioId)
  }, [assignments])

  /** 体験済みのみ（メイン・サブともにオフ） */
  const isExperiencedOnly = useCallback(
    (scenarioId: string) => {
      const assignment = getAssignment(scenarioId)
      return Boolean(
        assignment?.is_experienced && !assignment.can_main_gm && !assignment.can_sub_gm
      )
    },
    [getAssignment]
  )

  /** メイン／サブがオンなら体験済トグルは無効（シナリオ編集・DB制約と整合） */
  const toggleExperienced = useCallback((scenarioId: string) => {
    setAssignments((prev) => {
      const existing = prev.find((a) => a.scenario_master_id === scenarioId)
      if (existing?.can_main_gm || existing?.can_sub_gm) return prev
      if (existing?.is_experienced) {
        return prev.filter((a) => a.scenario_master_id !== scenarioId)
      }
      return [
        ...prev,
        {
          scenario_master_id: scenarioId,
          can_main_gm: false,
          can_sub_gm: false,
          is_experienced: true,
        },
      ]
    })
  }, [])

  /**
   * 1人体制シナリオ用: GM可1チェック（メインのみ true、サブは false）
   * シナリオ編集の1枠GMと整合（gm_slot_count=1 の行）
   */
  const setSingleGmCapability = useCallback((scenarioId: string, checked: boolean) => {
    setAssignments((prev) => {
      const idx = prev.findIndex((a) => a.scenario_master_id === scenarioId)
      const prevRow = idx >= 0 ? prev[idx] : null
      if (checked) {
        const next: Assignment = {
          scenario_master_id: scenarioId,
          can_main_gm: true,
          can_sub_gm: false,
          is_experienced: false,
        }
        if (!prevRow) return [...prev, next]
        const copy = [...prev]
        copy[idx] = next
        return copy
      }
      const next: Assignment = {
        scenario_master_id: scenarioId,
        can_main_gm: false,
        can_sub_gm: false,
        is_experienced: true,
      }
      if (!prevRow) return prev
      const copy = [...prev]
      copy[idx] = next
      return copy
    })
  }, [])

  /** メイン／サブ（staff_scenario_assignments。シナリオ編集の担当GMと同一） */
  const setGmRole = useCallback((scenarioId: string, role: 'main' | 'sub', checked: boolean) => {
    setAssignments((prev) => {
      const idx = prev.findIndex((a) => a.scenario_master_id === scenarioId)
      const prevRow = idx >= 0 ? prev[idx] : null
      const can_main_gm = role === 'main' ? checked : Boolean(prevRow?.can_main_gm)
      const can_sub_gm = role === 'sub' ? checked : Boolean(prevRow?.can_sub_gm)
      const hasGm = can_main_gm || can_sub_gm
      const next: Assignment = {
        scenario_master_id: scenarioId,
        can_main_gm,
        can_sub_gm,
        is_experienced: hasGm ? false : true,
      }
      if (!prevRow) {
        if (!hasGm) return prev
        return [...prev, next]
      }
      const copy = [...prev]
      copy[idx] = next
      return copy
    })
  }, [])

  // 保存
  const handleSave = async () => {
    if (!staffId) return

    try {
      setSaving(true)

      // 組織IDを取得
      const organizationId = await getCurrentOrganizationId()
      if (!organizationId) {
        showToast.error('組織情報が取得できません')
        return
      }

      // アサインメントを更新
      const assignmentData = assignments.map(a => ({
        scenarioId: a.scenario_master_id,
        can_main_gm: a.can_main_gm,
        can_sub_gm: a.can_sub_gm,
        is_experienced: a.is_experienced
      }))

      await assignmentApi.updateStaffAssignments(staffId, assignmentData, organizationId)

      // NOTE: staff.special_scenarios への同期は廃止
      // staff_scenario_assignments が唯一のデータソース

      // 関連するキャッシュを無効化（即座に反映されるようにする）
      queryClient.invalidateQueries({ queryKey: staffKeys.all })
      queryClient.invalidateQueries({ queryKey: scenarioKeys.all })

      showToast.success('保存しました')
    } catch (error) {
      logger.error('保存エラー:', error)
      showToast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // 体験済みシナリオの数
  const experiencedCount = useMemo(() => {
    return assignments.filter(a => a.is_experienced || a.can_main_gm || a.can_sub_gm).length
  }, [assignments])

  // GM可能シナリオの数
  const gmCount = useMemo(() => {
    return assignments.filter(a => a.can_main_gm || a.can_sub_gm).length
  }, [assignments])

  if (loading) {
    return (
      <AppLayout currentPage="staff-profile" maxWidth="max-w-[1440px]" containerPadding="px-[10px] py-3 sm:py-4 md:py-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    )
  }

  if (!staffId) {
    return (
      <AppLayout currentPage="staff-profile" maxWidth="max-w-[1440px]" containerPadding="px-[10px] py-3 sm:py-4 md:py-6">
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">
                スタッフ登録がされていません。<br />
                管理者に連絡してスタッフ登録を依頼してください。
              </p>
            </CardContent>
          </Card>
      </AppLayout>
    )
  }

  return (
    <AppLayout currentPage="staff-profile" maxWidth="max-w-[1440px]" containerPadding="px-[10px] py-3 sm:py-4 md:py-6">
      <div className="space-y-6">
        <PageHeader
          title={
            <div className="flex items-center gap-2">
              <UserCircle className="h-5 w-5 text-primary" />
              <span className="text-lg font-bold">担当作品</span>
            </div>
          }
          description={`${staffName}さんの体験リストとGM可否を管理。シナリオ編集の「GM」タブで必要GM数が2人以上の作品だけ、ここでメイン／サブを分けて設定できます`}
        >
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                保存中...
              </>
            ) : (
              '保存'
            )}
          </Button>
        </PageHeader>

        {/* サマリー */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{experiencedCount}</p>
                <p className="text-sm text-muted-foreground">体験済み作品</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Users className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{gmCount}</p>
                <p className="text-sm text-muted-foreground">GM可能作品</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 検索 */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="シナリオを検索..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* シナリオリスト */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">シナリオを選択</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              1人体制は「GM可」1つ。2人でメイン／サブを分けたい場合はシナリオ編集 → GM →「必要GM数」を2以上にして保存してください（報酬枠の行数では判定しません）
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {/* ヘッダー */}
            <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b text-xs font-medium text-muted-foreground gap-2">
              <div className="flex-1 min-w-0">シナリオ</div>
              <div className="flex items-center shrink-0 gap-3 sm:gap-4">
                <span className="w-12 sm:w-14 text-center">体験済</span>
                <span className="w-[7rem] sm:w-[8.5rem] text-center">GM</span>
              </div>
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              {filteredScenarios.map((scenario) => {
                const assignment = getAssignment(scenario.id)
                const hasGmRole = Boolean(assignment?.can_main_gm || assignment?.can_sub_gm)
                const experiencedOnly = isExperiencedOnly(scenario.id)
                const twoGm = needsTwoGmRoles(scenario.gm_slot_count)

                return (
                  <div
                    key={scenario.id}
                    className="flex items-center justify-between px-4 py-3 border-b last:border-b-0 hover:bg-muted/50 gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{scenario.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {scenario.author}
                        {twoGm && (
                          <span className="text-muted-foreground/80"> · 2人体制</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center shrink-0 gap-3 sm:gap-4">
                      <div
                        className="w-12 sm:w-14 flex justify-center"
                        title={
                          hasGmRole
                            ? 'GM可（メイン／サブ）がオンのときは体験済のみにできません。先にGMをオフにしてください'
                            : undefined
                        }
                      >
                        <CircleCheck
                          checked={experiencedOnly}
                          onChange={() => toggleExperienced(scenario.id)}
                          color="green"
                          disabled={hasGmRole}
                        />
                      </div>
                      <div className="w-[7rem] sm:w-[8.5rem] flex justify-center">
                        {twoGm ? (
                          <div className="flex items-start justify-center gap-2 sm:gap-3">
                            <div className="flex flex-col items-center gap-0.5">
                              <Checkbox
                                checked={Boolean(assignment?.can_main_gm)}
                                onCheckedChange={(v) =>
                                  setGmRole(scenario.id, 'main', v === true)
                                }
                                aria-label={`${scenario.title} メインGM可`}
                              />
                              <span className="text-[10px] text-muted-foreground leading-none">
                                メイン
                              </span>
                            </div>
                            <div className="flex flex-col items-center gap-0.5">
                              <Checkbox
                                checked={Boolean(assignment?.can_sub_gm)}
                                onCheckedChange={(v) =>
                                  setGmRole(scenario.id, 'sub', v === true)
                                }
                                aria-label={`${scenario.title} サブGM可`}
                              />
                              <span className="text-[10px] text-muted-foreground leading-none">
                                サブ
                              </span>
                            </div>
                          </div>
                        ) : (
                          <Checkbox
                            checked={hasGmRole}
                            onCheckedChange={(v) =>
                              setSingleGmCapability(scenario.id, v === true)
                            }
                            aria-label={`${scenario.title} GM可`}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              {filteredScenarios.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">
                  シナリオが見つかりません
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground mt-2">
          ※ 1人体制で「GM可」をオフにすると体験済のみのレコードになります。2人体制ではメイン／サブをどちらもオフにしたとき同様です。GMをオンにすると体験済フラグはオフになります（シナリオ編集の担当GMと同じDB制約）
        </p>
      </div>
    </AppLayout>
  )
}

