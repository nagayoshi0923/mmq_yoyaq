/** Discord buttons carry the exact date/time list they displayed (including year). */
export async function gmCandidateVersion(candidates: any[]): Promise<string> {
  const canonical = candidates.map(c => [c.date ?? null,c.timeSlot ?? null,c.startTime ?? null,c.endTime ?? null])
  const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical)))
  return Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,'0')).join('').slice(0,20)
}
export function gmCandidateButtons(candidates: any[],requestId: string,version: string) {
  const rows: any[]=[]
  candidates.slice(0,6).forEach((c,i)=>{
    if(i%5===0) rows.push({type:1,components:[]})
    rows[rows.length-1].components.push({type:2,style:3,label:`候補${i+1}: ${c.date} ${c.timeSlot} ${c.startTime}-${c.endTime}`.slice(0,80),custom_id:`date_${i+1}_${requestId}_${version}`})
  })
  rows.push({type:1,components:[{type:2,style:4,label:'全て不可',custom_id:`gm_unavailable_${requestId}_${version}`}]})
  return rows
}
