import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StaffManual } from './StaffManual'
import { BookOpen, Users, CalendarDays, FileText } from 'lucide-react'

export function ManualPage() {
  return (
    <AppLayout 
      currentPage="settings" // 設定やヘルプの一環として配置
      maxWidth="max-w-[1440px]"
      containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
      className="mx-auto"
    >
      <div className="space-y-6">
        <PageHeader
          title="操作マニュアル"
          description="システムの操作方法と使用シーンについてのガイド"
        >
          <BookOpen className="h-5 w-5 text-muted-foreground" />
        </PageHeader>

        <Tabs defaultValue="staff" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="staff" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              スタッフ管理
            </TabsTrigger>
            <TabsTrigger value="reservation" className="flex items-center gap-2" disabled>
              <CalendarDays className="h-4 w-4" />
              予約管理
            </TabsTrigger>
            <TabsTrigger value="shift" className="flex items-center gap-2" disabled>
              <FileText className="h-4 w-4" />
              シフト管理
            </TabsTrigger>
          </TabsList>
          
          <div className="mt-6">
            <TabsContent value="staff" className="m-0">
              <StaffManual />
            </TabsContent>
            
            <TabsContent value="reservation" className="m-0">
              <div className="p-8 text-center text-muted-foreground border rounded-lg border-dashed">
                予約管理マニュアルは準備中です
              </div>
            </TabsContent>
            
            <TabsContent value="shift" className="m-0">
              <div className="p-8 text-center text-muted-foreground border rounded-lg border-dashed">
                シフト管理マニュアルは準備中です
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </AppLayout>
  )
}

