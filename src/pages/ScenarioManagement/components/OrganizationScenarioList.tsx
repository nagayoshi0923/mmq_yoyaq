/**
 * 組織シナリオ一覧（マスタ連携版）
 * @purpose organization_scenarios_with_master ビューを使用した一覧表示
 * @design 旧UIと同じテーブル形式で表示
 *         - マスタ由来の項目: 通常ヘッダー（グレー）
 *         - 組織設定の項目: 色付きヘッダー（青）
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
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
  AlertTriangle, RefreshCw, Filter, X
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { AddFromMasterDialog } from '@/components/modals/AddFromMasterDialog'
import { ConfirmModal } from '@/components/patterns/modal'
import { TanStackDataTable } from '@/components/patterns/table'
import type { Column } from '@/components/patterns/table'

interface OrganizationScenarioWithMaster {
  id: string           // = scenario_master_id（ビューの id）
  org_scenario_id: string  // = organization_scenarios.id（実テーブルの id）
  organization_id: string
  scenario_master_id: string
  slug: string | null
  org_status: 'available' | 'unavailable' | 'coming_soon'
  pricing_patterns: any[]
  gm_assignments: any[]
  created_at: string
  updated_at: string
  extra_preparation_time: number | null
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
  // 組織設定項目（ビュー更新後に使用可能）
  license_amount: number | null
  gm_test_license_amount: number | null
  available_gms: string[] | null
  experienced_staff: string[] | null
  available_stores: string[] | null
  gm_costs: any[] | null
  gm_count: number | null
  play_count: number | null
}

const STATUS_LABELS = {
  available: { label: '公開中', color: 'bg-green-100 text-green-700' },
  unavailable: { label: '非公開', color: 'bg-gray-100 text-gray-600' },
  coming_soon: { label: '近日公開', color: 'bg-yellow-100 text-yellow-700' }
}

interface OrganizationScenarioListProps {
  /** シナリオ編集時のコールバック */
  onEdit?: (scenarioId: string) => void
  /** リフレッシュトリガー（変更されると再読み込み） */
  refreshKey?: number
}

// ヘッダー・セルスタイル: マスタ由来（通常）vs 組織設定（青）
// TanStackDataTableのデフォルトbg-gray-100を上書きするため!importantを使用
const MASTER_HEADER_CLASS = '' // 通常のヘッダー色（デフォルト灰色）
const MASTER_CELL_CLASS = '' // 通常のセル色
const ORG_HEADER_CLASS = '!bg-blue-100' // 組織設定項目のヘッダー色（青）
const ORG_CELL_CLASS = '!bg-blue-50/50' // 組織設定項目のセル背景色（薄い青）

// 店舗情報の型
interface StoreInfo {
  id: string
  short_name: string
  name: string
  ownership_type?: string
  is_temporary?: boolean
}

