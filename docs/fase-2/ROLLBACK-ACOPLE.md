# ROLLBACK DEL ACOPLE

Qué hacer si algo sale mal al aplicar las 70 migraciones sobre `wyqmzhliurwyxuyxznpb`.

**Escrito ANTES de aplicar nada.** A mitad de un incidente no es momento de improvisar, y la
diferencia entre un susto y una pérdida es tener esto decidido de antemano.

---

## 0 · Lo primero que hay que saber, y tranquiliza

**La tanda entera corre en UNA transacción.** Es todo o nada por diseño del ejecutor
(`packages/data/src/migraciones/ejecutor.ts`), y PostgreSQL tiene DDL transaccional, así que
esto es real y no una aproximación: si la migración 40 falla, las 39 anteriores se revierten
solas y la base queda EXACTAMENTE como estaba.

Es decir: **el caso más probable de fallo no necesita rollback**. La base se cuida sola.

Lo que sigue es para lo que no se cuida solo.

---

## 1 · El respaldo · qué es y dónde está

| | |
|---|---|
| **Qué** | Volcado lógico del esquema `public`: todas las filas de las 47 tablas, en `insert`s |
| **Dónde** | `D:\MIS PROYECTOS\Master POS\respaldos\morphiqpos-<fecha>.sql` |
| **Fuera del repositorio** | Sí, a propósito: son datos reales de cuatro negocios y el repositorio es público |
| **Cómo se hizo** | `node scripts/respaldo-logico.mjs` |
| **Cómo se comprueba** | `node scripts/respaldo-logico.mjs --verificar <archivo>` · compara sha256 y cuenta de `insert`s contra su manifiesto |
| **Comprobado de verdad** | Sí: `node scripts/ensayo-con-datos.mjs` lo restaura en un PostgreSQL desechable y cuenta las organizaciones. Un respaldo que nunca se ha restaurado no es un respaldo, es un archivo |

**Lo que el respaldo NO cubre, dicho aquí:**

- El **esquema** no va en el archivo, porque ya está versionado: son las migraciones. Restaurar
  el esquema es volver a aplicarlas.
- `auth`, `storage` y los buckets: están **vacíos** (0 usuarios, 0 objetos, 0 buckets,
  comprobado el 16-09-2026). La aplicación no usa Supabase Auth: tiene sus propias
  `identidades` y `credenciales_pin`.
- Las tablas efímeras `sesiones` y `limite_tasa`, a propósito: restaurar sesiones caducadas y
  contadores de peticiones viejas hace daño en vez de bien.
- Las cuatro **vistas**, porque se derivan: `ordenes_pagos_resumen`, `existencias_por_insumo`,
  `empleados_visibles` y `descuentos_inventario_venta`.
- Las **columnas generadas**, por la misma razón: se calculan.

---

## 2 · Si la tanda falla al aplicar

**No hay nada que restaurar.** La transacción revierte sola y el ejecutor lo dice:

```
✗ La migración falló. La base quedó como estaba.
```

Qué hacer, en este orden:

1. Leer el mensaje. Dice qué archivo y qué constraint.
2. Arreglar la migración.
3. **Reensayar con datos**, que es lo que de verdad prueba:
   ```bash
   node scripts/ensayo-con-datos.mjs
   ```
4. Sólo con el ensayo en verde, volver a aplicar.

Para ver TODOS los fallos de una pasada en vez de uno por arranque:

```bash
node scripts/ensayo-con-datos.mjs --seguir
```

---

## 3 · Si la tanda se aplicó y hay que deshacerla

Este es el caso serio. Las migraciones son **forward-only**: no hay `down`. Deshacer significa
volver al estado del respaldo.

**Antes de nada: comprobar que de verdad hace falta.** Casi todas las 70 son aditivas —tablas y
columnas nuevas— y no rompen nada de lo que ya funcionaba. La única que toca filas existentes es
el renombre de plantillas de la 058, y son **cuatro filas**. Si el problema es ése, el §4 es más
barato y más seguro que restaurar entero.

Si aun así hay que restaurar:

```sql
-- 1 · Cerrar la puerta. Sin esto, una venta a medio cobrar entra durante la
--     restauración y se pierde sin que nadie lo note.
--     (Se hace quitando el despliegue de Vercel o revocando el rol de la app.)
revoke all on all tables in schema public from morphiqpos_app;

-- 2 · Tirar el esquema entero y volver a levantarlo desde las migraciones.
drop schema public cascade;
create schema public;
```

```bash
# 3 · Reaplicar SÓLO hasta la frontera de la que se venía (las 25 aplicadas).
#     El ejecutor no tiene bandera `--hasta`: se consigue moviendo temporalmente
#     las pendientes fuera de packages/data/src/migraciones/sql/.
pnpm db:migrate

# 4 · Cargar el respaldo.
#     El archivo trae su propio `set session_replication_role = replica`, que es
#     lo que impide que los disparadores vuelvan a crear filas que el respaldo
#     ya trae (el almacén principal de cada organización, por ejemplo).
psql "$DATABASE_URL_ADMIN" -f "D:\MIS PROYECTOS\Master POS\respaldos\morphiqpos-<fecha>.sql"

# 5 · Devolver los permisos y comprobar.
pnpm verify:esquema
pnpm verify:rls
pnpm verify:acople
```

**Cuánto tarda:** el volcado son 879 filas en 47 tablas, 640 KB. La carga es de segundos. Lo
lento es el paso 3 —aplicar 25 migraciones— y en el ensayo tomó **menos de un segundo**. El
tiempo real del incidente se lo lleva decidir, no ejecutar.

**Quién puede hacerlo:** el paso 2 y el 3 necesitan un rol con DDL. `morphiqpos_app` **no lo
tiene a propósito**; hace falta el rol `postgres` del proyecto.

---

## 4 · Si lo único mal es la plantilla de un negocio

Es el caso más probable de los que sí necesitan mano, y no hace falta restaurar nada.

```sql
-- Mirar primero. Siempre.
select nombre, giro, paquete from organizaciones order by nombre;

-- Corregir UNA fila, nombrándola.
update organizaciones set paquete = 'restaurante' where nombre = 'Café Jacaranda';
```

Lo esperado, según D-12 y confirmado en el ensayo con los datos de verdad:

| Negocio | Giro | Plantilla |
|---|---|---|
| Restaurante MH | `restaurante` | `restaurante` |
| Café Jacaranda | `cafeteria` | **`restaurante`** |
| Abarrotes Don Chuy | `tienda` | `tienda` |
| Ferretería La Broca | `ferreteria` | `tienda` |

**Café Jacaranda se queda en `restaurante` aunque su giro sea cafetería**, y eso NO es un error:
tiene contratado el paquete completo con mesero y cocina, y bajarlo a `cafeteria` le quitaría
módulos que paga.

---

## 5 · Lo que NO se hace nunca

- **No se aplica una migración a mano por la consola de Supabase.** Eso fue lo que dejó ocho
  tablas sin RLS en la Fase 1 y costó una pasada entera de correcciones. Si hay que tocar la
  base, se hace con una migración nueva.
- **No se edita una migración ya aplicada.** El ejecutor valida por hash y aborta. En producción
  esa edición nunca se ejecutó, así que el código y la base habrían divergido en silencio.
- **No se prueba contra los cuatro negocios vivos.** Sus ventas, sus cortes y su inventario son
  reales. Toda prueba va sobre una organización de demostración.
- **No se toca el proyecto de Pastelería Confetti** (`ivqcxdpqxwjxfohiswqb`). Ni para leer.
