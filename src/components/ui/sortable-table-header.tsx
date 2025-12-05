import type { SortableTableHeaderProps } from '@/types/sortable'

export function SortableTableHeader<T extends string>({
  field,
  children,
  currentField,
  currentDirection,
  onSort,
  className = ''
}: SortableTableHeaderProps<T>) {
  const getHeaderStyle = () => {
    const baseStyle = 'cursor-pointer hover:bg-muted/50'
    
    if (currentField !== field) {
      return `${baseStyle} ${className}`
    }
    
    if (currentDirection === 'asc') {
      return `${baseStyle} border-t-2 border-t-blue-500 ${className}`
    } else {
      return `${baseStyle} border-b-2 border-b-blue-500 ${className}`
    }
  }

  return (
    <div 
      className={getHeaderStyle()}
      onClick={() => onSort(field)}
    >
      {children}
    </div>
  )
}
