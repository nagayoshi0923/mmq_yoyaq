/** 公演の各表示/APIモデルが共有するフィールド。DB行の全定義ではない。 */
export type ScheduleEventCategory = 'open' | 'private' | 'gmtest' | 'testplay' | 'offsite' | 'venue_rental' | 'venue_rental_free' | 'package' | 'mtg'

export interface ScheduleEventBase {
  id: string
  date: string
  venue: string
  scenario: string
  gms: string[]
  start_time: string
  end_time: string
  is_cancelled: boolean
  organization_id?: string
  store_id?: string
}
