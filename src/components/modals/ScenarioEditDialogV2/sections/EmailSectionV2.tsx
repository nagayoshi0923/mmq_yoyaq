import { useState, useCallback } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import {
  getDefaultPrivateConfirmTemplate,
  getDefaultReservationTemplate,
} from '@/lib/templateRegistry'
import { ConfirmDialog } from '@/components/patterns/modal'
import type { ScenarioFormData } from '@/components/modals/ScenarioEditDialogV2/types'

interface EmailSectionV2Props {
  formData: ScenarioFormData
  setFormData: React.Dispatch<React.SetStateAction<ScenarioFormData>>
}

type OverrideField = 'reservation_confirmation_template' | 'private_confirm_template'

export function EmailSectionV2({ formData, setFormData }: EmailSectionV2Props) {
  const [quotingField, setQuotingField] = useState<OverrideField | null>(null)
  const [quoteConfirmField, setQuoteConfirmField] = useState<OverrideField | null>(null)

  const applyQuotedStoreTemplate = useCallback(async (field: OverrideField) => {
    setQuotingField(field)
    try {
      const orgId = await getCurrentOrganizationId()
      const storeId = formData.available_stores?.[0] || null
      let query = supabase
        .from('email_settings')
        .select('reservation_confirmation_template, private_confirm_template, company_name, company_phone, company_email')
      if (storeId) {
        query = query.eq('store_id', storeId)
      } else if (orgId) {
        query = query.eq('organization_id', orgId)
      } else {
        setFormData(prev => ({
          ...prev,
          [field]: field === 'private_confirm_template'
            ? getDefaultPrivateConfirmTemplate()
            : getDefaultReservationTemplate(),
        }))
        return
      }
      const { data, error } = await query.limit(1).maybeSingle()
      if (error) throw error
      const quoted = field === 'private_confirm_template'
        ? (data?.private_confirm_template?.trim()
          || getDefaultPrivateConfirmTemplate(data?.company_name || '', data?.company_phone || '', data?.company_email || ''))
        : (data?.reservation_confirmation_template?.trim()
          || getDefaultReservationTemplate(data?.company_name || '', data?.company_phone || '', data?.company_email || ''))
      setFormData(prev => ({ ...prev, [field]: quoted }))
    } catch (e) {
      logger.error('店舗テンプレの引用エラー:', e)
      showToast.error('店舗テンプレの読み込みに失敗しました')
    } finally {
      setQuotingField(null)
      setQuoteConfirmField(null)
    }
  }, [formData.available_stores, setFormData])

  const handleQuoteStoreTemplate = useCallback((field: OverrideField) => {
    if (formData[field]?.trim()) {
      setQuoteConfirmField(field)
      return
    }
    void applyQuotedStoreTemplate(field)
  }, [formData, applyQuotedStoreTemplate])

  return (
    <>
      <OverrideCard
        title="予約確定メール（この作品だけ上書き）"
        help="通常予約の完了時に使います。空なら店舗の予約確認テンプレを送ります。"
        value={formData.reservation_confirmation_template || ''}
        onChange={(value) => setFormData(prev => ({ ...prev, reservation_confirmation_template: value || null }))}
        placeholder="空欄のままなら、店舗の予約確認メールを使います"
        quoting={quotingField === 'reservation_confirmation_template'}
        onQuote={() => handleQuoteStoreTemplate('reservation_confirmation_template')}
        note="公演ダイアログの「予約確認を上書き」があれば、そちらが優先されます。"
      />

      <OverrideCard
        title="貸切確定メール（この作品だけ上書き）"
        help="貸切を承認したときに使います。空なら店舗の貸切確定テンプレを送ります。"
        value={formData.private_confirm_template || ''}
        onChange={(value) => setFormData(prev => ({ ...prev, private_confirm_template: value || null }))}
        placeholder="空欄のままなら、店舗の貸切確定メールを使います"
        quoting={quotingField === 'private_confirm_template'}
        onQuote={() => handleQuoteStoreTemplate('private_confirm_template')}
        note="公演ダイアログの「貸切確定を上書き」があれば、そちらが優先されます。"
      />

      <ConfirmDialog
        open={quoteConfirmField !== null}
        onOpenChange={(open) => { if (!open) setQuoteConfirmField(null) }}
        title="店舗テンプレを引用しますか？"
        description="今の上書き文面は、店舗テンプレで置き換わります。"
        confirmLabel="引用する"
        cancelLabel="キャンセル"
        onConfirm={() => {
          if (quoteConfirmField) void applyQuotedStoreTemplate(quoteConfirmField)
        }}
        isLoading={quotingField !== null}
      />
    </>
  )
}

function OverrideCard({
  title,
  help,
  value,
  onChange,
  placeholder,
  quoting,
  onQuote,
  note,
}: {
  title: string
  help: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  quoting: boolean
  onQuote: () => void
  note: string
}) {
  return (
    <div className="scenario-edit-card">
      <p className="scenario-edit-card__title">{title}</p>
      <p className="scenario-edit-card__help">{help}</p>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="scenario-edit-card__textarea"
      />
      <button
        type="button"
        className="scenario-edit-card__quote"
        onClick={onQuote}
        disabled={quoting}
      >
        {quoting ? '引用中…' : '店舗テンプレを引用'}
      </button>
      <p className="scenario-edit-card__note">{note}</p>
    </div>
  )
}
