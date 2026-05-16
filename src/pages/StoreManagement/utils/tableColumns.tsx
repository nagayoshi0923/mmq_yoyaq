import { Edit } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Column } from '@/components/patterns/table'
import type { Store } from '@/types'
import { devDb } from '@/components/ui/DevField'

interface StoreTableActions {
  onEdit: (store: Store) => void
}

const STORE_COLORS: Record<string, { dot: string; badge: string }> = {
  '馬場': { dot: 'bg-blue-500', badge: 'bg-blue-100 text-blue-800' },
  '別館①': { dot: 'bg-green-500', badge: 'bg-green-100 text-green-800' },
  '別館②': { dot: 'bg-purple-500', badge: 'bg-purple-100 text-purple-800' },
  '大久保': { dot: 'bg-orange-500', badge: 'bg-orange-100 text-orange-800' },
  '大塚': { dot: 'bg-red-500', badge: 'bg-red-100 text-red-800' },
  '埼玉大宮': { dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-800' },
}

export function getStoreColors(shortName: string) {
  return STORE_COLORS[shortName] ?? { dot: 'bg-gray-500', badge: 'bg-gray-100 text-gray-800' }
}

export function getStatusBadge(status: string) {
  switch (status) {
    // @ts-ignore
    case 'active': return <Badge variant="success">営業中</Badge>
    // @ts-ignore
    case 'temporarily_closed': return <Badge variant="warning">一時休業</Badge>
    // @ts-ignore
    case 'closed': return <Badge variant="gray">閉鎖</Badge>
    default: return <Badge variant="outline">不明</Badge>
  }
}

export function createStoreColumns(actions: StoreTableActions): Column<Store>[] {
  const { onEdit } = actions

  return [
    {
      key: 'name',
      header: '店舗名',
      sortable: true,
      required: true,
      width: 'w-52',
      render: (store) => {
        const colors = getStoreColors(store.short_name)
        return (
          <button
            onClick={() => onEdit(store)}
            className="flex items-center gap-2 w-full hover:bg-muted/50 rounded px-2 py-1 -mx-2 -my-1 transition-colors text-left"
          >
            <div className={`w-3 h-3 rounded-full flex-shrink-0 ${colors.dot}`} />
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate hover:text-blue-600" {...devDb('stores.name')}>{store.name}</div>
              <div className="text-xs text-muted-foreground" {...devDb('stores.short_name')}>{store.short_name}</div>
            </div>
          </button>
        )
      },
    },
    {
      key: 'status',
      header: 'ステータス',
      sortable: false,
      width: 'w-28',
      render: (store) => getStatusBadge(store.status),
    },
    {
      key: 'ownership_type',
      header: 'タイプ',
      sortable: false,
      width: 'w-24',
      render: (store) => {
        if (!store.ownership_type) return <span className="text-xs text-muted-foreground">-</span>
        return (
          <Badge
            // @ts-ignore
            variant={
              store.ownership_type === 'corporate' ? 'info' :
              store.ownership_type === 'office' ? 'purple' : 'warning'
            }
            className="text-[10px] px-1.5 py-0 font-normal"
          >
            {store.ownership_type === 'corporate' ? '直営店' :
             store.ownership_type === 'office' ? 'オフィス' : 'FC'}
          </Badge>
        )
      },
    },
    {
      key: 'region',
      header: '地域',
      sortable: false,
      width: 'w-24',
      render: (store) => (
        <span className="text-sm text-muted-foreground">{store.region || '-'}</span>
      ),
    },
    {
      key: 'capacity',
      header: '収容',
      sortable: true,
      width: 'w-20',
      align: 'center',
      render: (store) => (
        <span className="text-sm">
          <span className="font-medium" {...devDb('stores.capacity')}>{store.capacity || 0}</span>
          <span className="text-xs text-muted-foreground">名</span>
        </span>
      ),
    },
    {
      key: 'rooms',
      header: '部屋',
      sortable: true,
      width: 'w-20',
      align: 'center',
      render: (store) => (
        <span className="text-sm">
          <span className="font-medium" {...devDb('stores.rooms')}>{store.rooms || 0}</span>
          <span className="text-xs text-muted-foreground">室</span>
        </span>
      ),
    },
    {
      key: 'address',
      header: '住所',
      sortable: false,
      width: 'w-56',
      render: (store) => (
        <span className="text-sm text-muted-foreground line-clamp-1">{store.address || '-'}</span>
      ),
    },
    {
      key: 'manager_name',
      header: '店長',
      sortable: false,
      width: 'w-28',
      render: (store) => (
        <span className="text-sm">{store.manager_name || '-'}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      sortable: false,
      required: true,
      width: 'w-12',
      align: 'center',
      render: (store) => (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onEdit(store)}
          className="h-7 w-7"
        >
          <Edit className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ]
}
