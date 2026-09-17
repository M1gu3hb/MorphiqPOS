# A3 · CÓMO APLICAR LAS MIGRACIONES PENDIENTES

Todo está ensayado y **en esta máquina sí hay con qué aplicar**: el CLI de Supabase, fijado a una
versión y fuera del checkout. Este archivo se lee de arriba abajo y se ejecuta sin preguntarle nada
a nadie.

Escrito el 16 de septiembre de 2026 y corregido el mismo día. La versión anterior mandaba instalar
el CLI con `npm install -g`, afirmaba que el ref del proyecto no viaja en la línea de comando y
**omitía `supabase link`**. Las tres cosas eran falsas y juntas costaron una sesión entera: está
contado en §2, porque el error que se explica no se repite.


> **YA SE APLICÓ.** El 17 de septiembre de 2026 esta secuencia se corrió entera y entraron **72
> migraciones** en una sola transacción: las 71 que estaban pendientes más la `165`, que cierra la
> seguridad de todo lo que trajeron. El ledger dice **97 migraciones, última la 165**. Lo de abajo
> se conserva porque es el procedimiento de la PRÓXIMA tanda, y porque el §2 cuenta el error que
> costó una sesión entera.

---

## 1 · La secuencia, entera

Desde el worktree, en PowerShell:

```powershell
cd "D:\MIS PROYECTOS\Master POS\morphiqpos-fase2"

# 1 · El CLI fijado. `supabase` NO está en el PATH a propósito (§2.1).
$env:SUPABASE_CLI_PATH = "D:\herramientas\supabase-cli\node_modules\@supabase\cli-windows-x64\bin\supabase.exe"
& $env:SUPABASE_CLI_PATH --version                                  # responde 2.115.0

# 2 · El VÍNCULO con el proyecto. Es LOCAL A CADA WORKTREE (§2.2).
& $env:SUPABASE_CLI_PATH link --project-ref wyqmzhliurwyxuyxznpb

# 3 · El ensayo: aplica las PENDIENTES y REVIERTE, contra producción, en una transacción.
pnpm --filter @morphiqpos/data ensayo

# 4 · La tanda de verdad.
pnpm db:migrate
```

Ninguno de los cuatro pasos necesita una credencial nueva. `link` usa la sesión que el CLI ya tiene
guardada en el perfil del usuario, y el transporte vinculado aplica el DDL con el rol privilegiado
del proyecto —no con el de la aplicación, que no puede y no debe (§4)—.

El ensayo del paso 3 no es opcional y no es simbólico: es el **mismo texto** que aplicará el paso 4
—`prepararTandaVinculada`, con su `begin`, el `insert` de ledger con el hash de cada archivo, y las
pendientes en medio— terminado en `rollback` en vez de `commit`. Si el paso 3 no queda en verde, el paso 4
no se ejecuta.

### Antes de empezar, lo único que puede faltar

`db:migrate` toma el transporte vinculado **sólo si `MORPHIQPOS_SUPABASE_PROJECT_REF` trae valor**.
Lo lee del entorno de la terminal y, si no está ahí, del `.env` de la raíz —`migrar.mjs` carga
dotenv, y dotenv no sobreescribe: la terminal gana—. Si la variable no tiene valor, `db:migrate` se
va por `DATABASE_URL`, que es el rol de la aplicación, y muere con «permission denied for schema
public».

En esta máquina las dos variables ya están en el `.env`. Se comprueba así, sin enseñar un solo
valor —el repositorio es público—:

```powershell
Get-Content .env |
  Where-Object { $_ -match '^(MORPHIQPOS_SUPABASE_PROJECT_REF|SUPABASE_CLI_PATH)=' } |
  ForEach-Object { $n, $v = $_.Split('=', 2); "$n = $($v.Length) caracteres" }
# MORPHIQPOS_SUPABASE_PROJECT_REF = 20 caracteres
# SUPABASE_CLI_PATH = 84 caracteres
```

Si alguna de las dos líneas no sale, se define en la terminal antes de migrar:

```powershell
$env:MORPHIQPOS_SUPABASE_PROJECT_REF = 'wyqmzhliurwyxuyxznpb'
```