export function OrganizationScenarioList({ onEdit, refreshKey }: OrganizationScenarioListProps) {
  const [scenarios, setScenarios] = useState<OrganizationScenarioWithMaster[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [organizationName, setOrganizationName] = useState<string>('')
  const [sortState, setSortState] = useState<{ field: string; direction: 'asc' | 'desc' } | undefined>({ field: 'title', direction: 'asc' })
  
  // 追加フィルタ
  const [gmFilter, setGmFilter] = useState<string>('all')
  const [experiencedFilter, setExperiencedFilter] = useState<string>('all')
  const [playerCountFilter, setPlayerCountFilter] = useState<string>('all')
  const [durationFilter, setDurationFilter] = useState<string>('all')
  const [storeMap, setStoreMap] = useState<Map<string, StoreInfo>>(new Map())

  // マスタ追加ダイアログ
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  
  // 解除確認
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [scenarioToDelete, setScenarioToDelete] = useState<OrganizationScenarioWithMaster | null>(null)

  const fetchScenarios = useCallback(async (isRefresh = false) => {
    try {
      // リフレッシュ時はローディング表示しない（バックグラウンド更新）
      if (!isRefresh) {
        setLoading(true)
      }
      setError(null)
      
      const organizationId = await getCurrentOrganizationId()
      if (!organizationId) {
        setError('組織情報が取得できません')
        return
      }

      // 組織名、店舗一覧、シナリオ一覧を並列取得（パフォーマンス改善）
      // ※ 担当GM・体験済みスタッフはビューで staff_scenario_assignments から動的に計算される
      const [orgResult, storesResult, scenariosResult] = await Promise.all([
        // 組織名を取得
        supabase
          .from('organizations')
          .select('name')
          .eq('id', organizationId)
          .single(),
        // 店舗一覧を取得（IDから名前への変換用）
        supabase
          .from('stores')
          .select('id, name, short_name, ownership_type, is_temporary')
          .eq('organization_id', organizationId),
        // シナリオ一覧を取得（組織設定項目を含める）
        // ※ available_gms, experienced_staff はビューで staff_scenario_assignments から動的に計算
        supabase
          .from('organization_scenarios_with_master')
          .select(`
            id,
            org_scenario_id,
            organization_id,
            scenario_master_id,
            slug,
            org_status,
            pricing_patterns,
            gm_assignments,
            created_at,
            updated_at,
            extra_preparation_time,
            title,
            author,
            author_id,
            key_visual_url,
            description,
            synopsis,
            caution,
            player_count_min,
            player_count_max,
            duration,
            genre,
            difficulty,
            participation_fee,
            master_status,
            play_count,
            available_gms,
            available_stores,
            gm_costs,
            gm_count,
            license_amount,
            gm_test_license_amount,
            experienced_staff
          `)
          .eq('organization_id', organizationId)
          .order('title', { ascending: true }),
      ])

      if (orgResult.data?.name) {
        setOrganizationName(orgResult.data.name)
      }

      if (storesResult.data) {
        const map = new Map<string, StoreInfo>()
        storesResult.data.forEach(store => {
          map.set(store.id, { 
            id: store.id, 
            name: store.name, 
            short_name: store.short_name || store.name,
            ownership_type: store.ownership_type,
            is_temporary: store.is_temporary
          })
        })
        setStoreMap(map)
        const regularCount = storesResult.data.filter(s => s.ownership_type !== 'office' && !s.is_temporary).length
        console.log('🏪 店舗一覧:', { total: storesResult.data.length, regular: regularCount, stores: storesResult.data.map(s => ({ id: s.id.substring(0, 8), name: s.name })) })
      } else {
        console.warn('⚠️ 店舗データの取得に失敗:', storesResult.error)
      }

      const data = scenariosResult.data
      const fetchError = scenariosResult.error

      if (fetchError) {
        logger.error('Failed to fetch organization scenarios:', fetchError)
        setError('シナリオの取得に失敗しました')
        return
      }

      // 対応店舗のフォールバック用Map（ビューに無い場合の補完）
      const scenarioMasterIds = (data || []).map(s => s.scenario_master_id).filter(Boolean)
      const availableStoresMap = new Map<string, string[]>()
      
      if (scenarioMasterIds.length > 0) {
        // ビューにavailable_storesが無いシナリオ用のフォールバック
        const missingStoresMasterIds = (data || [])
          .filter(s => !s.available_stores || s.available_stores.length === 0)
          .map(s => s.scenario_master_id)
          .filter(Boolean)
        
        if (missingStoresMasterIds.length > 0) {
          // organization_scenarios から直接取得
          const { data: orgScenariosStores } = await supabase
            .from('organization_scenarios')
            .select('scenario_master_id, available_stores')
            .eq('organization_id', organizationId)
            .in('scenario_master_id', missingStoresMasterIds)
          
          if (orgScenariosStores) {
            orgScenariosStores.forEach(os => {
              if (os.scenario_master_id && os.available_stores && os.available_stores.length > 0) {
                availableStoresMap.set(os.scenario_master_id, os.available_stores)
              }
            })
          }
        }
      }

      // シナリオに対応店舗をマージ
      // ※ 担当GMと体験済みスタッフはビューで直接取得される（staff_scenario_assignmentsから動的に計算）
      const scenariosWithAssignments = (data || []).map(scenario => {
        // 対応店舗: ビュー → organization_scenarios直接 → scenarios のどれかから取得
        const viewStores = scenario.available_stores && scenario.available_stores.length > 0 ? scenario.available_stores : null
        const mapStores = availableStoresMap.get(scenario.scenario_master_id)
        
        return {
          ...scenario,
          // 担当GM・体験済み: ビューから直接取得（上書きしない）
          // 対応店舗: ビュー > organization_scenarios直接 > scenarios > 空配列
          available_stores: viewStores || mapStores || []
        }
      })

      // デバッグ: play_count の確認
      if (scenariosWithAssignments.length > 0) {
        // 生データの play_count を確認
        const rawPlayCounts = (data || []).slice(0, 5).map(s => ({
          title: s.title,
          play_count: s.play_count,
          play_count_type: typeof s.play_count
        }))
        console.log('🎯 raw data play_count (最初の5件):', rawPlayCounts)
        
        const withPlayCount = scenariosWithAssignments.filter(s => s.play_count != null && s.play_count > 0)
        console.log('🎯 play_count > 0 のシナリオ数:', withPlayCount.length, '/', scenariosWithAssignments.length)
        if (withPlayCount.length > 0) {
          console.log('🎯 play_count トップ3:', withPlayCount.slice(0, 3).map(s => ({
            title: s.title,
            play_count: s.play_count
          })))
        }
      }

      setScenarios(scenariosWithAssignments)
    } catch (err) {
      logger.error('Error fetching scenarios:', err)
      setError('エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }, [])

  // 初回ロード済みフラグ
  const initialLoadDoneRef = useRef(false)

  useEffect(() => {
    if (!initialLoadDoneRef.current) {
      // 初回: ローディング表示あり
      initialLoadDoneRef.current = true
      fetchScenarios(false)
    } else {
      // リフレッシュ: バックグラウンド更新（ローディング表示なし）
      fetchScenarios(true)
    }
  }, [fetchScenarios, refreshKey])

  // 作者名・カテゴリ名の一括編集後に一覧を再取得
  useEffect(() => {
    const handler = () => fetchScenarios(true)
    window.addEventListener('scenario-data-updated', handler)
    return () => window.removeEventListener('scenario-data-updated', handler)
  }, [fetchScenarios])

  // フィルタ用のスタッフ名一覧を抽出
  const gmNames = useMemo(() => {
    const names = new Set<string>()
    scenarios.forEach(s => {
      (s.available_gms || []).forEach(name => names.add(name))
    })
    return Array.from(names).sort()
  }, [scenarios])

  const experiencedStaffNames = useMemo(() => {
    const names = new Set<string>()
    scenarios.forEach(s => {
      (s.experienced_staff || []).forEach(name => names.add(name))
    })
    return Array.from(names).sort()
  }, [scenarios])

  // フィルタリング
  const filteredScenarios = useMemo(() => {
    let result = scenarios.filter(s => {
      const matchesSearch = !searchTerm ||
        s.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.author && s.author.toLowerCase().includes(searchTerm.toLowerCase()))
      const matchesStatus = statusFilter === 'all' || s.org_status === statusFilter
      
      // 担当GMフィルタ
      const matchesGm = gmFilter === 'all' || 
        (gmFilter === 'none' ? (s.available_gms || []).length === 0 : (s.available_gms || []).includes(gmFilter))
      
      // 体験済みスタッフフィルタ
      const matchesExperienced = experiencedFilter === 'all' || 
        (experiencedFilter === 'none' ? (s.experienced_staff || []).length === 0 : (s.experienced_staff || []).includes(experiencedFilter))
      
      // 人数フィルタ（指定人数でプレイ可能か）
      let matchesPlayerCount = true
      if (playerCountFilter !== 'all') {
        const count = parseInt(playerCountFilter)
        matchesPlayerCount = s.player_count_min <= count && s.player_count_max >= count
      }
      
      // 時間フィルタ（指定時間以内か）
      let matchesDuration = true
      if (durationFilter !== 'all') {
        const maxDuration = parseInt(durationFilter)
        matchesDuration = s.duration <= maxDuration
      }
      
      return matchesSearch && matchesStatus && matchesGm && matchesExperienced && matchesPlayerCount && matchesDuration
    })

    // ソート適用
    if (sortState) {
      result = [...result].sort((a, b) => {
        let aVal: any
        let bVal: any
        switch (sortState.field) {
          case 'title':
            aVal = a.title
            bVal = b.title
            break
          case 'author':
            aVal = a.author || ''
            bVal = b.author || ''
            break
          case 'duration':
            aVal = a.duration
            bVal = b.duration
            break
          case 'player_count':
          case 'player_count_min':
            aVal = a.player_count_min
            bVal = b.player_count_min
            break
          case 'player_count_max':
            aVal = a.player_count_max
            bVal = b.player_count_max
            break
          case 'participation_fee':
            aVal = a.participation_fee || 0
            bVal = b.participation_fee || 0
            break
          case 'org_status':
            aVal = a.org_status
            bVal = b.org_status
            break
          case 'available_gms':
            // 担当スタッフ数でソート
            aVal = Array.isArray(a.available_gms) ? a.available_gms.length : 0
            bVal = Array.isArray(b.available_gms) ? b.available_gms.length : 0
            break
          case 'experienced_staff':
            // 体験済みスタッフ数でソート
            aVal = Array.isArray(a.experienced_staff) ? a.experienced_staff.length : 0
            bVal = Array.isArray(b.experienced_staff) ? b.experienced_staff.length : 0
            break
          default:
            aVal = (a as unknown as Record<string, unknown>)[sortState.field]
            bVal = (b as unknown as Record<string, unknown>)[sortState.field]
        }
        if (aVal == null) return 1
        if (bVal == null) return -1
        if (aVal < bVal) return sortState.direction === 'asc' ? -1 : 1
        if (aVal > bVal) return sortState.direction === 'asc' ? 1 : -1
        return 0
      })
    }

    return result
  }, [scenarios, searchTerm, statusFilter, sortState, gmFilter, experiencedFilter, playerCountFilter, durationFilter])

  // 既に追加済みのマスタIDリスト
  const existingMasterIds = useMemo(() => scenarios.map(s => s.scenario_master_id), [scenarios])

  // ステータス変更（ローカルstate即時更新 → DB保存）
  // useCallbackで安定化し、columns useMemoの不要な再計算を防止
  const handleStatusChange = useCallback(async (scenario: OrganizationScenarioWithMaster, newStatus: string) => {
    const previousStatus = scenario.org_status
    
    // 楽観的更新: まずローカルstateを即時反映（リロードなし）
    setScenarios(prev => prev.map(s => 
      s.id === scenario.id ? { ...s, org_status: newStatus as OrganizationScenarioWithMaster['org_status'] } : s
    ))

    try {
      // RPC を使用してステータス更新（RLS をバイパス）
      // org_scenario_id = organization_scenarios テーブルの実 id
      const { data, error } = await supabase.rpc('update_org_scenario_status', {
        p_scenario_id: scenario.org_scenario_id,
        p_new_status: newStatus
      })

      if (error) {
        logger.error('Failed to update status:', error)
        toast.error(`ステータス更新に失敗しました: ${error.message}`)
        setScenarios(prev => prev.map(s => 
          s.id === scenario.id ? { ...s, org_status: previousStatus } : s
        ))
        return
      }

      // RPC の結果を確認
      if (!data?.success) {
        logger.error('Update failed:', data)
        const debugInfo = data?.debug ? ` (user_org: ${data.debug.user_org_id}, scenario_org: ${data.debug.scenario_org_id}, uid: ${data.debug.user_id})` : ''
        toast.error(`${data?.error || 'ステータス更新に失敗しました'}${debugInfo}`)
        setScenarios(prev => prev.map(s => 
          s.id === scenario.id ? { ...s, org_status: previousStatus } : s
        ))
        return
      }

      logger.log('Status updated successfully:', data)
      toast.success(`「${scenario.title}」を${STATUS_LABELS[newStatus as keyof typeof STATUS_LABELS]?.label || newStatus}に変更しました`)
    } catch (err) {
      logger.error('Error updating status:', err)
      toast.error('エラーが発生しました')
      setScenarios(prev => prev.map(s => 
        s.id === scenario.id ? { ...s, org_status: previousStatus } : s
      ))
    }
  }, [])

  // シナリオ解除（組織からの紐付けを削除、マスタは残る）
  const handleUnlink = async () => {
    if (!scenarioToDelete) return

    try {
      // RPC を使用して削除（RLS をバイパス）
      // org_scenario_id = organization_scenarios テーブルの実 id
      const { data, error } = await supabase.rpc('delete_org_scenario', {
        p_scenario_id: scenarioToDelete.org_scenario_id
      })

      if (error) {
        logger.error('Failed to unlink scenario:', error)
        toast.error(`解除に失敗しました: ${error.message}`)
        return
      }

      // RPC の結果を確認
      if (!data?.success) {
        logger.error('Delete failed:', data)
        const debugInfo = data?.debug ? ` (user_org: ${data.debug.user_org_id}, scenario_org: ${data.debug.scenario_org_id}, uid: ${data.debug.user_id})` : ''
        toast.error(`${data?.error || '解除に失敗しました'}${debugInfo}`)
        return
      }

      logger.log('Scenario unlinked successfully:', data)
      toast.success(`「${scenarioToDelete.title}」を解除しました`)
      // ローカルstateから即時削除（リロードなし）
      setScenarios(prev => prev.filter(s => s.id !== scenarioToDelete.id))
      setDeleteDialogOpen(false)
      setScenarioToDelete(null)
    } catch (err) {
      logger.error('Error unlinking scenario:', err)
      toast.error('エラーが発生しました')
    }
  }

  // 統計（旧UIと同じ項目）
  const stats = useMemo(() => {
    const totalScenarios = scenarios.length
    const availableScenarios = scenarios.filter(s => s.org_status === 'available').length
    
    // 平均公演回数と中央値を計算
    const playCounts = scenarios.map(s => s.play_count || 0)
    const totalPlayCount = playCounts.reduce((sum, count) => sum + count, 0)
    const avgPlayCount = totalScenarios > 0 
      ? Math.round((totalPlayCount / totalScenarios) * 10) / 10 // 小数点第1位まで
      : 0
    
    // 中央値を計算
    const sortedCounts = [...playCounts].sort((a, b) => a - b)
    let medianPlayCount = 0
    if (sortedCounts.length > 0) {
      const mid = Math.floor(sortedCounts.length / 2)
      if (sortedCounts.length % 2 === 0) {
        // 偶数の場合: 中央2つの平均
        medianPlayCount = Math.round(((sortedCounts[mid - 1] + sortedCounts[mid]) / 2) * 10) / 10
      } else {
        // 奇数の場合: 中央の値
        medianPlayCount = sortedCounts[mid]
      }
    }
    
    // 平均プレイヤー数を計算
    const totalPlayers = scenarios.reduce((sum, s) => {
      const maxPlayers = s.player_count_max || s.player_count_min
      return sum + maxPlayers
    }, 0)
    const avgPlayers = totalScenarios > 0 ? Math.round(totalPlayers / totalScenarios) : 0
    
    return {
      totalScenarios,
      availableScenarios,
      avgPlayCount,
      medianPlayCount,
      avgPlayers
    }
  }, [scenarios])

  // テーブル列定義（旧UIと同じスタイル + 組織設定項目のヘッダー色変更）
  const tableColumns: Column<OrganizationScenarioWithMaster>[] = useMemo(() => [
    // ========== マスタ由来の項目（通常ヘッダー）==========
    {
      key: 'image',
      header: '画像',
      helpText: 'シナリオのキービジュアル画像（マスタで設定）',
      width: 'w-16',
      headerClassName: `text-center ${MASTER_HEADER_CLASS}`,
      cellClassName: 'p-1',
      render: (scenario) => (
        <div className="flex items-center justify-center">
          {scenario.key_visual_url ? (
            <div className="w-10 h-12 bg-gray-200 rounded overflow-hidden">
              <img
                src={scenario.key_visual_url}
                alt={scenario.title}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-10 h-12 border border-dashed border-gray-300 rounded flex items-center justify-center">
              <span className="text-[8px] text-gray-400">No img</span>
            </div>
          )}
        </div>
      )
    },
    {
      key: 'title',
      header: 'タイトル',
      helpText: 'シナリオのタイトル。クリックで詳細編集（マスタで設定）',
      width: 'w-40',
      sortable: true,
      headerClassName: MASTER_HEADER_CLASS,
      render: (scenario) => (
        <button
          onClick={() => onEdit?.(scenario.scenario_master_id)}
          className="text-sm truncate text-left hover:text-blue-600 hover:underline w-full"
          title={scenario.title}
        >
          {scenario.title}
        </button>
      )
    },
    {
      key: 'author',
      header: '作者',
      helpText: 'シナリオの制作者名（マスタで設定）',
      width: 'w-24',
      sortable: true,
      headerClassName: MASTER_HEADER_CLASS,
      render: (scenario) => (
        <p className="text-sm truncate" title={scenario.author || ''}>
          {scenario.author || '-'}
        </p>
      )
    },
    {
      key: 'player_count',
      header: '人数',
      helpText: 'プレイ可能な参加者の人数範囲（マスタで設定）',
      width: 'w-20',
      sortable: true,
      headerClassName: MASTER_HEADER_CLASS,
      render: (scenario) => (
        <p className="text-sm flex items-center gap-1">
          <Users className="h-3 w-3" /> 
          {scenario.player_count_min === scenario.player_count_max
            ? `${scenario.player_count_min}人`
            : `${scenario.player_count_min}〜${scenario.player_count_max}人`}
        </p>
      )
    },
    {
      key: 'genre',
      header: 'ジャンル',
      helpText: 'シナリオのジャンル分類（ホラー、感動、推理など。マスタで設定）',
      width: 'w-28',
      headerClassName: MASTER_HEADER_CLASS,
      render: (scenario) => {
        if (!scenario.genre || scenario.genre.length === 0) {
          return <span className="text-xs text-muted-foreground">-</span>
        }
        return (
          <div className="flex flex-wrap gap-0.5">
            {scenario.genre.slice(0, 2).map((g, i) => (
              <Badge key={i} variant="secondary" className="font-normal text-[10px] px-1 py-0 bg-gray-100 border-0 rounded-[2px]">
                {g}
              </Badge>
            ))}
            {scenario.genre.length > 2 && (
              <span className="text-[10px] text-muted-foreground">+{scenario.genre.length - 2}</span>
            )}
          </div>
        )
      }
    },
    {
      key: 'master_status',
      header: 'マスタ',
      helpText: 'シナリオマスタの承認状態。承認済みのみ一般公開可能',
      width: 'w-16',
      headerClassName: MASTER_HEADER_CLASS,
      render: (scenario) => {
        if (scenario.master_status === 'approved') {
          return <span className="text-[10px] text-green-600">承認済</span>
        }
        return (
          <Badge variant="outline" className="text-[10px] text-yellow-600 border-yellow-300 px-1 py-0">
            未承認
          </Badge>
        )
      }
    },

    // ========== 組織設定の項目（青いヘッダー・青い背景）==========
    {
      key: 'available_stores',
      header: '対応店舗',
      helpText: 'このシナリオを公演できる店舗（組織で設定）。空欄は全店舗対応',
      width: 'w-36',
      headerClassName: ORG_HEADER_CLASS,
      cellClassName: ORG_CELL_CLASS,
      render: (scenario) => {
        const storeIds = scenario.available_stores || []
        // 全店舗数と比較（オフィス・臨時会場を除く通常店舗数）
        const regularStoreCount = Array.from(storeMap.values()).filter(s => 
          s.ownership_type !== 'office' && !s.is_temporary
        ).length
        
        if (storeIds.length === 0 || storeIds.length >= regularStoreCount) {
          return <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">全店舗</span>
        }
        // IDを店舗名に変換
        const storeNames = storeIds.map((id: string) => {
          const store = storeMap.get(id)
          return store?.short_name || store?.name || id
        })
        return (
          <div className="flex flex-wrap gap-0.5">
            {storeNames.map((name: string, i: number) => (
              <span key={i} className="text-[10px] px-1 py-0 bg-purple-50 text-purple-700 rounded-sm border border-purple-200">
                {name}
              </span>
            ))}
          </div>
        )
      }
    },
    {
      key: 'duration',
      header: '時間',
      helpText: 'シナリオのプレイ時間（組織でカスタマイズ可能）',
      width: 'w-16',
      sortable: true,
      headerClassName: ORG_HEADER_CLASS,
      cellClassName: ORG_CELL_CLASS,
      render: (scenario) => (
        <p className="text-sm">
          {scenario.duration}分
        </p>
      )
    },
    {
      key: 'extra_preparation_time',
      header: '準備',
      helpText: '公演前の追加準備時間（スケジュール枠に加算される。組織で設定）',
      width: 'w-14',
      headerClassName: ORG_HEADER_CLASS,
      cellClassName: ORG_CELL_CLASS,
      render: (scenario) => (
        <p className="text-sm">
          {scenario.extra_preparation_time ? `+${scenario.extra_preparation_time}分` : '-'}
        </p>
      )
    },
    {
      key: 'participation_fee',
      header: '参加費',
      helpText: '1人あたりの参加費（税込。組織で設定）',
      width: 'w-20',
      sortable: true,
      headerClassName: ORG_HEADER_CLASS,
      cellClassName: ORG_CELL_CLASS,
      render: (scenario) => (
        <p className="text-sm text-right">
          {scenario.participation_fee != null
            ? `¥${scenario.participation_fee.toLocaleString()}`
            : '-'}
        </p>
      )
    },
    {
      key: 'available_gms',
      header: '担当GM',
      helpText: 'このシナリオを担当できるGM一覧（組織で設定）',
      width: 'w-40',
      headerClassName: ORG_HEADER_CLASS,
      cellClassName: ORG_CELL_CLASS + ' overflow-hidden',
      render: (scenario) => {
        const gms: string[] = scenario.available_gms || []
        const maxDisplay = 4
        
        if (gms.length === 0) {
          return <span className="text-[10px] text-muted-foreground">-</span>
        }
        
        const displayed = gms.slice(0, maxDisplay)
        const remaining = gms.length - maxDisplay
        
        const content = (
          <div className="flex flex-wrap gap-0.5">
            {displayed.map((name: string, i: number) => (
              <span key={i} className="text-[10px] px-1 py-0 bg-blue-50 text-blue-700 rounded-sm border border-blue-200">
                {name}
              </span>
            ))}
            {remaining > 0 && (
              <span className="text-[10px] text-muted-foreground">+{remaining}</span>
            )}
          </div>
        )
        
        if (remaining <= 0) return content
        
        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="cursor-default">{content}</div>
              </TooltipTrigger>
              <TooltipContent className="bg-gray-900 text-white border-gray-900 px-2 py-1.5">
                <div className="flex flex-col gap-0.5">
                  {gms.map((name: string, i: number) => (
                    <span key={i} className="text-xs">{name}</span>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      }
    },
    {
      key: 'experienced_staff',
      header: '体験済',
      helpText: 'このシナリオを体験済みのスタッフ（プレイヤーとして参加済み。組織で設定）',
      width: 'w-40',
      headerClassName: ORG_HEADER_CLASS,
      cellClassName: ORG_CELL_CLASS + ' overflow-hidden',
      render: (scenario) => {
        const staff = scenario.experienced_staff || []
        if (staff.length === 0) {
          return <span className="text-[10px] text-muted-foreground">-</span>
        }
        
        const maxDisplay = 4
        const displayed = staff.slice(0, maxDisplay)
        const remaining = staff.length - maxDisplay
        
        const content = (
          <div className="flex flex-wrap gap-0.5">
            {displayed.map((name: string, i: number) => (
              <span key={i} className="text-[10px] px-1 py-0 bg-green-50 text-green-700 rounded-sm border border-green-200">
                {name}
              </span>
            ))}
            {remaining > 0 && (
              <span className="text-[10px] text-muted-foreground">+{remaining}</span>
            )}
          </div>
        )
        
        if (remaining <= 0) return content
        
        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="cursor-default">{content}</div>
              </TooltipTrigger>
              <TooltipContent className="bg-gray-900 text-white border-gray-900 px-2 py-1.5">
                <div className="flex flex-col gap-0.5">
                  {staff.map((name: string, i: number) => (
                    <span key={i} className="text-xs">{name}</span>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      }
    },
    {
      key: 'license_amount',
      header: 'ライセンス',
      helpText: '1公演あたりのライセンス料（作者への支払い。組織で設定）',
      width: 'w-20',
      headerClassName: ORG_HEADER_CLASS,
      cellClassName: ORG_CELL_CLASS,
      render: (scenario) => {
        const license = scenario.license_amount
        if (license == null || license === 0) {
          return <span className="text-[10px] text-muted-foreground">-</span>
        }
        return (
          <p className="text-sm text-right">
            ¥{license.toLocaleString()}
          </p>
        )
      }
    },
    {
      key: 'play_count',
      header: '公演',
      helpText: 'このシナリオの累計公演回数（組織の実績）',
      width: 'w-14',
      sortable: true,
      headerClassName: ORG_HEADER_CLASS,
      cellClassName: ORG_CELL_CLASS,
      render: (scenario) => {
        const count = scenario.play_count
        if (count == null || count === 0) {
          return <span className="text-[10px] text-muted-foreground">-</span>
        }
        return (
          <p className="text-sm text-center font-medium">
            {count}回
          </p>
        )
      }
    },
    {
      key: 'org_status',
      header: '公開',
      helpText: '公開中: 予約可 / 近日公開: 告知のみ / 非公開: 表示しない（組織で設定）',
      width: 'w-24',
      sortable: true,
      headerClassName: ORG_HEADER_CLASS,
      cellClassName: ORG_CELL_CLASS,
      render: (scenario) => {
        const statusConfig = STATUS_LABELS[scenario.org_status]
        return (
          <select
            value={scenario.org_status}
            onChange={(e) => {
              e.stopPropagation()
              handleStatusChange(scenario, e.target.value)
            }}
            className={`text-xs border rounded px-1 py-0.5 bg-white cursor-pointer ${statusConfig.color}`}
            onClick={(e) => e.stopPropagation()}
          >
            <option value="available">公開中</option>
            <option value="coming_soon">近日公開</option>
            <option value="unavailable">非公開</option>
          </select>
        )
      }
    },
    {
      key: 'actions',
      header: '操作',
      helpText: '編集: 詳細設定を変更 / 解除: 組織からシナリオを削除（マスタは残る）',
      width: 'w-20',
      headerClassName: 'text-center',
      cellClassName: 'text-center',
      render: (scenario) => (
        <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
          {onEdit && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onEdit(scenario.scenario_master_id)
              }}
              title="編集"
            >
              <Edit className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-orange-500 hover:text-orange-700 hover:bg-orange-50"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setScenarioToDelete(scenario)
              setDeleteDialogOpen(true)
            }}
            title="解除"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      )
    }
  ], [onEdit, handleStatusChange, storeMap])

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
      {/* 組織名表示 */}
      {organizationName && (
        <div className="flex items-center gap-2 text-lg font-semibold text-gray-800">
          <span>📍</span>
          <span>{organizationName} のシナリオ</span>
        </div>
      )}

      {/* 凡例 */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 bg-gray-100 border rounded"></span>
          マスタ由来
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 bg-blue-100 border border-blue-200 rounded"></span>
          組織設定
        </span>
      </div>

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

      {/* 統計カード（旧UIと同じ項目） */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
        <Card className="bg-white border shadow-none">
          <CardContent className="p-3 sm:p-4">
            <div className="text-xs text-muted-foreground">総シナリオ数</div>
            <div className="text-xl sm:text-2xl font-bold">
              {stats.totalScenarios}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border shadow-none">
          <CardContent className="p-3 sm:p-4">
            <div className="text-xs text-muted-foreground">利用可能</div>
            <div className="text-xl sm:text-2xl font-bold text-green-700">
              {stats.availableScenarios}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border shadow-none">
          <CardContent className="p-3 sm:p-4">
            <div className="text-xs text-muted-foreground">平均公演回数</div>
            <div className="text-xl sm:text-2xl font-bold">
              {stats.avgPlayCount.toFixed(1)}回
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              中央値: {stats.medianPlayCount.toFixed(1)}回
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border shadow-none">
          <CardContent className="p-3 sm:p-4">
            <div className="text-xs text-muted-foreground">平均プレイヤー数</div>
            <div className="text-xl sm:text-2xl font-bold">
              {stats.avgPlayers}名
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 検索・フィルター・アクション */}
      <div className="space-y-3">
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
            <Button variant="outline" size="sm" onClick={() => fetchScenarios(true)}>
              <RefreshCw className="w-4 h-4 mr-1" />
              更新
            </Button>
            <Button size="sm" onClick={() => setAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              マスタから追加
            </Button>
          </div>
        </div>

        {/* 追加フィルター */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          
          {/* 担当GM */}
          <Select value={gmFilter} onValueChange={setGmFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="担当GM" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">担当GM: 全て</SelectItem>
              <SelectItem value="none">担当なし</SelectItem>
              {gmNames.map(name => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 体験済みスタッフ */}
          <Select value={experiencedFilter} onValueChange={setExperiencedFilter}>
            <SelectTrigger className="w-[150px] h-8 text-xs">
              <SelectValue placeholder="体験済み" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">体験済み: 全て</SelectItem>
              <SelectItem value="none">体験済みなし</SelectItem>
              {experiencedStaffNames.map(name => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 人数 */}
          <Select value={playerCountFilter} onValueChange={setPlayerCountFilter}>
            <SelectTrigger className="w-[100px] h-8 text-xs">
              <SelectValue placeholder="人数" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">人数: 全て</SelectItem>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                <SelectItem key={n} value={String(n)}>{n}名可</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 所要時間 */}
          <Select value={durationFilter} onValueChange={setDurationFilter}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue placeholder="時間" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">時間: 全て</SelectItem>
              <SelectItem value="60">60分以内</SelectItem>
              <SelectItem value="90">90分以内</SelectItem>
              <SelectItem value="120">120分以内</SelectItem>
              <SelectItem value="150">150分以内</SelectItem>
              <SelectItem value="180">180分以内</SelectItem>
              <SelectItem value="240">240分以内</SelectItem>
              <SelectItem value="300">300分以内</SelectItem>
              <SelectItem value="360">360分以内</SelectItem>
              <SelectItem value="480">480分以内</SelectItem>
              <SelectItem value="600">600分以内</SelectItem>
            </SelectContent>
          </Select>

          {/* フィルタリセット */}
          {(gmFilter !== 'all' || experiencedFilter !== 'all' || playerCountFilter !== 'all' || durationFilter !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-muted-foreground"
              onClick={() => {
                setGmFilter('all')
                setExperiencedFilter('all')
                setPlayerCountFilter('all')
                setDurationFilter('all')
              }}
            >
              <X className="w-3 h-3 mr-1" />
              リセット
            </Button>
          )}
        </div>
      </div>

      {/* シナリオ一覧 */}
      {filteredScenarios.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border">
          <p className="text-gray-500 mb-4">
            {searchTerm || statusFilter !== 'all' || gmFilter !== 'all' || experiencedFilter !== 'all' || playerCountFilter !== 'all' || durationFilter !== 'all'
              ? '検索条件に一致するシナリオがありません'
              : 'シナリオがありません'}
          </p>
          {!searchTerm && statusFilter === 'all' && gmFilter === 'all' && experiencedFilter === 'all' && playerCountFilter === 'all' && durationFilter === 'all' && (
            <Button onClick={() => setAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              マスタからシナリオを追加
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* PC用: テーブル形式 */}
          <div className="hidden md:block bg-white border rounded-lg overflow-hidden">
            <TanStackDataTable
              data={filteredScenarios}
              columns={tableColumns}
              getRowKey={(scenario) => scenario.id}
              sortState={sortState}
              onSort={setSortState}
              enableColumnReorder={true}
              columnOrderKey="org-scenario-list"
              emptyMessage={
                searchTerm || statusFilter !== 'all' || gmFilter !== 'all' || experiencedFilter !== 'all' || playerCountFilter !== 'all' || durationFilter !== 'all'
                  ? '検索条件に一致するシナリオが見つかりません' 
                  : 'シナリオが登録されていません'
              }
              loading={loading}
            />
          </div>

          {/* モバイル用: リスト形式 */}
          <div className="md:hidden space-y-2">
            {filteredScenarios.map((scenario) => {
              const statusConfig = STATUS_LABELS[scenario.org_status]
              const gms = scenario.available_gms || []
              return (
                <div
                  key={scenario.id}
                  className="bg-white border rounded-lg overflow-hidden"
                  onClick={() => onEdit?.(scenario.scenario_master_id)}
                >
                  <div className="p-3 flex items-start gap-3">
                    {/* 画像サムネイル */}
                    <div className="flex-shrink-0 w-14 h-14 bg-gray-100 rounded-md overflow-hidden border">
                      {scenario.key_visual_url ? (
                        <img src={scenario.key_visual_url} alt={scenario.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                          <span className="text-[10px]">No img</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <h3 className="font-bold text-sm truncate pr-2">{scenario.title}</h3>
                        <Badge className={`shrink-0 text-[10px] px-1.5 py-0 ${statusConfig.color}`}>
                          {statusConfig.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-500 truncate mb-1">作: {scenario.author || '不明'}</p>
                      
                      {/* マスタ由来情報 */}
                      <div className="flex items-center gap-3 text-xs text-gray-500 mb-1">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {scenario.duration}分
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {scenario.player_count_min === scenario.player_count_max
                            ? `${scenario.player_count_min}人`
                            : `${scenario.player_count_min}〜${scenario.player_count_max}人`}
                        </span>
                      </div>
                      
                      {/* 組織設定情報（青背景で区別） */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {scenario.participation_fee != null && (
                          <span className="text-[10px] px-1 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200">
                            ¥{scenario.participation_fee.toLocaleString()}
                          </span>
                        )}
                        {gms.length > 0 && (
                          <span className="text-[10px] px-1 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200">
                            GM: {gms.length}名
                          </span>
                        )}
                        {scenario.extra_preparation_time && scenario.extra_preparation_time > 0 && (
                          <span className="text-[10px] px-1 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200">
                            準備+{scenario.extra_preparation_time}分
                          </span>
                        )}
                      </div>
                    </div>

                    {/* アクション */}
                    <div className="flex flex-col gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-orange-500 hover:text-orange-700 hover:bg-orange-50"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setScenarioToDelete(scenario)
                          setDeleteDialogOpen(true)
                        }}
                        title="解除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* マスタ追加ダイアログ */}
      <AddFromMasterDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onAdded={fetchScenarios}
        existingMasterIds={existingMasterIds}
      />

      {/* 解除確認ダイアログ */}
      <ConfirmModal
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleUnlink}
        title="シナリオを解除"
        message={scenarioToDelete ? `「${scenarioToDelete.title}」を${organizationName || 'この組織'}から解除します。\nマスタデータは残るので、後から再度追加できます。` : ''}
        variant="danger"
        confirmLabel="解除する"
      />
    </div>
  )
}
