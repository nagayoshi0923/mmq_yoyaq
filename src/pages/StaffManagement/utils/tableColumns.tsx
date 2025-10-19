import { Edit, Link2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { StaffAvatar } from '@/components/staff/StaffAvatar'
import type { Column } from '@/components/patterns/table'
import type { Staff, Store } from '@/types'
import { getRoleBadges, getStoreColors, getStatusBadge } from './staffFormatters'

interface StaffTableActions {
  onEdit: (member: Staff) => void
  onLink: (member: Staff) => void
  onDelete: (member: Staff) => void
}

interface StaffTableContext {
  stores: Store[]
  getScenarioName: (scenarioId: string) => string
}

/**
 * StaffManagement用のテーブル列定義を生成
 */
export function createStaffColumns(
  context: StaffTableContext,
  actions: StaffTableActions
): Column<Staff>[] {
  const { stores, getScenarioName } = context
  const { onEdit, onLink, onDelete } = actions

  return [
    {
      key: 'name',
      header: '基本情報',
      sortable: true,
      width: 'w-56',
      render: (staff) => (
        <div className="flex items-center gap-2">
          <StaffAvatar
            name={staff.name}
            avatarUrl={staff.avatar_url}
            avatarColor={staff.avatar_color}
            size="sm"
          />
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm truncate leading-tight">{staff.name}</h3>
            {!staff.user_id && (
              <Badge size="sm" className="bg-amber-100 text-amber-800 text-xs mt-0.5">
                未紐付け
              </Badge>
            )}
          </div>
          <div className="flex-shrink-0">
            {getStatusBadge(staff.status)}
          </div>
        </div>
      )
    },
    {
      key: 'role',
      header: '役割',
      sortable: false,
      width: 'w-32',
      render: (staff) => (
        <div className="flex flex-wrap gap-1">
          {staff.role && staff.role.length > 0 ? (
            <>
              {getRoleBadges(staff.role.slice(0, 1))}
              {staff.role.length > 1 && (
                <Badge size="sm" variant="outline" className="font-normal text-xs px-1 py-0.5">
                  +{staff.role.length - 1}
                </Badge>
              )}
            </>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </div>
      )
    },
    {
      key: 'stores',
      header: '担当店舗',
      sortable: false,
      width: 'w-32',
      render: (staff) => (
        <div className="flex flex-wrap gap-1">
          {staff.stores && staff.stores.length > 0 ? (
            <>
              {staff.stores.slice(0, 1).map((storeId, index) => {
                const storeObj = stores.find(s => s.id === storeId)
                return (
                  <Badge 
                    key={index} 
                    size="sm" 
                    variant="static" 
                    className={`font-normal text-xs px-1 py-0.5 ${getStoreColors(storeObj?.name || '')}`}
                  >
                    {storeObj ? storeObj.name : storeId}
                  </Badge>
                )
              })}
              {staff.stores.length > 1 && (
                <Badge size="sm" variant="outline" className="font-normal text-xs px-1 py-0.5">
                  +{staff.stores.length - 1}
                </Badge>
              )}
            </>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </div>
      )
    },
    {
      key: 'special_scenarios',
      header: 'GM可能',
      sortable: true,
      render: (staff) => {
        if (!staff.special_scenarios || staff.special_scenarios.length === 0) {
          return <span className="text-xs text-muted-foreground">-</span>
        }

        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 overflow-hidden cursor-pointer">
                <div className="flex gap-1 overflow-hidden">
                  {staff.special_scenarios.slice(0, 4).map((scenarioId, index) => (
                    <Badge 
                      key={index} 
                      size="sm" 
                      variant="outline" 
                      className="font-normal text-xs px-1 py-0.5 whitespace-nowrap flex-shrink-0"
                    >
                      {getScenarioName(scenarioId)}
                    </Badge>
                  ))}
                </div>
                {staff.special_scenarios.length > 4 && (
                  <Badge 
                    size="sm" 
                    variant="outline" 
                    className="font-normal text-xs px-1 py-0.5 whitespace-nowrap flex-shrink-0"
                  >
                    +{staff.special_scenarios.length - 4}
                  </Badge>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs max-h-96 overflow-y-auto">
              <div className="space-y-1">
                <p className="font-medium text-xs">GM可能シナリオ（全{staff.special_scenarios.length}件）:</p>
                {staff.special_scenarios.map((scenarioId, index) => (
                  <p key={index} className="text-xs">• {getScenarioName(scenarioId)}</p>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        )
      }
    },
    {
      key: 'experienced_scenarios',
      header: '体験済み',
      sortable: true,
      render: (staff) => {
        const experiencedScenarios = (staff as any).experienced_scenarios
        if (!experiencedScenarios || experiencedScenarios.length === 0) {
          return <span className="text-xs text-muted-foreground">-</span>
        }

        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 overflow-hidden cursor-pointer">
                <div className="flex gap-1 overflow-hidden">
                  {experiencedScenarios.slice(0, 4).map((scenarioId: string, index: number) => (
                    <Badge 
                      key={index} 
                      size="sm" 
                      variant="outline" 
                      className="font-normal text-xs px-1 py-0.5 whitespace-nowrap flex-shrink-0"
                    >
                      {getScenarioName(scenarioId)}
                    </Badge>
                  ))}
                </div>
                {experiencedScenarios.length > 4 && (
                  <Badge 
                    size="sm" 
                    variant="outline" 
                    className="font-normal text-xs px-1 py-0.5 whitespace-nowrap flex-shrink-0"
                  >
                    +{experiencedScenarios.length - 4}
                  </Badge>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs max-h-96 overflow-y-auto">
              <div className="space-y-1">
                <p className="font-medium text-xs">体験済みシナリオ（全{experiencedScenarios.length}件）:</p>
                {experiencedScenarios.map((scenarioId: string, index: number) => (
                  <p key={index} className="text-xs">• {getScenarioName(scenarioId)}</p>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        )
      }
    },
    {
      key: 'actions',
      header: 'アクション',
      sortable: false,
      width: 'w-32',
      align: 'center',
      render: (staff) => (
        <div className="flex gap-1 justify-center">
          {!staff.user_id && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon-sm"
                  onClick={() => onLink(staff)}
                  className="h-7 w-7"
                >
                  <Link2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">ユーザーと紐付け</p>
              </TooltipContent>
            </Tooltip>
          )}
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon-sm"
                onClick={() => onEdit(staff)}
                className="h-7 w-7"
              >
                <Edit className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">編集</p>
            </TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon-sm"
                onClick={() => onDelete(staff)}
                className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">削除</p>
            </TooltipContent>
          </Tooltip>
        </div>
      )
    }
  ]
}

