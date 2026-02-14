import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { assignmentApi } from '@/lib/assignmentApi'
// scenarioApi は不要（organization_scenarios_with_master ビューを直接使用）
import { staffKeys } from '@/pages/StaffManagement/hooks/useStaffQuery'
import { Loader2, Search, BookOpen, Users, Check, UserCircle } from 'lucide-react'

// カスタム丸型チェックボックス
interface CircleCheckProps {
  checked: boolean
  onChange: () => void
  color: 'blue' | 'green'
}

function CircleCheck({ checked, onChange, color }: CircleCheckProps) {
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
      onClick={onChange}
      className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors ${colorClasses[color]}`}
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
}

interface Assignment {
  scenario_id: string // scenario_master_id と統一済み
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
          .select('scenario_master_id, title, author')
          .eq('organization_id', organizationId!)
          .order('title', { ascending: true })
        
        if (orgError) throw orgError
        
        const scenariosList: Scenario[] = (orgScenarios || [])
          .filter(s => s.scenario_master_id)
          .map(s => ({
            id: s.scenario_master_id,
            title: s.title || '',
            author: s.author || '',
            scenario_master_id: s.scenario_master_id
          }))
        setScenarios(scenariosList)

        // 現在のアサインメントを取得（scenario_id = scenario_master_id）
        const assignmentsData = await assignmentApi.getAllStaffAssignments(staffData.id)
        setAssignments(assignmentsData)

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
    return assignments.find(a => a.scenario_id === scenarioId)
  }, [assignments])

  // 体験済みかどうか
  const isExperienced = useCallback((scenarioId: string) => {
    const assignment = getAssignment(scenarioId)
    if (!assignment) return false
    return assignment.is_experienced || assignment.can_main_gm || assignment.can_sub_gm
  }, [getAssignment])

  // GM可能かどうか
  const canGM = useCallback((scenarioId: string) => {
    const assignment = getAssignment(scenarioId)
    if (!assignment) return false
    return assignment.can_main_gm || assignment.can_sub_gm
  }, [getAssignment])

  // 体験済みをトグル
  const toggleExperienced = useCallback((scenarioId: string) => {
    setAssignments(prev => {
      const existing = prev.find(a => a.scenario_id === scenarioId)
      
      if (existing) {
        // 既存のアサインメントがある場合
        if (existing.is_experienced || existing.can_main_gm || existing.can_sub_gm) {
          // 体験済み→未体験に変更（削除）- GM可能も一緒に解除
          return prev.filter(a => a.scenario_id !== scenarioId)
        }
      }
      
      // 未体験→体験済みに変更（追加）
      return [...prev, {
        scenario_id: scenarioId,
        can_main_gm: false,
        can_sub_gm: false,
        is_experienced: true
      }]
    })
  }, [])

  // GM可能をトグル（GM可能にすると自動的に体験済みになる）
  const toggleGM = useCallback((scenarioId: string) => {
    setAssignments(prev => {
      const existing = prev.find(a => a.scenario_id === scenarioId)
      
      if (existing) {
        if (existing.can_main_gm || existing.can_sub_gm) {
          // GM可能→体験済みのみに変更
          return prev.map(a => 
            a.scenario_id === scenarioId 
              ? { ...a, can_main_gm: false, can_sub_gm: false, is_experienced: true }
              : a
          )
        } else {
          // 体験済み→GM可能に変更
          return prev.map(a => 
            a.scenario_id === scenarioId 
              ? { ...a, can_main_gm: true, can_sub_gm: true, is_experienced: false }
              : a
          )
        }
      }
      
      // 新規追加（GM可能 = 自動的に体験済みも含む）
      return [...prev, {
        scenario_id: scenarioId,
        can_main_gm: true,
        can_sub_gm: true,
        is_experienced: false
      }]
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
        scenarioId: a.scenario_id,
        can_main_gm: a.can_main_gm,
        can_sub_gm: a.can_sub_gm,
        is_experienced: a.is_experienced
      }))

      await assignmentApi.updateStaffAssignments(staffId, assignmentData, organizationId)

      // staffテーブルにも保存（special_scenarios のみ。experienced_scenarios はDBカラムが存在しないため除外）
      // 体験済みデータは staff_scenario_assignments テーブルが正規データ源
      const specialScenarios = assignments
        .filter(a => a.can_main_gm || a.can_sub_gm)
        .map(a => a.scenario_id)

      const { error: staffUpdateError } = await supabase
        .from('staff')
        .update({
          special_scenarios: specialScenarios
        })
        .eq('id', staffId)
        .eq('organization_id', organizationId)

      if (staffUpdateError) throw staffUpdateError

      // organization_scenarios の available_gms / experienced_staff を同期
      // 変更されたシナリオIDを特定して、それぞれの organization_scenarios を再構築
      try {
        const affectedScenarioIds = [...new Set(assignments.map(a => a.scenario_id))]
        
        for (const scenarioId of affectedScenarioIds) {
          // このシナリオの全アサインメントを取得
          const { data: scenarioAssignments } = await supabase
            .from('staff_scenario_assignments')
            .select('staff_id, can_main_gm, can_sub_gm, is_experienced, staff:staff_id(name)')
            .eq('scenario_id', scenarioId)
            .eq('organization_id', organizationId)

          if (scenarioAssignments) {
            const gmNames: string[] = []
            const expNames: string[] = []
            const gmAssignmentsJson: any[] = []

            scenarioAssignments.forEach((a: any) => {
              const name = a.staff?.name
              if (!name) return
              if (a.can_main_gm || a.can_sub_gm) {
                if (!gmNames.includes(name)) gmNames.push(name)
                gmAssignmentsJson.push({ staff_name: name, staff_id: a.staff_id, can_main_gm: a.can_main_gm, can_sub_gm: a.can_sub_gm })
              }
              if (a.is_experienced && !a.can_main_gm && !a.can_sub_gm) {
                if (!expNames.includes(name)) expNames.push(name)
              }
            })

            // scenario_id が scenario_master_id として使われている organization_scenarios を更新
            await supabase
              .from('organization_scenarios')
              .update({
                available_gms: gmNames,
                experienced_staff: expNames,
                gm_assignments: gmAssignmentsJson,
                updated_at: new Date().toISOString()
              })
              .eq('scenario_master_id', scenarioId)
              .eq('organization_id', organizationId)
          }
        }
      } catch (syncError) {
        logger.error('organization_scenarios 同期エラー（無視）:', syncError)
      }

      // スタッフ管理ページのキャッシュを無効化（即座に反映されるようにする）
      queryClient.invalidateQueries({ queryKey: staffKeys.all })

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
          description={`${staffName}さんの体験リストとGM可能作品を管理`}
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
              体験済み・GM可能を設定してください
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {/* ヘッダー */}
            <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b text-xs font-medium text-muted-foreground">
              <div className="flex-1">シナリオ</div>
              <div className="flex items-center gap-6">
                <span className="w-16 text-center">体験済</span>
                <span className="w-16 text-center">GM可</span>
              </div>
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              {filteredScenarios.map(scenario => {
                const experienced = isExperienced(scenario.id)
                const gm = canGM(scenario.id)

                return (
                  <div
                    key={scenario.id}
                    className="flex items-center justify-between px-4 py-3 border-b last:border-b-0 hover:bg-muted/50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{scenario.title}</p>
                      <p className="text-xs text-muted-foreground">{scenario.author}</p>
                    </div>
                    <div className="flex items-center gap-6">
                      {/* 体験済みチェックボックス */}
                      <div className="w-16 flex justify-center">
                        <CircleCheck
                          checked={experienced}
                          onChange={() => toggleExperienced(scenario.id)}
                          color="green"
                        />
                      </div>
                      {/* GM可能チェックボックス */}
                      <div className="w-16 flex justify-center">
                        <CircleCheck
                          checked={gm}
                          onChange={() => toggleGM(scenario.id)}
                          color="blue"
                        />
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
          ※ GM可能にチェックすると自動的に体験済みになります
        </p>
      </div>
    </AppLayout>
  )
}

