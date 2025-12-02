import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { assignmentApi } from '@/lib/assignmentApi'
import { scenarioApi } from '@/lib/api'
import { Loader2, Search, BookOpen, CheckCircle2, Users } from 'lucide-react'

interface Scenario {
  id: string
  title: string
  author: string
}

interface Assignment {
  scenario_id: string
  can_main_gm: boolean
  can_sub_gm: boolean
  is_experienced: boolean
  scenarios?: {
    id: string
    title: string
    author: string
  }
}

export function StaffProfile() {
  const { user } = useAuth()
  const [staffId, setStaffId] = useState<string | null>(null)
  const [staffName, setStaffName] = useState<string>('')
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState<'experienced' | 'gm'>('experienced')

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
          console.error('スタッフ情報が見つかりません')
          setLoading(false)
          return
        }

        setStaffId(staffData.id)
        setStaffName(staffData.name)

        // シナリオ一覧を取得
        const scenariosData = await scenarioApi.getAll()
        setScenarios(scenariosData)

        // 現在のアサインメントを取得
        const assignmentsData = await assignmentApi.getAllStaffAssignments(staffData.id)
        setAssignments(assignmentsData)

      } catch (error) {
        console.error('データ読み込みエラー:', error)
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
          // 体験済み→未体験に変更（削除）
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

  // GM可能をトグル
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
      
      // 新規追加（GM可能）
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

      // アサインメントを更新
      const assignmentData = assignments.map(a => ({
        scenarioId: a.scenario_id,
        can_main_gm: a.can_main_gm,
        can_sub_gm: a.can_sub_gm,
        is_experienced: a.is_experienced
      }))

      await assignmentApi.updateStaffAssignments(staffId, assignmentData)

      alert('保存しました')
    } catch (error) {
      console.error('保存エラー:', error)
      alert('保存に失敗しました')
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
      <AppLayout currentPage="staff-profile">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    )
  }

  if (!staffId) {
    return (
      <AppLayout currentPage="staff-profile">
        <div className="container mx-auto max-w-4xl px-2 md:px-4 py-6">
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">
                スタッフ登録がされていません。<br />
                管理者に連絡してスタッフ登録を依頼してください。
              </p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout currentPage="staff-profile">
      <div className="container mx-auto max-w-4xl px-2 md:px-4 py-6">
        <PageHeader
          title="マイプロフィール"
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

        {/* タブ */}
        <div className="flex gap-2 mb-4">
          <Button
            variant={activeTab === 'experienced' ? 'default' : 'outline'}
            onClick={() => setActiveTab('experienced')}
            size="sm"
          >
            体験リスト追加
          </Button>
          <Button
            variant={activeTab === 'gm' ? 'default' : 'outline'}
            onClick={() => setActiveTab('gm')}
            size="sm"
          >
            GM可能作品追加
          </Button>
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
            <CardTitle className="text-base">
              {activeTab === 'experienced' ? '体験済みシナリオを選択' : 'GM可能なシナリオを選択'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
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
                    <div className="flex items-center gap-3 ml-4">
                      {/* ステータスバッジ */}
                      {gm && (
                        <Badge className="bg-green-100 text-green-800 border-green-200">
                          GM可
                        </Badge>
                      )}
                      {experienced && !gm && (
                        <Badge variant="secondary">
                          体験済
                        </Badge>
                      )}

                      {/* チェックボックス */}
                      {activeTab === 'experienced' ? (
                        <Checkbox
                          checked={experienced}
                          onCheckedChange={() => toggleExperienced(scenario.id)}
                        />
                      ) : (
                        <Checkbox
                          checked={gm}
                          onCheckedChange={() => toggleGM(scenario.id)}
                          disabled={!experienced}
                        />
                      )}
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

        {activeTab === 'gm' && (
          <p className="text-xs text-muted-foreground mt-2">
            ※ GM可能に設定するには、まず体験リストに追加してください
          </p>
        )}
      </div>
    </AppLayout>
  )
}

