// Existing properties verified in Google Analytics on 2026-09-08.
// Only public page paths and aggregate reservation completion are sent.
const QW_ID = 'G-1JLE1C4K9W'
const MMQ_ID = 'G-QSE4VBLEVF'
const initialized = new Set<string>()
const completed = new Set<string>()
let lastPage = ''
type AnalyticsWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void }
export function publicAnalyticsTarget(path: string): string | null {
  if (/^\/queens-waltz(?:\/scenario\/[^/]+)?\/?$/.test(path)) return QW_ID
  if (/^\/(?:scenario(?:\/[^/]+)?|guide|faq|stores|about|for-business)?\/?$/.test(path)) return MMQ_ID
  return null
}
function init(id: string) {
  if (window.location.hostname !== 'mmq.game') return null
  const win = window as AnalyticsWindow
  win.dataLayer ??= []
  // gtag.js consumes an Arguments object (not an array).
  // eslint-disable-next-line prefer-rest-params
  win.gtag ??= function () { win.dataLayer!.push(arguments) }
  if (!initialized.has(id)) {
    if (!document.getElementById('mmq-analytics')) {
      const script=document.createElement('script'); script.id='mmq-analytics'; script.async=true
      script.src=`https://www.googletagmanager.com/gtag/js?id=${id}`; document.head.appendChild(script)
      win.gtag('js', new Date())
    }
    win.gtag('config', id, {send_page_view:false, page_location:'https://mmq.game/', page_title:'MMQ', page_referrer:safeReferrer(), allow_google_signals:false,
      allow_ad_personalization_signals:false, linker:{domains:['queenswaltz.jp','mmq.game']}})
    initialized.add(id)
  }
  return win.gtag
}
function safeReferrer() {
  try { return new URL(document.referrer).origin } catch { return '' }
}
export function trackPublicPage(path: string) {
  const id=publicAnalyticsTarget(path)
  if (!id) {lastPage=''; return}
  if(lastPage===path) return
  const gtag=init(id);if(!gtag) return
  lastPage=path
  gtag('event','page_view',{send_to:id,page_location:`https://mmq.game${path}`,
    page_title:path,page_referrer:safeReferrer()})
}
export function trackReservationComplete(reservationId: string, orgSlug?: string) {
  // The reservation ID is used only for in-memory deduplication; it is never sent to Google.
  if(completed.has(reservationId))return
  const id=orgSlug==='queens-waltz'?QW_ID:MMQ_ID
  const gtag=init(id);if(!gtag)return
  completed.add(reservationId)
  gtag('event','reservation_complete',{send_to:id,booking_type:'normal',
    page_location:`https://mmq.game/${orgSlug==='queens-waltz'?'queens-waltz':''}`,
    page_title:'予約完了',page_referrer:safeReferrer()})
}
