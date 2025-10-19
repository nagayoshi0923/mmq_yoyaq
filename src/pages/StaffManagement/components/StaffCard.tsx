import { memo } from 'react'
import { Edit, Link2, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { StaffAvatar } from '@/components/staff/StaffAvatar'
import type { Staff, Store } from '@/types'
import { getRoleBadges, getStoreColors, getStatusBadge } from '@/pages/StaffManagement/utils/staffFormatters'

interface StaffCardProps {
  member: Staff
  stores: Store[]
  getScenarioName: (scenarioId: string) => string
  onEdit: (member: Staff) => void
  onLink: (member: Staff) => void
  onDelete: (member: Staff) => void
}

/**
 * スタッフ情報を1行で表示するカードコンポーネント（スプレッドシート形式）
 */
export const StaffCard = memo(function StaffCard({
  member,
  stores,
  getScenarioName,
  onEdit,
  onLink,
  onDelete
}: StaffCardProps) {
  return (
    <Card className="overflow-hidden hover:shadow-sm transition-shadow">
      <CardContent className="p-0">
        <div className="flex items-center h-[50px]">
          {/* 基本情報 */}
          <div className="flex-shrink-0 w-56 px-3 py-2 border-r">
            <div className="flex items-center gap-2">
              <StaffAvatar
                name={member.name}
                avatarUrl={member.avatar_url}
                avatarColor={member.avatar_color}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm truncate leading-tight">{member.name}</h3>
                {!member.user_id && (
                  <Badge size="sm" className="bg-amber-100 text-amber-800 text-xs mt-0.5">
                    未紐付け
                  </Badge>
                )}
              </div>
              <div className="flex-shrink-0">
                {getStatusBadge(member.status)}
              </div>
            </div>
          </div>

          {/* 役割 */}
          <div className="flex-shrink-0 w-32 px-3 py-2 border-r">
            <div className="flex flex-wrap gap-1">
              {member.role && member.role.length > 0 ? (
                <>
                  {getRoleBadges(member.role.slice(0, 1))}
                  {member.role.length > 1 && (
                    <Badge size="sm" variant="outline" className="font-normal text-xs px-1 py-0.5">
                      +{member.role.length - 1}
                    </Badge>
                  )}
                </>
              ) : (
                <span className="text-xs text-muted-foreground">-</span>
              )}
            </div>
          </div>

          {/* 担当店舗 */}
          <div className="flex-shrink-0 w-32 px-3 py-2 border-r">
            <div className="flex flex-wrap gap-1">
              {member.stores && member.stores.length > 0 ? (
                <>
                  {member.stores.slice(0, 1).map((storeId, index) => {
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
                  {member.stores.length > 1 && (
                    <Badge size="sm" variant="outline" className="font-normal text-xs px-1 py-0.5">
                      +{member.stores.length - 1}
                    </Badge>
                  )}
                </>
              ) : (
                <span className="text-xs text-muted-foreground">-</span>
              )}
            </div>
          </div>

          {/* GM可能なシナリオ */}
          <div className="flex-1 px-3 py-2 border-r min-w-0">
            {member.special_scenarios && member.special_scenarios.length > 0 ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 overflow-hidden cursor-pointer">
                    <div className="flex gap-1 overflow-hidden">
                      {member.special_scenarios.slice(0, 4).map((scenarioId, index) => (
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
                    {member.special_scenarios.length > 4 && (
                      <Badge 
                        size="sm" 
                        variant="outline" 
                        className="font-normal text-xs px-1 py-0.5 whitespace-nowrap flex-shrink-0"
                      >
                        +{member.special_scenarios.length - 4}
                      </Badge>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs max-h-96 overflow-y-auto">
                  <div className="space-y-1">
                    <p className="font-medium text-xs">GM可能シナリオ（全{member.special_scenarios.length}件）:</p>
                    {member.special_scenarios.map((scenarioId, index) => (
                      <p key={index} className="text-xs">• {getScenarioName(scenarioId)}</p>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            ) : (
              <span className="text-xs text-muted-foreground">-</span>
            )}
          </div>

          {/* 体験済みシナリオ（GM不可） */}
          <div className="flex-1 px-3 py-2 border-r min-w-0">
            {(member as any).experienced_scenarios && (member as any).experienced_scenarios.length > 0 ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 overflow-hidden cursor-pointer">
                    <div className="flex gap-1 overflow-hidden">
                      {(member as any).experienced_scenarios.slice(0, 4).map((scenarioId: string, index: number) => (
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
                    {(member as any).experienced_scenarios.length > 4 && (
                      <Badge 
                        size="sm" 
                        variant="outline" 
                        className="font-normal text-xs px-1 py-0.5 whitespace-nowrap flex-shrink-0"
                      >
                        +{(member as any).experienced_scenarios.length - 4}
                      </Badge>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs max-h-96 overflow-y-auto">
                  <div className="space-y-1">
                    <p className="font-medium text-xs">体験済みシナリオ（全{(member as any).experienced_scenarios.length}件）:</p>
                    {(member as any).experienced_scenarios.map((scenarioId: string, index: number) => (
                      <p key={index} className="text-xs">• {getScenarioName(scenarioId)}</p>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            ) : (
              <span className="text-xs text-muted-foreground">-</span>
            )}
          </div>

          {/* アクション */}
          <div className="flex-shrink-0 w-32 px-3 py-2">
            <div className="flex gap-1 justify-center">
              {!member.user_id && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon-sm"
                      onClick={() => onLink(member)}
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
                    onClick={() => onEdit(member)}
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
                    onClick={() => onDelete(member)}
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
          </div>
        </div>
      </CardContent>
    </Card>
  )
})

