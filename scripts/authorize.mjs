import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
const flags = new Map();
for(let i=2;i<process.argv.length;i+=2) flags.set(process.argv[i],process.argv[i+1]);
const projectId=flags.get('--project');
const patientEmail=flags.get('--patient-email')?.trim().toLowerCase();
const therapistEmail=flags.get('--therapist-email')?.trim().toLowerCase();
if (!projectId || !patientEmail || !therapistEmail || patientEmail===therapistEmail) {
  console.error('Uso: npm run authorize -- --project ID --patient-email paciente@ejemplo.com --therapist-email psicologa@ejemplo.com'); process.exit(1);
}
initializeApp({credential:applicationDefault(),projectId});
const auth=getAuth();
try {
  const [patient,therapist]=await Promise.all([auth.getUserByEmail(patientEmail),auth.getUserByEmail(therapistEmail)]);
  if (!patient.emailVerified || !therapist.emailVerified) throw Error('Ambas cuentas deben verificar su correo primero.');
  if (patient.disabled || therapist.disabled || patient.uid===therapist.uid) throw Error('Las cuentas deben ser distintas y estar habilitadas.');
  // Este proyecto está pensado para una pareja paciente/profesional.
  // Evita mantener inadvertidamente otros roles al ejecutar de nuevo el comando.
  let page;
  do {
    page=await auth.listUsers(1000,page?.pageToken);
    const extra=page.users.filter(u=>['patient','therapist'].includes(u.customClaims?.role) && ![patient.uid,therapist.uid].includes(u.uid));
    if (extra.length) throw Error('Ya hay otras cuentas con rol asignado. Revoca esos roles antes de sustituir la pareja.');
  } while(page.pageToken);
  await auth.setCustomUserClaims(patient.uid,{...patient.customClaims,role:'patient',patientId:patient.uid});
  await auth.setCustomUserClaims(therapist.uid,{...therapist.customClaims,role:'therapist',patientId:patient.uid});
  console.log('Cuentas autorizadas. Pulsad «Comprobar acceso» en la web o volved a iniciar sesión.');
} catch(error) {console.error(error.message);process.exitCode=1;}
