import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/apiClient'
import {
  resolveInheritedSetting, resolveSetting, type SettingLayers, type SettingScope, type SettingValue,
} from '../../supabase/functions/_shared/settings-inheritance'
import { SETTING_DEFINITIONS } from '../../supabase/functions/_shared/setting-definitions'

interface SettingsResponse {
  layers: SettingLayers
  revisions: Record<SettingScope, number>
  can_edit: boolean
}

export function useOperatingSettings(scope: SettingScope, targetId?: string, enabled = true) {
  const client = useQueryClient()
  const [data, setData] = useState<SettingsResponse | null>(null)
  const [draft, setDraft] = useState<Record<string, SettingValue | null>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const generation = useRef(0)
  const query = `scope=${scope}${scope === 'organization' ? '' : `&target_id=${encodeURIComponent(targetId ?? '')}`}`
  const load = useCallback(async () => {
    const current = ++generation.current
    setLoading(true); setError(''); setData(null); setDraft({})
    if (!enabled || (scope !== 'organization' && !targetId)) { setLoading(false); return false }
    try {
      const result = await apiClient.get<SettingsResponse>(`/api/schedule?type=operating-settings&${query}`)
      if (current !== generation.current) return false
      setData(result); return true
    } catch (e) {
      if (current === generation.current) setError(e instanceof Error ? e.message : '設定を読み込めませんでした')
      return false
    } finally { if (current === generation.current) setLoading(false) }
  }, [query, scope, targetId, enabled])
  const cancelPending = useCallback(() => { generation.current++ }, [])
  useEffect(() => { setMessage(''); void load(); return cancelPending }, [load, cancelPending])
  const layers = { ...data?.layers, [scope]: { ...data?.layers[scope], ...draft } }
  function resolve(key: string, fallback: SettingValue) {
    return resolveSetting(key, fallback, layers, SETTING_DEFINITIONS[key]?.scopes)
  }
  function inherited(key: string, fallback: SettingValue) {
    return resolveInheritedSetting(key, fallback, layers, scope, SETTING_DEFINITIONS[key]?.scopes)
  }
  function set(key: string, value: SettingValue | null) {
    setDraft(previous => ({ ...previous, [key]: value })); setMessage('')
  }
  async function save(values = draft) {
    if (!data?.can_edit || !Object.keys(values).length) return false
    const current = generation.current
    setSaving(true); setError(''); setMessage('')
    try {
      await apiClient.patch(`/api/schedule?action=operating-settings&${query}`, {
        settings: values, expected_revision: data.revisions[scope],
      })
      await Promise.all([
        client.invalidateQueries({ queryKey: ['booking-payment-settings'], refetchType: 'all' }),
        client.invalidateQueries({ queryKey: ['preparation-settings'], refetchType: 'all' }),
        client.invalidateQueries({ queryKey: ['group-survey-settings'], refetchType: 'all' }),
      ])
      if (current !== generation.current) return false
      if (await load()) { setMessage('設定を保存しました'); return true }
      return false
    } catch (e) {
      if (current === generation.current) setError(e instanceof Error ? e.message : '保存できませんでした')
      return false
    } finally { setSaving(false) }
  }
  return { data, loading, saving, error, message, resolve, inherited, set, save, reload: load, dirty: Object.keys(draft).length > 0 }
}
