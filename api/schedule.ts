import { preparationSettings } from './_lib/preparationSettings.js'
import { operatingSettings, groupSurveySettings, effectiveEmailSettings } from './_lib/operatingSettings.js'
import { bookingCutoffSettings } from './_lib/bookingCutoffSettings.js'
import { privateBookingSettings } from './_lib/privateBookingSettings.js'
import { confirmationTemplates } from './_lib/confirmationTemplates.js'
import { recruitmentSettings, commonRecruitmentSettings } from './_lib/recruitmentSettings.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, getMissingEnvError } from './_lib/db.js'
import { requireAuth, requireStaff, ApiError, type AuthUser } from './_lib/auth.js'
import { setCors } from './_lib/schedule/common.js'
import { handleMySchedule } from './_lib/schedule/mySchedule.js'
import { handleByMonth } from './_lib/schedule/byMonth.js'
import { handleByDateRange, handleByScenario } from './_lib/schedule/reads.js'
import { handleCreate } from './_lib/schedule/create.js'
import { handleUpdate } from './_lib/schedule/update.js'
import { handleToggleCancel, handleDelete } from './_lib/schedule/cancelDelete.js'
import { handleAddDemoParticipants, handleRemoveDemoReservations } from './_lib/schedule/demo.js'
import { handleExtendRecruitment, handleBookingWindow, handleBookingCutoff, handleScenarioBookingCutoff } from './_lib/schedule/recruitment.js'

// 公演 API の入口。処理は api/_lib/schedule/ に分けてある（整備 Phase 3、#774）。

// ─── エントリポイント ────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const envError = getMissingEnvError()
  if (envError || !db) return res.status(500).json({ error: `環境変数が未設定です: ${envError}` })

  try {
    const user = await requireAuth(req)
    requireStaff(user)

    if (req.method === 'GET') return await handleGet(req, res, user)
    if (req.method === 'POST') return await handlePost(req, res, user)
    if (req.method === 'PATCH') return await handlePatch(req, res, user)
    if (req.method === 'DELETE') return await handleDelete(req, res, user)
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[schedule] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const type = req.query.type as string | undefined
  if (!type) {
    return res.status(400).json({ error: 'type クエリパラメータが必要です' })
  }
  switch (type) {
    case 'confirmation-templates':
      return await confirmationTemplates(req, res, user)
    case 'private-booking-settings':
      return await privateBookingSettings(req, res, user)
    case 'common-recruitment-settings':
      return await commonRecruitmentSettings(req, res, user)
    case 'recruitment-settings':
      return await recruitmentSettings(req, res, user)
    case 'group-survey-settings':
      return await groupSurveySettings(req, res, user)
    case 'preparation-settings':
      return await preparationSettings(req, res, user)
    case 'effective-email-settings':
      return await effectiveEmailSettings(req, res, user)
    case 'operating-settings':
      return await operatingSettings(req, res, user)
    case 'booking-cutoff-settings':
      return await bookingCutoffSettings(req, res, user)
    case 'scenario-booking-cutoff':
      return await handleScenarioBookingCutoff(req, res, user, false)
    case 'booking-window':
      return await handleBookingWindow(req, res, user)
    case 'my-schedule':
      return await handleMySchedule(req, res, user)
    case 'by-month':
      return await handleByMonth(req, res, user)
    case 'by-date-range':
      return await handleByDateRange(req, res, user)
    case 'by-scenario':
      return await handleByScenario(req, res, user)
    default:
      return res.status(400).json({ error: `未対応の type: ${type}` })
  }
}

async function handlePost(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const action = req.query.action as string | undefined
  if (action === 'add-demo-participants') return await handleAddDemoParticipants(req, res, user)
  if (action === 'remove-demo-reservations') return await handleRemoveDemoReservations(req, res, user)
  return await handleCreate(req, res, user)
}

async function handlePatch(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const action = req.query.action as string | undefined
  if (action === 'confirmation-templates') return await confirmationTemplates(req, res, user, true)
  if (action === 'private-booking-settings') return await privateBookingSettings(req, res, user, true)
  if (action === 'common-recruitment-settings') return await commonRecruitmentSettings(req, res, user, true)
  if (action === 'recruitment-settings') return await recruitmentSettings(req, res, user, true)
  if (action === 'freeze-group-survey-deadline') return await groupSurveySettings(req, res, user, true)
  if (action === 'operating-settings') return await operatingSettings(req, res, user, true)
  if (action === 'booking-cutoff-settings') return await bookingCutoffSettings(req, res, user, true)
  if (action === 'scenario-booking-cutoff') return await handleScenarioBookingCutoff(req, res, user, true)
  if (action === 'booking-cutoff') return await handleBookingCutoff(req, res, user)
  if (action === 'extend-recruitment') return await handleExtendRecruitment(req, res, user)
  if (action === 'toggle-cancel') return await handleToggleCancel(req, res, user)
  return await handleUpdate(req, res, user)
}
