import { memo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { StaffCard } from './StaffCard'
import type { Staff, Store } from '@/types'

interface StaffListProps {
  filteredStaff: Staff[]
  stores: Store[]
  getScenarioName: (scenarioId: string) => string
  onEdit: (member: Staff) => void
  onLink: (member: Staff) => void
  onDelete: (member: Staff) => void
}

/**
 * スタッフリスト（スプレッドシート形式）コンポーネント
 */
export const StaffList = memo(function StaffList({
  filteredStaff,
  stores,
  getScenarioName,
  onEdit,
  onLink,
  onDelete
}: StaffListProps) {
  return (
    <div className="space-y-1">
      {/* ヘッダー行 */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center h-[50px] bg-muted/30">
            <div className="flex-shrink-0 w-56 px-3 py-2 border-r font-medium text-sm">基本情報</div>
            <div className="flex-shrink-0 w-32 px-3 py-2 border-r font-medium text-sm">役割</div>
            <div className="flex-shrink-0 w-32 px-3 py-2 border-r font-medium text-sm">担当店舗</div>
            <div className="flex-1 px-3 py-2 border-r font-medium text-sm min-w-0">GM可能</div>
            <div className="flex-1 px-3 py-2 border-r font-medium text-sm min-w-0">体験済み</div>
            <div className="flex-shrink-0 w-32 px-3 py-2 font-medium text-sm text-center">アクション</div>
          </div>
        </CardContent>
      </Card>

      {/* スタッフデータ行 */}
      <div className="space-y-1">
        {filteredStaff.map((member) => (
          <StaffCard
            key={member.id}
            member={member}
            stores={stores}
            getScenarioName={getScenarioName}
            onEdit={onEdit}
            onLink={onLink}
            onDelete={onDelete}
          />
        ))}
      </div>

      {/* 結果がない場合 */}
      {filteredStaff.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <p>該当するスタッフが見つかりません</p>
              <p className="text-sm mt-2">検索条件を変更してください</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
})

