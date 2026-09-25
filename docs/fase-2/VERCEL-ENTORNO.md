# EL ENTORNO DEL PREVIEW DE VERCEL

Qué se configuró, cómo se verifica el preview desde fuera y qué quedó como decisión de Miguel.
Escrito el 16 de septiembre de 2026 al cerrar A5 y **puesto al día el 17**, cuando el preview pasó
de «no se puede verificar» a verificado con una suite de navegador corriendo contra él.

---

## 0 · Lo que estaba mal, y ya no

`F2.3-REGLAS §10` lo describía así: _«El preview de la Fase 1 quedó con las variables de entorno
vacías y las APIs en 500.»_ Y era exacto: el proyecto `mh-astral-systems/morphiqpos` tenía **diez
variables, las diez sólo en Production**. El entorno Preview estaba literalmente vacío.

Hoy tiene **nueve**, puestas con el CLI:

| Variable                 | De dónde sale su valor                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`           | El pooler de Supabase con el rol `morphiqpos_app` — **en el puerto 6543, modo TRANSACCIÓN**. Ver §4, que es lo importante    |
| `SESSION_SECRET`         | El mismo que Production                                                                                                      |
| `PIN_PEPPER`             | El mismo que Production                                                                                                      |
| `STORAGE_ENDPOINT`       | El mismo que Production                                                                                                      |
| `STORAGE_BUCKET`         | El mismo que Production                                                                                                      |
| `STORAGE_ACCESS_KEY`     | El mismo que Production                                                                                                      |
| `STORAGE_SECRET_KEY`     | El mismo que Production                                                                                                      |
| `ORGANIZACION`           | **Las cinco demostraciones** `demo-acople-*`, y nada más (desde el 24-09-2026, D-15). Ver §2                                  |
| `APP_URL`                | `https://morphiqpos-git-fase-2-mh-astral-systems.vercel.app` — el alias de rama, no la URL de un despliegue, que cambia      |
| `APP_URL_ALTERNAS`       | Los OTROS orígenes del mismo despliegue, separados por comas. Ver §7, que es un 403 que rompía la entrada entera            |

Se comprueban con:

```bash
vercel env ls preview
```

**Ningún valor aparece en este archivo ni en ningún commit.** El repositorio es público. Los valores
se leyeron del `.env` local —que está en `.gitignore`— y viajaron por la entrada estándar del CLI,
nunca por una línea de comando ni por un archivo versionado.

---

## 1 · Las dos que quedaron fuera, con su motivo

| Variable   | Por qué NO se puso                                                                                                                                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV` | Vercel la fija él en cada build, y ponerla a mano es una de las formas conocidas de romper un build de Next. Está en Production por herencia de la Fase 1; en Preview se deja que la ponga la plataforma.                                                                                                                  |
| `TZ`       | **Vercel la rechaza: es un nombre reservado.** El CLI devuelve `The name of your Environment Variable is reserved`. No es un problema: el formato de fechas fija `America/Mexico_City` donde se presenta —`Intl.DateTimeFormat` y la configuración de Playwright— en vez de depender de la zona del proceso.                 |

---

## 2 · A QUÉ NEGOCIOS sirve cada entorno, que no es un detalle

*Reescrito el 24-09-2026 (C.18 de la 2.4). Aquí decía que «un despliegue sirve a UN negocio» y que
el Preview apuntaba a una demo cada vez; `07-ESTADO.md` decía, con razón, que producción ya servía a
seis. Lo vigente es esto:*

| Entorno    | `ORGANIZACION`                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------ |
| Preview    | Las cinco `demo-acople-*`. **Nunca un negocio real**: Preview escribe en la MISMA base que producción, y un Preview que sirviera a un cliente sería una puerta trasera |
| Production | `mh-restaurante` y las cinco demos (lo que sirve `main`). Tras fusionar la 2.4, Miguel añade Jacaranda, Don Chuy y La Broca (D-15): ver el §10 del reporte 020 |

Un despliegue sirve a VARIOS negocios desde la migración 166, y desde la 2.4 **la entrada es de
uno**: cada negocio entra por `/n/<slug>/login-pos` (o por el host con su slug), la lista de
empleados sólo devuelve la gente de ese negocio, y `/login-pos` a secas no enseña nombres. Por eso
las cinco demos pueden convivir en el mismo Preview: cada suite entra por la dirección de SU demo, y
la precondición de `pruebas/e2e/ayudantes/sesion.ts` se niega si una sola persona de la respuesta no
es de ella.

Las variables se aplican al construir: cambiar `ORGANIZACION` es cambiar la variable **y
redesplegar**.

```bash
vercel env rm ORGANIZACION preview --yes
printf 'demo-acople-tienda,demo-acople-cafeteria,demo-acople-restaurante,demo-acople-ferreteria,demo-acople-estetica' \
  | vercel env add ORGANIZACION preview
