# ADR 0001 — Cómo accede MorphiqPOS a Postgres

- **Estado:** PROPUESTO — pendiente de aprobación de Miguel
- **Fecha:** 2026-09-07
- **Tarea:** F1.0-T04
- **Bloquea:** la primera migración (F1.1). No se escribe una línea de SQL antes de aprobar esto.

---

## 1. Contexto

`packages/data` es **el único lugar del monorepo que conoce SQL** (`04-ARQUITECTURA §3`).
Toda la lógica crítica vive en comandos de `packages/app` con transacciones reales
contra Postgres (A-21). La base de datos es **almacenamiento con integridad**, no un
lugar donde vive lógica de negocio (R7).

Esa elección le deja a la capa de datos una responsabilidad estrecha pero exigente.
Los requisitos no son negociables porque salen de reglas ya escritas:

| # | Requisito | De dónde sale |
|---|---|---|
| 1 | Transacciones reales **anidables** (savepoints), componibles desde un comando | R10, `04-ARQUITECTURA §3` |
| 2 | **SQL legible en revisión** — se debe poder leer lo que le llega a Postgres | F1.0-T04 |
| 3 | **Tipos generados del esquema, no escritos a mano** | `04-ARQUITECTURA §3` (`contracts`) |
| 4 | **Migraciones versionadas** `NNN_snake_case.sql`, reproducibles | `04-ARQUITECTURA §7`, gate PRS §12 |
| 5 | Cero dependencia de servicios propietarios; todo corre en Docker local sin internet | A-27, R7 |
| 6 | Decremento **atómico con guarda** sobre el saldo de existencias | R13, P1-03 |
| 7 | `UPDATE … RETURNING` dentro de la transacción para el folio consecutivo | P1-09 |
| 8 | Índices **parciales únicos** (una sola orden activa por mesa) | P0-05, `03-MODELO §6` |
| 9 | `bigint` de centavos **sin pérdida de precisión** en el driver | R15, `03-MODELO` |
| 10 | Triggers propios (`historial_precios`) y `check` explícitos en vez de tipos `enum` | `03-MODELO §2` y convenciones |

El punto 10 importa más de lo que parece, y es el que decide este ADR. Volvemos a él en §4.

---

## 2. Opciones evaluadas

### Opción A — `pg` con SQL escrito a mano

`pg@8.23.0` (el driver de referencia de Node, quince años de producción) más SQL crudo
en cada repositorio, más una herramienta de migraciones, más un generador de tipos.

**A favor**

- Cero abstracción: lo que se lee en el repositorio es exactamente lo que ejecuta Postgres.
- Todo Postgres disponible sin peleas: CTE, `FOR UPDATE`, índices parciales, `RETURNING`, savepoints.
- Dependencia mínima y estable. Es infraestructura, no moda (R8).

**En contra**

- Los tipos **no vienen gratis**: hay que montar generación aparte (`pgtyped` por consulta o `kanel` por tabla) y mantenerla.
- Mucha plomería a mano: mapear filas a objetos, nombres de columna como cadenas.
- Renombrar una columna es buscar y reemplazar cadenas. El compilador no ayuda.

### Opción B — Drizzle ORM + drizzle-kit

`drizzle-orm@0.45.2` + `drizzle-kit@0.31.10`. El esquema se declara en TypeScript y la
herramienta genera las migraciones SQL.

**A favor**

- Tipos gratis y siempre sincronizados: el esquema TS **es** la fuente de tipos.
- Refactor guiado por el compilador.
- Transacciones y savepoints anidados nativos; escape hatch de SQL crudo para lo demás.
- Ecosistema activo y mucha documentación.

**En contra**

- **Invierte el requisito 2.** El SQL pasa a ser *salida generada*, no la fuente. Se
  revisa el `.sql` que produjo la herramienta, no el que se escribió.
- Pre-1.0 (`0.45.x`): la API todavía se mueve, y este proyecto va a vivir 8–11 meses de
  Fase 1 y años después.
