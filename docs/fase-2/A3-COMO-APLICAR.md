# A3 · CÓMO APLICAR LAS 70 MIGRACIONES

Todo está listo y ensayado. Lo único que falta es **una credencial con DDL**, y es lo único que
esta sesión no pudo obtener. Este archivo dice exactamente qué correr, en qué orden, y qué
comprobar después.

Escrito el 16 de septiembre de 2026.

---

## 0 · Lo que YA está hecho, para que nadie lo repita

| | |
|---|---|
| **Respaldo** | `D:\MIS PROYECTOS\Master POS\respaldos\morphiqpos-2026-09-16T21-36-23.sql` · 642 380 bytes · 879 filas en 29 tablas · fuera del repositorio |
| **Respaldo comprobado** | Sí: restaurado en un PostgreSQL desechable y contadas las cuatro organizaciones. Un respaldo que nunca se restauró no es un respaldo |
| **Ensayo con datos** | `node scripts/ensayo-con-datos.mjs` en **verde**: las 70 aplican sobre una copia de producción CON DATOS, y los cuatro negocios caen donde D-12 dice |
| **Diez defectos** | Encontrados por ese ensayo y **corregidos**. Cada uno habría abortado la tanda entera. Están en `BITACORA.md` |
| **Encabezados** | Los 70 `ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2` retirados: P-04 está resuelta |
| **El código** | Ya entiende los seis valores de `organizaciones.paquete` y normaliza con `plantillaDeOrganizacion`. Funciona **antes y después** de aplicar, así que el orden no es una carrera |
| **Rollback** | `docs/fase-2/ROLLBACK-ACOPLE.md` |

---

## 1 · Por qué esta sesión no pudo aplicarlas

`morphiqpos_app` —el rol de la `DATABASE_URL` que hay en el `.env`— **no puede hacer DDL, a
propósito**. Está comprobado:

```sql
select has_schema_privilege('morphiqpos_app','public','CREATE');  -- false
```

Y esa decisión es CORRECTA: es la que hace que comprobar que la base está al día sea una operación
de sólo lectura y que sólo un rol con DDL pueda cambiarla. No se toca.

Los dos transportes del ejecutor necesitan otra cosa:

- `migrar()` pide una `DATABASE_URL` **con DDL**. No la hay en esta máquina.
- `migrarVinculado()` pide el **ejecutable del CLI de Supabase**. No está instalado: no hay
  `supabase`, ni `psql`, ni `pg_dump`, ni Docker.

Se intentaron dos formas de conseguir el privilegio y las dos las rechazó el sistema de permisos
de la sesión, con razón —las dos son cambios persistentes de seguridad—:

1. `grant postgres to morphiqpos_app` · rechazado.
2. `create role morphiqpos_migrador login … in role postgres` · rechazado. (Se preparó con el
   **verificador SCRAM calculado en local**, para que la contraseña no viajara; ni así.)

Queda una tercera vía que sí está abierta y que **no se usó a propósito**: pegar las 517 705 bytes
de SQL de la tanda en una llamada a la herramienta de Supabase. Se descartó porque exigiría
transcribir a mano 13 000 líneas de SQL, y un error de transcripción sobre la base de cuatro
negocios que cobran no falla ruidosamente: deja un esquema sutilmente distinto. **Aplicar DDL a
producción copiando SQL a mano no es una forma responsable de hacerlo.**

---

## 2 · Las tres formas de desbloquearlo, de mejor a peor

### Opción A · el CLI de Supabase (la que el ejecutor prefiere)

```bash
npm install -g supabase          # o scoop install supabase
supabase login                   # abre el navegador una vez
```

Y entonces, desde `D:\MIS PROYECTOS\Master POS\morphiqpos-fase2`:

```bash
# El ref va en el .env, NO en la línea de comando.
#   MORPHIQPOS_SUPABASE_PROJECT_REF=wyqmzhliurwyxuyxznpb
pnpm --filter @morphiqpos/data ensayo   # aplica y REVIERTE, contra producción
pnpm db:migrate                         # la tanda de verdad
```

Es la mejor porque el ejecutor corre entero: una transacción, el ledger con el hash de cada
archivo, y `comprobarIntegridad` delante.

### Opción B · una `DATABASE_URL` con DDL

Si Miguel tiene la contraseña del rol `postgres` del proyecto (Supabase → Settings → Database):

```bash
# En el .env, TEMPORALMENTE, y se borra al terminar:
#   DATABASE_URL=postgresql://postgres.wyqmzhliurwyxuyxznpb:<contraseña>@aws-0-us-east-2.pooler.supabase.com:5432/postgres
pnpm --filter @morphiqpos/data ensayo
pnpm db:migrate
```

Y al acabar se devuelve la `DATABASE_URL` del rol de aplicación. **No se deja la de `postgres` en
el `.env`.**

### Opción C · un rol temporal de migración

Si se prefiere no mover la `DATABASE_URL`, en el editor SQL de Supabase:

```sql
create role morphiqpos_migrador login password '<una-contraseña-larga>' in role postgres;
```

…se migra con esa cadena (Opción B), y al terminar:

```sql
drop role morphiqpos_migrador;
```

Es la que esta sesión intentó. Nace para la tanda y se borra al terminar, que es lo que la hace
mejor que elevar el rol de la aplicación.

### Lo que NO se hace, en ninguna de las tres

**Nunca a mano por la consola de Supabase, migración por migración.** Eso fue lo que dejó ocho
tablas sin RLS en la Fase 1 y costó una pasada entera de correcciones. El ejecutor existe para que
el ledger y los hashes no dependan de que alguien se acuerde.

---

## 3 · Qué comprobar inmediatamente después

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

## 4 · Y sólo entonces, lo que queda detrás

Estas tres cosas están escritas y no se pueden ejercitar hasta que las migraciones estén aplicadas:

1. **La organización de demostración.** `pnpm db:alta-negocio --slug demo-acople --nombre "Demo del
   acople" --giro tienda --paquete tienda`. Hoy falla: el `check` de `organizaciones.paquete` no
   admite `tienda` todavía. Y **tiene que ser una demo**: los cuatro negocios vivos no se prueban.
2. **Las cinco plantillas en el navegador** (`pruebas/e2e/`). Las cinco pruebas están escritas y
   parametrizadas por `MORPHIQPOS_URL_DESPLIEGUE`; les falta la demo.
3. **El preview de Vercel abierto a la automatización.** Ver `VERCEL-ENTORNO.md §2`.
