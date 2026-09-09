import { before,after,beforeEach,test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment,assertSucceeds,assertFails } from '@firebase/rules-unit-testing';
import { doc,setDoc,getDoc,getDocs,getCountFromServer,collection,deleteDoc,Timestamp,query,orderBy,where } from 'firebase/firestore';
let env;
const id='a8268bf2-3e97-44d0-9586-894fca9e50d9';
const path=`patients/patient1/events/${id}`;
const event=()=>({kind:'guapa',occurredAt:Timestamp.now()});
const patient=()=>env.authenticatedContext('patient1',{email_verified:true,role:'patient'}).firestore();
const therapist=()=>env.authenticatedContext('therapist1',{email_verified:true,role:'therapist',patientId:'patient1'}).firestore();
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-registro',firestore:{rules:readFileSync('firestore.rules','utf8')}});});
beforeEach(async()=>{await env.clearFirestore();});
after(async()=>{await env?.cleanup();});
test('Paciente crea; no puede leer, listar ni contar sus registros',async()=>{const db=patient();await assertSucceeds(setDoc(doc(db,path),event()));await assertFails(getDoc(doc(db,path)));await assertFails(getDocs(collection(db,'patients/patient1/events')));await assertFails(getCountFromServer(collection(db,'patients/patient1/events')));});
test('Psicóloga vinculada lee y consulta por fecha, pero no escribe ni borra',async()=>{await env.withSecurityRulesDisabled(async ctx=>setDoc(doc(ctx.firestore(),path),event()));const db=therapist();await assertSucceeds(getDoc(doc(db,path)));await assertSucceeds(getDocs(query(collection(db,'patients/patient1/events'),where('occurredAt','>=',Timestamp.fromMillis(0)),orderBy('occurredAt','desc'))));await assertFails(setDoc(doc(db,path),event()));await assertFails(deleteDoc(doc(db,path)));});
test('Cuenta no autorizada, sin verificar u otra psicóloga no tiene acceso',async()=>{await env.withSecurityRulesDisabled(async ctx=>setDoc(doc(ctx.firestore(),path),event()));for(const ctx of [env.unauthenticatedContext(),env.authenticatedContext('stranger',{email_verified:true}),env.authenticatedContext('patient1',{role:'patient',email_verified:false}),env.authenticatedContext('another',{role:'therapist',patientId:'other',email_verified:true})]){await assertFails(getDoc(doc(ctx.firestore(),path)));await assertFails(setDoc(doc(ctx.firestore(),path),event()));}});
test('No se pueden falsificar roles, escribir otro paciente ni cambiar registros',async()=>{const db=patient(),data=event();await assertFails(setDoc(doc(db,'users/patient1'),{role:'therapist'}));await assertFails(setDoc(doc(db,`patients/other/events/${id}`),data));await assertFails(setDoc(doc(db,path),{...data,kind:'otra'}));await assertFails(setDoc(doc(db,path),{...data,total:100}));await assertSucceeds(setDoc(doc(db,path),data));await assertFails(setDoc(doc(db,path),{...data,kind:'fea'}));await assertFails(deleteDoc(doc(db,path)));});
test('Reintentar exactamente lo mismo es seguro y no duplica',async()=>{const db=patient(),data=event();await assertSucceeds(setDoc(doc(db,path),data));await assertSucceeds(setDoc(doc(db,path),data));const docs=await getDocs(collection(therapist(),'patients/patient1/events'));if(docs.size!==1)throw Error('Duplicado');});

test('Commit REST real: confirma al servidor y reutiliza el mismo ID',async()=>{
 const now=Math.floor(Date.now()/1000);
 const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const token=encode({alg:'none',typ:'JWT'})+'.'+encode({iss:'https://securetoken.google.com/demo-registro',aud:'demo-registro',iat:now,exp:now+3600,sub:'patient1',user_id:'patient1',email_verified:true,role:'patient',firebase:{sign_in_provider:'custom'}})+'.';
 const {eventWrite}=await import('../src/model.js');
 const body=eventWrite('demo-registro','patient1',{id,kind:'guapa',at:new Date().toISOString()});
 for(let i=0;i<2;i++){
  const response=await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/v1/projects/demo-registro/databases/(default)/documents:commit',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const result=await response.json();if(!response.ok||!result.commitTime)throw Error(JSON.stringify(result));
 }
 const docs=await getDocs(collection(therapist(),'patients/patient1/events'));if(docs.size!==1)throw Error('Duplicado REST');
});
test('La pulsación pendiente puede recuperarse después de 24 horas',async()=>{
 await assertSucceeds(setDoc(doc(patient(),path),{kind:'fea',occurredAt:Timestamp.fromMillis(Date.now()-48*60*60*1000)}));
});