- **El problema de fondo:** Drizzle no expresa triggers, funciones ni ciertas
  restricciones. Esas van en migraciones SQL crudas *aparte*. Resultado: **dos fuentes
  de verdad del esquema** —el TS y el SQL crudo— que pueden desincronizarse sin que nada
  avise. Es exactamente la clase de deriva silenciosa que este proyecto está tratando de
  no repetir.

### Opción C — Kysely sobre `pg`, con el esquema en SQL · *propuesta*

`kysely@0.29.5` sobre `pg@8.23.0`. Kysely **no es un ORM**: es un constructor de
consultas tipado. No posee el esquema, no genera migraciones y no esconde SQL. Los
tipos salen de `kysely-codegen@0.20.0`, que **lee la base ya migrada**.

**A favor**

- Es la Opción A **más tipos**, no una alternativa a ella. Por debajo es `pg`.
- Lo que se escribe se parece uno a uno al SQL que sale. El requisito 2 se cumple por forma.
- El SQL literal es ciudadano de primera: las consultas críticas (decremento atómico con
  guarda, `UPDATE … RETURNING`, `FOR UPDATE`) se escriben como SQL **y siguen tipadas**.
- **Una sola fuente de verdad del esquema: los archivos `.sql`.** Los tipos se derivan de
  la base real, así que no pueden desincronizarse: si la migración no se aplicó, el tipo
  no existe y el build falla.
- Transacciones con savepoints anidados.
- Sin runtime propio: quitarlo deja `pg` y SQL, que es la Opción A.

**En contra**

- El paso de codegen **necesita una base viva**. En CI hay que migrar antes de tipar. Es
  un paso más en el pipeline, y de todos modos ya se levanta Postgres para las pruebas
  de integración.
- Menos ecosistema y menos ejemplos que Drizzle.
- `0.29.x` también es pre-1.0, aunque con una API mucho más quieta.

---

## 3. Cómo puntúa cada opción

| Requisito | A · `pg` a mano | B · Drizzle | C · Kysely |
|---|:---:|:---:|:---:|
| 1 · Transacciones anidables | ✅ | ✅ | ✅ |
| 2 · SQL legible en revisión | ✅ | ⚠️ generado | ✅ |
| 3 · Tipos generados del esquema | ⚠️ hay que montarlo | ✅ | ✅ |
| 4 · Migraciones `NNN_*.sql` versionadas | ✅ | ⚠️ nombra y numera a su manera | ✅ |
| 5 · Portabilidad, cero propietario | ✅ | ✅ | ✅ |
| 6 · Decremento atómico con guarda | ✅ | ⚠️ vía escape hatch | ✅ |
| 7 · `UPDATE … RETURNING` | ✅ | ✅ | ✅ |
| 8 · Índices parciales únicos | ✅ | ✅ | ✅ |
| 9 · `bigint` sin pérdida | ⚠️ configurar el driver | ⚠️ igual | ⚠️ igual |
| 10 · **Una sola fuente de verdad del esquema** | ✅ | ❌ **dos** | ✅ |
| — Refactor asistido por el compilador | ❌ | ✅ | ✅ |
| — Plomería a mano | ❌ mucha | ✅ poca | ✅ poca |

El requisito 9 es empate: **los tres usan `pg` por debajo**, y `pg` devuelve `int8` como
cadena por omisión. Se resuelve una sola vez configurando el parser de tipos en
`packages/data/cliente.ts`, y se prueba en F1.0-T06 con el módulo `dinero/`.

---

## 4. Decisión

> **Opción C — Kysely sobre `pg`, con el esquema en archivos `.sql` escritos a mano y
> los tipos generados de la base con `kysely-codegen`.**

La razón que decide es el **requisito 10**, no la comodidad.