```

---

## 3 · El muro de Vercel, y las TRES formas de pasarlo

El preview está detrás de la **Protección de Despliegue**: todo —la raíz y las rutas de API—
devuelve 401 o un 302 a `vercel.com/sso-api`. **Eso no es la aplicación**, y un 401 del muro se ve
igual que un 401 de la aplicación, así que confundirlos sería declarar verificado algo que no se
miró.

| Vía                                                          | Qué cuesta                                                                                            | Cuándo usarla                                     |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **1 · Protection Bypass for Automation**                      | Un secreto de proyecto (se genera con el CLI, abajo). No caduca y no abre el preview al mundo          | CI, y cualquier automatización que repita          |
| **2 · Un enlace compartido** (`?_vercel_share=…`)             | Nada. Deja una cookie `_vercel_jwt` que vale **23 horas** y muere en cada redespliegue                  | Verificar hoy sin tocar la configuración del proyecto |
| **3 · Apagar la protección de Preview**                       | Deja el preview abierto a cualquiera que adivine la URL, con datos de negocios reales dentro            | **No.** Está aquí para decir que se descartó       |

**Lo que se usó el 17-09-2026 fue la 2**, y a propósito: encender o apagar la protección de un
despliegue es un cambio persistente de seguridad sobre un proyecto con datos de cuatro negocios que
cobran, y la verificación no lo necesitaba. La **1 sigue siendo la recomendada para CI**.

**Cómo se genera el secreto de la 1 · la única forma escrita en este repositorio.** Aquí decía que
«sólo se genera en el panel», y el RUNBOOK decía que con el CLI. Lo cierto (comprobado el 24-09-2026
con `vercel project protection --help`, CLI 54) es el CLI:

```bash
vercel project protection enable morphiqpos --protection-bypass --format json --scope mh-astral-systems
# la salida trae el secreto: va a VERCEL_AUTOMATION_BYPASS_SECRET / MORPHIQPOS_BYPASS_VERCEL, nunca al repo
vercel project protection disable morphiqpos --protection-bypass --protection-bypass-secret <secreto> --scope mh-astral-systems
```

Es un cambio de la configuración de seguridad del proyecto: lo decide Miguel, y **se revoca al
terminar** —un bypass vivo es una puerta abierta a los previews—. Mientras no exista, la vía 2 es la
que usan los agentes. El RUNBOOK remite aquí.

Las dos las entienden ya las dos herramientas:

```bash
# La puerta de la fase, contra el despliegue de verdad
MORPHIQPOS_URL_DESPLIEGUE=https://morphiqpos-git-fase-2-mh-astral-systems.vercel.app \
MORPHIQPOS_BYPASS_VERCEL=<el-secreto> \
pnpm verify:acople
#   …o, con la cookie del enlace compartido:
MORPHIQPOS_COOKIE_VERCEL='_vercel_jwt=<…>' pnpm verify:acople

