export function roleFromClaims(claims) {
  if (claims.role === 'patient') return 'patient';
  if (claims.role === 'therapist' && typeof claims.patientId === 'string' && claims.patientId) return 'therapist';
  return null;
}
export function madridDay(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
export function summarize(events, from, to) {
  const days = new Map();
  for (const event of events) {
    const day = madridDay(event.occurredAt);
    if (day < from || day > to || !['guapa','fea'].includes(event.kind)) continue;
    if (!days.has(day)) days.set(day,{day,guapa:0,fea:0});
    days.get(day)[event.kind]++;
  }
  return [...days.values()].sort((a,b)=>b.day.localeCompare(a.day));
}
export function validRange(from,to) {
  const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
  return valid(from) && valid(to) && from<=to && Date.parse(to)-Date.parse(from)<=366*86400000;
}
export function eventWrite(projectId, uid, event) {
  if (!/^[a-z][a-z0-9-]+$/.test(projectId) || !/^[A-Za-z0-9_-]+$/.test(uid)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(event.id)
    || !['guapa','fea'].includes(event.kind) || !Number.isFinite(Date.parse(event.at))) throw Error('Pulsación no válida');
  return {writes:[{update:{name:`projects/${projectId}/databases/(default)/documents/patients/${uid}/events/${event.id}`,fields:{kind:{stringValue:event.kind},occurredAt:{timestampValue:event.at}}}}]};
}
