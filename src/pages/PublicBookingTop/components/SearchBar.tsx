import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import { memo } from 'react'

interface SearchBarProps {
  searchTerm: string
  onSearchChange: (value: string) => void
}

/**
 * 検索バーコンポーネント
 */
export const SearchBar = memo(function SearchBar({ 
  searchTerm, 
  onSearchChange 
}: SearchBarProps) {
  return (
    <div className="max-w-lg mx-auto w-full">
      <div className="relative">
        <Search className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
        <Input
          type="text"
          placeholder="シナリオを検索..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8 sm:pl-10 pr-3 sm:pr-4 py-2 sm:py-2.5 text-sm sm:text-base h-10 sm:h-11"
        />
      </div>
    </div>
  )
})

