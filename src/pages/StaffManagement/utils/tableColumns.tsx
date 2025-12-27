import { Edit, Link2, Trash2, Unlink, CheckCircle2, AlertCircle, Clock, HelpCircle, MailPlus } from 'lucide-react'
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
  onReinvite?: (member: Staff) => void
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
  const { onEdit, onLink, onUnlink, onDelete, onReinvite } = actions

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
      width: 'w-28',
      render: (staff) => {
        if (!staff.role || staff.role.length === 0) {
          return <span className="text-[10px] text-muted-foreground">-</span>
        }
        
        const roleLabels: Record<string, string> = {
          'gm': 'GM',
          'staff': 'スタッフ',
          'admin': '管理者',
          'sub_gm': 'サブGM'
        }
        
        return (
          <div className="flex flex-wrap gap-0.5">
            {staff.role.map((role, index) => (
              <span 
                key={index} 
                className="text-[10px] px-1 py-0 bg-gray-100 text-gray-700 rounded-sm border border-gray-200"
              >
                {roleLabels[role] || role}
              </span>
            ))}
          </div>
        )
      }
    },
    {
      key: 'stores',
      header: '担当店舗',
      sortable: false,
      width: 'w-36',
      render: (staff) => {
        if (!staff.stores || staff.stores.length === 0) {
          return <span className="text-[10px] text-muted-foreground">-</span>
        }
        
        return (
          <div className="flex flex-wrap gap-0.5">
            {staff.stores.map((storeId, index) => {
              const storeObj = stores.find(s => s.id === storeId)
              const storeName = storeObj?.short_name || storeObj?.name || storeId
              return (
                <span 
                  key={index} 
                  className="text-[10px] px-1 py-0 bg-purple-50 text-purple-700 rounded-sm border border-purple-200"
                >
                  {storeName}
                </span>
              )
            })}
          </div>
        )
      }
    },
    {
      key: 'special_scenarios',
      header: 'GM可能',
      sortable: true,
      width: 'w-48',
      render: (staff) => {
        if (!staff.special_scenarios || staff.special_scenarios.length === 0) {
          return <span className="text-[10px] text-muted-foreground">-</span>
        }

        const truncate = (name: string, max = 10) => 
          name.length > max ? name.slice(0, max) + '…' : name
        
        const allScenarios = staff.special_scenarios
        
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-default max-h-[2.2rem] overflow-hidden">
                <div className="flex flex-wrap gap-0.5">
                  {allScenarios.map((scenarioId, index) => (
                    <span 
                      key={index} 
                      className="text-[10px] px-1 py-0 bg-blue-50 text-blue-700 rounded-sm border border-blue-200"
                    >
                      {truncate(getScenarioName(scenarioId))}
                    </span>
                  ))}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent className="bg-gray-900 text-white border-gray-900 px-2 py-1.5 max-h-64 overflow-y-auto">
              <div className="flex flex-col gap-0.5">
                {allScenarios.map((scenarioId, index) => (
                  <span key={index} className="text-xs">{getScenarioName(scenarioId)}</span>
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
      width: 'w-48',
      render: (staff) => {
        const experiencedScenarios = staff.experienced_scenarios
        if (!experiencedScenarios || experiencedScenarios.length === 0) {
          return <span className="text-[10px] text-muted-foreground">-</span>
        }

        const truncate = (name: string, max = 10) => 
          name.length > max ? name.slice(0, max) + '…' : name
        
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-default max-h-[2.2rem] overflow-hidden">
                <div className="flex flex-wrap gap-0.5">
                  {experiencedScenarios.map((scenarioId: string, index: number) => (
                    <span 
                      key={index} 
                      className="text-[10px] px-1 py-0 bg-green-50 text-green-700 rounded-sm border border-green-200"
                    >
                      {truncate(getScenarioName(scenarioId))}
                    </span>
                  ))}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent className="bg-gray-900 text-white border-gray-900 px-2 py-1.5 max-h-64 overflow-y-auto">
              <div className="flex flex-col gap-0.5">
                {experiencedScenarios.map((scenarioId: string, index: number) => (
                  <span key={index} className="text-xs">{getScenarioName(scenarioId)}</span>
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
      width: 'w-40',
      align: 'center',
      render: (staff) => {
        const authStatus = getAuthStatus ? getAuthStatus(staff.user_id) : null
        const showReinvite = onReinvite && staff.email && 
          (authStatus?.status === 'pending' || authStatus?.status === 'not_linked')
        
        return (
        <div className="flex gap-1 justify-center">
          {/* 再招待ボタン（パスワード未設定 or 未紐付けの場合） */}
          {showReinvite && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => onReinvite(staff)}
                  className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                >
                  <MailPlus className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">招待メール再送信</p>
              </TooltipContent>
            </Tooltip>
          )}
          
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
    }
  ]
}