# La suite de navegador, contra el despliegue de verdad
MORPHIQPOS_URL_DESPLIEGUE=… MORPHIQPOS_BYPASS_VERCEL=<el-secreto> \
MORPHIQPOS_ORG_DEMO=demo-acople-estetica MORPHIQPOS_DEMO_PIN=1234 \
pnpm test:e2e pruebas/e2e/estetica-salon.spec.ts
#   …o, con la cookie, en un archivo de estado FUERA del repositorio:
MORPHIQPOS_ESTADO_VERCEL=<ruta-al-estado.json> …
```

La cookie va como `storageState` y **no** como cabecera `Cookie` fija: una cabecera fija
sustituiría la del tarro y se llevaría por delante la cookie de sesión en cuanto la prueba entrara
con PIN. `verify:acople` DICE en su salida con cuál de las dos entró, porque «probado contra el
despliegue» significa cosas distintas según cómo se entró.

---

## 4 · EL POOLER · lo que hay que decidir, y por qué corre prisa

Este es el hallazgo del 17 de septiembre y **no es del preview: es de producción**.

La `DATABASE_URL` del proyecto entraba por el pooler de Supabase en el puerto **5432, modo
SESIÓN**, donde el techo son **15 clientes simultáneos**. Y `packages/data/src/cliente.ts` abre un
pool de hasta **10 conexiones por proceso**, con un comentario que decía «Supabase con pooler en
modo **transacción** admite bastante». El comentario describía otro puerto.

Medido, no supuesto:

```
puerto 5432 (sesión)      dos procesos agotan el pooler · las suites dan 500 con
                          (EMAXCONNSESSION) max clients reached in session mode
                          → hubo que bajar el pool a 3 y cerrar conexiones a mano entre corridas

puerto 6543 (transacción) las cinco suites en verde con el pool por omisión (10),
                          y ~40 % más rápidas: 20.3 s contra 35.0 s en restaurante,
                          17.6 s contra 29.1 s en abarrotes
```

**En producción cada instancia de Vercel abre su propio pool.** Con 10 por instancia y 15 clientes
de techo, **dos instancias calientes bastan para que el punto de venta empiece a devolver 500 en
hora pico** — con un error que no menciona el pooler por ningún lado y que manda a buscar el
defecto en la aplicación.

**Preview está en el 6543**, el `.env` local también, **y Production también desde el 17-09-2026**
(etapa E5 de la 2.3, `07-ESTADO.md`). Aquí decía «Production NO se tocó»; era verdad el 17 por la
mañana y dejó de serlo esa misma tarde. La huella: `vercel env ls production` da `DATABASE_URL`
creada el 17-09 y el resto de las variables de Production, el 8. Los valores son «Sensitive» y no se
pueden leer, ni hace falta.

---

## 5 · Lo que SÍ se verificó contra el despliegue, y cómo

Contra `https://morphiqpos-git-fase-2-mh-astral-systems.vercel.app`, con la cookie del enlace
compartido:

| Qué                                     | Resultado                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| La raíz                                 | **200**                                                                              |
| `/api/auth/empleados`                   | 200, y devuelve **«Demo del acople · tienda»** — la demo, no un negocio vivo          |
| `/api/datos/consultar` **sin** sesión   | **401**, que es lo correcto                                                          |
| Entrar con PIN (`/api/auth/entrar`)     | **200**, y devuelve al dueño con su rol                                              |
| `/api/datos/consultar` **con** sesión   | 200 · `paquete_modo=tienda` · `nombre_negocio=Demo del acople · tienda`               |
| `/api/configuracion/vocabulario`        | 200 · `giro=tienda`                                                                  |
| Pantallas de modelo                     | `/abarrotes/caja` 200 · `/estetica-salon/agenda-del-dia` 200                          |
| `pnpm verify:acople`                    | **en 0**, con las 82 rutas probadas por HTTP **contra el despliegue**                 |
| Suite de navegador · `abarrotes`        | **2 passed** contra el preview                                                        |
| Suite de navegador · `estetica-salon`   | **2 passed** contra el preview — el giro que la migración 164 acaba de crear          |

---

## 6 · Lo que NO se hizo, a propósito

