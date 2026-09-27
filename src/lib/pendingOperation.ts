// Keep only an opaque digest and UUID in session storage; request bodies can contain PII.
const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable)
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => [k,stable(v)]))
  return value
}
export async function pendingOperation(scope: string, payload: unknown) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(stable({scope,payload}))))
  const key = 'mmq.pending-operation.' + Array.from(new Uint8Array(bytes), v => v.toString(16).padStart(2,'0')).join('')
  let id = sessionStorage.getItem(key)
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    id = crypto.randomUUID()
    sessionStorage.setItem(key,id) // Failure must stop before issuing a non-repeatable request.
  }
  return { id, complete: () => sessionStorage.removeItem(key) }
}
