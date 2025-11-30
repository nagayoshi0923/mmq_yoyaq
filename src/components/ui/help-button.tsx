import { HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface HelpButtonProps {
  /** マニュアルのタブID (例: 'staff', 'reservation') */
  topic: string
  /** ツールチップに表示するテキスト */
  label?: string
}

export function HelpButton({ topic, label = 'マニュアルを開く' }: HelpButtonProps) {
  const handleClick = () => {
    // 新しいタブで開くのではなく、現在のウィンドウで遷移
    window.location.hash = `manual?tab=${topic}`
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClick}
            className="text-muted-foreground hover:text-primary"
          >
            <HelpCircle className="h-5 w-5" />
            <span className="sr-only">{label}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