- **No se promovió nada a producción.** El preview es lo que quedó funcionando; promover es de
  Miguel, a un clic.
- **No se encendió ni se apagó la Protección de Despliegue.** Ver §3: no hacía falta para verificar.
- **No se cambió la `DATABASE_URL` de Production.** Ver §4: es la decisión que queda sobre la mesa,
  y es la que más corre.

---

## 7 · `APP_URL_ALTERNAS` · el 403 que no dejaba ni entrar

Lo encontró el rastreador la primera vez que alguien tocó la aplicación desplegada, y ninguna
puerta lo había visto.

La frontera de escritura compara el `Origin` que manda el navegador contra `APP_URL` y responde
**403** a cualquier otro. Es la defensa contra CSRF y está bien. Lo que faltaba es que un despliegue
de Vercel **se sirve siempre por su dominio `*.vercel.app`**, además del dominio propio. Con
`APP_URL` puesta a `https://pos-mh-astral-systems.com` —cuyo DNS todavía se estaba configurando— la
aplicación contestaba 403 a **toda** escritura hecha desde `morphiqpos-kappa.vercel.app`, empezando
por `/api/auth/entrar`:

```
POST /api/auth/entrar   origin: https://morphiqpos-kappa.vercel.app   → 403
POST /api/datos/consultar                                             → 403
```

**Nadie podía entrar al sistema desde la URL del despliegue.** Y no lo vio ninguna puerta porque las
suites corren con `APP_URL=http://localhost:3200`, donde el origen coincide siempre; el único sitio
donde los dos valores se separan es un despliegue de verdad.

### Cómo se arregla

```bash
vercel env add APP_URL_ALTERNAS production
# valor: https://morphiqpos-kappa.vercel.app
```

Una lista separada por comas. `APP_URL` sigue siendo la canónica —la de los enlaces de un ticket y
del portal QR— y esto es sólo quién más puede escribir.

### Cómo está hoy · leído el 24-09-2026 (C.18 de la 2.4), y está MAL

Los valores de Production son «Sensitive» y no se pueden leer. Se leyó su EFECTO, sin sesión y sin
escribir nada: una lectura por `POST /api/datos/consultar` contesta **403** si el `Origin` no está
permitido y **401** si lo está (la frontera va antes que la sesión).

```
origin: https://morphiqpos-kappa.vercel.app        → 401  (permitido)
origin: https://pos-mh-astral-systems.com          → 401  (permitido)
origin: https://www.pos-mh-astral-systems.com      → 403
origin: https://no-es-de-aqui.example              → 403
```

Coincide con lo de arriba: `APP_URL` = el dominio propio, `APP_URL_ALTERNAS` = kappa. **Y el dominio
propio hoy no es de Vercel**: `pos-mh-astral-systems.com` resuelve a `216.24.57.1` y contesta **402**.
`APP_URL` es lo que va en la URL de cada imagen subida (`/api/archivos/subir` devuelve
`<APP_URL>/api/archivos/…`) y en cada exporte: hoy **toda imagen que se suba en producción nace con
un enlace roto**. No hay ninguna guardada todavía (contado en la base: cero URLs de archivo), así que
cruzar los dos valores no rompe nada existente. Es un cambio de variable de Production, de Miguel:
`APP_URL=https://morphiqpos-kappa.vercel.app` y `APP_URL_ALTERNAS=https://pos-mh-astral-systems.com`
mientras el DNS no apunte a Vercel; cuando apunte, se vuelven a cruzar.

### Lo que NO se hizo, y por qué

Leer el `Host` de la petición y aceptar el origen que coincida con él. Habría arreglado el síntoma
sin tocar la configuración, y habría roto R-17: el origen esperado tiene que nacer de la
configuración, porque leer el `Host` es dejar que quien ataca lo declare. La prueba «rechaza un Host
falsificado aunque coincida con Origin» sigue en pie sin un cambio.

---

## 8 · EL ALMACÉN DE ARCHIVOS · de `localhost:9000` a Supabase

