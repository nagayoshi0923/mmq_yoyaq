import { memo } from 'react'
import { Card, CardContent } from '@/components/ui/card'

interface OrganizerInfoProps {
  authorName: string
}

export const OrganizerInfo = memo(function OrganizerInfo({ authorName }: OrganizerInfoProps) {
  return (
    <div>
      <h3 className="font-bold mb-2 sm:mb-3 text-sm sm:text-base text-muted-foreground">主催</h3>
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center text-white font-bold text-xs sm:text-sm">
              {authorName.charAt(0)}
            </div>
            <div>
              <p className="text-xs sm:text-sm font-medium">{authorName}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
})

