import { useState, useEffect, useCallback } from 'react'
import { Check, ChevronsUpDown, Loader2, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { supabase } from '@/lib/supabase'

interface UserOption {
  id: string
  email: string
  role: string
}

interface UserSearchComboboxProps {
  value: string
  onValueChange: (userId: string, user: UserOption | null) => void
  placeholder?: string
  disabled?: boolean
}

export function UserSearchCombobox({
  value,
  onValueChange,
  placeholder = 'メールアドレスで検索...',
  disabled = false
}: UserSearchComboboxProps) {
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [users, setUsers] = useState<UserOption[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null)

  // ユーザーを検索
  const searchUsers = useCallback(async (email: string) => {
    if (!email || email.length < 2) {
      setUsers([])
      return
    }

    setIsSearching(true)
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, role')
        .ilike('email', `%${email}%`)
        .limit(10)

      if (error) {
        console.error('Error searching users:', error)
        setUsers([])
      } else {
        setUsers(data || [])
      }
    } catch (err) {
      console.error('Error searching users:', err)
      setUsers([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  // 検索キーワードが変わったら検索実行
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchUsers(searchTerm)
    }, 300) // デバウンス: 300ms

    return () => clearTimeout(timeoutId)
  }, [searchTerm, searchUsers])

  // 選択されたユーザーを取得
  useEffect(() => {
    if (value) {
      const user = users.find(u => u.id === value)
      setSelectedUser(user || null)
    } else {
      setSelectedUser(null)
    }
  }, [value, users])

  const handleSelect = (user: UserOption) => {
    onValueChange(user.id, user)
    setOpen(false)
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-purple-100 text-purple-800'
      case 'staff':
        return 'bg-blue-100 text-blue-800'
      case 'customer':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={disabled}
        >
          {selectedUser ? (
            <span className="flex items-center gap-2 truncate">
              <User className="h-4 w-4" />
              {selectedUser.email}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="メールアドレスを入力..." 
            value={searchTerm}
            onValueChange={setSearchTerm}
          />
          <CommandEmpty>
            {isSearching ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                検索中...
              </div>
            ) : searchTerm.length < 2 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                2文字以上入力してください
              </div>
            ) : (
              <div className="py-6 text-center text-sm text-muted-foreground">
                ユーザーが見つかりません
              </div>
            )}
          </CommandEmpty>
          <CommandGroup className="max-h-[300px] overflow-auto">
            {users.map((user) => (
              <CommandItem
                key={user.id}
                value={user.id}
                onSelect={() => handleSelect(user)}
                className="cursor-pointer"
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4 flex-shrink-0",
                    value === user.id ? "opacity-100" : "opacity-0"
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="font-medium truncate">{user.email}</span>
                  </div>
                  <div className="mt-1">
                    <span className={cn(
                      "inline-block text-xs px-2 py-0.5 rounded-full",
                      getRoleBadgeColor(user.role)
                    )}>
                      {user.role}
                    </span>
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