**Antes de esto, en producción no se podía guardar un solo archivo.** `STORAGE_ENDPOINT` valía
`http://localhost:9000` —el MinIO del compose— así que subir el logo del negocio, la foto de un
producto o generar el menú QR contestaba `ECONNREFUSED`. La vuelta 2.3 lo convirtió en un **503 con
el endpoint y las cuatro variables escritos**, que es honesto y sigue sin funcionar.

Y en la etapa del diseño no es un pendiente cualquiera: **el logo del negocio y las imágenes del
menú son parte del diseño.** Sin almacén, media fase de interfaz no se puede ni ver.

### Por qué NO se usó el endpoint S3 de Supabase

Porque no se puede con la credencial que este despliegue tiene, y está medido:

| Credencial probada | Qué contestó su endpoint S3 |
|---|---|
| referencia + llave de servicio | `InvalidAccessKeyId: The Access Key Id you provided does not exist in our records` |
| referencia + publicable + llave de servicio como *session token* | `SignatureDoesNotMatch: … The session token should be a valid JWT token` |

El segundo mensaje es el que lo explica: la autenticación por *session token* exige un **JWT**, y
este proyecto usa el **formato de llaves nuevo** (`sb_secret_…`, `sb_publishable_…`), que no lo es.
La otra vía son **llaves de acceso S3**, y ésas sólo se crean en el panel del proyecto —Project
Settings → Storage → S3 access keys—, que es lo único de todo esto que no se puede hacer desde
aquí.

### Lo que sí se hizo

Un **segundo conductor** en `packages/data/src/archivos.ts`, contra la API de Almacenamiento
(`/storage/v1`), que es la que la llave de servicio abre. Las cinco operaciones son las mismas
—guardar, obtener, copiar, borrar y sumar bytes bajo un prefijo— y quien llama no sabe con quién
habla.

**S3 sigue siendo el de por omisión y no se va.** A-27 exige que el backend completo corra en la PC
de un cliente, sin internet y sin cuenta de terceros: ahí va un MinIO al lado, y ése es el camino
de S3. La decisión entre los dos la toma **la ruta del endpoint**, no el dominio ni una variable
nueva:

```
termina en /storage/v1  →  la API de Supabase
cualquier otra cosa     →  S3
```

### Las cuatro variables, y qué significa cada una

|  | S3 (MinIO, local) | Supabase (gestionado) |
|---|---|---|
| `STORAGE_ENDPOINT` | `http://localhost:9000` | `https://<ref>.supabase.co/storage/v1` |
| `STORAGE_BUCKET` | `morphiqpos` | `morphiqpos` |
| `STORAGE_ACCESS_KEY` | la llave de acceso | **la referencia del proyecto** |
| `STORAGE_SECRET_KEY` | el secreto | **la llave de servicio** |

Y el conductor de Supabase **comprueba que `STORAGE_ACCESS_KEY` sea la referencia del endpoint**.
No es papeleo: cambiar una de las dos y no la otra —la llave de un proyecto contra el bucket de
otro— es el fallo clásico de despliegue, y se manifiesta como un 400 del almacenamiento cuatro
pantallas más adelante. Dicho al construir el cliente, se lee una vez.

### Lo que se dejó puesto, el 21-09-2026

- El bucket **`morphiqpos`**, **privado**, creado en el proyecto `wyqmzhliurwyxuyxznpb`.
- Las cuatro variables, en **`production` y `preview`**.
- Las cinco operaciones, probadas contra el proyecto de verdad: guardar, leer con su
  `content-type`, copiar, sumar 44 bytes bajo un prefijo, devolver `null` para lo que no existe y
  borrar hasta dejarlo en cero.

### Lo que esto cierra

`FALLOS_QUE_SON_UNA_DECISION` llevaba `503 /api/reportes/exportar` con su condición de borrado
escrita: «el día que el bucket exista, la prueba vuelve a exigirlo». Ese día es hoy, y la
declaración se fue.
