import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, Search, User, Check } from 'lucide-react'
import { searchCustomers, grantCouponToCustomer } from '@/lib/api/couponApi'
import type { CouponCampaign } from '@/types'
import { useDebounce } from '@/hooks/useDebounce'

interface GrantCouponDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaign: CouponCampaign | null
  onSuccess: () => void
}

interface Customer {
  id: string
  name: string
  email: string
  phone: string | null
}

export function GrantCouponDialog({
  open,
  onOpenChange,
  campaign,
  onSuccess
}: GrantCouponDialogProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const debouncedQuery = useDebounce(searchQuery, 300)

  const handleSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setCustomers([])
      return
    }

    setIsSearching(true)
    try {
      const results = await searchCustomers(query)
      setCustomers(results)
    } catch {
      setCustomers([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  useEffect(() => {
    handleSearch(debouncedQuery)
  }, [debouncedQuery, handleSearch])

  useEffect(() => {
    if (!open) {
      setSearchQuery('')
      setCustomers([])
      setSelectedCustomer(null)
      setError(null)
      setSuccessMessage(null)
    }
  }, [open])

  const handleGrant = async () => {
    if (!campaign || !selectedCustomer) return

    setIsSubmitting(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const result = await grantCouponToCustomer(campaign.id, selectedCustomer.id)
      if (result.success) {
        setSuccessMessage(`${selectedCustomer.name}にクーポンを付与しました`)
        setSelectedCustomer(null)
        setSearchQuery('')
        setCustomers([])
        onSuccess()
      } else {
        setError(result.error || '付与に失敗しました')
      }
    } catch {
      setError('付与に失敗しました')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!campaign) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>クーポンを付与</DialogTitle>
          <DialogDescription>
            「{campaign.name}」を顧客に付与します
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 bg-muted rounded-lg space-y-1">
            <div className="text-sm font-medium">{campaign.name}</div>
            <div className="text-sm text-muted-foreground">
              {campaign.discount_type === 'fixed' 
                ? `${campaign.discount_amount.toLocaleString()}円OFF` 
                : `${campaign.discount_amount}%OFF`}
              {' / '}
              使用回数: {campaign.max_uses_per_customer}回
            </div>
          </div>

          <div className="space-y-2">
            <Label>顧客を検索</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="名前、メール、電話番号で検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {isSearching && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isSearching && customers.length > 0 && (
            <ScrollArea className="h-[200px] border rounded-md">
              <div className="p-2 space-y-1">
                {customers.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    className={`w-full text-left p-2 rounded-md transition-colors ${
                      selectedCustomer?.id === customer.id
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted'
                    }`}
                    onClick={() => setSelectedCustomer(customer)}
                  >
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{customer.name}</div>
                        <div className="text-xs opacity-80 truncate">{customer.email}</div>
                      </div>
                      {selectedCustomer?.id === customer.id && (
                        <Check className="h-4 w-4 shrink-0" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}

          {!isSearching && searchQuery.length >= 2 && customers.length === 0 && (
            <div className="text-center py-4 text-muted-foreground text-sm">
              該当する顧客が見つかりません
            </div>
          )}

          {selectedCustomer && (
            <div className="p-3 bg-primary/10 rounded-lg flex items-center gap-2">
              <Badge variant="outline">選択中</Badge>
              <span className="font-medium">{selectedCustomer.name}</span>
              <span className="text-sm text-muted-foreground">({selectedCustomer.email})</span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-green-500/10 text-green-700 dark:text-green-400 rounded-lg text-sm flex items-center gap-2">
              <Check className="h-4 w-4" />
              {successMessage}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            閉じる
          </Button>
          <Button
            onClick={handleGrant}
            disabled={!selectedCustomer || isSubmitting}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            付与する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
