import { Edit, Link2, Trash2, Unlink, CheckCircle2, AlertCircle, Clock, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { StaffAvatar } from '@/components/staff/StaffAvatar'
import type { Column } from '@/components/patterns/table'
import type { Staff, Store } from '@/types'
import { getRoleBadges, getStoreColors, getStatusBadge } from './staffFormatters'
import type { StaffAuthStatus } from '../hooks/useStaffAuthStatus'

interface StaffTableActions {
  onEdit: (member: Staff) => void
  onLink: (member: Staff) => void
  onUnlink: (member: Staff) => void
  onDelete: (member: Staff) => void
}

interface StaffTableContext {
  stores: Store[]
  getScenarioName: (scenarioId: string) => string
  getAuthStatus?: (userId: string | null) => StaffAuthStatus
}

/**
 * StaffManagement用のテーブル列定義を生成
 */
/**
 * 認証状態のバッジを返す
 */
function getAuthStatusBadge(status: StaffAuthStatus) {
  switch (status.status) {
    case 'active':
      return (
        <div className="flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
          <span className="text-xs text-green-700">設定済み</span>
        </div>
      )
    case 'pending':
      return (
        <div className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5 text-yellow-600" />
          <span className="text-xs text-yellow-700">招待中</span>
        </div>
      )
    case 'never_logged_in':
      return (
        <div className="flex items-center gap-1">
          <AlertCircle className="h-3.5 w-3.5 text-orange-600" />
          <span className="text-xs text-orange-700">未ログイン</span>
        </div>
      )
    case 'not_linked':
    default:
      return (
        <div className="flex items-center gap-1">
          <HelpCircle className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-xs text-gray-500">未紐付け</span>
        </div>
      )
  }
}

export function createStaffColumns(
  context: StaffTableContext,
  actions: StaffTableActions
): Column<Staff>[] {
  const { stores, getScenarioName, getAuthStatus } = context
  const { onEdit, onLink, onUnlink, onDelete } = actions

  return [
    {
      key: 'name',
      header: '基本情報',
      sortable: true,
      width: 'w-56',
      render: (staff) => (
        <button
          onClick={() => actions.onEdit(staff)}
          className="flex items-center gap-2 w-full hover:bg-muted/50 rounded px-2 py-1 -mx-2 -my-1 transition-colors text-left"
        >
          <StaffAvatar
            name={staff.name}
            avatarUrl={staff.avatar_url}
            avatarColor={staff.avatar_color}
            size="sm"
          />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm truncate hover:text-blue-600">{staff.name}</h3>
            {!staff.user_id && (
              // @ts-ignore
              <Badge size="sm" variant="warning" className="text-[10px] mt-0.5 font-normal">
                未紐付け
              </Badge>
            )}
          </div>
          <div className="flex-shrink-0">
            {getStatusBadge(staff.status)}
          </div>
        </button>
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
                // @ts-ignore
                <Badge size="sm" variant="gray" className="font-normal text-xs">
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
                const storeName = storeObj ? storeObj.name : storeId
                return (
                  <Badge 
                    key={index} 
                    size="sm" 
                    className={`font-normal text-xs border-0 ${getStoreColors(storeName)}`}
                  >
                    {storeName}
                  </Badge>
                )
              })}
              {staff.stores.length > 1 && (
                // @ts-ignore
                <Badge size="sm" variant="gray" className="font-normal text-xs">
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
      width: 'w-64 max-w-64',
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
                      variant="outline"
                      className="font-normal text-xs whitespace-nowrap flex-shrink-0 bg-blue-50 border-blue-200 text-blue-700 py-0.5 px-1.5"
                    >
                      {getScenarioName(scenarioId)}
                    </Badge>
                  ))}
                </div>
                {staff.special_scenarios.length > 4 && (
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    +{staff.special_scenarios.length - 4}
                  </span>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs max-h-96 overflow-y-auto">
              <div className="space-y-1">
                <p className="text-xs font-medium text-blue-700">GM可能シナリオ（全{staff.special_scenarios.length}件）:</p>
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
      width: 'w-64 max-w-64',
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
                      variant="outline"
                      className="font-normal text-xs whitespace-nowrap flex-shrink-0 bg-green-50 border-green-200 text-green-700 py-0.5 px-1.5"
                    >
                      {getScenarioName(scenarioId)}
                    </Badge>
                  ))}
                </div>
                {experiencedScenarios.length > 4 && (
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    +{experiencedScenarios.length - 4}
                  </span>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs max-h-96 overflow-y-auto">
              <div className="space-y-1">
                <p className="text-xs font-medium text-green-700">体験済みシナリオ（全{experiencedScenarios.length}件）:</p>
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
      key: 'auth_status',
      header: '認証状態',
      sortable: false,
      width: 'w-24',
      render: (staff) => {
        if (!getAuthStatus) {
          return <span className="text-xs text-muted-foreground">-</span>
        }
        const authStatus = getAuthStatus(staff.user_id)
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-pointer">
                {getAuthStatusBadge(authStatus)}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-xs">
                {authStatus.status === 'active' && <p>パスワード設定済み</p>}
                {authStatus.status === 'pending' && <p>招待メール送信済み、パスワード未設定</p>}
                {authStatus.status === 'never_logged_in' && <p>パスワード設定済み、未ログイン</p>}
                {authStatus.status === 'not_linked' && <p>ユーザーアカウントと未紐付け</p>}
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
          {!staff.user_id ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon"
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
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => onUnlink(staff)}
                  className="h-7 w-7 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                >
                  <Unlink className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">連携解除</p>
              </TooltipContent>
            </Tooltip>
          )}
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon"
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
                size="icon"
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
