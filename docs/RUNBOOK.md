# Runbook de operación — MorphiqPOS

Lo que hay que saber para desplegar, arrancar un negocio nuevo y salir de un
apuro. Escrito para leerse a las once de la noche con un cliente esperando.

---

## 1 · Dar de alta un negocio

```bash
pnpm db:bootstrap --org <slug> --persona "<nombre>" --pin <4-8 dígitos>
```

Crea o reusa persona, identidad y empleo de **dueño**, y guarda el PIN con
Argon2id. Eso es todo: se abre `/login-pos`, se toca el nombre y se teclea el
PIN. **Ya no hay código de enrolamiento** — la caja se da de alta sola la
primera vez que alguien entra desde ese dispositivo.

A partir de ahí no vuelve a hacer falta: dar de alta cajeros se hace desde
**`/accesos`**.

Un despliegue sirve a UN negocio. Si la base tiene más de una organización
activa, hay que decir cuál con `ORGANIZACION=<slug>` en el entorno; con una
sola, se resuelve sola. Sin eso, la pantalla de acceso responde 500 y el
servidor dice en su log exactamente qué falta.

Para sembrar la organización de demostración de este despliegue:

```bash
node scripts/sembrar-demo.mjs --org demo-ferreteria-la-broca
```

---

## 2 · Migraciones

**Se aplican ANTES de desplegar, a mano.** No hay migración automática en el
despliegue y es deliberado: una migración que corre sola en cada arranque de una
función serverless corre N veces en paralelo.

```bash
pnpm db:migrate     # aplica lo que falte; es SÓLO LECTURA si no falta nada
pnpm db:tipos       # regenera esquema.ts desde la base ya migrada
```

`db:migrate` con el rol de aplicación **no puede** aplicar nada: `morphiqpos_app`
tiene DML y no DDL, a propósito. Sirve para VERIFICAR que no hay drift. Para
aplicar de verdad hace falta una credencial con DDL —hoy, la consola
administrada de Supabase—, y la migración se registra a mano en `_migraciones`
con el hash que calcula `packages/data/src/migraciones/lectura.ts`.

Orden que no se negocia (`supabase-vercel-produccion §6`):

> **Primero lo ADITIVO. Luego se despliega el frontend. Y SÓLO ENTONCES se
> retira lo viejo.**

---

## 3 · Desplegar

`main` está conectado a Vercel: **un push despliega**. Root Directory es
`apps/web`; Vercel detecta el workspace de pnpm e instala desde la raíz.

```bash
pnpm verify        # las nueve puertas. Si esto no pasa, no se despliega.
git push origin main
```

Comprobar el resultado:

```bash
vercel ls --scope mh-astral-systems
vercel inspect --logs <url> --scope mh-astral-systems
```

### Humo después de desplegar

```bash
pnpm db:bootstrap --org demo-ferreteria-la-broca --persona "Elena" --pin 4821
node scripts/humo-venta.mjs --base https://pos-mh-astral-systems.com
```

Recorre los once pasos por HTTP sin importar una línea del servidor: si el
bundle de producción se rompió, esto se entera. Hay tres más —`humo-turno.mjs`,
`humo-accesos.mjs`, `humo-seguridad.mjs`— y todos aceptan `--base`.

Las URL `*.vercel.app` están detrás del SSO del equipo. Para correr humo contra
un despliegue concreto hace falta un secreto de bypass:

```bash
vercel project protection enable morphiqpos --protection-bypass --format json --scope mh-astral-systems
# exportar VERCEL_AUTOMATION_BYPASS_SECRET, correr el humo, y después:
vercel project protection disable morphiqpos --protection-bypass --protection-bypass-secret <secreto> --scope mh-astral-systems
```

**Se revoca al terminar.** Un bypass vivo es una puerta abierta a los previews.

---

## 4 · Volver atrás

```bash
vercel rollback <url-del-despliegue-anterior> --scope mh-astral-systems
```

El rollback de la aplicación **no revierte la base**. Si el despliegue traía una
migración, volver atrás el código deja el esquema por delante. Por eso las
migraciones son aditivas: el código viejo tiene que poder correr sobre el
esquema nuevo. Cuando una migración no pueda ser aditiva, se escribe el plan de
vuelta atrás ANTES de aplicarla.

---

## 5 · Cuando algo falla

| Síntoma | Casi siempre es |
|---|---|
| «DATABASE_URL: expected string, received undefined» | El `.env` está en la raíz del monorepo. Next lo carga desde `next.config.mjs`; los CLI de datos desde `packages/data/bin/*`. Si aparece en otro sitio, ese sitio no lo está cargando. |
| «self-signed certificate in certificate chain» | La raíz de Supabase. Va embebida en `packages/data/src/certificados/`. **No se arregla con `rejectUnauthorized: false`** — eso deja el canal cifrado y sin autenticar. |
| «permission denied for schema public» | Se intentó DDL con el rol de aplicación. Correcto: no puede. |
| «tenant/user not found» del pooler | El usuario del pooler es `<rol>.<ref>` y el host de esta región es `aws-0-us-east-2.pooler.supabase.com`. |
| «Demasiados intentos desde esta red» | El límite por IP de C-13. Veinte entradas por cinco minutos, veinte enrolamientos por diez. Se espera o se cambia `LIMITES` en `packages/app/src/http/limite.ts`. |
| «Esta terminal ya tiene una caja abierta» | Hay un turno sin cerrar. Se cierra en `/corte`. |
| La pantalla de acceso dice «No pudimos cargar los usuarios» | El servidor no sabe a qué negocio sirve. El log lo dice: o falta `ORGANIZACION`, o su slug no existe. |
| Entra desde un navegador nuevo y aparece una caja de más | Es correcto: un dispositivo sin cookie es una caja nueva. La cookie dura un año; borrarla crea otra. Se ven todas en `/accesos`. |
| Un PIN correcto no entra | Antes de tocar nada, `pnpm vitest run packages/app/src/identidad`. La prueba del viaje redondo es la que caza el fallo que costó tres sesiones. |
| «No Next.js version detected» en Vercel | El Root Directory del proyecto no es `apps/web`. |

---

## 6 · Lo que no tiene runbook todavía

- **Restaurar la base.** Supabase tiene copias automáticas; el procedimiento no
  se ha ensayado. `morphiq-prs §23A` pide medir RTO y RPO de verdad, y eso está
  sin hacer.
- **Rotar `PIN_PEPPER`.** Cambiarla invalida TODOS los PIN a la vez. Haría falta
  un doble hash de transición, y no existe.
- **Rotar la contraseña de `morphiqpos_app`.** Se regenera con
  `node scripts/credencial-db.mjs`, que escribe el `.env` y escupe el SQL con el
  verificador SCRAM — la contraseña no viaja. Falta actualizarla también en
  Vercel, y eso hoy es un paso manual.
