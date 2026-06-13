import { useState } from 'react'
import type { ComponentProps } from 'react'
import { Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { showToast } from '@/utils/toast'
import { TemplateEditDialog } from '@/components/settings/TemplateEditDialog'
import type { EmailTemplateKey } from '@/lib/templateRegistry'

interface TemplateEditButtonProps {
  templateKey: EmailTemplateKey
  storeId?: string | null
  organizationId?: string | null
  label: string
  unavailableMessage?: string
  className?: string
  variant?: ComponentProps<typeof Button>['variant']
  size?: ComponentProps<typeof Button>['size']
  onSaved?: (value: string) => void
}

export function TemplateEditButton({
  templateKey,
  storeId,
  organizationId,
  label,
  unavailableMessage = '店舗・組織が特定できず、テンプレートを開けません',
  className,
  variant = 'ghost',
  size = 'sm',
  onSaved,
}: TemplateEditButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={() => {
          if (!storeId && !organizationId) {
            showToast.error(unavailableMessage)
            return
          }
          setOpen(true)
        }}
      >
        <Mail className="h-3 w-3 mr-1" />
        {label}
      </Button>
      <TemplateEditDialog
        templateKey={templateKey}
        storeId={storeId}
        organizationId={organizationId}
        open={open}
        onOpenChange={setOpen}
        onSaved={onSaved}
      />
    </>
  )
}