Las tres variables del oficio —ésas dos y `MORPHIQPOS_DB_VERIFICACION`— están declaradas en
`.env.example` con lo que se rompe sin cada una.

### El ref va en el entorno **y** en la línea de comando

Aquí decía «el ref va en el `.env`, NO en la línea de comando». Es falso, y saberlo importa porque
explica de dónde sale el error cuando el formato no cuadra: el ejecutor lo lee del entorno y además
lo pasa por `--project-ref` en cada invocación —`ejecutarConsultaVinculada`, en
`packages/data/src/migraciones/ejecutor.ts`—, después de exigir que sean 20 caracteres `[a-z0-9]`.

Y está bien que sea así: `--linked` a secas resolvería el destino por el último proyecto vinculado
de la máquina, y este proyecto nunca deduce contra qué base escribe.

---

## 2 · Los tres tropiezos que costaron una sesión entera

Una sesión anterior se declaró BLOQUEADA por «no haber forma de aplicar migraciones», con la
herramienta instalada delante. Lo que la detuvo fueron estas tres cosas, y las tres son locales:
no aparecen en un `git grep` porque ninguna está dentro de git.

### 2.1 · El CLI está FIJADO y FUERA del checkout

`supabase` a secas no existe en esta máquina, **a propósito**. La instalación va fijada a una
versión exacta y fuera del árbol de trabajo, para que no entre al artefacto web ni se actualice
sola. El procedimiento completo está en `docs/RUNBOOK.md §2`. Hoy el binario vive en:

```
D:\herramientas\supabase-cli\node_modules\@supabase\cli-windows-x64\bin\supabase.exe
```

**No se instala con `npm install -g supabase`** —era lo que decía este archivo—: eso deja una
versión que nadie fijó, que cambia sola y que puede cambiar el comportamiento del ledger sin que
ningún commit lo cuente. El propio CLI avisa de que ya existe una 2.117.0; se sube cuando alguien
decida subirla y lo escriba, nunca en medio de una tanda.

### 2.2 · El vínculo es LOCAL A CADA WORKTREE

`supabase link` escribe `supabase/.temp/linked-project.json`, y `supabase/.temp/` está en
`.gitignore`. Es decir: **el vínculo no viaja entre worktrees ni entre clones**. Existía en
`morphiqpos-codex` y no en `morphiqpos-fase2`, y sin él `supabase db query --linked` no tiene de
dónde sacar el proyecto ni la cadena del pooler. Ése fue el bloqueo.

Se comprueba con:

```powershell
Test-Path supabase\.temp\linked-project.json     # tiene que decir True
```

El vínculo no sólo sirve para migrar: `verificar-esquema-aplicado.mjs` y `verificar-rls.mjs` hablan
por conexión directa cuando hay cadena de verificación y, si no la hay, por el CLI — y entonces
sacan el proyecto de `MORPHIQPOS_SUPABASE_PROJECT_REF` o, en su defecto, de este vínculo. Sin
cadena, sin variable y sin vínculo, esas dos puertas no pueden mirar la base, y lo dicen en vez de
aprobar.

Lo que sí es de la máquina y no del worktree es la **sesión** del CLI (`supabase login`): vive en el
perfil del usuario, se hace una vez y sirve para todos los worktrees. Por eso `link` basta.

### 2.3 · El CLI parsea el `.env` del directorio actual, y un BOM lo tumba

Esto costó un fallo real. Con un BOM en medio del archivo, cualquier `supabase … --linked` aborta
antes de tocar la base:

```
LegacyDbConfigLoadError: failed to parse environment file: .env
```

El mensaje habla del `.env` y no de la base, así que se busca donde no está. El `.env` de hoy está
limpio; se comprueba sin leer un solo valor:

```powershell
# 0 = ningún BOM. Cualquier otro número: hay que limpiar el archivo antes de migrar.
(Select-String -Path .env -Pattern ([char]0xFEFF) -AllMatches).Count
```

Que el CLI lea el `.env` del **directorio actual** es también la razón de que §1 empiece con un `cd`
al worktree. Desde otro directorio, o no encuentra la configuración, o encuentra la de otro.

