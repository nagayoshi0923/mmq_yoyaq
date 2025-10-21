import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Clock, Users, Star, Edit, Trash2, Upload, X } from 'lucide-react'
import type { Column } from '@/components/patterns/table'
import type { Scenario } from '@/types'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { 
  formatDuration, 
  formatPlayerCount, 
  formatParticipationFee,
  getStatusLabel,
  getDifficultyStars,
  getDisplayGMs
} from './scenarioFormatters'

interface ScenarioActionsProps {
  onEdit: (scenario: Scenario) => void
  onDelete: (scenario: Scenario) => void
  onImageUpload?: (scenario: Scenario, file: File) => void
  onImageRemove?: (scenario: Scenario) => void
}

/**
 * シナリオテーブルの列定義を生成
 */
export function createScenarioColumns(
  displayMode: 'compact' | 'detailed',
  actions: ScenarioActionsProps
): Column<Scenario>[] {
  const columns: Column<Scenario>[] = [
    {
      key: 'image',
      header: '画像',
      width: 'w-20',
      render: (scenario) => {
        const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
          const file = e.target.files?.[0]
          if (file && actions.onImageUpload) {
            actions.onImageUpload(scenario, file)
          }
          // inputをリセット
          e.target.value = ''
        }

        return (
          <div className="flex items-center justify-center">
            {scenario.key_visual_url ? (
              <div className="relative w-12 h-16 bg-gray-200 rounded overflow-hidden group">
                <OptimizedImage
                  src={scenario.key_visual_url}
                  alt={scenario.title}
                  className="w-full h-full object-cover"
                  responsive={true}
                  srcSetSizes={[48, 96]}
                  breakpoints={{ mobile: 48, tablet: 64, desktop: 96 }}
                  useWebP={true}
                  quality={85}
                  fallback={
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                      No Image
                    </div>
                  }
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (actions.onImageRemove) {
                      actions.onImageRemove(scenario)
                    }
                  }}
                  className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="画像を削除"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <label className="w-12 h-16 border-2 border-dashed border-gray-300 rounded flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors">
                <Upload className="h-4 w-4 text-gray-400" />
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                  onClick={(e) => e.stopPropagation()}
                />
              </label>
            )}
          </div>
        )
      }
    },
    {
      key: 'title',
      header: 'タイトル',
      width: 'w-40',
      sortable: true,
      render: (scenario) => (
        <button
          onClick={() => actions.onEdit(scenario)}
          className="font-medium text-sm truncate text-left hover:text-blue-600 hover:underline w-full"
          title={scenario.title}
        >
          {scenario.title}
        </button>
      )
    },
    {
      key: 'author',
      header: '作者',
      width: 'w-32',
      sortable: true,
      render: (scenario) => (
        <p className="text-sm truncate" title={scenario.author}>
          {scenario.author}
        </p>
      )
    },
    {
      key: 'duration',
      header: '所要時間',
      width: 'w-24',
      sortable: true,
      render: (scenario) => (
        <p className="text-sm flex items-center gap-1">
          <Clock className="h-3 w-3" /> {formatDuration(scenario.duration)}
        </p>
      )
    },
    {
      key: 'player_count',
      header: '人数',
      width: 'w-24',
      sortable: true,
      render: (scenario) => (
        <p className="text-sm flex items-center gap-1">
          <Users className="h-3 w-3" /> 
          {formatPlayerCount(scenario.player_count_min, scenario.player_count_max)}
        </p>
      )
    }
  ]

  // displayMode に応じて列を追加
  if (displayMode === 'compact') {
    columns.push({
      key: 'available_gms',
      header: '担当GM',
      width: 'w-96',
      sortable: true,
      render: (scenario) => {
        const { displayed: displayedGMs, remaining: remainingGMs } = getDisplayGMs(scenario.available_gms || [])
        return (
          <div className="text-sm">
            {displayedGMs.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {displayedGMs.map((gm, i) => (
                  <Badge key={i} variant="outline" className="font-normal text-xs px-1 py-0.5">
                    {gm}
                  </Badge>
                ))}
                {remainingGMs > 0 && (
                  <Badge variant="outline" className="font-normal text-xs px-1 py-0.5">
                    +{remainingGMs}
                  </Badge>
                )}
              </div>
            ) : (
              <span className="text-muted-foreground">未設定</span>
            )}
          </div>
        )
      }
    })
  } else {
    // detailed モード
    columns.push(
      {
        key: 'difficulty',
        header: '難易度',
        width: 'w-24',
        sortable: true,
        render: (scenario) => (
          <div className="flex items-center gap-1">
            {[...Array(5)].map((_, i) => (
              <Star 
                key={i} 
                className={`h-3 w-3 ${i < getDifficultyStars(scenario.difficulty) ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground'}`} 
              />
            ))}
          </div>
        )
      },
      {
        key: 'license',
        header: 'ライセンス料',
        width: 'w-28',
        render: (scenario) => {
          const normalLicense = scenario.license_amount || 0
          const gmTestLicense = scenario.gm_test_license_amount || 0
          
          if (normalLicense === 0 && gmTestLicense === 0) {
            return <p className="text-sm text-right text-muted-foreground">¥0</p>
          }
          
          return (
            <div className="text-xs space-y-0.5">
              <p className="text-right">
                通常: ¥{normalLicense.toLocaleString()}
              </p>
              <p className="text-right text-muted-foreground">
                GMテスト: ¥{gmTestLicense.toLocaleString()}
              </p>
            </div>
          )
        }
      }
    )
  }

  // 共通列
  columns.push(
    {
      key: 'participation_fee',
      header: '参加費',
      width: 'w-24',
      sortable: true,
      render: (scenario) => (
        <p className="text-sm text-right">
          {formatParticipationFee(scenario.participation_fee || 0)}
        </p>
      )
    },
    {
      key: 'status',
      header: 'ステータス',
      width: 'w-28',
      sortable: true,
      render: (scenario) => (
        <Badge className={
          scenario.status === 'available' ? 'bg-green-100 text-green-800 px-1 py-0.5' :
          scenario.status === 'maintenance' ? 'bg-yellow-100 text-yellow-800 px-1 py-0.5' :
          'bg-red-100 text-red-800 px-1 py-0.5'
        }>
          {getStatusLabel(scenario.status)}
        </Badge>
      )
    }
  )

  // detailed モードのみ: ジャンル列
  if (displayMode === 'detailed') {
    columns.push({
      key: 'genre',
      header: 'ジャンル',
      width: 'flex-1 min-w-0',
      sortable: true,
      cellClassName: 'min-w-0',
      render: (scenario) => {
        if (!scenario.genre || scenario.genre.length === 0) return null
        return (
          <div className="flex flex-wrap gap-1">
            {scenario.genre.slice(0, 2).map((g, i) => (
              <Badge key={i} variant="outline" className="font-normal text-xs px-1 py-0.5">
                {g}
              </Badge>
            ))}
            {scenario.genre.length > 2 && (
              <Badge variant="outline" className="font-normal text-xs px-1 py-0.5">
                +{scenario.genre.length - 2}
              </Badge>
            )}
          </div>
        )
      }
    })
  }

  // アクション列
  columns.push({
    key: 'actions',
      header: 'アクション',
    width: 'w-24',
    headerClassName: 'text-center',
    render: (scenario) => (
      <div className="flex gap-1 justify-center">
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-6 w-6 p-0"
          title="編集"
          onClick={() => actions.onEdit(scenario)}
        >
          <Edit className="h-4 w-4" />
        </Button>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
          title="削除"
          onClick={() => actions.onDelete(scenario)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    )
  })

  return columns
}

