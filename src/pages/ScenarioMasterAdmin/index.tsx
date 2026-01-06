/**
 * シナリオマスタ管理ページ
 * @path /admin/scenario-masters
 * @purpose MMQ運営がシナリオマスタを管理
 * @access license_admin のみ
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'
import { ScenarioMasterEditDialog } from '@/components/modals/ScenarioMasterEditDialog'
import { 
  Search, Plus, Edit, CheckCircle, XCircle, Clock, FileText, Users,
  BookOpen, AlertTriangle, Shield
} from 'lucide-react'
import { devDb } from '@/components/ui/DevField'

interface ScenarioMaster {
  id: string
  title: string
  author: string | null
  key_visual_url: string | null
  player_count_min: number
  player_count_max: number
  official_duration: number
  genre: string[]
  master_status: 'draft' | 'pending' | 'approved' | 'rejected'
  updated_at: string
  organization_count?: number
}

const STATUS_CONFIG = {
  draft: { label: '下書き', color: 'bg-gray-100 text-gray-700', icon: FileText },
  pending: { label: '承認待ち', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  approved: { label: '承認済み', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  rejected: { label: '却下', color: 'bg-red-100 text-red-700', icon: XCircle },
}

export function ScenarioMasterAdmin() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [masters, setMasters] = useState<ScenarioMaster[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  
  // 編集ダイアログ
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingMasterId, setEditingMasterId] = useState<string | null>(null)

  const isLicenseAdmin = user?.role === 'license_admin'

  const fetchMasters = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const { data, error: fetchError } = await supabase
        .from('scenario_masters')
        .select('*')
        .order('updated_at', { ascending: false })

      if (fetchError) {
        logger.error('Failed to fetch scenario masters:', fetchError)
        setError('シナリオマスタの取得に失敗しました')
        return
      }

      // 組織数を取得
      const mastersWithCounts = await Promise.all(
        (data || []).map(async (master) => {
          const { count } = await supabase
            .from('organization_scenarios')
            .select('id', { count: 'exact', head: true })
            .eq('scenario_master_id', master.id)

          return {
            ...master,
            organization_count: count || 0
          }
        })
      )

      setMasters(mastersWithCounts)
    } catch (err) {
      logger.error('Error fetching masters:', err)
      setError('エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isLicenseAdmin) {
      fetchMasters()
    }
  }, [fetchMasters, isLicenseAdmin])

  // フィルタリング
  const filteredMasters = useMemo(() => {
    return masters.filter(m => {
      const matchesSearch = !searchTerm || 
        m.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (m.author && m.author.toLowerCase().includes(searchTerm.toLowerCase()))
      const matchesStatus = statusFilter === 'all' || m.master_status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [masters, searchTerm, statusFilter])

  // 統計
  const stats = useMemo(() => ({
    total: masters.length,
    approved: masters.filter(m => m.master_status === 'approved').length,
    pending: masters.filter(m => m.master_status === 'pending').length,
    draft: masters.filter(m => m.master_status === 'draft').length,
  }), [masters])

  const handleEdit = (master: ScenarioMaster) => {
    setEditingMasterId(master.id)
    setEditDialogOpen(true)
  }

  const handleNew = () => {
    setEditingMasterId(null)
    setEditDialogOpen(true)
  }

  const handleDialogClose = () => {
    setEditDialogOpen(false)
    setEditingMasterId(null)
  }

  const handleSaved = () => {
    fetchMasters()
  }

  if (!isLicenseAdmin) {
    return (
      <AppLayout currentPage="scenario-masters" maxWidth="max-w-[1440px]">
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">アクセス権限がありません</h1>
          <p className="text-gray-600 mb-8">このページはMMQ運営のみアクセス可能です。</p>
          <Button onClick={() => navigate('/')}>トップへ戻る</Button>
        </div>
      </AppLayout>
    )
  }

  if (loading) {
    return (
      <AppLayout currentPage="scenario-masters" maxWidth="max-w-[1440px]" containerPadding="px-[10px] py-3 sm:py-4 md:py-6">
        <div className="flex items-center justify-center py-20">
          <div className="text-muted-foreground text-lg flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
            読み込み中...
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout
      currentPage="scenario-masters"
      maxWidth="max-w-[1440px]"
      containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
      className="mx-auto"
    >
      <div className="space-y-6">
        <PageHeader
          title={
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <span className="text-lg font-bold">シナリオマスタ管理</span>
            </div>
          }
          description={`全${masters.length}本のマスタを管理`}
        >
          <Button onClick={handleNew} size="sm">
            <Plus className="mr-1 h-4 w-4" />
            <span className="hidden sm:inline">新規マスタ</span>
            <span className="sm:hidden">新規</span>
          </Button>
        </PageHeader>

        {/* エラー表示 */}
        {error && (
          <Card className="border-red-500 bg-red-50 shadow-none">
            <CardContent className="p-3 sm:p-4 md:pt-6">
              <div className="flex items-center gap-2 text-red-800 text-sm sm:text-base">
                <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
                <p className="break-words">{error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 統計情報 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
          <Card className="shadow-none">
            <CardContent className="p-3">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-xs text-muted-foreground">全マスタ</div>
            </CardContent>
          </Card>
          <Card className="shadow-none border-green-200 bg-green-50">
            <CardContent className="p-3">
              <div className="text-2xl font-bold text-green-700">{stats.approved}</div>
              <div className="text-xs text-green-600">承認済み</div>
            </CardContent>
          </Card>
          <Card className="shadow-none border-yellow-200 bg-yellow-50">
            <CardContent className="p-3">
              <div className="text-2xl font-bold text-yellow-700">{stats.pending}</div>
              <div className="text-xs text-yellow-600">承認待ち</div>
            </CardContent>
          </Card>
          <Card className="shadow-none border-gray-200 bg-gray-50">
            <CardContent className="p-3">
              <div className="text-2xl font-bold text-gray-700">{stats.draft}</div>
              <div className="text-xs text-gray-600">下書き</div>
            </CardContent>
          </Card>
        </div>

        {/* 検索・フィルター */}
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="タイトル・作者で検索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 overflow-x-auto">
            {['all', 'approved', 'pending', 'draft', 'rejected'].map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(status)}
                className="text-xs sm:text-sm whitespace-nowrap"
              >
                {status === 'all' ? '全て' : STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]?.label}
              </Button>
            ))}
          </div>
        </div>

        {/* PC用: テーブル形式 */}
        <div className="hidden md:block bg-white border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">シナリオ</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">作者</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">人数</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">時間</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">ステータス</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">利用組織</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredMasters.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    {searchTerm || statusFilter !== 'all' 
                      ? '検索条件に一致するマスタが見つかりません' 
                      : 'シナリオマスタが登録されていません'}
                  </td>
                </tr>
              ) : (
                filteredMasters.map((master) => {
                  const statusConfig = STATUS_CONFIG[master.master_status]
                  const StatusIcon = statusConfig.icon

                  return (
                    <tr 
                      key={master.id} 
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => handleEdit(master)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 w-10 h-14 bg-gray-100 rounded overflow-hidden border">
                            {master.key_visual_url ? (
                              <img
                                src={master.key_visual_url}
                                alt={master.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-300">
                                <span className="text-[8px]">No img</span>
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate" {...devDb('scenario_masters.title')}>{master.title}</p>
                            {master.genre && master.genre.length > 0 && (
                              <div className="flex gap-1 mt-1">
                                {master.genre.slice(0, 2).map((g, i) => (
                                  <Badge key={i} variant="secondary" className="text-xs">{g}</Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600" {...devDb('scenario_masters.author')}>
                        {master.author || '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-gray-600">
                        <div className="flex items-center justify-center gap-1" {...devDb('scenario_masters.player_count_min/max')}>
                          <Users className="w-3 h-3" />
                          {master.player_count_min === master.player_count_max
                            ? `${master.player_count_max}人`
                            : `${master.player_count_min}-${master.player_count_max}人`}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-gray-600">
                        <div className="flex items-center justify-center gap-1" {...devDb('scenario_masters.official_duration')}>
                          <Clock className="w-3 h-3" />
                          {Math.floor(master.official_duration / 60)}h
                          {master.official_duration % 60 > 0 && `${master.official_duration % 60}m`}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusConfig.color}`} {...devDb('scenario_masters.master_status')}>
                          <StatusIcon className="w-3 h-3" />
                          {statusConfig.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-gray-600">
                        {master.organization_count || 0}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleEdit(master)
                          }}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* モバイル用: リスト形式（ScenarioManagementと同じスタイル） */}
        <div className="md:hidden space-y-2">
          {filteredMasters.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {searchTerm || statusFilter !== 'all' 
                ? '検索条件に一致するマスタが見つかりません' 
                : 'シナリオマスタが登録されていません'}
            </div>
          ) : (
            filteredMasters.map((master) => {
              const statusConfig = STATUS_CONFIG[master.master_status]
              const StatusIcon = statusConfig.icon
              const genres = master.genre || []

              return (
                <div 
                  key={master.id} 
                  className="bg-white border rounded-lg overflow-hidden"
                  onClick={() => handleEdit(master)}
                >
                  <div className="p-3 flex items-start gap-3">
                    {/* 画像サムネイル */}
                    <div className="flex-shrink-0 w-14 h-14 bg-gray-100 rounded-md overflow-hidden border">
                      {master.key_visual_url ? (
                        <img src={master.key_visual_url} alt={master.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                          <span className="text-[10px]">No img</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <h3 className="font-bold text-sm truncate pr-2">{master.title}</h3>
                        {/* @ts-ignore */}
                        <Badge variant={master.master_status === 'approved' ? 'success' : 'warning'} size="sm" className="shrink-0 text-[10px] px-1.5 py-0">
                          {statusConfig.label}
                        </Badge>
                      </div>
                      
                      <div className="text-xs text-muted-foreground mb-1.5 truncate">
                        作: {master.author || '不明'}
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          <span>
                            {master.player_count_min === master.player_count_max
                              ? `${master.player_count_max}人`
                              : `${master.player_count_min}〜${master.player_count_max}人`}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>{master.official_duration}分</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* ジャンル */}
                  {genres.length > 0 && (
                    <div className="px-3 pb-1">
                      <div className="flex items-start gap-2 text-xs">
                        <span className="text-blue-600 shrink-0 w-10">ジャンル</span>
                        <div className="flex flex-wrap gap-1">
                          {genres.slice(0, 5).map((g, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs font-normal py-0.5 px-1.5 bg-blue-50 border-blue-200 text-blue-700">
                              {g}
                            </Badge>
                          ))}
                          {genres.length > 5 && <span className="text-muted-foreground">+{genres.length - 5}</span>}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* フッター */}
                  <div className="bg-gray-50 px-3 py-1.5 border-t flex items-center justify-between text-[10px] text-muted-foreground">
                    <div className="flex gap-3">
                      <span className="text-blue-600">利用: {master.organization_count || 0}組織</span>
                    </div>
                    <span className="text-primary">編集 →</span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* 編集ダイアログ */}
      <ScenarioMasterEditDialog
        open={editDialogOpen}
        onOpenChange={handleDialogClose}
        masterId={editingMasterId}
        onSaved={handleSaved}
        sortedMasterIds={filteredMasters.map(m => m.id)}
        onMasterChange={setEditingMasterId}
      />
    </AppLayout>
  )
}

export default ScenarioMasterAdmin
