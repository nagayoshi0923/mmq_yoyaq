import { useState, useCallback } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { getDefaultReservationTemplate } from '@/lib/templateRegistry'
import { ConfirmDialog } from '@/components/patterns/modal'
import type { ScenarioFormData } from '@/components/modals/ScenarioEditDialogV2/types'

interface EmailSectionV2Props {
  formData: ScenarioFormData
  setFormData: React.Dispatch<React.SetStateAction<ScenarioFormData>>
}

export function EmailSectionV2({ formData, setFormData }: EmailSectionV2Props) {
  const [quotingTemplate, setQuotingTemplate] = useState(false)
  const [quoteConfirmOpen, setQuoteConfirmOpen] = useState(false)

  const applyQuotedStoreTemplate = useCallback(async () => {
    setQuotingTemplate(true)
    try {
      const orgId = await getCurrentOrganizationId()
      const storeId = formData.available_stores?.[0] || null
      let query = supabase
        .from('email_settings')
        .select('reservation_confirmation_template, company_name, company_phone, company_email')
      if (storeId) {
        query = query.eq('store_id', storeId)
      } else if (orgId) {
        query = query.eq('organization_id', orgId)
      } else {
        setFormData(prev => ({ ...prev, reservation_confirmation_template: getDefaultReservationTemplate() }))
        return
      }
      const { data, error } = await query.limit(1).maybeSingle()
      if (error) throw error
      const quoted = data?.reservation_confirmation_template?.trim()
        || getDefaultReservationTemplate(data?.company_name || '', data?.company_phone || '', data?.company_email || '')
      setFormData(prev => ({ ...prev, reservation_confirmation_template: quoted }))
    } catch (e) {
      logger.error('店舗テンプレの引用エラー:', e)
      showToast.error('店舗テンプレの読み込みに失敗しました')
    } finally {
      setQuotingTemplate(false)
      setQuoteConfirmOpen(false)
    }
  }, [formData.available_stores, setFormData])

  const handleQuoteStoreTemplate = useCallback(() => {
    if (formData.reservation_confirmation_template?.trim()) {
      setQuoteConfirmOpen(true)
      return
    }
    void applyQuotedStoreTemplate()
  }, [formData.reservation_confirmation_template, applyQuotedStoreTemplate])

  return (
    <>
      <div className="scenario-edit-card">
        <p className="scenario-edit-card__title">予約確定メール（この作品だけ上書き）</p>
        <p className="scenario-edit-card__help">
          空なら店舗の予約確認テンプレを送ります。事前読み込み案内など、この作品だけ変えたいときに記入してください。
        </p>
        <Textarea
          value={formData.reservation_confirmation_template || ''}
          onChange={(e) => setFormData(prev => ({ ...prev, reservation_confirmation_template: e.target.value || null }))}
          placeholder="空欄のままなら、店舗の予約確認メールを使います"
          className="scenario-edit-card__textarea"
        />
        <button
          type="button"
          className="scenario-edit-card__quote"
          onClick={handleQuoteStoreTemplate}
          disabled={quotingTemplate}
        >
          {quotingTemplate ? '引用中…' : '店舗テンプレを引用'}
        </button>
        <p className="scenario-edit-card__note">
          公演ダイアログで「この公演だけ上書き」すれば、作品の文面よりそちらが優先されます。
        </p>
      </div>

      <ConfirmDialog
        open={quoteConfirmOpen}
        onOpenChange={setQuoteConfirmOpen}
        title="店舗テンプレを引用しますか？"
        description="今の上書き文面は、店舗の予約確認テンプレで置き換わります。"
        confirmLabel="引用する"
        cancelLabel="キャンセル"
        onConfirm={applyQuotedStoreTemplate}
        isLoading={quotingTemplate}
      />
    </>
  )
}
