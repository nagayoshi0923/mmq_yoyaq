import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, BookOpen } from 'lucide-react'
import { memo } from 'react'
import { MYPAGE_THEME as THEME } from '@/lib/theme'

interface SearchBarProps {
  searchTerm: string
  onSearchChange: (value: string) => void
  organizationSlug?: string
}

/**
 * 検索バーコンポーネント
 */
export const SearchBar = memo(function SearchBar({ 
  searchTerm, 
  onSearchChange,
  organizationSlug
}: SearchBarProps) {
  const handleCatalogClick = () => {
    const catalogPath = organizationSlug ? `/${organizationSlug}/catalog` : '/catalog'
    window.location.href = catalogPath
  }

  return (
    <div className="max-w-xl mx-auto w-full flex gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="シナリオを検索..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8 sm:pl-9 pr-3 text-sm h-10 md:h-9"
        />
      </div>
      <Button
        variant="outline"
        onClick={handleCatalogClick}
        className="h-10 md:h-9 px-3 flex items-center gap-1.5 whitespace-nowrap text-sm hover:scale-[1.02] transition-transform"
        style={{ 
          borderColor: THEME.primary,
          color: THEME.primary,
          borderWidth: 2,
        }}
      >
        <BookOpen className="w-4 h-4" />
        <span className="hidden sm:inline">カタログ</span>
      </Button>
    </div>
  )
})

