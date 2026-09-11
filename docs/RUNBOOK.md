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

**Se aplican ANTES de desplegar y siempre mediante `pnpm db:migrate`.** No hay
migración automática en el despliegue: una migración que corre sola en cada
arranque de una función serverless corre N veces en paralelo.

```bash
pnpm db:migrate     # aplica lo que falte; es SÓLO LECTURA si no falta nada
pnpm db:tipos       # regenera esquema.ts desde la base ya migrada
```

`db:migrate` admite dos transportes y ambos ejecutan el SQL y su fila de ledger
en una sola transacción:

- `DATABASE_URL` con una credencial de DDL, para Postgres local o remoto.
- `MORPHIQPOS_SUPABASE_PROJECT_REF` con una sesión ya autenticada del CLI de
  Supabase. Si `supabase` no está en `PATH`, se indica su ejecutable con
  `SUPABASE_CLI_PATH`.

`morphiqpos_app` conserva sólo DML y no puede aplicar DDL. Con ese rol,
`db:migrate` sirve para comprobar que no falta nada.

> **Prohibido pegar migraciones en la consola de Supabase o registrar filas de
> `_migraciones` a mano.** Ese procedimiento dejó 045 aplicada a medias y el
> ledger cinco versiones atrás. Si el ejecutor no puede correr, se corrige su
> acceso; no se divide ni se copia el archivo SQL.

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

## 6 · Restaurar la base

### Objetivos vigentes

| Medida | Objetivo operativo | Evidencia al 11 de septiembre de 2026 |
|---|---:|---|
| **RPO** | **25 horas** | Cuatro respaldos físicos completados entre el 8 y el 11 de septiembre. El mayor intervalo observado fue **24 h 32 min 2 s**. |
| **RTO** | **4 horas** | El ensayo lógico completo tardó **17.895 s**. El margen cubre crear el destino gestionado, cambiar secretos, desplegar y hacer humo; esas operaciones externas no se simulan localmente. |

El RPO de 25 horas describe la protección que existe hoy; no promete PITR. Antes
de incorporar un negocio cuyos movimientos no puedan reconstruirse desde sus
comprobantes se debe habilitar PITR y bajar el objetivo a 15 minutos.

### Ensayo repetible en un destino aislado

El ensayo lee exclusivamente el proyecto cuyo ref está fijado en el script,
crea un PostgreSQL temporal en `%TEMP%`, aplica las migraciones con
`pnpm db:migrate`, restaura todas las tablas públicas y compara cantidad de filas
y checksum por tabla. El respaldo temporal contiene datos sensibles: el script
lo elimina junto con el clúster aun cuando falla.

```powershell
$env:MORPHIQPOS_SUPABASE_PROJECT_REF='wyqmzhliurwyxuyxznpb'
$env:SUPABASE_CLI_PATH='D:\herramientas\supabase-cli\node_modules\@supabase\cli-windows-x64\bin\supabase.exe'
$env:MORPHIQPOS_PG_BIN='C:\Program Files\PostgreSQL\18\bin'
pnpm db:restore:drill
```

Resultado del 11 de septiembre de 2026, con instantánea creada a las
11:44:12 UTC:

| Paso medido | Tiempo |
|---|---:|
| Extraer respaldo lógico | 3.413 s |
| Crear destino y aplicar 53 migraciones | 11.110 s |
| Restaurar datos | 3.070 s |
| Validar 47 tablas y 825 filas | 0.299 s |
| **Total** | **17.895 s** |

La instantánea pesó 451,512 bytes. Este número es una línea base para el volumen
actual; el tiempo crecerá con los datos. Se repite el ensayo cada trimestre y
antes de una migración que transforme o elimine columnas.

### Incidente real

1. Detén escrituras y anota la hora UTC del último movimiento confirmado.
2. Ejecuta `supabase backups list --project-ref wyqmzhliurwyxuyxznpb` y elige el
   punto completado más nuevo anterior al incidente. Si PITR está habilitado,
   elige el segundo exacto anterior al cambio destructivo.
3. Restaura primero en un proyecto de sustitución. No restaures encima del
   origen mientras siga siendo la única copia.
4. Ejecuta `pnpm db:migrate -- --ensayo` y luego `pnpm db:migrate` contra el
   destino. Compara el contrato con `pnpm verify:esquema` y `pnpm verify:rls`.
5. Haz humo de acceso, venta, cobro, corte, inventario y portal QR. Compara los
   folios y totales del último turno contra los comprobantes del negocio.
6. Cambia `DATABASE_URL` sólo después de aprobar el humo, despliega y conserva
   el origen sin escrituras hasta cerrar la conciliación.

---

## 7 · Lo que no tiene runbook todavía

- **Rotar `PIN_PEPPER`.** Cambiarla invalida TODOS los PIN a la vez. Haría falta
  un doble hash de transición, y no existe.
- **Rotar la contraseña de `morphiqpos_app`.** Se regenera con
  `node scripts/credencial-db.mjs`, que escribe el `.env` y escupe el SQL con el
  verificador SCRAM — la contraseña no viaja. Falta actualizarla también en
  Vercel, y eso hoy es un paso manual.
