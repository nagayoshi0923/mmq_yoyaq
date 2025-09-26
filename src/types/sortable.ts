export type SortDirection = 'asc' | 'desc'

export interface SortState<T extends string> {
  field: T
  direction: SortDirection
}

export interface SortableConfig<T extends string> {
  storageKey: string
  defaultField: T
  defaultDirection: SortDirection
}

export interface SortableTableHeaderProps<T extends string> {
  field: T
  children: React.ReactNode
  currentField: T
  currentDirection: SortDirection
  onSort: (field: T) => void
  className?: string
}