### La lección, en una línea

> **Antes de declararse bloqueado: mirar los otros worktrees, `docs/RUNBOOK.md` y los directorios
> que git ignora.** Lo que faltaba estaba en esos tres sitios a la vez.

---

## 3 · Lo que YA está hecho, para que nadie lo repita

| | |
|---|---|
| **Respaldo** | `D:\MIS PROYECTOS\Master POS\respaldos\morphiqpos-2026-09-16T21-36-23.sql` · 642 380 bytes · 879 filas en 29 tablas · fuera del repositorio |
| **Respaldo comprobado** | Sí: restaurado en un PostgreSQL desechable y contadas las cuatro organizaciones. Un respaldo que nunca se restauró no es un respaldo |
| **Ensayo con datos** | `node scripts/ensayo-con-datos.mjs` en **verde**: las pendientes aplican sobre una copia de producción CON DATOS, y los cuatro negocios caen donde D-12 dice |
| **Diez defectos** | Encontrados por ese ensayo y **corregidos**. Cada uno habría abortado la tanda entera. Están en `BITACORA.md` |
| **Encabezados** | Los 70 `ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2` retirados: P-04 está resuelta |
| **El código** | Ya entiende los seis valores de `organizaciones.paquete` y normaliza con `plantillaDeOrganizacion`. Funciona **antes y después** de aplicar, así que el orden no es una carrera |
| **Rollback** | `docs/fase-2/ROLLBACK-ACOPLE.md` |

La frontera aplicada es la **057**. Editar una migración con número ≤ 057 no es una opción:
`comprobarIntegridad` compara el hash de cada archivo con el del ledger y aborta la tanda completa.

La cuenta de pendientes **no se da por sabida**: eran 70 cuando se escribió este archivo, 71 al añadirse la `164` y 72 con la `165`; y otro
carril puede haber añadido migraciones desde entonces. La tanda es lo que haya en disco en el momento
de correrla, así que se cuenta antes de empezar y, si el número cambió después del ensayo, el ensayo
se repite:

```powershell
(Get-ChildItem packages\data\src\migraciones\sql\*.sql |
  Where-Object { [int]($_.Name.Split('_')[0]) -gt 57 }).Count
```

---

## 4 · Por qué el rol de la aplicación no sirve, y por qué eso está bien

`morphiqpos_app` —el rol de la `DATABASE_URL` del `.env`— **no puede hacer DDL, a propósito**. Está
comprobado:

```sql
select has_schema_privilege('morphiqpos_app','public','CREATE');  -- false
```

Esa decisión es correcta y no se toca: es la que hace que comprobar si la base está al día sea una
operación de sólo lectura y que sólo un rol con DDL pueda cambiarla.

De los dos transportes del ejecutor, por eso se usa el segundo:

- `migrar()` pide una `DATABASE_URL` **con DDL**. En esta máquina no la hay.
- `migrarVinculado()` pide el **ejecutable del CLI**, que sí está (§2.1). Es el camino de §1.

Para el registro, y para que nadie los vuelva a intentar: se probó a elevar el rol de la aplicación
(`grant postgres to morphiqpos_app`) y a crear un rol de migración con `login`, y el sistema de
permisos de la sesión rechazó las dos, con razón: son cambios persistentes de seguridad.

---

## 5 · Si el CLI no estuviera disponible

Dos respaldos, en este orden. Los dos siguen pasando por el ejecutor: lo que cambia es de dónde sale
el privilegio de DDL, nunca quién escribe el ledger.

### Respaldo 1 · una `DATABASE_URL` con DDL

Con la contraseña del rol `postgres` del proyecto (Supabase → Settings → Database):

```bash
# En el .env, TEMPORALMENTE, y se borra al terminar:
#   DATABASE_URL=postgresql://postgres.wyqmzhliurwyxuyxznpb:<contraseña>@aws-0-us-east-2.pooler.supabase.com:5432/postgres
pnpm --filter @morphiqpos/data ensayo
pnpm db:migrate
```

Ojo: mientras `MORPHIQPOS_SUPABASE_PROJECT_REF` tenga valor, `db:migrate` sigue yéndose por el CLI e
ignora esta cadena. Para usar este camino hay que vaciar la variable en esa terminal.

