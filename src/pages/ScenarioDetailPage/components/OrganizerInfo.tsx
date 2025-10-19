import { memo } from 'react'
import { Card, CardContent } from '@/components/ui/card'

interface OrganizerInfoProps {
  authorName: string
}

export const OrganizerInfo = memo(function OrganizerInfo({ authorName }: OrganizerInfoProps) {
  return (
    <div>
      <h3 className="font-bold mb-3 text-muted-foreground">主催</h3>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
              {authorName.charAt(0)}
            </div>
            <div>
              <p className="text-sm font-medium">{authorName}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
})

