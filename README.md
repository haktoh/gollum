# Registro privado: paciente y psicóloga

Web independiente, con código propio, preparada para GitHub Pages. Utiliza Firebase Authentication (Google o correo/contraseña) y Cloud Firestore. No utiliza ChatGPT, OpenAI, Sites, servidores privados ni una cuenta de ChatGPT. No necesita Cloud Functions.

## Comportamiento

1. La primera pantalla muestra **Psicóloga** y **Paciente**.
2. Cada persona puede crear su cuenta con Google o con correo y contraseña. Los correos deben estar verificados.
3. La cuenta autorizada como paciente ve dos botones grandes: **Guapa** y **Fea**.
4. Cada pulsación crea un documento. Solo aparece **Guardado** cuando Firestore confirma la escritura.
5. La psicóloga autorizada ve los recuentos por día, con intervalo de fechas y actualización en tiempo real.

Elegir un perfil en la pantalla no concede permisos. Los roles se asignan una sola vez mediante Firebase Admin, fuera de la web. Registrarse por cuenta propia no da acceso a datos.

## Archivos principales

| Archivo | Función |
| --- | --- |
| `src/main.js` | Pantallas, autenticación y flujos de uso |
| `src/storage.js` | Escritura con confirmación del servidor |
| `src/model.js` | Reintentos y recuentos por día |
| `firestore.rules` | Permisos reales sobre los registros |
| `scripts/authorize.mjs` | Autorizar las dos cuentas desde un entorno de confianza |
| `.github/workflows/pages.yml` | Publicación en GitHub Pages al subir a `main` |
| `.env.example` | Las cuatro variables de configuración web |

## 1. Crear Firebase

