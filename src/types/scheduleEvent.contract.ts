/** npm run typecheckで実行する型契約。実行時コード・値は生成しない。 */
import type { ScheduleEvent as Legacy } from './scheduleEvent'
import type { ScheduleEvent as View } from './schedule'
import type { ScheduleEvent as Api } from '@/lib/api/types'
import type { ScheduleEventBase, ScheduleEventCategory } from './scheduleEventBase'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Assert<T extends true> = T
type SharedFields = Exclude<keyof ScheduleEventBase, 'store_id'>
type LegacyView = Assert<Equal<Pick<Legacy, SharedFields>, Pick<View, SharedFields>>>
type ViewApi = Assert<Equal<Pick<View, SharedFields>, Pick<Api, SharedFields>>>
type Categories = Assert<Equal<Legacy['category'], View['category']>>
type CategorySource = Assert<Equal<View['category'], ScheduleEventCategory>>
// 移行時に勝手に同一化してはいけない既存契約。
type LegacyNullableSlot = Assert<Equal<Legacy['time_slot'], string | null | undefined>>
type ViewSlot = Assert<Equal<View['time_slot'], string | undefined>>
type ApiStore = Assert<Equal<Api['store_id'], string>>
type LegacyTimestamp = Assert<Equal<Legacy['created_at'], string>>
export type ScheduleEventContracts = [LegacyView, ViewApi, Categories, CategorySource, LegacyNullableSlot, ViewSlot, ApiStore, LegacyTimestamp]
