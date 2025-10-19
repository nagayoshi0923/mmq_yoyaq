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
    <div className="max-w-md mx-auto mb-8">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input
          type="text"
          placeholder="シナリオを検索..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 pr-4 py-6 text-lg"
        />
      </div>
    </div>
  )
})