En [Firebase Console](https://console.firebase.google.com/):

1. Crea un proyecto dedicado a este registro. No es necesario activar Analytics.
2. Añade una **aplicación web** y copia su configuración `firebaseConfig`.
3. En **Authentication → Sign-in method**, activa **Google** y **Correo electrónico/contraseña**. Configura el correo de soporte que pide Google.
4. En **Authentication → Settings → Authorized domains**, añade `localhost` para desarrollo y después el dominio de la web, por ejemplo `TU_USUARIO.github.io`. Es el dominio, sin `https://` ni el nombre del repositorio.
5. Crea **Cloud Firestore**, base de datos **(default)**, edición Standard y **modo de producción**. Elige una región europea si quieres ubicar allí los documentos.

Las opciones y cuotas de Firebase/GitHub dependen de tu cuenta; revisa sus consolas. La arquitectura no necesita contratar un servidor ni desplegar funciones.

## 2. Arrancar en tu ordenador

Requisitos: Node.js 22.12 o posterior. Para las pruebas del emulador incluidas, Java 17 o posterior compatible con la versión fijada de Firebase CLI.

```bash
npm ci
cp .env.example .env.local
```

Rellena `.env.local` con los valores de la configuración **web**:

```dotenv
VITE_FIREBASE_API_KEY=valor_de_apiKey
VITE_FIREBASE_AUTH_DOMAIN=tu-proyecto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tu-proyecto
VITE_FIREBASE_APP_ID=valor_de_appId
```

```bash
npm run dev
```

Abre la dirección que indique Vite. Si cambias las variables, reinicia Vite. Sin configuración la web muestra un aviso explícito y no simula registros.

## 3. Publicar las reglas antes de usar la web

```bash
npx firebase login
npx firebase deploy --only firestore:rules,firestore:indexes --project TU_PROJECT_ID
```

No dejes Firestore en modo de prueba. Las reglas incluidas bloquean por defecto todas las colecciones no previstas.

## 4. Publicar en GitHub Pages

1. Crea un repositorio y sube el contenido de esta carpeta, incluidos `.github`, `package-lock.json`, `src`, `public` y los archivos de configuración. No subas `node_modules`, `.env.local`, credenciales de administración ni claves privadas.
2. En **Settings → Secrets and variables → Actions → Variables**, crea estas cuatro **Repository variables**, con los mismos valores de `.env.local`:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_APP_ID`
3. En **Settings → Pages → Build and deployment**, elige **GitHub Actions**.
4. Haz un push a `main` o ejecuta el workflow **Publicar web** desde Actions.
5. Añade el dominio final a los dominios autorizados de Firebase Authentication (paso 1). Abre la URL de Pages.

El workflow comprueba que las cuatro variables existen y genera `dist/`. El sitio funciona bajo una ruta de repositorio, por ejemplo `https://TU_USUARIO.github.io/registro/`. No depende de un router ni de reglas de redirección del servidor.

La configuración web de Firebase está presente en el JavaScript publicado: es normal. No es una clave de administración. La protección de datos está en Authentication y en las reglas de Firestore. **Nunca** pongas una clave privada del Admin SDK en una variable `VITE_*`, en el repositorio o en el frontend.

## 5. Autorizar a las dos personas (una sola vez)

Primero, ambos entráis en la URL publicada y creáis vuestra cuenta con el método que prefiráis. Si es con contraseña, verificáis el correo. La web mostrará **Acceso pendiente** hasta completar este paso.

Para asignar los permisos, ejecuta el script local con Firebase Admin. Puedes utilizar credenciales de aplicación de Google Cloud de una cuenta con los permisos correspondientes. Alternativamente, genera una clave de cuenta de servicio desde **Configuración del proyecto → Cuentas de servicio**, guárdala fuera del repositorio y úsala solo localmente:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/ruta/privada/firebase-adminsdk.json"
npm run authorize -- --project TU_PROJECT_ID --patient-email "TU_CORREO" --therapist-email "CORREO_PSICOLOGA"
unset GOOGLE_APPLICATION_CREDENTIALS
```

No compartas ni subas esa clave. El script no envía invitaciones y no necesita conocer las contraseñas de las dos personas.

El script comprueba que las cuentas existen, están verificadas, son distintas y no hay otras cuentas con roles del registro. Asigna:

- Paciente: `role: patient`.
- Psicóloga: `role: therapist`, vinculado al UID del paciente.

Después, ambos pulsáis **Comprobar acceso** o volvéis a iniciar sesión. El paciente puede empezar a registrar; la psicóloga puede consultar desde otro dispositivo.

El acceso de Google y el de correo son opciones por cuenta, no dos perfiles diferentes. Utilizad el método con el que habéis creado cada cuenta. Si Firebase detecta un correo existente con otro proveedor, la web indica que hay que entrar con ese método. No se ha añadido una pantalla de vinculación de proveedores.

## Datos y privacidad de la aplicación

```text
patients/{uidPaciente}/events/{uuid}
  kind: "guapa" | "fea"
  occurredAt: timestamp
```

- El paciente no puede leer, listar ni ejecutar agregaciones sobre sus eventos, ni con la consola del navegador.
- La psicóloga solo puede leer los eventos del paciente al que está vinculada. No puede modificarlos ni borrarlos.
- El paciente solo puede crear sus eventos o repetir una escritura idéntica, nunca cambiar una anterior.
- Los roles no se pueden asignar desde formularios ni escribiendo en Firestore.
- Los recuentos no se guardan en el navegador del paciente. Se calculan únicamente en la sesión de la psicóloga, a partir de documentos que sus reglas le permiten leer.
- La base de datos es la fuente de verdad. Si se pierde la conexión, queda como máximo **una pulsación pendiente** en el dispositivo (ID, categoría y hora), sin historial ni contador local. Reintentar reutiliza el mismo ID; no duplica. Hay que confirmarla antes de registrar otra.
- La confirmación depende de una respuesta de escritura del servidor. Sin conexión no se muestra «Guardado». No se promete funcionamiento completamente offline.
- La hora registrada es la del dispositivo al pulsar, para conservar el día de la observación aunque se confirme después. Los días se agrupan con `Europe/Madrid`, incluidos los cambios de horario. Mantén activadas la fecha y la hora automáticas. Se rechazan fechas que estén más de cinco minutos en el futuro respecto al servidor.
- Si se borra el almacenamiento del navegador antes de confirmar una pulsación pendiente, puede perderse su identificador de reintento. No vuelvas a crearla manualmente si no sabes si llegó: consulta con la profesional.
- Quien administra el proyecto Firebase tiene acceso administrativo a los datos fuera de esta web. Si también quieres impedirte ese acceso, la propiedad/administración del proyecto debe quedar en manos de tu psicóloga o de otra persona de confianza. El rol paciente de la aplicación no equivale al rol administrador de Firebase.

La app implementa el registro indicado, sin interpretaciones, porcentajes, rachas, comparaciones ni conclusiones sobre los datos.

## Poner un acceso en el móvil

Abre la web en Chrome y usa el menú para añadirla a la pantalla de inicio. Se incluye un manifest con nombre e iconos. El navegador determina si ofrece instalarla o crear un acceso directo. No hay service worker que almacene registros ni páginas privadas offline.

## Comprobar y modificar

```bash
npm test
npm run test:rules
npm run build
```

Las pruebas verifican roles, fechas, confirmación, escritura sin lecturas, consultas de la profesional, denegación de usuarios ajenos, imposibilidad de cambiar registros y reintentos sin duplicados. Las de reglas utilizan un proyecto ficticio y el emulador; no escriben en tu Firebase real.

La versión de Firebase CLI se fija para reproducir estas pruebas con Java 17; se usa solo para desarrollo/despliegue, no forma parte del JavaScript de la web.

No se ha realizado un inicio de sesión de Google ni una prueba contra tu proyecto real: requiere que crees y configures ese proyecto. El paquete no está conectado a la base de datos de la versión anterior y no migra registros anteriores.

## Alternativa de alojamiento

Puedes desplegar el mismo `dist/` en otro hosting estático o en Firebase Hosting:

```bash
npm run build
npx firebase deploy --only hosting --project TU_PROJECT_ID
```

Authentication y Firestore siguen siendo los mismos. Comparte la URL que muestre el proveedor. No uses el enlace anterior alojado en ChatGPT para esta versión.

## Documentación oficial utilizada

- [Acceso con Google](https://firebase.google.com/docs/auth/web/google-signin)
- [Correo y contraseña](https://firebase.google.com/docs/auth/web/password-auth)
- [Roles mediante custom claims](https://firebase.google.com/docs/auth/admin/custom-claims)
- [Validación de campos en reglas](https://firebase.google.com/docs/firestore/security/rules-fields)
- [Firestore REST con token de Firebase y reglas](https://firebase.google.com/docs/firestore/use-rest-api)
- [Pruebas de reglas](https://firebase.google.com/docs/rules/unit-tests)
- [Publicación en GitHub Pages con Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
