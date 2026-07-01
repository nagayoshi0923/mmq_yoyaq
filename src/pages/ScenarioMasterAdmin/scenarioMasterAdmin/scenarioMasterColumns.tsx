import type { Dispatch, SetStateAction } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Users, Clock, Edit, ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { devDb } from '@/components/ui/DevField'
import type { Column } from '@/components/patterns/table'
import type { ScenarioMaster } from './types'
import { STATUS_CONFIG } from './types'

export function buildScenarioMasterColumns(deps: {
  filteredMasters: ScenarioMaster[]
  selectedIds: Set<string>
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>
  handleEdit: (master: ScenarioMaster) => void
  handleStatusChange: (masterId: string, newStatus: ScenarioMaster['master_status']) => void
}): Column<ScenarioMaster>[] {
  const { filteredMasters, selectedIds, setSelectedIds, handleEdit, handleStatusChange } = deps
  const COMPACT_CELL = '!px-1.5 !py-1'
  return [
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
            className="text-xs truncate text-left hover:text-blue-600 hover:underline w-full font-medium"
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
        <div className="flex items-center justify-center gap-1 text-xs text-gray-600" {...devDb('scenario_masters.player_count_min/max')}>
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
        <div className="flex items-center justify-center gap-1 text-xs text-gray-600" {...devDb('scenario_masters.official_duration')}>
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
        <p className="text-xs text-gray-500">
          {new Date(master.updated_at).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: '2-digit', month: '2-digit', day: '2-digit' })}
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
  ]
}
