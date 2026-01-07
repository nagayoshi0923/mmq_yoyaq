/**
 * 組織シナリオ一覧（マスタ連携版）
 * @purpose organization_scenarios_with_master ビューを使用した一覧表示
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'
import { toast } from 'sonner'
import {
  Search, Plus, Edit, Trash2, Clock, Users, JapaneseYen, 
  ExternalLink, AlertTriangle, RefreshCw
} from 'lucide-react'
import { AddFromMasterDialog } from '@/components/modals/AddFromMasterDialog'
import { ConfirmModal } from '@/components/patterns/modal'

interface OrganizationScenarioWithMaster {
  id: string
  organization_id: string
  scenario_master_id: string
  slug: string | null
  org_status: 'available' | 'unavailable' | 'coming_soon'
  pricing_patterns: any[]
  gm_assignments: any[]
  created_at: string
  updated_at: string
  // マスタ情報
  title: string
  author: string | null
  key_visual_url: string | null
  description: string | null
  player_count_min: number
  player_count_max: number
  duration: number
  genre: string[]
  difficulty: string | null
  participation_fee: number | null
  master_status: 'draft' | 'pending' | 'approved' | 'rejected'
}

const STATUS_LABELS = {
  available: { label: '公開中', color: 'bg-green-100 text-green-700' },
  unavailable: { label: '非公開', color: 'bg-gray-100 text-gray-600' },
  coming_soon: { label: '近日公開', color: 'bg-yellow-100 text-yellow-700' }
}

interface OrganizationScenarioListProps {
  /** シナリオ編集時のコールバック */
  onEdit?: (scenarioId: string) => void
}