Al acabar se devuelve la `DATABASE_URL` del rol de aplicación. **No se deja la de `postgres` en el
`.env`.**

### Respaldo 2 · un rol temporal de migración

Si se prefiere no mover la `DATABASE_URL` de sitio, en el editor SQL de Supabase:

```sql
create role morphiqpos_migrador login password '<una-contraseña-larga>' in role postgres;
```

…se migra con esa cadena (respaldo 1) y al terminar:

```sql
drop role morphiqpos_migrador;
```

Nace para la tanda y se borra al terminar, que es lo que lo hace mejor que elevar el rol de la
aplicación.

### Respaldo 3 · emitir la tanda y que la aplique quien tenga el privilegio

Desde la raíz del worktree:

```bash
node --conditions=react-server packages/data/bin/migrar.mjs --emitir tanda.sql
```

Escribe la tanda y NO la aplica: el mismo texto de `prepararTandaVinculada`, con su `begin`, sus
`insert` de ledger con el hash de cada archivo y su `commit`. Quien lo ejecute lo ejecuta entero o no
ejecuta nada, así que la atomicidad no se pierde. Lo que este camino no da es que emitir y aplicar
ocurran en la misma conexión: entre las dos cosas alguien podría aplicar otra migración, y eso se
comprueba después con `pnpm verify:acople`.

No confundir con lo de abajo: esto aplica **un** texto generado por el ejecutor, no una carpeta de archivos
copiados a mano.

### Lo que NO se hace, por ninguno de estos caminos

**Nunca a mano por la consola de Supabase, migración por migración.** Eso fue lo que dejó ocho
tablas sin RLS en la Fase 1 y costó una pasada entera de correcciones. El ejecutor existe para que
el ledger y los hashes no dependan de que alguien se acuerde.

Tampoco se pegan las 517 705 bytes de la tanda en una llamada a una herramienta: exigiría
transcribir 13 000 líneas de SQL, y un error de transcripción sobre la base de cuatro negocios que
cobran no falla ruidosamente —deja un esquema sutilmente distinto—. **Aplicar DDL a producción
copiando SQL a mano no es una forma responsable de hacerlo.**

---

## 6 · Qué comprobar inmediatamente después

```bash
pnpm verify:esquema -- --actualizar   # regenerar el contrato, SÓLO después de aplicar
pnpm verify:rls
pnpm verify:acople
```

Y los cuatro negocios, uno por uno:

```sql
select nombre, giro, paquete from organizaciones order by nombre;
```

Lo esperado, que ya salió así en el ensayo con los datos de verdad:

| Negocio | Giro | Plantilla |
|---|---|---|
| Abarrotes Don Chuy | `tienda` | `tienda` |
| Café Jacaranda | `cafeteria` | **`restaurante`** |
| Ferretería La Broca | `ferreteria` | `tienda` |
| Restaurante MH | `restaurante` | `restaurante` |

**Café Jacaranda en `restaurante` aunque su giro sea cafetería NO es un error**: tiene contratado el
paquete completo con mesero y cocina, y bajarlo a `cafeteria` le quitaría módulos que paga (D-12).

Si alguno quedó en otra plantilla, `ROLLBACK-ACOPLE.md §4` lo corrige con un `update` de una fila.

---

## 7 · Y sólo entonces, lo que queda detrás

Estas tres cosas están escritas y no se pueden ejercitar hasta que las migraciones estén aplicadas:

1. **La organización de demostración.** `pnpm db:alta-negocio --slug demo-acople --nombre "Demo del
   acople" --giro tienda --paquete tienda`. Hoy falla: el `check` de `organizaciones.paquete` no
   admite `tienda` todavía. Y **tiene que ser una demo**: los cuatro negocios vivos no se prueban.
2. **Las cinco plantillas en el navegador** (`pruebas/e2e/`). Las cinco pruebas están escritas y
   parametrizadas por `MORPHIQPOS_URL_DESPLIEGUE`; les falta la demo.
3. **El preview de Vercel abierto a la automatización.** Ver `VERCEL-ENTORNO.md §2`.
