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
import { useOrganization, checkIsLicenseAdmin } from '@/hooks/useOrganization'
import { logger } from '@/utils/logger'
import { ScenarioMasterEditDialog } from '@/components/modals/ScenarioMasterEditDialog'
import {
  Search, Plus, Edit, CheckCircle, XCircle, Clock, FileText, Users,
  AlertTriangle, Shield, Filter, X, Download
} from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { devDb } from '@/components/ui/DevField'
import { TanStackDataTable, ColumnSettingsPanel } from '@/components/patterns/table'
import type { Column } from '@/components/patterns/table'
import { useTablePreferences } from '@/hooks/useTablePreferences'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { ChevronDown } from 'lucide-react'

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
  submitted_by_organization_id: string | null
  submitted_by_organization_name?: string | null
  organization_count?: number
  using_organizations?: { id: string; name: string }[]
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
  const [genreFilter, setGenreFilter] = useState<string>('all')
  const [authorFilter, setAuthorFilter] = useState<string>('all')
  const [orgUsageFilter, setOrgUsageFilter] = useState<string>('all') // all / used / unused
  const [playerCountFilter, setPlayerCountFilter] = useState<string>('all')
  const [durationFilter, setDurationFilter] = useState<string>('all')
  const [sortState, setSortState] = useState<{ field: string; direction: 'asc' | 'desc' } | undefined>({ field: 'updated_at', direction: 'desc' })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // 編集ダイアログ
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingMasterId, setEditingMasterId] = useState<string | null>(null)

  const { organizationId } = useOrganization()
  const isLicenseAdmin = checkIsLicenseAdmin(user?.role, organizationId)

  const fetchMasters = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase
        .from('scenario_masters')
        .select('id, title, author, author_id, key_visual_url, description, player_count_min, player_count_max, official_duration, genre, difficulty, synopsis, caution, required_items, master_status, submitted_by_organization_id, approved_by, approved_at, rejection_reason, created_at, updated_at, created_by')
        .order('updated_at', { ascending: false })

      if (fetchError) {
        logger.error('Failed to fetch scenario masters:', fetchError)
        setError('シナリオマスタの取得に失敗しました')
        return
      }

      const masterIds = (data || []).map(m => m.id)

      // 利用組織を一括取得（master_id ごとに groupBy）
      const { data: orgScenarios } = await supabase
        .from('organization_scenarios')
        .select('scenario_master_id, organization:organizations(id, name)')
        .in('scenario_master_id', masterIds)

      const usingOrgsByMaster = new Map<string, { id: string; name: string }[]>()
      ;(orgScenarios || []).forEach((row: { scenario_master_id: string; organization: { id: string; name: string } | { id: string; name: string }[] | null }) => {
        const org = Array.isArray(row.organization) ? row.organization[0] : row.organization
        if (!org) return
        const list = usingOrgsByMaster.get(row.scenario_master_id) || []
        if (!list.some(o => o.id === org.id)) list.push({ id: org.id, name: org.name })
        usingOrgsByMaster.set(row.scenario_master_id, list)
      })

      // 申請組織を一括取得（submitted_by_organization_id の集合）
      const submitterIds = Array.from(new Set((data || []).map(m => m.submitted_by_organization_id).filter((v): v is string => !!v)))
      let submitterMap = new Map<string, string>()
      if (submitterIds.length > 0) {
        const { data: orgs } = await supabase
          .from('organizations')
          .select('id, name')
          .in('id', submitterIds)
        ;(orgs || []).forEach(o => submitterMap.set(o.id, o.name))
      }

      const mastersWithMeta = (data || []).map(master => {
        const usingOrgs = usingOrgsByMaster.get(master.id) || []
        return {
          ...master,
          submitted_by_organization_name: master.submitted_by_organization_id
            ? submitterMap.get(master.submitted_by_organization_id) || null
            : null,
          using_organizations: usingOrgs,
          organization_count: usingOrgs.length,
        }
      })

      setMasters(mastersWithMeta)
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
      const matchesGenre = genreFilter === 'all' || (m.genre || []).includes(genreFilter)
      const matchesAuthor = authorFilter === 'all' || m.author === authorFilter
      const matchesOrgUsage =
        orgUsageFilter === 'all' ||
        (orgUsageFilter === 'used' && (m.organization_count || 0) > 0) ||
        (orgUsageFilter === 'unused' && (m.organization_count || 0) === 0)
      const matchesPlayers = playerCountFilter === 'all' || (
        m.player_count_min <= parseInt(playerCountFilter) && parseInt(playerCountFilter) <= m.player_count_max
      )
      const matchesDuration = durationFilter === 'all' || m.official_duration <= parseInt(durationFilter)
      return matchesSearch && matchesStatus && matchesGenre && matchesAuthor && matchesOrgUsage && matchesPlayers && matchesDuration
    })
  }, [masters, searchTerm, statusFilter, genreFilter, authorFilter, orgUsageFilter, playerCountFilter, durationFilter])

  // フィルタオプション用の一覧
  const allGenres = useMemo(() => {
    const set = new Set<string>()
    masters.forEach(m => (m.genre || []).forEach(g => set.add(g)))
    return Array.from(set).sort()
  }, [masters])

  const allAuthors = useMemo(() => {
    const set = new Set<string>()
    masters.forEach(m => { if (m.author) set.add(m.author) })
    return Array.from(set).sort()
  }, [masters])

  const hasActiveFilters =
    genreFilter !== 'all' || authorFilter !== 'all' || orgUsageFilter !== 'all' ||
    playerCountFilter !== 'all' || durationFilter !== 'all'

  const resetFilters = () => {
    setGenreFilter('all')
    setAuthorFilter('all')
    setOrgUsageFilter('all')
    setPlayerCountFilter('all')
    setDurationFilter('all')
  }

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

  // 一括ステータス変更（楽観的更新）
  const handleBulkStatusChange = async (newStatus: ScenarioMaster['master_status']) => {
    const targetIds = Array.from(selectedIds)
    if (targetIds.length === 0) return

    const previousMasters = masters
    setMasters(prev => prev.map(m =>
      selectedIds.has(m.id) ? { ...m, master_status: newStatus } : m
    ))

    try {
      const updatePayload: Record<string, unknown> = { master_status: newStatus }
      if (newStatus === 'approved') {
        updatePayload.approved_by = user?.id
        updatePayload.approved_at = new Date().toISOString()
      }
      const { error } = await supabase
        .from('scenario_masters')
        .update(updatePayload)
        .in('id', targetIds)

      if (error) throw error
      toast.success(`${targetIds.length}件を${STATUS_CONFIG[newStatus].label}に変更しました`)
      setSelectedIds(new Set())
    } catch (err) {
      logger.error('Bulk status change error:', err)
      toast.error('一括変更に失敗しました')
      setMasters(previousMasters)
    }
  }

  // CSV エクスポート（フィルタ後の一覧 or 選択行のみ）
  const handleCsvExport = () => {
    const targets = selectedIds.size > 0
      ? filteredMasters.filter(m => selectedIds.has(m.id))
      : filteredMasters
    if (targets.length === 0) {
      toast.error('エクスポート対象がありません')
      return
    }
    const headers = ['ID', 'タイトル', '作者', '申請組織', '人数(最小)', '人数(最大)', '時間(分)', 'ジャンル', 'ステータス', '利用組織数', '利用組織', '更新日']
    const rows = targets.map(m => [
      m.id,
      m.title,
      m.author || '',
      m.submitted_by_organization_name || '',
      m.player_count_min,
      m.player_count_max,
      m.official_duration,
      (m.genre || []).join(';'),
      STATUS_CONFIG[m.master_status].label,
      m.organization_count || 0,
      (m.using_organizations || []).map(o => o.name).join(';'),
      m.updated_at,
    ])
    const csv = [headers, ...rows].map(row =>
      row.map(cell => {
        const s = String(cell ?? '')
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }).join(',')
    ).join('\n')
    // UTF-8 BOM 付きで Excel での文字化けを防ぐ
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const today = new Date().toISOString().slice(0, 10)
    a.download = `scenario_masters_${today}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`${targets.length}件をエクスポートしました`)
  }

  // ステータス変更（楽観的更新）
  const handleStatusChange = async (masterId: string, newStatus: ScenarioMaster['master_status']) => {
    // 楽観的更新: 先にローカル状態を変更
    const previousMasters = masters
    setMasters(prev => prev.map(m =>
      m.id === masterId ? { ...m, master_status: newStatus } : m
    ))

    try {
      const updatePayload: Record<string, unknown> = { master_status: newStatus }
      if (newStatus === 'approved') {
        updatePayload.approved_by = user?.id
        updatePayload.approved_at = new Date().toISOString()
      }
      const { error } = await supabase
        .from('scenario_masters')
        .update(updatePayload)
        .eq('id', masterId)

      if (error) throw error
      toast.success(`${STATUS_CONFIG[newStatus].label}に変更しました`)
    } catch (err) {
      logger.error('Status change error:', err)
      toast.error('ステータス変更に失敗しました')
      // 失敗時はロールバック
      setMasters(previousMasters)
    }
  }

  // テーブルカラム定義（余白圧縮 + 利用組織/申請組織カラム追加）
  const COMPACT_CELL = '!px-1.5 !py-1'
  const tableColumns: Column<ScenarioMaster>[] = useMemo(() => [
    {
      key: 'select',
      header: '',
      width: 'w-10',
      align: 'center',
      required: true,
      cellClassName: '!p-1',
      renderHeader: () => {
        const visibleIds = filteredMasters.map(m => m.id)
        const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id))
        const someSelected = visibleIds.some(id => selectedIds.has(id)) && !allSelected
        return (
          <Checkbox
            checked={allSelected || (someSelected ? 'indeterminate' : false)}
            onCheckedChange={(checked) => {
              if (checked) {
                setSelectedIds(new Set(visibleIds))
              } else {
                setSelectedIds(new Set())
              }
            }}
            aria-label="全て選択"
          />
        )
      },
      render: (master) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={selectedIds.has(master.id)}
            onCheckedChange={(checked) => {
              setSelectedIds(prev => {
                const next = new Set(prev)
                if (checked) next.add(master.id)
                else next.delete(master.id)
                return next
              })
            }}
            aria-label={`${master.title}を選択`}
          />
        </div>
      )
    },
    {
      key: 'image',
      header: '画像',
      helpText: 'シナリオのキービジュアル画像',
      width: 'w-16',
      align: 'center',
      cellClassName: '!p-1',
      render: (master) => (
        <div className="flex items-center justify-center">
          {master.key_visual_url ? (
            <div className="w-10 h-12 bg-gray-200 rounded overflow-hidden">
              <img src={master.key_visual_url} alt={master.title} className="w-full h-full object-cover" />
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
      helpText: 'シナリオのタイトル。クリックで詳細編集',
      width: 'w-48',
      sortable: true,
      required: true,
      cellClassName: COMPACT_CELL,
      render: (master) => (
        <div className="min-w-0">
          <button
            onClick={() => handleEdit(master)}
            className="text-sm truncate text-left hover:text-blue-600 hover:underline w-full"
            title={master.title}
            {...devDb('scenario_masters.title')}
          >
            {master.title}
          </button>
          {master.genre && master.genre.length > 0 && (
            <div className="flex gap-1 mt-0.5 flex-wrap">
              {master.genre.slice(0, 3).map((g, i) => (
                <Badge key={i} variant="secondary" className="text-[10px] px-1 py-0">{g}</Badge>
              ))}
              {master.genre.length > 3 && (
                <span className="text-[10px] text-muted-foreground">+{master.genre.length - 3}</span>
              )}
            </div>
          )}
        </div>
      ),
      sortValue: (master) => master.title.toLowerCase()
    },
    {
      key: 'author',
      header: '作者',
      helpText: 'シナリオの制作者名（作者ポータルと連携）',
      width: 'w-28',
      sortable: true,
      cellClassName: COMPACT_CELL,
      render: (master) => (
        <p className="text-xs text-gray-600 truncate" {...devDb('scenario_masters.author')}>
          {master.author || '-'}
        </p>
      ),
      sortValue: (master) => (master.author || '').toLowerCase()
    },
    {
      key: 'submitted_by_org',
      header: '申請組織',
      helpText: 'このマスタを MMQ プラットフォームに申請してきた組織',
      width: 'w-28',
      sortable: true,
      cellClassName: COMPACT_CELL,
      render: (master) => (
        <p className="text-xs text-gray-600 truncate" title={master.submitted_by_organization_name || ''}>
          {master.submitted_by_organization_name || '-'}
        </p>
      ),
      sortValue: (master) => (master.submitted_by_organization_name || '').toLowerCase()
    },
    {
      key: 'player_count',
      header: '人数',
      helpText: 'このシナリオをプレイできる参加者の人数範囲',
      width: 'w-16',
      align: 'center',
      sortable: true,
      cellClassName: COMPACT_CELL,
      render: (master) => (
        <div className="flex items-center justify-center gap-1 text-sm text-gray-600" {...devDb('scenario_masters.player_count_min/max')}>
          <Users className="w-3 h-3" />
          {master.player_count_min === master.player_count_max
            ? `${master.player_count_max}人`
            : `${master.player_count_min}-${master.player_count_max}人`}
        </div>
      ),
      sortValue: (master) => master.player_count_max
    },
    {
      key: 'duration',
      header: '時間',
      helpText: 'シナリオの公式所要時間（準備・片付け時間は含まない）',
      width: 'w-16',
      align: 'center',
      sortable: true,
      cellClassName: COMPACT_CELL,
      render: (master) => (
        <div className="flex items-center justify-center gap-1 text-sm text-gray-600" {...devDb('scenario_masters.official_duration')}>
          <Clock className="w-3 h-3" />
          {Math.floor(master.official_duration / 60)}h
          {master.official_duration % 60 > 0 && `${master.official_duration % 60}m`}
        </div>
      ),
      sortValue: (master) => master.official_duration
    },
    {
      key: 'master_status',
      header: 'ステータス',
      helpText: 'クリックで変更可。下書き→承認待ち→承認済み/却下の順で進行。承認済みのみ組織が利用可能',
      width: 'w-28',
      align: 'center',
      sortable: true,
      cellClassName: COMPACT_CELL,
      render: (master) => {
        const statusConfig = STATUS_CONFIG[master.master_status]
        const StatusIcon = statusConfig.icon
        const otherStatuses = (['approved', 'pending', 'draft', 'rejected'] as const)
          .filter(s => s !== master.master_status)
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium hover:opacity-80 transition-opacity ${statusConfig.color}`}
                {...devDb('scenario_masters.master_status')}
              >
                <StatusIcon className="w-3 h-3" />
                {statusConfig.label}
                <ChevronDown className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-36">
              {otherStatuses.map(s => {
                const cfg = STATUS_CONFIG[s]
                const Icon = cfg.icon
                return (
                  <DropdownMenuItem
                    key={s}
                    onClick={() => handleStatusChange(master.id, s)}
                    className="text-xs cursor-pointer"
                  >
                    <Icon className="w-3 h-3 mr-2" />
                    {cfg.label}に変更
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
      sortValue: (master) => master.master_status
    },
    {
      key: 'organization_count',
      header: '利用組織',
      helpText: 'このマスタを利用している組織。最大3件表示し、残りは件数表示',
      width: 'w-36',
      sortable: true,
      cellClassName: COMPACT_CELL,
      render: (master) => {
        const orgs = master.using_organizations || []
        if (orgs.length === 0) {
          return <span className="text-[10px] text-muted-foreground">-</span>
        }
        const visible = orgs.slice(0, 3)
        const rest = orgs.length - visible.length
        return (
          <div className="flex flex-wrap gap-0.5" title={orgs.map(o => o.name).join(', ')}>
            {visible.map(o => (
              <span key={o.id} className="text-[10px] px-1 py-0 bg-blue-50 text-blue-700 rounded-sm border border-blue-200">
                {o.name}
              </span>
            ))}
            {rest > 0 && <span className="text-[10px] text-muted-foreground">+{rest}</span>}
          </div>
        )
      },
      sortValue: (master) => master.organization_count || 0
    },
    {
      key: 'updated_at',
      header: '更新日',
      helpText: '最終更新日時',
      width: 'w-20',
      align: 'center',
      sortable: true,
      cellClassName: COMPACT_CELL,
      render: (master) => (
        <p className="text-[10px] text-gray-500">
          {new Date(master.updated_at).toLocaleDateString('ja-JP', { year: '2-digit', month: '2-digit', day: '2-digit' })}
        </p>
      ),
      sortValue: (master) => master.updated_at
    },
    {
      key: 'actions',
      header: '操作',
      width: 'w-14',
      align: 'right',
      required: true,
      cellClassName: COMPACT_CELL,
      render: (master) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={(e) => { e.stopPropagation(); handleEdit(master) }}
            title="編集"
          >
            <Edit className="w-4 h-4" />
          </Button>
        </div>
      )
    }
  ], [filteredMasters, selectedIds])

  const defaultColumnKeys = useMemo(() => tableColumns.map(c => c.key), [tableColumns])
  const [columnPrefs, setColumnPrefs] = useTablePreferences('scenario-master-admin', defaultColumnKeys)

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
          title={<><Shield className="h-5 w-5 text-primary" />シナリオマスタ管理</>}
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
          <Card
            role="button"
            tabIndex={0}
            onClick={() => setStatusFilter('all')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setStatusFilter('all') } }}
            className={`shadow-none cursor-pointer transition-all ${statusFilter === 'all' ? 'ring-2 ring-primary border-primary' : 'hover:opacity-80'}`}
          >
            <CardContent className="p-3">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-xs text-muted-foreground">全マスタ</div>
            </CardContent>
          </Card>
          <Card
            role="button"
            tabIndex={0}
            onClick={() => setStatusFilter('approved')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setStatusFilter('approved') } }}
            className={`shadow-none border-green-200 bg-green-50 cursor-pointer transition-all ${statusFilter === 'approved' ? 'ring-2 ring-green-500' : 'hover:opacity-80'}`}
          >
            <CardContent className="p-3">
              <div className="text-2xl font-bold text-green-700">{stats.approved}</div>
              <div className="text-xs text-green-600">承認済み</div>
            </CardContent>
          </Card>
          <Card
            role="button"
            tabIndex={0}
            onClick={() => setStatusFilter('pending')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setStatusFilter('pending') } }}
            className={`shadow-none border-yellow-200 bg-yellow-50 cursor-pointer transition-all ${statusFilter === 'pending' ? 'ring-2 ring-yellow-500' : 'hover:opacity-80'}`}
          >
            <CardContent className="p-3">
              <div className="text-2xl font-bold text-yellow-700">{stats.pending}</div>
              <div className="text-xs text-yellow-600">承認待ち</div>
            </CardContent>
          </Card>
          <Card
            role="button"
            tabIndex={0}
            onClick={() => setStatusFilter('draft')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setStatusFilter('draft') } }}
            className={`shadow-none border-gray-200 bg-gray-50 cursor-pointer transition-all ${statusFilter === 'draft' ? 'ring-2 ring-gray-500' : 'hover:opacity-80'}`}
          >
            <CardContent className="p-3">
              <div className="text-2xl font-bold text-gray-700">{stats.draft}</div>
              <div className="text-xs text-gray-600">下書き</div>
            </CardContent>
          </Card>
        </div>

        {/* 検索・フィルター */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              <span className="hidden sm:flex items-center text-xs text-muted-foreground flex-shrink-0 whitespace-nowrap">
                {filteredMasters.length}件
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
              <div className="flex items-center gap-1 overflow-x-auto">
                {(['all', 'approved', 'pending', 'draft', 'rejected'] as const).map((status) => (
                  <Button
                    key={status}
                    variant={statusFilter === status ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter(status)}
                    className="text-xs whitespace-nowrap"
                  >
                    {status === 'all' ? '全て' : STATUS_CONFIG[status]?.label}
                  </Button>
                ))}
              </div>
              <div className="hidden md:flex items-center gap-1 ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => handleCsvExport()}
                  title="CSV エクスポート"
                >
                  <Download className="w-3 h-3 mr-1" />
                  CSV
                </Button>
                <ColumnSettingsPanel
                  columns={tableColumns}
                  preferences={columnPrefs}
                  onPreferencesChange={setColumnPrefs}
                  defaultColumnKeys={defaultColumnKeys}
                />
              </div>
            </div>
          </div>

          {/* 追加フィルタ行 */}
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />

            <Select value={genreFilter} onValueChange={setGenreFilter}>
              <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="ジャンル" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ジャンル: 全て</SelectItem>
                {allGenres.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={authorFilter} onValueChange={setAuthorFilter}>
              <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="作者" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">作者: 全て</SelectItem>
                {allAuthors.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={orgUsageFilter} onValueChange={setOrgUsageFilter}>
              <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="利用組織" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">利用組織: 全て</SelectItem>
                <SelectItem value="used">利用組織あり</SelectItem>
                <SelectItem value="unused">利用組織なし</SelectItem>
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

            {hasActiveFilters && (
              <Button
                variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground"
                onClick={resetFilters}
              >
                <X className="w-3 h-3 mr-1" />
                リセット
              </Button>
            )}
          </div>
        </div>

        {/* 一括操作バー（選択行があるときだけ表示） */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
            <span className="text-sm font-medium text-blue-900">
              {selectedIds.size}件 選択中
            </span>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>
              <X className="w-3 h-3 mr-1" />
              選択解除
            </Button>
            <span className="text-xs text-blue-700 ml-2">一括ステータス変更:</span>
            <div className="flex items-center gap-1">
              {(['approved', 'pending', 'draft', 'rejected'] as const).map(s => {
                const cfg = STATUS_CONFIG[s]
                const Icon = cfg.icon
                return (
                  <Button
                    key={s}
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleBulkStatusChange(s)}
                  >
                    <Icon className="w-3 h-3 mr-1" />
                    {cfg.label}
                  </Button>
                )
              })}
            </div>
          </div>
        )}

        {/* PC用: テーブル形式 */}
        <div className="hidden md:block">
          <div className="bg-white border rounded-lg overflow-hidden">
            <TanStackDataTable
              data={filteredMasters}
              columns={tableColumns}
              getRowKey={(master) => master.id}
              sortState={sortState}
              onSort={setSortState}
              columnPreferences={columnPrefs}
              autoRowHeight
              emptyMessage={
                searchTerm || statusFilter !== 'all'
                  ? '検索条件に一致するマスタが見つかりません'
                  : 'シナリオマスタが登録されていません'
              }
              loading={loading}
            />
          </div>
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
                        <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className={`inline-flex items-center gap-1 px-1.5 py-0 rounded-full text-[10px] font-medium hover:opacity-80 transition-opacity ${statusConfig.color}`}>
                                {statusConfig.label}
                                <ChevronDown className="w-2.5 h-2.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-36">
                              {(['approved', 'pending', 'draft', 'rejected'] as const)
                                .filter(s => s !== master.master_status)
                                .map(s => {
                                  const cfg = STATUS_CONFIG[s]
                                  const Icon = cfg.icon
                                  return (
                                    <DropdownMenuItem
                                      key={s}
                                      onClick={() => handleStatusChange(master.id, s)}
                                      className="text-xs cursor-pointer"
                                    >
                                      <Icon className="w-3 h-3 mr-2" />
                                      {cfg.label}に変更
                                    </DropdownMenuItem>
                                  )
                                })}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
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
                    <div className="flex items-center gap-2">
                      <span className="text-primary">編集 →</span>
                    </div>
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
