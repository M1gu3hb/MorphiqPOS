# EL ENTORNO DEL PREVIEW DE VERCEL

Qué se configuró, qué quedó fuera y por qué, y qué falta para poder verificar el preview desde
fuera. Escrito el 16 de septiembre de 2026, al cerrar la etapa A5 del acople.

---

## 0 · Lo que estaba mal, y ya no

`F3-REGLAS §10` lo describía así: *«El preview de la Fase 1 quedó con las variables de entorno
vacías y las APIs en 500.»* Y era exacto: el proyecto `mh-astral-systems/morphiqpos` tenía **diez
variables, las diez sólo en Production**. El entorno Preview estaba literalmente vacío.

Ahora tiene **nueve**, puestas con el CLI:

| Variable | De dónde sale su valor |
|---|---|
| `DATABASE_URL` | El mismo pooler de Supabase que usa Production, con el rol `morphiqpos_app` |
| `SESSION_SECRET` | El mismo que Production |
| `PIN_PEPPER` | El mismo que Production |
| `STORAGE_ENDPOINT` | El mismo que Production |
| `STORAGE_BUCKET` | El mismo que Production |
| `STORAGE_ACCESS_KEY` | El mismo que Production |
| `STORAGE_SECRET_KEY` | El mismo que Production |
| `ORGANIZACION` | El mismo que Production |
| `APP_URL` | `https://morphiqpos-git-fase-2-mh-astral-systems.vercel.app` — el alias de rama, no la URL de un despliegue concreto, que cambia en cada push |

Se comprueban con:

```bash
vercel env ls preview
```

**Ningún valor aparece en este archivo ni en ningún commit.** El repositorio es público. Los
valores se leyeron del `.env` local —que está en `.gitignore`— y viajaron por la entrada estándar
del CLI, nunca por una línea de comando ni por un archivo versionado.

---

## 1 · Las dos que quedaron fuera, con su motivo

| Variable | Por qué NO se puso |
|---|---|
| `NODE_ENV` | Vercel la fija él en cada build, y ponerla a mano es una de las formas conocidas de romper un build de Next. Está en Production por herencia de la Fase 1; en Preview se deja que la ponga la plataforma. |
| `TZ` | **Vercel la rechaza: es un nombre reservado.** El CLI devuelve `The name of your Environment Variable is reserved`. No es un problema: el formato de fechas de la aplicación fija `America/Mexico_City` en el sitio donde se presenta —`Intl.DateTimeFormat` y la configuración de Playwright— en vez de depender de la zona del proceso, que es lo correcto para un sistema que un día tendrá clientes en dos husos. |

---

## 2 · Lo que IMPIDE verificar el preview desde aquí

El despliegue responde, pero **detrás del muro de Vercel**:

```
GET https://morphiqpos-1ugmw4ixh-mh-astral-systems.vercel.app/
→ 302 https://vercel.com/sso-api?url=…&nonce=…
```

Todo —la raíz, `/estilos`, las rutas de API— devuelve 401 o un 302 al SSO de Vercel. **Eso no es
la aplicación: es la Protección de Despliegue de Vercel**, que está encendida para Preview. Un 401
del muro y un 401 de la aplicación se ven igual desde `curl`, y confundirlos sería declarar
verificado algo que no se miró.

Hay dos formas de abrirlo, y **las dos son cambios de configuración de la cuenta de Miguel, no del
repositorio**, así que no se hicieron:

1. **Protection Bypass for Automation** (Settings → Deployment Protection). Genera un secreto que
   se manda en la cabecera `x-vercel-protection-bypass`. Es la opción correcta para una suite
   automatizada: no abre el preview al mundo, sólo a quien tenga el secreto.
2. **Apagar la protección para Preview.** Más simple y peor: deja el preview abierto a cualquiera
   que adivine la URL, y ahí hay datos de cuatro negocios que cobran.

**Recomendada: la 1.** Al generarla, se guarda como variable de entorno del Preview y entonces:

```bash
MORPHIQPOS_URL_DESPLIEGUE=https://morphiqpos-git-fase-2-mh-astral-systems.vercel.app \
MORPHIQPOS_BYPASS_VERCEL=<el-secreto> \
pnpm verify:acople
```

Mientras eso no exista, `verify:acople` comprueba las rutas **contra el servidor local** y lo DICE
en su salida. Es la salida escrita en `F3-REGLAS §8.1`: sin ella el encargo sería imposible de
cerrar y a la vez estaría prohibido detenerse.

---

## 3 · Lo que SÍ se verificó, y contra qué

Con `next start` sobre el build de producción, en `http://localhost:3000`:

```
rutas    103 declaradas · 82 probadas por HTTP · 21 dinámicas o exceptuadas, comprobadas en disco
```

Las 82 responden. Ninguna da 404 ni 5xx: las de comando devuelven **403** sin sesión, que es lo
correcto —la ruta existe y está guardada—. Es el mismo build que Vercel sirve, con el mismo
`DATABASE_URL`, así que lo que se probó es la aplicación; lo que no se pudo probar es el tránsito
por el CDN de Vercel.

---

## 4 · Y lo que NO se puede verificar todavía por otra razón

Las **cinco plantillas en el navegador** no dependen de Vercel: dependen de las 70 migraciones, que
no están aplicadas. Sin ellas no existen las tablas de los cinco modelos, `alta-negocio.mjs` no
puede crear la organización de demostración —el `check` de la 058 todavía no admite `tienda`— y
cambiar de plantilla desde Configuración escribiría un valor que la base rechaza.

Eso está en `docs/fase-2/A3-COMO-APLICAR.md`, que es el otro bloqueo y el que manda.
