/** Validate before any import writes so one unknown name cannot fail the bulk INSERT. */
export function validateScheduleImportStaff(
  events: Array<{ date: string; scenario: string; gms: string[]; isMemo?: boolean }>,
  staff: Array<{ name: string }>,
): string[] {
  const known = new Set(staff.map(person => person.name))
  return events.flatMap(event => {
    if (event.isMemo) return []
    const unknown = [...new Set(event.gms.filter(name => !known.has(name)))]
    const duplicate = [...new Set(event.gms.filter((name, index) => event.gms.indexOf(name) !== index))]
    const errors: string[] = []
    if (unknown.length) errors.push(`${event.date} ${event.scenario}: 未登録の担当名 ${unknown.join('、')}`)
    if (duplicate.length) errors.push(`${event.date} ${event.scenario}: 重複した担当名 ${duplicate.join('、')}`)
    return errors
  })
}