export function OrganizationScenarioList({ onEdit }: OrganizationScenarioListProps) {
  const [scenarios, setScenarios] = useState<OrganizationScenarioWithMaster[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // マスタ追加ダイアログ
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  
  // 削除確認
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [scenarioToDelete, setScenarioToDelete] = useState<OrganizationScenarioWithMaster | null>(null)

  const fetchScenarios = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const organizationId = await getCurrentOrganizationId()
      if (!organizationId) {
        setError('組織情報が取得できません')
        return
      }

      const { data, error: fetchError } = await supabase
        .from('organization_scenarios_with_master')
        .select('*')
        .eq('organization_id', organizationId)
        .order('title', { ascending: true })

      if (fetchError) {
        logger.error('Failed to fetch organization scenarios:', fetchError)
        setError('シナリオの取得に失敗しました')
        return
      }

      setScenarios(data || [])
    } catch (err) {
      logger.error('Error fetching scenarios:', err)
      setError('エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchScenarios()
  }, [fetchScenarios])

  // フィルタリング
  const filteredScenarios = useMemo(() => {
    return scenarios.filter(s => {
      const matchesSearch = !searchTerm ||
        s.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.author && s.author.toLowerCase().includes(searchTerm.toLowerCase()))
      const matchesStatus = statusFilter === 'all' || s.org_status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [scenarios, searchTerm, statusFilter])

  // 既に追加済みのマスタIDリスト
  const existingMasterIds = useMemo(() => scenarios.map(s => s.scenario_master_id), [scenarios])

  // ステータス変更
  const handleStatusChange = async (scenario: OrganizationScenarioWithMaster, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('organization_scenarios')
        .update({ org_status: newStatus })
        .eq('id', scenario.id)

      if (error) {
        logger.error('Failed to update status:', error)
        toast.error('ステータス更新に失敗しました')
        return
      }

      toast.success(`「${scenario.title}」を${STATUS_LABELS[newStatus as keyof typeof STATUS_LABELS]?.label || newStatus}に変更しました`)
      fetchScenarios()
    } catch (err) {
      logger.error('Error updating status:', err)
      toast.error('エラーが発生しました')
    }
  }

  // 削除
  const handleDelete = async () => {
    if (!scenarioToDelete) return

    try {
      const { error } = await supabase
        .from('organization_scenarios')
        .delete()
        .eq('id', scenarioToDelete.id)

      if (error) {
        logger.error('Failed to delete scenario:', error)
        toast.error('削除に失敗しました')
        return
      }

      toast.success(`「${scenarioToDelete.title}」を削除しました`)
      setDeleteDialogOpen(false)
      setScenarioToDelete(null)
      fetchScenarios()
    } catch (err) {
      logger.error('Error deleting scenario:', err)
      toast.error('エラーが発生しました')
    }
  }

  // 統計
  const stats = useMemo(() => ({
    total: scenarios.length,
    available: scenarios.filter(s => s.org_status === 'available').length,
    unavailable: scenarios.filter(s => s.org_status === 'unavailable').length,
    coming_soon: scenarios.filter(s => s.org_status === 'coming_soon').length
  }), [scenarios])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
          読み込み中...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* エラー表示 */}
      {error && (
        <Card className="border-red-500 bg-red-50 shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-red-800">
              <AlertTriangle className="h-4 w-4" />
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 統計カード */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        <Card className="shadow-none">
          <CardContent className="p-3">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">全シナリオ</div>
          </CardContent>
        </Card>
        <Card className="shadow-none border-green-200 bg-green-50">
          <CardContent className="p-3">
            <div className="text-2xl font-bold text-green-700">{stats.available}</div>
            <div className="text-xs text-green-600">公開中</div>
          </CardContent>
        </Card>
        <Card className="shadow-none border-yellow-200 bg-yellow-50">
          <CardContent className="p-3">
            <div className="text-2xl font-bold text-yellow-700">{stats.coming_soon}</div>
            <div className="text-xs text-yellow-600">近日公開</div>
          </CardContent>
        </Card>
        <Card className="shadow-none border-gray-200 bg-gray-50">
          <CardContent className="p-3">
            <div className="text-2xl font-bold text-gray-700">{stats.unavailable}</div>
            <div className="text-xs text-gray-600">非公開</div>
          </CardContent>
        </Card>
      </div>

      {/* 検索・フィルター・アクション */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="タイトル・作者で検索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-1">
            {['all', 'available', 'coming_soon', 'unavailable'].map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(status)}
                className="text-xs"
              >
                {status === 'all' ? '全て' : STATUS_LABELS[status as keyof typeof STATUS_LABELS]?.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchScenarios}>
            <RefreshCw className="w-4 h-4 mr-1" />
            更新
          </Button>
          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-1" />
            マスタから追加
          </Button>
        </div>
      </div>

      {/* シナリオ一覧 */}
      {filteredScenarios.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border">
          <p className="text-gray-500 mb-4">
            {searchTerm || statusFilter !== 'all'
              ? '検索条件に一致するシナリオがありません'
              : 'シナリオがありません'}
          </p>
          {!searchTerm && statusFilter === 'all' && (
            <Button onClick={() => setAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              マスタからシナリオを追加
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredScenarios.map((scenario) => {
            const statusConfig = STATUS_LABELS[scenario.org_status]
            return (
              <div
                key={scenario.id}
                className="bg-white border rounded-lg p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start gap-4">
                  {/* サムネイル */}
                  <div className="w-16 h-20 flex-shrink-0 bg-gray-100 rounded overflow-hidden border">
                    {scenario.key_visual_url ? (
                      <img
                        src={scenario.key_visual_url}
                        alt={scenario.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <span className="text-[10px]">No img</span>
                      </div>
                    )}
                  </div>

                  {/* 情報 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-gray-900 truncate">{scenario.title}</h3>
                      <Badge className={`text-xs ${statusConfig.color}`}>
                        {statusConfig.label}
                      </Badge>
                      {scenario.master_status !== 'approved' && (
                        <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-300">
                          マスタ未承認
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-2">作: {scenario.author || '不明'}</p>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {scenario.player_count_min === scenario.player_count_max
                          ? `${scenario.player_count_min}人`
                          : `${scenario.player_count_min}〜${scenario.player_count_max}人`}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {scenario.duration}分
                      </span>
                      {scenario.participation_fee != null && (
                        <span className="flex items-center gap-1">
                          <JapaneseYen className="w-3 h-3" />
                          {scenario.participation_fee.toLocaleString()}円
                        </span>
                      )}
                      {scenario.genre && scenario.genre.length > 0 && (
                        <div className="flex items-center gap-1">
                          {scenario.genre.slice(0, 2).map((g, i) => (
                            <Badge key={i} variant="outline" className="text-xs py-0">
                              {g}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* アクション */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* ステータス切り替え */}
                    <select
                      value={scenario.org_status}
                      onChange={(e) => handleStatusChange(scenario, e.target.value)}
                      className="text-xs border rounded px-2 py-1 bg-white"
                    >
                      <option value="available">公開中</option>
                      <option value="coming_soon">近日公開</option>
                      <option value="unavailable">非公開</option>
                    </select>

                    {/* 編集 */}
                    {onEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onEdit(scenario.id)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    )}

                    {/* 削除 */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => {
                        setScenarioToDelete(scenario)
                        setDeleteDialogOpen(true)
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* マスタ追加ダイアログ */}
      <AddFromMasterDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onAdded={fetchScenarios}
        existingMasterIds={existingMasterIds}
      />

      {/* 削除確認ダイアログ */}
      <ConfirmModal
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDelete}
        title="シナリオを削除"
        message={scenarioToDelete ? `「${scenarioToDelete.title}」を組織から削除します。マスタデータは残ります。` : ''}
        variant="danger"
        confirmLabel="削除"
      />
    </div>
  )
}

