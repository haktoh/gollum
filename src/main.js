import './style.css';
import { GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, onIdTokenChanged, signOut } from 'firebase/auth';
import { collection, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { auth, db, configured, projectId, authReady } from './firebase.js';
import { roleFromClaims, madridDay, summarize, validRange, eventWrite } from './model.js';
import { commitEvent } from './storage.js';
const app=document.querySelector('#app');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let user=null, claims={}, selected=null, authMode='login', loaded=false, stopSummary=null;
let saving=false, pending=null, pendingPersisted=false, toastTimer;
const today=madridDay(); let from=today.slice(0,8)+'01',to=today;
const label=role=>role==='therapist'?'Psicóloga':'Paciente';
const mark='<span class="mark" aria-hidden="true">≡</span>';
function toast(message) { const el=document.querySelector('#toast'); clearTimeout(toastTimer);el.textContent=message;el.classList.add('visible');toastTimer=setTimeout(()=>el.classList.remove('visible'),2200); }
function message(text) {const target=document.querySelector('#message');if(target){target.textContent=text;target.hidden=false;}else toast(text);}
function friendly(error) {
 const codes={
  'auth/invalid-credential':'El correo o la contraseña no son correctos.',
  'auth/wrong-password':'El correo o la contraseña no son correctos.',
  'auth/user-not-found':'El correo o la contraseña no son correctos.',
  'auth/email-already-in-use':'Ese correo ya tiene cuenta. Prueba a entrar o a recuperar la contraseña.',
  'auth/weak-password':'Elige una contraseña más segura (al menos 8 caracteres).',
  'auth/invalid-email':'Introduce un correo válido.',
  'auth/too-many-requests':'Demasiados intentos. Espera unos minutos y vuelve a probar.',
  'auth/network-request-failed':'No se pudo conectar. Comprueba tu conexión.',
  'auth/popup-closed-by-user':'Has cerrado el acceso de Google. Puedes intentarlo otra vez.',
  'auth/popup-blocked':'El navegador ha bloqueado Google. Permite las ventanas emergentes o entra con correo.',
  'auth/unauthorized-domain':'Este dominio todavía no está autorizado en Firebase Authentication.',
  'auth/operation-not-allowed':'Este método de acceso todavía no está activado en Firebase.',
  'auth/account-exists-with-different-credential':'Este correo usa otro método de acceso. Entra con el método con el que creaste la cuenta.',
  'auth/invalid-api-key':'La configuración de Firebase no es válida.',
 };
 return codes[error.code] || 'No se ha podido completar la operación. Vuelve a intentarlo.';
}
function shell(content,footer='') {
 stopSummary?.();stopSummary=null;
 app.innerHTML=`<main class="shell"><header><a class="brand" href="./">${mark}Registro privado</a><span class="private">Acceso privado</span></header>${content}<footer>${footer||'<span>Un espacio compartido, dos accesos.</span>'}</footer></main>`;
 document.querySelector('#logout')?.addEventListener('click',async()=>{if(saving)return;try{await signOut(auth);selected=null;claims={};pending=null;render();}catch(e){message(friendly(e));}});
 document.querySelector('#back')?.addEventListener('click',()=>{if(saving)return;selected=null;render();});
}
const footer=()=>`<button class="text-button" id="back">Cambiar acceso</button>${user?'<button class="text-button" id="logout">Cerrar sesión</button>':''}`;
function render() {
 if(!configured) {shell(`<section class="center"><p class="eyebrow">Configuración inicial</p><h1>El registro está preparado.</h1><p class="muted">Falta conectar tu proyecto Firebase para activar las cuentas y el guardado.</p><p class="note">Sigue la guía README incluida en el proyecto y añade las cuatro variables de configuración.</p></section>`);return;}
 if(!loaded){shell('<section class="center"><p role="status">Comprobando sesión…</p></section>');return;}
 if(!selected){renderChoice();return;}
 if(!user){renderAuth();return;}
 if(!user.emailVerified){renderVerification();return;}
 const role=roleFromClaims(claims);
 if(!role){renderPending();return;}
 if(role!==selected){shell(`<section class="center"><p class="eyebrow">Acceso ${escape(label(selected))}</p><h1>Esta cuenta es de ${escape(label(role).toLowerCase())}.</h1><p class="muted">Elige su acceso para continuar.</p><button class="primary wide" id="correct">Ir a ${escape(label(role))}</button></section>`,footer());document.querySelector('#correct').onclick=()=>{selected=role;render();};return;}
 if(role==='patient')renderPatient(); else renderTherapist();
}
function renderChoice(){
 shell(`<section class="center"><p class="eyebrow">REGISTRO DIARIO</p><h1>¿Cómo quieres entrar?</h1><p class="muted">Selecciona tu acceso.</p><div class="role-grid"><button class="role-card" id="therapist"><span class="role-symbol" aria-hidden="true">▤</span><strong>Psicóloga</strong><span>Consultar los registros</span></button><button class="role-card" id="patient"><span class="role-symbol" aria-hidden="true">＋</span><strong>Paciente</strong><span>Registrar una pulsación</span></button></div></section>`);
 for(const role of ['patient','therapist'])document.getElementById(role).onclick=()=>{selected=role;render();};
}
function renderAuth(){
 const signup=authMode==='register';
 shell(`<section class="center auth"><p class="eyebrow">ACCESO ${escape(label(selected).toUpperCase())}</p><h1>${signup?'Crea tu cuenta.':'Hola de nuevo.'}</h1><div class="mode-switch" aria-label="Tipo de acceso"><button id="login-mode" aria-pressed="${!signup}">Entrar</button><button id="register-mode" aria-pressed="${signup}">Crear cuenta</button></div><button class="google wide" id="google">Continuar con Google</button><div class="divider"><span>o con tu correo</span></div><form id="auth-form"><label for="email">Correo electrónico</label><input id="email" type="email" autocomplete="email" required placeholder="tu@correo.com"/><label for="password">Contraseña</label><input id="password" type="password" autocomplete="${signup?'new-password':'current-password'}" minlength="${signup?8:1}" required placeholder="${signup?'Al menos 8 caracteres':'Tu contraseña'}"/><button class="primary wide" id="submit" type="submit">${signup?'Crear cuenta':'Entrar'}</button></form><p id="message" class="message" role="alert" hidden></p>${!signup?'<button class="text-button reset" id="reset">He olvidado mi contraseña</button>':'<p class="note">Crear la cuenta no concede permisos. El acceso se autoriza una sola vez.</p>'}</section>`,footer());
 document.querySelector('#login-mode').onclick=()=>{authMode='login';renderAuth();};document.querySelector('#register-mode').onclick=()=>{authMode='register';renderAuth();};
 let busy=false;
 async function run(action){if(busy)return;busy=true;const buttons=[...document.querySelectorAll('.auth button')];buttons.forEach(b=>b.disabled=true);try{await action();}catch(e){message(friendly(e));}finally{busy=false;buttons.forEach(b=>b.disabled=false);}}
 document.querySelector('#google').onclick=()=>run(async()=>{const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});await signInWithPopup(auth,provider);});
 document.querySelector('#auth-form').onsubmit=e=>{e.preventDefault();const email=document.querySelector('#email').value.trim(),password=document.querySelector('#password').value;run(async()=>{if(signup){const result=await createUserWithEmailAndPassword(auth,email,password);await sendEmailVerification(result.user);toast('Correo de verificación enviado');}else await signInWithEmailAndPassword(auth,email,password);});};
 document.querySelector('#reset')?.addEventListener('click',()=>{const email=document.querySelector('#email');if(!email.reportValidity()||!email.value)return;run(async()=>{await sendPasswordResetEmail(auth,email.value.trim());message('Si hay una cuenta asociada, recibirás las instrucciones para recuperar el acceso.');});});
}
async function refreshAccess(){
 try {await user.reload();const token=await user.getIdTokenResult(true);claims=token.claims;render();}catch(e){message(friendly(e));}
}
function renderVerification(){
 shell(`<section class="center auth"><p class="eyebrow">UN PASO MÁS</p><h1>Verifica tu correo.</h1><p class="muted">Abre el enlace de verificación enviado a <strong>${escape(user.email)}</strong> y vuelve aquí.</p><button class="primary wide" id="verified">Ya lo he verificado</button><button class="text-button wide" id="resend">Reenviar correo</button><p id="message" class="message" role="alert" hidden></p></section>`,footer());
 document.querySelector('#verified').onclick=refreshAccess;
 document.querySelector('#resend').onclick=async()=>{try{await sendEmailVerification(user);toast('Correo enviado');}catch(e){message(friendly(e));}};
}
function renderPending(){
 shell(`<section class="center auth"><p class="eyebrow">${escape(label(selected).toUpperCase())}</p><h1>Acceso pendiente.</h1><p class="muted">Tu cuenta ya está creada. Falta autorizarla para este registro.</p><p class="account">${escape(user.email)}</p><button class="primary wide" id="refresh">Comprobar acceso</button><p id="message" class="message" role="alert" hidden></p></section>`,footer());document.querySelector('#refresh').onclick=refreshAccess;
}
function pendingKey(){return `registro:pending:${user.uid}`;}
function recoverPending(){
 pending=null;pendingPersisted=false;
 try{const raw=localStorage.getItem(pendingKey());if(raw){const value=JSON.parse(raw);eventWrite(projectId,user.uid,value);pending=value;pendingPersisted=true;}}catch{/* No se utiliza el almacenamiento local como historial. */}
}
function renderPatient(){
 if(!pending)recoverPending();
 shell(`<section class="center patient"><p class="eyebrow">PACIENTE</p><h1>Registra y continúa.</h1><div class="record-grid"><button id="guapa" class="record-button">Guapa</button><button id="fea" class="record-button">Fea</button></div><p id="save-state" class="save-state" role="status" aria-live="polite"></p><div id="save-error" class="message" role="alert" hidden><p id="save-error-text"></p><button id="retry" class="primary">Reintentar esta pulsación</button></div><p class="note">Tus recuentos solo se muestran en el acceso de tu psicóloga.</p></section>`,footer());
 document.querySelector('#guapa').onclick=()=>save('guapa');document.querySelector('#fea').onclick=()=>save('fea');document.querySelector('#retry').onclick=()=>save();
 if(pending){document.querySelector('#save-error').hidden=false;document.querySelector('#save-error-text').textContent='Hay una pulsación sin confirmar. Reinténtala antes de registrar otra.';}
 updateButtons();
}
function updateButtons(){for(const id of ['guapa','fea']){const el=document.getElementById(id);if(el)el.disabled=saving||!!pending;}for(const id of ['retry','logout','back']){const el=document.getElementById(id);if(el)el.disabled=saving;}}
async function save(kind){
 if(saving || roleFromClaims(claims)!=='patient')return;
 if(!pending&&kind){pending={id:crypto.randomUUID(),kind,at:new Date().toISOString()};try{localStorage.setItem(pendingKey(),JSON.stringify(pending));pendingPersisted=true;}catch{pendingPersisted=false;}}
 if(!pending)return;
 saving=true;updateButtons();document.querySelector('#save-error').hidden=true;document.querySelector('#save-state').textContent='Guardando…';
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
 try{
  await commitEvent({projectId,user,event:pending,signal:controller.signal});
  try{localStorage.removeItem(pendingKey());}catch{/* Un reintento del mismo ID será idéntico y no sumará otra vez. */}
  pending=null;pendingPersisted=false;document.querySelector('#save-state').textContent='';toast('✓ Guardado');
 }catch(e){
  document.querySelector('#save-state').textContent='';document.querySelector('#save-error').hidden=false;
  document.querySelector('#save-error-text').textContent=(e.name==='AbortError'?'No se ha podido confirmar el guardado. Reintenta con conexión.':e.message)+(pendingPersisted?'':' No cierres esta pestaña hasta confirmarlo.');
 }finally{clearTimeout(timer);saving=false;if(!user||roleFromClaims(claims)!=='patient')render();else updateButtons();}
}
function renderTherapist(){
 shell(`<section class="dashboard"><p class="eyebrow">PSICÓLOGA</p><h1>Registro por día.</h1><p class="muted">Recuentos de las pulsaciones del paciente.</p><div class="filters"><label>Desde<input id="from" type="date" value="${from}"/></label><label>Hasta<input id="to" type="date" value="${to}"/></label><button class="secondary" id="refresh-summary">Actualizar</button></div><div id="summary" class="table-card" aria-live="polite"><p class="empty">Cargando registros…</p></div><p class="note">Hora de Madrid · Los días sin pulsaciones no aparecen.</p></section>`,footer());
 document.querySelector('#from').onchange=e=>{from=e.target.value;listenSummary();};document.querySelector('#to').onchange=e=>{to=e.target.value;listenSummary();};document.querySelector('#refresh-summary').onclick=listenSummary;listenSummary();
}
function listenSummary(){
 stopSummary?.();stopSummary=null;const box=document.querySelector('#summary');
 if(roleFromClaims(claims)!=='therapist')return;
 if(!validRange(from,to)){box.innerHTML='<p class="empty" role="alert">Selecciona un intervalo válido de hasta un año.</p>';return;}
 box.innerHTML='<p class="empty">Cargando registros…</p>';
 // Márgenes UTC que cubren Madrid también en los cambios de horario.
 // summarize filtra después por el día exacto Europe/Madrid.
 const start=new Date(Date.parse(from)-86400000),end=new Date(Date.parse(to)+2*86400000);
 const q=query(collection(db,'patients',claims.patientId,'events'),where('occurredAt','>=',Timestamp.fromDate(start)),where('occurredAt','<',Timestamp.fromDate(end)),orderBy('occurredAt','desc'));
 stopSummary=onSnapshot(q,{includeMetadataChanges:true},snapshot=>{
  if(snapshot.metadata.fromCache){box.innerHTML='<p class="empty">Conectando para consultar los registros actualizados…</p>';return;}
  const events=snapshot.docs.map(d=>{const data=d.data();return {kind:data.kind,occurredAt:data.occurredAt.toDate()};});
  const days=summarize(events,from,to);
  if(!days.length){box.innerHTML='<p class="empty">No hay pulsaciones registradas en este intervalo.</p>';return;}
  box.innerHTML=`<table><caption class="sr-only">Recuentos diarios</caption><thead><tr><th scope="col">Día</th><th scope="col">Guapa</th><th scope="col">Fea</th></tr></thead><tbody>${days.map(d=>`<tr><th scope="row">${new Intl.DateTimeFormat('es-ES',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(d.day))}</th><td>${d.guapa}</td><td>${d.fea}</td></tr>`).join('')}</tbody></table>`;
 },()=>{box.innerHTML='<p class="empty" role="alert">No se pudieron consultar los registros. Comprueba la conexión y que tu cuenta esté autorizada.</p>';});
}
window.addEventListener('beforeunload',event=>{if(saving||pending&&!pendingPersisted){event.preventDefault();event.returnValue='';}});
if(configured){
 authReady.then(()=>onIdTokenChanged(auth,async current=>{
  // No desmontar los controles en mitad de una confirmación.
  try {
   if(current?.uid!==user?.uid && !saving)pending=null;
   user=current;claims=current?(await current.getIdTokenResult()).claims:{};loaded=true;
   if(!saving)render();
  } catch {
   claims={};loaded=true;if(!saving)render();message('No se ha podido comprobar el acceso. Vuelve a iniciar sesión.');
  }
 })).catch(()=>{loaded=true;shell('<section class="center"><h1>No se pudo iniciar la sesión.</h1><p class="muted">Comprueba la configuración o permite el almacenamiento del navegador y recarga.</p></section>');});
}
render();
