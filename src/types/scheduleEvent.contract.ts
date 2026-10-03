/** npm run typecheckで実行する型契約。実行時コード・値は生成しない。 */
import type { ReservationScheduleEvent } from './scheduleEvent'
import type { ScheduleEvent } from './schedule'
import type { ScheduleEvent as Barrel } from './index'
import type { ScheduleEventBase, ScheduleEventCategory } from './scheduleEventBase'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Assert<T extends true> = T
type SharedFields = keyof ScheduleEventBase
// 画面で扱う公演の型は1つだけ（'@/types' から読んでも同じもの）
type OneScheduleEvent = Assert<Equal<Barrel, ScheduleEvent>>
type ReservationShared = Assert<Equal<Pick<ReservationScheduleEvent, SharedFields>, Pick<ScheduleEvent, SharedFields>>>
type Categories = Assert<Equal<ReservationScheduleEvent['category'], ScheduleEvent['category']>>
type CategorySource = Assert<Equal<ScheduleEvent['category'], ScheduleEventCategory>>
// 移行時に勝手に同一化してはいけない既存契約。
type ReservationNullableSlot = Assert<Equal<ReservationScheduleEvent['time_slot'], string | null | undefined>>
type ViewSlot = Assert<Equal<ScheduleEvent['time_slot'], string | undefined>>
type ReservationTimestamp = Assert<Equal<ReservationScheduleEvent['created_at'], string>>
export type ScheduleEventContracts = [OneScheduleEvent, ReservationShared, Categories, CategorySource, ReservationNullableSlot, ViewSlot, ReservationTimestamp]