El modelo de datos de `03-MODELO` no es un CRUD. Tiene triggers (`historial_precios`),
índices parciales únicos que **sustituyen lógica de aplicación** —la restricción de una
sola orden activa por mesa es lo que corrige P0-05 estructuralmente—, `check` explícitos
en vez de tipos `enum`, y una proyección (`existencias`) que se actualiza con decremento
atómico guardado. Ese esquema **no cabe entero en un esquema declarado en TypeScript**.
Con Drizzle, la mitad viviría en TS y la otra mitad en migraciones SQL crudas, y nada
garantizaría que concuerdan.

Con Kysely el esquema vive **entero en SQL**, en un solo sitio, y los tipos se derivan de
la base ya migrada. Si una migración no se aplicó, el tipo no existe y el build falla. La
sincronía no depende de disciplina.

Y respecto a la Opción A: Kysely no compite con ella, la completa. Por debajo es `pg`
ejecutando el mismo SQL. Lo que agrega es que el compilador conozca las columnas.

### Sub-decisión · el ejecutor de migraciones

Archivos `NNN_snake_case.sql` en `packages/data/migraciones/`, aplicados por el **ejecutor
de migraciones que ya trae Kysely**, con un proveedor que lee esos archivos (unas 60
líneas, con su prueba).

Motivo: A-27 exige que todo corra en la PC de un cliente sin internet, y el ejecutor es
parte de esa ruta. Kysely ya trae el control de versiones y el bloqueo; sólo hay que
darle el proveedor. No se agrega `node-pg-migrate` porque duplicaría un mecanismo que ya
viene en una dependencia que sí usamos (R8).

---

## 5. Consecuencias

**Se gana**

- Una sola fuente de verdad del esquema: los `.sql`. Revisables, versionados, portables.
- Tipos que no pueden mentir: salen de la base real.
- Las consultas críticas se escriben en SQL literal, tipadas, sin pelear con un ORM.
- Salir de Kysely deja `pg` + SQL, que es la Opción A. La reversa es barata por construcción.

**Se paga**

- Un paso de codegen en el pipeline: migrar → generar tipos → compilar. En CI ya se
  levanta Postgres para las pruebas de integración, así que el costo real es un comando.
- Los tipos generados se versionan y hay una comprobación en CI de que **están al día
  respecto a las migraciones**. Si alguien agrega una migración y no regenera, CI falla.
- Menos respuestas listas en internet que con Drizzle. Se compensa con que el SQL es SQL.

**Riesgos y cómo se controlan**

| Riesgo | Control |
|---|---|
| Kysely es pre-1.0 y rompe la API | Se fija la versión exacta. La superficie que usamos es pequeña y la reversa a `pg` crudo es mecánica |
| Los tipos generados se desincronizan | Comprobación en CI: regenerar y comparar. Si difiere, falla |
| `bigint` vuelve como cadena y el dinero se corrompe en silencio | Parser configurado una vez, más una prueba de F1.0-T06 que falla si `int8` no llega como `bigint` |
| Escribir SQL a mano invita a olvidar `organizacion_id` | R16 más las pruebas generadas `TEN-*` de `13-PRUEBAS §3`, que recorren todo comando y consulta |

---

## 6. Salida de reversa

Si Kysely estorba, en cualquier momento:

1. Las migraciones `.sql` **no se tocan**: nunca dependieron de Kysely.
2. Cada repositorio de `packages/data` se reescribe a `pg.query(texto, valores)`. El SQL
   ya está escrito; se le quita el envoltorio tipado.
3. Los tipos generados se conservan tal cual: son un `.d.ts` que no depende de Kysely.
4. `packages/domain`, `packages/app`, `packages/ui` y `apps/web` **no se enteran**: sólo
   hablan con las firmas de los repositorios.

Coste estimado: proporcional al número de repositorios, sin efecto en el resto del
monorepo. Es justo lo que garantiza la regla de dependencia entre capas.

---

## 7. Qué necesito de Miguel

Aprobar, o elegir otra opción. Si apruebas, este ADR pasa a **ACEPTADO**, se registra
como decisión **A-37** en `/DECISIONES.md`, y F1.1 puede escribir la primera migración.
