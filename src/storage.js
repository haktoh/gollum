import { eventWrite } from './model.js';
export async function commitEvent({projectId,user,event,signal,fetcher=fetch}) {
  const token = await user.getIdToken();
  const response = await fetcher(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`, {
    method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify(eventWrite(projectId,user.uid,event)),signal,
  });
  if (!response.ok) {
    const error = new Error(response.status === 403 ? 'No tienes permiso para guardar. Comprueba que tu cuenta está autorizada y el reloj del móvil es correcto.' : 'No se ha podido confirmar el guardado. Reintenta la misma pulsación.');
    error.code = response.status; throw error;
  }
  const result = await response.json();
  if (!result.commitTime || !Array.isArray(result.writeResults) || result.writeResults.length!==1) throw Error('El servidor no confirmó el guardado.');
}
