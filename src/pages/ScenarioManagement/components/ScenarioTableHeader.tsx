import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { SortableTableHeader } from '@/components/ui/sortable-table-header'

type ScenarioSortField = 'title' | 'author' | 'duration' | 'player_count_min' | 'difficulty' | 'participation_fee' | 'status' | 'available_gms'

interface SortState {
  field: ScenarioSortField
  direction: 'asc' | 'desc'
}

interface ScenarioTableHeaderProps {
  displayMode: 'compact' | 'detailed'
  sortState: SortState
  onSort: (field: ScenarioSortField) => void
}

/**
 * シナリオテーブルのヘッダー（再利用可能）
 */
export const ScenarioTableHeader: React.FC<ScenarioTableHeaderProps> = ({
  displayMode,
  sortState,
  onSort
}) => {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center h-[50px] bg-muted/30">
          <SortableTableHeader
            field="title"
            currentField={sortState.field}
            currentDirection={sortState.direction}
            onSort={onSort}
            className="flex-shrink-0 w-40 px-3 py-2 border-r font-medium text-sm"
          >
            タイトル
          </SortableTableHeader>
          <SortableTableHeader
            field="author"
            currentField={sortState.field}
            currentDirection={sortState.direction}
            onSort={onSort}
            className="flex-shrink-0 w-32 px-3 py-2 border-r font-medium text-sm"
          >
            作者
          </SortableTableHeader>
          <SortableTableHeader
            field="duration"
            currentField={sortState.field}
            currentDirection={sortState.direction}
            onSort={onSort}
            className="flex-shrink-0 w-24 px-3 py-2 border-r font-medium text-sm"
          >
            所要時間
          </SortableTableHeader>
          <SortableTableHeader
            field="player_count_min"
            currentField={sortState.field}
            currentDirection={sortState.direction}
            onSort={onSort}
            className="flex-shrink-0 w-24 px-3 py-2 border-r font-medium text-sm"
          >
            人数
          </SortableTableHeader>
          {displayMode === 'compact' && (
            <SortableTableHeader
              field="available_gms"
              currentField={sortState.field}
              currentDirection={sortState.direction}
              onSort={onSort}
              className="flex-shrink-0 w-96 px-3 py-2 border-r font-medium text-sm"
            >
              担当GM
            </SortableTableHeader>
          )}
          {displayMode === 'detailed' && (
            <>
              <SortableTableHeader
                field="difficulty"
                currentField={sortState.field}
                currentDirection={sortState.direction}
                onSort={onSort}
                className="flex-shrink-0 w-24 px-3 py-2 border-r font-medium text-sm"
              >
                難易度
              </SortableTableHeader>
              <SortableTableHeader
                field="participation_fee"
                currentField={sortState.field}
                currentDirection={sortState.direction}
                onSort={onSort}
                className="flex-shrink-0 w-28 px-3 py-2 border-r font-medium text-sm"
              >
                ライセンス料
              </SortableTableHeader>
            </>
          )}
          <SortableTableHeader
            field="participation_fee"
            currentField={sortState.field}
            currentDirection={sortState.direction}
            onSort={onSort}
            className="flex-shrink-0 w-24 px-3 py-2 border-r font-medium text-sm"
          >
            参加費
          </SortableTableHeader>
          <SortableTableHeader
            field="status"
            currentField={sortState.field}
            currentDirection={sortState.direction}
            onSort={onSort}
            className="flex-shrink-0 w-28 px-3 py-2 border-r font-medium text-sm"
          >
            ステータス
          </SortableTableHeader>
          {displayMode === 'detailed' && (
            <div className="flex-1 px-3 py-2 border-r font-medium text-sm min-w-0">ジャンル</div>
          )}
          <div className="flex-shrink-0 w-24 px-3 py-2 font-medium text-sm text-center">アクション</div>
        </div>
      </CardContent>
    </Card>
  )
}

