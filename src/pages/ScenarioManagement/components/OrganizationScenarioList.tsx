/**
 * 組織シナリオ一覧（マスタ連携版）
 * @purpose organization_scenarios_with_master ビューを使用した一覧表示
 * @design 旧UIと同じテーブル形式で表示
 *         - マスタ由来の項目: 通常ヘッダー（グレー）
 *         - 組織設定の項目: 色付きヘッダー（青）
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { toast } from 'sonner'
import {
  Search, Plus, Edit, Trash2, Clock, Users, JapaneseYen,
  AlertTriangle, Filter, X, Send, CheckCircle, XCircle, Loader2
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
import { scenarioMasterApi } from '@/lib/api/scenarioMasterApi'
import { ConfirmDialog } from '@/components/patterns/modal'
import { TanStackDataTable, ColumnSettingsPanel } from '@/components/patterns/table'
import type { Column } from '@/components/patterns/table'
import { useTablePreferences } from '@/hooks/useTablePreferences'
import { useOrganization } from '@/hooks/useOrganization'
import { useQueryClient } from '@tanstack/react-query'
import {
  gmScenarioBadgeClassNames,
} from '@/lib/gmScenarioMode'
import {
  useOrganizationScenariosQuery,
  orgScenariosKeys,
  type OrganizationScenarioWithMaster,
  type StoreInfo,
  type OrgScenariosData,
} from '../hooks/useOrganizationScenariosQuery'

const STATUS_LABELS = {
  available: { label: '公開中', color: 'bg-green-100 text-green-700' },
  unavailable: { label: '非公開', color: 'bg-gray-100 text-gray-600' },
  coming_soon: { label: '近日公開', color: 'bg-yellow-100 text-yellow-700' }
}

interface OrganizationScenarioListProps {
  onEdit?: (scenarioId: string) => void
  canEdit?: boolean
}

// ヘッダー・セルスタイル: マスタ由来（通常）vs 組織設定（青）
const MASTER_HEADER_CLASS = ''
const ORG_HEADER_CLASS = '!bg-blue-100'
const ORG_CELL_CLASS = '!bg-blue-50/50'

export function OrganizationScenarioList({ onEdit, canEdit = true }: OrganizationScenarioListProps) {
  const { organizationId } = useOrganization()
  const queryClient = useQueryClient()
  const { data, isLoading, error: queryError } = useOrganizationScenariosQuery(organizationId)

  const scenarios = data?.scenarios ?? []
  const storeMap = data?.storeMap ?? new Map<string, StoreInfo>()

  const error = queryError ? (queryError as Error).message : null

  // フィルタ・ソート状態
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortState, setSortState] = useState<{ field: string; direction: 'asc' | 'desc' } | undefined>({ field: 'title', direction: 'asc' })
  const [gmFilter, setGmFilter] = useState<string>('all')
  const [experiencedFilter, setExperiencedFilter] = useState<string>('all')
  const [playerCountFilter, setPlayerCountFilter] = useState<string>('all')
  const [durationFilter, setDurationFilter] = useState<string>('all')

  // MMQへの申請中マスタID
  const [submittingMasterId, setSubmittingMasterId] = useState<string | null>(null)

  // MMQプラットフォームへ申請（draft → pending）
  const handleSubmitToMMQ = useCallback(async (scenario: OrganizationScenarioWithMaster) => {
    if (!scenario.scenario_master_id) return
    setSubmittingMasterId(scenario.scenario_master_id)
    try {
      await scenarioMasterApi.publish(scenario.scenario_master_id)
      toast.success(`「${scenario.title}」をMMQに申請しました。審査後に掲載されます。`)
      queryClient.invalidateQueries({ queryKey: ['org-scenarios', 'list'] })
    } catch (err) {
      toast.error('申請に失敗しました。時間をおいて再試行してください。')
    } finally {
      setSubmittingMasterId(null)
    }
  }, [queryClient])

  // マスタ追加ダイアログ
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  // 解除確認
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [scenarioToDelete, setScenarioToDelete] = useState<OrganizationScenarioWithMaster | null>(null)

  const invalidateScenarios = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['org-scenarios', 'list'] })
  }, [queryClient])

  // scenario-data-updated イベントで再取得
  useEffect(() => {
    window.addEventListener('scenario-data-updated', invalidateScenarios)
    return () => window.removeEventListener('scenario-data-updated', invalidateScenarios)
  }, [invalidateScenarios])

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

  const filteredScenarios = useMemo(() => {
    let result = scenarios.filter(s => {
      const matchesSearch = !searchTerm ||
        s.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.author && s.author.toLowerCase().includes(searchTerm.toLowerCase()))
      const matchesStatus = statusFilter === 'all' || s.org_status === statusFilter
      const matchesGm = gmFilter === 'all' ||
        (gmFilter === 'none' ? (s.available_gms || []).length === 0 : (s.available_gms || []).includes(gmFilter))
      const matchesExperienced = experiencedFilter === 'all' ||
        (experiencedFilter === 'none' ? (s.experienced_staff || []).length === 0 : (s.experienced_staff || []).includes(experiencedFilter))

      let matchesPlayerCount = true
      if (playerCountFilter !== 'all') {
        const count = parseInt(playerCountFilter)
        matchesPlayerCount = s.player_count_min <= count && s.player_count_max >= count
      }

      let matchesDuration = true
      if (durationFilter !== 'all') {
        const maxDuration = parseInt(durationFilter)
        matchesDuration = s.duration <= maxDuration
      }

      return matchesSearch && matchesStatus && matchesGm && matchesExperienced && matchesPlayerCount && matchesDuration
    })

    if (sortState) {
      result = [...result].sort((a, b) => {
        let aVal: any
        let bVal: any
        switch (sortState.field) {
          case 'title': aVal = a.title; bVal = b.title; break
          case 'author': aVal = a.author || ''; bVal = b.author || ''; break
          case 'duration': aVal = a.duration; bVal = b.duration; break
          case 'player_count':
          case 'player_count_min': aVal = a.player_count_min; bVal = b.player_count_min; break
          case 'player_count_max': aVal = a.player_count_max; bVal = b.player_count_max; break
          case 'participation_fee': aVal = a.participation_fee || 0; bVal = b.participation_fee || 0; break
          case 'org_status': aVal = a.org_status; bVal = b.org_status; break
          case 'available_gms':
            aVal = Array.isArray(a.available_gms) ? a.available_gms.length : 0
            bVal = Array.isArray(b.available_gms) ? b.available_gms.length : 0
            break
          case 'experienced_staff':
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

  const existingMasterIds = useMemo(() => scenarios.map(s => s.scenario_master_id), [scenarios])

  // シナリオ解除
  const handleUnlink = async () => {
    if (!scenarioToDelete || !organizationId) return
    const queryKey = orgScenariosKeys.list(organizationId)

    try {
      const { data, error } = await supabase.rpc('delete_org_scenario', {
        p_scenario_id: scenarioToDelete.org_scenario_id
      })

      if (error) {
        logger.error('Failed to unlink scenario:', error)
        toast.error(`解除に失敗しました: ${error.message}`)
        return
      }

      if (!data?.success) {
        logger.error('Delete failed:', data)
        toast.error(data?.error || '解除に失敗しました')
        return
      }

      toast.success(`「${scenarioToDelete.title}」を解除しました`)
      queryClient.setQueryData<OrgScenariosData>(queryKey, old => {
        if (!old) return old
        return { ...old, scenarios: old.scenarios.filter(s => s.id !== scenarioToDelete!.id) }
      })
      setDeleteDialogOpen(false)
      setScenarioToDelete(null)
    } catch (err) {
      logger.error('Error unlinking scenario:', err)
      toast.error('エラーが発生しました')
    }
  }

  const tableColumns: Column<OrganizationScenarioWithMaster>[] = useMemo(() => [
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
              <img src={scenario.key_visual_url} alt={scenario.title} className="w-full h-full object-cover" />
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
      required: true,
      headerClassName: MASTER_HEADER_CLASS,
      render: (scenario) => (
        canEdit ? (
          <button
            onClick={() => onEdit?.(scenario.scenario_master_id)}
            className="text-sm truncate text-left hover:text-blue-600 hover:underline w-full"
            title={scenario.title}
          >
            {scenario.title}
          </button>
        ) : (
          <span className="text-sm truncate block w-full" title={scenario.title}>
            {scenario.title}
          </span>
        )
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
        <p className="text-sm truncate" title={scenario.author || ''}>{scenario.author || '-'}</p>
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
        if (!scenario.genre || scenario.genre.length === 0) return <span className="text-xs text-muted-foreground">-</span>
        return (
          <div className="flex flex-wrap gap-0.5">
            {scenario.genre.slice(0, 2).map((g, i) => (
              <Badge key={i} variant="secondary" className="font-normal text-[10px] px-1 py-0 bg-gray-100 border-0 rounded-[2px]">{g}</Badge>
            ))}
            {scenario.genre.length > 2 && <span className="text-[10px] text-muted-foreground">+{scenario.genre.length - 2}</span>}
          </div>
        )
      }
    },
    {
      key: 'master_status',
      header: 'MMQ掲載',
      helpText: 'MMQプラットフォームへの掲載状態。承認済みのみ全体検索に表示されます',
      width: 'w-24',
      headerClassName: MASTER_HEADER_CLASS,
      render: (scenario) => {
        if (scenario.master_status === 'approved') {
          return (
            <span className="flex items-center gap-0.5 text-[10px] text-green-600">
              <CheckCircle className="h-3 w-3" />掲載中
            </span>
          )
        }
        if (scenario.master_status === 'pending') {
          return (
            <Badge variant="outline" className="text-[10px] text-yellow-600 border-yellow-300 px-1 py-0">
              審査中
            </Badge>
          )
        }
        if (scenario.master_status === 'rejected') {
          return (
            <span className="flex items-center gap-0.5 text-[10px] text-red-500">
              <XCircle className="h-3 w-3" />却下
            </span>
          )
        }
        // draft: 申請ボタン（canEdit 時のみ）
        if (canEdit) {
          const isSubmitting = submittingMasterId === scenario.scenario_master_id
          return (
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-5 px-1.5 text-[10px] text-blue-600 border-blue-300 hover:bg-blue-50"
                    onClick={(e) => { e.stopPropagation(); handleSubmitToMMQ(scenario) }}
                    disabled={isSubmitting}
                  >
                    {isSubmitting
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <><Send className="h-3 w-3 mr-0.5" />申請</>
                    }
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left" className="text-xs max-w-[200px]">
                  MMQプラットフォームに掲載申請します。承認後、全体検索に表示されます。
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        }
        return <Badge variant="outline" className="text-[10px] text-gray-400 border-gray-200 px-1 py-0">未申請</Badge>
      }
    },
    {
      key: 'available_stores',
      header: '対応店舗',
      helpText: 'このシナリオを公演できる店舗（組織で設定）。空欄は全店舗対応',
      width: 'w-36',
      headerClassName: ORG_HEADER_CLASS,
      cellClassName: ORG_CELL_CLASS,
      render: (scenario) => {
        const storeIds = scenario.available_stores || []
        const regularStoreCount = Array.from(storeMap.values()).filter(s =>
          s.ownership_type !== 'office' && !s.is_temporary
        ).length
        if (storeIds.length === 0 || storeIds.length >= regularStoreCount) {
          return <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">全店舗</span>
        }
        const storeNames = storeIds.map((id: string) => {
          const store = storeMap.get(id)
          return store?.short_name || store?.name || id
        })
        return (
          <div className="flex flex-wrap gap-0.5">
            {storeNames.map((name: string, i: number) => (
              <span key={i} className="text-[10px] px-1 py-0 bg-purple-50 text-purple-700 rounded-sm border border-purple-200">{name}</span>
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
      render: (scenario) => <p className="text-sm">{scenario.duration}分</p>
    },
    {
      key: 'extra_preparation_time',
      header: '準備',
      helpText: '公演前の追加準備時間（スケジュール枠に加算される。組織で設定）',
      width: 'w-14',
      headerClassName: ORG_HEADER_CLASS,
      cellClassName: ORG_CELL_CLASS,
      render: (scenario) => <p className="text-sm">{scenario.extra_preparation_time ? `+${scenario.extra_preparation_time}分` : '-'}</p>
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
          {scenario.participation_fee != null ? `¥${scenario.participation_fee.toLocaleString()}` : '-'}
        </p>
      )
    },
    {
      key: 'available_gms',
      header: '担当GM',
      helpText: 'メインGM可＝青、メイン・サブ両方＝紫、サブのみ＝水色。サブのみのスタッフは「サブ＋名前」表示（組織で設定）',
      width: 'w-40',
      headerClassName: ORG_HEADER_CLASS,
      cellClassName: ORG_CELL_CLASS + ' overflow-hidden',
      render: (scenario) => {
        const badges = scenario.gm_list_badges
        const fallbackNames: string[] = scenario.available_gms || []
        const maxDisplay = 4

        type CellItem = { key: string; label: string; badgeClass: string }
        let items: CellItem[] = []
        if (badges && badges.length > 0) {
          items = badges.map((b, i) => ({ key: `${b.name}-${b.mode}-${i}`, label: b.displayLabel, badgeClass: gmScenarioBadgeClassNames(b.mode) }))
        } else if (fallbackNames.length > 0) {
          items = fallbackNames.map((name, i) => ({ key: `fb-${name}-${i}`, label: name, badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' }))
        }

        if (items.length === 0) return <span className="text-[10px] text-muted-foreground">-</span>

        const displayed = items.slice(0, maxDisplay)
        const remaining = items.length - maxDisplay

        const content = (
          <div className="flex flex-wrap gap-0.5">
            {displayed.map(item => (
              <span key={item.key} className={`text-[10px] px-1 py-0 rounded-sm border ${item.badgeClass}`}>{item.label}</span>
            ))}
            {remaining > 0 && <span className="text-[10px] text-muted-foreground">+{remaining}</span>}
          </div>
        )

        if (remaining <= 0) return content
        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild><div className="cursor-default">{content}</div></TooltipTrigger>
              <TooltipContent className="bg-gray-900 text-white border-gray-900 px-2 py-1.5">
                <div className="flex flex-col gap-0.5">
                  {items.map(item => <span key={item.key} className="text-xs">{item.label}</span>)}
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
        if (staff.length === 0) return <span className="text-[10px] text-muted-foreground">-</span>
        const maxDisplay = 4
        const displayed = staff.slice(0, maxDisplay)
        const remaining = staff.length - maxDisplay
        const content = (
          <div className="flex flex-wrap gap-0.5">
            {displayed.map((name: string, i: number) => (
              <span key={i} className="text-[10px] px-1 py-0 bg-green-50 text-green-700 rounded-sm border border-green-200">{name}</span>
            ))}
            {remaining > 0 && <span className="text-[10px] text-muted-foreground">+{remaining}</span>}
          </div>
        )
        if (remaining <= 0) return content
        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild><div className="cursor-default">{content}</div></TooltipTrigger>
              <TooltipContent className="bg-gray-900 text-white border-gray-900 px-2 py-1.5">
                <div className="flex flex-col gap-0.5">
                  {staff.map((name: string, i: number) => <span key={i} className="text-xs">{name}</span>)}
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
        if (license == null || license === 0) return <span className="text-[10px] text-muted-foreground">-</span>
        return <p className="text-sm text-right">¥{license.toLocaleString()}</p>
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
        if (count == null || count === 0) return <span className="text-[10px] text-muted-foreground">-</span>
        return <p className="text-sm text-center font-medium">{count}回</p>
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
        return <Badge className={`text-[10px] px-1.5 py-0 ${statusConfig.color}`}>{statusConfig.label}</Badge>
      }
    },
    {
      key: 'actions',
      header: '操作',
      helpText: '編集: 詳細設定を変更 / 解除: 組織からシナリオを削除（マスタは残る）',
      width: 'w-20',
      headerClassName: 'text-center',
      cellClassName: 'text-center',
      render: (scenario) =>
        canEdit ? (
          <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
            {onEdit && (
              <Button
                variant="ghost" size="sm" className="h-7 w-7 p-0"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(scenario.scenario_master_id) }}
                title="編集"
              >
                <Edit className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button
              variant="ghost" size="sm" className="h-7 w-7 p-0 text-orange-500 hover:text-orange-700 hover:bg-orange-50"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setScenarioToDelete(scenario); setDeleteDialogOpen(true) }}
              title="解除"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        )
    }
  ], [canEdit, onEdit, storeMap, submittingMasterId, handleSubmitToMMQ])

  const defaultOrgColumnKeys = useMemo(() => tableColumns.map(c => c.key), [tableColumns])
  const [orgColumnPrefs, setOrgColumnPrefs] = useTablePreferences('org-scenario-list', defaultOrgColumnKeys)

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex gap-2 flex-wrap">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-muted/50 px-4 py-2 flex gap-3">
            {[48, 120, 80, 60, 60, 80, 60].map((w, i) => (
              <Skeleton key={i} className="h-3" style={{ width: w }} />
            ))}
            <Skeleton className="h-3 flex-1" />
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="px-4 py-3 border-t flex gap-3 items-center">
              <Skeleton className="h-10 w-10 rounded shrink-0" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-20 hidden md:block" />
              <Skeleton className="h-4 w-16 hidden md:block" />
              <Skeleton className="h-5 w-14 rounded-full hidden md:block" />
              <Skeleton className="h-4 flex-1 hidden md:block" />
              <Skeleton className="h-8 w-16 ml-auto" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
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

      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
          <div className="flex items-center gap-2 flex-1">
            <span className="hidden sm:flex items-center text-xs text-muted-foreground flex-shrink-0 whitespace-nowrap">
              {filteredScenarios.length}件
            </span>
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
              {(['all', 'available', 'coming_soon', 'unavailable'] as const).map((status) => (
                <Button
                  key={status}
                  variant={statusFilter === status ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter(status)}
                  className="text-xs"
                >
                  {status === 'all' ? '全て' : STATUS_LABELS[status]?.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />

          <Select value={gmFilter} onValueChange={setGmFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="担当GM" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">担当GM: 全て</SelectItem>
              <SelectItem value="none">担当なし</SelectItem>
              {gmNames.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={experiencedFilter} onValueChange={setExperiencedFilter}>
            <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue placeholder="体験済み" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">体験済み: 全て</SelectItem>
              <SelectItem value="none">体験済みなし</SelectItem>
              {experiencedStaffNames.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={playerCountFilter} onValueChange={setPlayerCountFilter}>
            <SelectTrigger className="w-[100px] h-8 text-xs"><SelectValue placeholder="人数" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">人数: 全て</SelectItem>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <SelectItem key={n} value={String(n)}>{n}名可</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={durationFilter} onValueChange={setDurationFilter}>
            <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue placeholder="時間" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">時間: 全て</SelectItem>
              {[60, 90, 120, 150, 180, 240, 300, 360, 480, 600].map(m => (
                <SelectItem key={m} value={String(m)}>{m}分以内</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(gmFilter !== 'all' || experiencedFilter !== 'all' || playerCountFilter !== 'all' || durationFilter !== 'all') && (
            <Button
              variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground"
              onClick={() => { setGmFilter('all'); setExperiencedFilter('all'); setPlayerCountFilter('all'); setDurationFilter('all') }}
            >
              <X className="w-3 h-3 mr-1" />
              リセット
            </Button>
          )}

          <div className="hidden md:block ml-auto">
            <ColumnSettingsPanel
              columns={tableColumns}
              preferences={orgColumnPrefs}
              onPreferencesChange={setOrgColumnPrefs}
              defaultColumnKeys={defaultOrgColumnKeys}
            />
          </div>
        </div>
      </div>

      {filteredScenarios.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border">
          <p className="text-gray-500 mb-4">
            {searchTerm || statusFilter !== 'all' || gmFilter !== 'all' || experiencedFilter !== 'all' || playerCountFilter !== 'all' || durationFilter !== 'all'
              ? '検索条件に一致するシナリオがありません'
              : 'シナリオがありません'}
          </p>
          {canEdit && !searchTerm && statusFilter === 'all' && gmFilter === 'all' && experiencedFilter === 'all' && playerCountFilter === 'all' && durationFilter === 'all' && (
            <Button onClick={() => setAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              マスタからシナリオを追加
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="hidden md:block">
            <div className="bg-white border rounded-lg overflow-hidden">
              <TanStackDataTable
                data={filteredScenarios}
                columns={tableColumns}
                getRowKey={(scenario) => scenario.id}
                sortState={sortState}
                onSort={setSortState}
                columnPreferences={orgColumnPrefs}
                emptyMessage={
                  searchTerm || statusFilter !== 'all' || gmFilter !== 'all' || experiencedFilter !== 'all' || playerCountFilter !== 'all' || durationFilter !== 'all'
                    ? '検索条件に一致するシナリオが見つかりません'
                    : 'シナリオが登録されていません'
                }
                loading={isLoading}
              />
            </div>
          </div>

          <div className="md:hidden space-y-2">
            {filteredScenarios.map((scenario) => {
              const statusConfig = STATUS_LABELS[scenario.org_status]
              const gmBadges = scenario.gm_list_badges
              const gmFallbackNames: string[] = scenario.available_gms || []
              type GmCardItem = { key: string; label: string; badgeClass: string }
              let gmItems: GmCardItem[] = []
              if (gmBadges && gmBadges.length > 0) {
                gmItems = gmBadges.map((b, i) => ({ key: `${b.name}-${b.mode}-${i}`, label: b.displayLabel, badgeClass: gmScenarioBadgeClassNames(b.mode) }))
              } else if (gmFallbackNames.length > 0) {
                gmItems = gmFallbackNames.map((name, i) => ({ key: `fb-${name}-${i}`, label: name, badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' }))
              }
              return (
                <div
                  key={scenario.id}
                  className="bg-white border rounded-lg overflow-hidden"
                  onClick={canEdit ? () => onEdit?.(scenario.scenario_master_id) : undefined}
                >
                  <div className="p-3 flex items-start gap-3">
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
                        <Badge className={`shrink-0 text-[10px] px-1.5 py-0 ${statusConfig.color}`}>{statusConfig.label}</Badge>
                      </div>
                      <p className="text-xs text-gray-500 truncate mb-1">作: {scenario.author || '不明'}</p>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mb-1">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{scenario.duration}分</span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {scenario.player_count_min === scenario.player_count_max
                            ? `${scenario.player_count_min}人`
                            : `${scenario.player_count_min}〜${scenario.player_count_max}人`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {scenario.participation_fee != null && (
                          <span className="text-[10px] px-1 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200">
                            <JapaneseYen className="w-2.5 h-2.5 inline" />{scenario.participation_fee.toLocaleString()}
                          </span>
                        )}
                        {scenario.extra_preparation_time && scenario.extra_preparation_time > 0 && (
                          <span className="text-[10px] px-1 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200">
                            準備+{scenario.extra_preparation_time}分
                          </span>
                        )}
                      </div>
                    </div>
                    {canEdit && (
                      <div className="flex flex-col gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost" size="sm" className="h-7 w-7 p-0 text-orange-500 hover:text-orange-700 hover:bg-orange-50"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setScenarioToDelete(scenario); setDeleteDialogOpen(true) }}
                          title="解除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {(gmItems.length > 0 || (scenario.experienced_staff || []).length > 0) && (
                    <div className="px-3 pb-3 space-y-1">
                      {gmItems.length > 0 && (
                        <div className="flex items-start gap-2 text-xs">
                          <span className="text-blue-600 shrink-0 w-10">GM可</span>
                          <Popover>
                            <PopoverTrigger asChild>
                              <div className="flex flex-wrap gap-1 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                                {gmItems.map(item => (
                                  <Badge key={item.key} variant="outline" className={`text-xs font-normal py-0.5 px-1.5 ${item.badgeClass}`}>{item.label}</Badge>
                                ))}
                              </div>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto max-w-[280px] p-3" align="start" onClick={(e) => e.stopPropagation()}>
                              <div className="text-xs font-medium mb-2">担当GM（{gmItems.length}名）</div>
                              <div className="flex flex-wrap gap-1">
                                {gmItems.map(item => (
                                  <Badge key={item.key} variant="outline" className={`text-xs font-normal py-0.5 px-1.5 ${item.badgeClass}`}>{item.label}</Badge>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                      )}
                      {(scenario.experienced_staff || []).length > 0 && (
                        <div className="flex items-start gap-2 text-xs">
                          <span className="text-green-600 shrink-0 w-10">体験</span>
                          <Popover>
                            <PopoverTrigger asChild>
                              <div className="flex flex-wrap gap-1 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                                {(scenario.experienced_staff || []).map((name, idx) => (
                                  <Badge key={idx} variant="outline" className="text-xs font-normal py-0.5 px-1.5 bg-green-50 border-green-200 text-green-700">{name}</Badge>
                                ))}
                              </div>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto max-w-[280px] p-3" align="start" onClick={(e) => e.stopPropagation()}>
                              <div className="text-xs font-medium mb-2">体験済み（{(scenario.experienced_staff || []).length}名）</div>
                              <div className="flex flex-wrap gap-1">
                                {(scenario.experienced_staff || []).map((name, idx) => (
                                  <Badge key={idx} variant="outline" className="text-xs font-normal py-0.5 px-1.5 bg-green-50 border-green-200 text-green-700">{name}</Badge>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      <AddFromMasterDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onAdded={invalidateScenarios}
        existingMasterIds={existingMasterIds}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleUnlink}
        title="シナリオを解除しますか？"
        message={scenarioToDelete ? `「${scenarioToDelete.title}」をこの組織から解除します。\nマスタデータは残るので、後から再度追加できます。` : ''}
        variant="destructive"
        confirmLabel="解除する"
      />
    </div>
  )
}
