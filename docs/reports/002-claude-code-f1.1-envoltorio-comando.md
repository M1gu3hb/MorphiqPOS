# Reporte 002 — Claude Code — Montaje de dos carriles y envoltorio `comando()`

- **Agente:** Claude Code
- **Carril:** A (venta, dinero, restaurante)
- **Rama:** carril-a
- **Fecha inicio / fin:** 8 de septiembre de 2026
- **Commits:** `fdf8179` · `9c31f19` · `0a5a57f` (3 commits, integrados a `main`)
- **Tareas cubiertas:** montaje (credenciales, GitHub, ramas, worktree) + **A-01**

---

## 1. El prompt que recibí

> Sigues en MorphiqPOS. Cambian dos cosas: ahora hay OTRO AGENTE trabajando en
> paralelo (Codex), y tienes AUTONOMÍA TOTAL. No me preguntes a cada rato.
>
> PASO 0 — CARGA ESTAS SKILLS
> /morphiq-prs · /contratos-por-mutacion · /full-output-enforcement ·
> /supabase-vercel-produccion · /vercel-react-best-practices ·
> /vercel-composition-patterns · /vercel-deploy-to-vercel ·
> /web-design-guidelines · /impeccable · /ui-ux-pro-max
>
> PASO 1 — LEE. NO CONFÍES EN TU MEMORIA
> https://github.com/M1gu3hb/MorphiqPOS
> 1. TEAM.md ← NUEVO. Léelo primero. 2. DECISIONES.md ← 48 decisiones.
> 3. REGLAS.md. 4. docs/fase-1/18-REPARTO-DOS-CARRILES.md ← NUEVO. Tu carril es el A.
> 5. docs/fase-1/16-CORTE-F1.1-POS-QUE-VENDE.md. 6. docs/fase-1/11-CORTE-F1.4-RESTAURANTE.md
> ← también es tuyo. 7. docs/fase-1/03-MODELO-DE-DATOS-UNIFICADO.md.
> 8. docs/fase-1/04-ARQUITECTURA-Y-MONOREPO.md. 9. docs/fase-1/06-DEFECTOS-Y-ERRADICACION.md.
> 10. docs/reports/PLANTILLA.md ← NUEVO. Tu reporte va así. 11. docs/fase-1/BITACORA.md
>
> PASO 2 — MONTAJE (tú lo haces, eres el que está en la carpeta principal)
> A) Credenciales. Tengo Supabase CLI instalado y te doy permiso expreso para
>    sacar las claves del proyecto wyqmzhliurwyxuyxznpb. Escríbelas en .env,
>    que está en .gitignore. Nunca en el código, ni en un reporte, ni en un
>    commit — el repositorio es público.
>    Si el CLI te falla, dilo en el reporte: Codex lo intenta.
>    ⚠️ El proyecto "Pasteleria Confetti" (ivqcxdpqxwjxfohiswqb) NO SE TOCA.
> B) Conecta el código a GitHub. Hoy el repo local no tiene remoto y eso se
>    acabó: todo se sube.
>        git remote add origin https://github.com/M1gu3hb/MorphiqPOS.git
>        git fetch origin
>        git merge origin/main --allow-unrelated-histories
>    El README del código gana; mueve el de planeación a docs/README-PLANEACION.md.
>    Resuelve los conflictos y sube.
> C) Identidad de commits, en las dos carpetas:
>        git config user.name "M1gu3hb"
>        git config user.email "enchuer2797@gmail.com"
> D) Ramas y worktree para Codex (comandos exactos en TEAM.md §2):
>        git branch carril-a && git branch carril-b
>        git switch carril-a
>        git worktree add "..\morphiqpos-codex" carril-b
>    Tú te quedas en morphiqpos/carril-a y NO entras a la otra carpeta.
>
> TU CARRIL: A — VENTA, DINERO Y RESTAURANTE
> 22 tareas, A-01 a A-22, en docs/fase-1/18-REPARTO-DOS-CARRILES.md §3.
> Van F1.1 (motor de venta) y F1.2 (restaurante completo) enteras.
>
> TU PRIMERA TAREA ES A-01: el envoltorio comando(). Codex depende de eso —
> constrúyelo, pásale sus pruebas, haz commit y súbelo INMEDIATAMENTE. No lo
> dejes para después.
>
> Tu única dependencia de Codex es consumo.ts + stock.ts para cobrarOrden
> (A-09). Si no está listo cuando llegues: escribe la firma en contracts, pon
> un doble marcado // STUB — carril B, sigue, y anótalo en tu reporte. NO
> escribas la implementación real: es zona de Codex.
>
> Zonas de propiedad en TEAM.md §3. Migraciones: rango 010–039.
> Si un archivo no es tuyo, no lo tocas. Aunque veas un bug. Lo anotas.
>
> AUTONOMÍA
> DECIDES TÚ y lo documentas: librerías, versiones, nombres, estructura,
> orden de tareas, diseño de pruebas y mutaciones, bugs que encuentres,
> diseño visual dentro de los tokens, y cualquier cosa reversible.
> ME PREGUNTAS sólo si: es irreversible, contradice DECISIONES.md o REGLAS.md,
> o toca datos de un cliente real.
> Si dudas entre preguntar y decidir: DECIDE y escríbelo. Prefiero corregir
> una decisión escrita que esperarte.
>
> NO SE NEGOCIA
> · Cero lógica de negocio en RLS o Edge Functions. Todo en la API TypeScript
>   con transacciones reales por Kysely.
> · Precios y totales SIEMPRE en el servidor. El endpoint no acepta importes
>   del cliente.
> · Cobro, caja y stock transaccionales e idempotentes. O todo, o nada.
> · Autorización en el servidor. Ocultar un botón no es autorización.
> · Stock: ledger inmutable, decremento atómico. Nunca Math.max(0,...).
> · Dinero en bigint de centavos.
> · TypeScript estricto. Cero any, cero @ts-ignore, cero catch vacío.
> · Ningún archivo supera 300 líneas.
> · historico/ se lee como especificación. No se copia un solo archivo.
> · La prueba ANTES que el código, y después la mutación: quítala, confirma
>   que falla, restaura.
>
> AL TERMINAR
> Escribe tu reporte en docs/reports/NNN-claude-code-<tema>.md siguiendo
> PLANTILLA.md. El folio es correlativo COMPARTIDO con Codex: mira el número
> más alto que exista y toma el siguiente.
> El campo "Lo que NO hice" es obligatorio y es el que más me importa. Ahí va
> lo que quedó fuera, lo que declaraste hecho con un hueco, y toda afirmación
> del reporte que no puedas respaldar ejecutando algo.
> Sube todo: código, documentación y reporte. Nada se queda en local.
>
> Arranca: skills, lectura, montaje, y luego A-01. Trabaja sin pedirme permiso.
> Avísame cuando termines.

## 2. Qué se me pidió

Montar la infraestructura de dos carriles —credenciales, remoto de GitHub, ramas y
worktree— y luego construir A-01, el envoltorio `comando()`, y subirlo de inmediato
porque Codex está bloqueado esperándolo.

No entendí nada distinto de lo escrito. Una precisión: interpreté «súbelo
INMEDIATAMENTE» como subirlo también a `main`, no sólo a `carril-a`, porque desde
`carril-a` Codex no lo alcanza.

---

## 3. Qué hice — tarea por tarea

### Montaje · credenciales

- **Qué construí:** `.env` con las claves del proyecto MorphiqPOS.
- **Cómo lo resolví:** el CLI de Supabase no estaba en el PATH, pero sí disponible
  vía `npx` (2.117.0) y ya autenticado. `supabase projects api-keys --reveal`
  entregó las cuatro claves. Se prefirieron las modernas `sb_publishable_` y
  `sb_secret_` sobre las JWT heredadas, siguiendo
  `supabase-vercel-produccion §13`: las legacy se deprecan a fin de 2026.
- **Archivos creados:** `.env` (ignorado por git; verificado con `git check-ignore`).
- **Criterio de aceptación:** ⬜ **PARCIAL.** `DATABASE_URL` sigue faltando. Ver §11.

### Montaje · GitHub, ramas y worktree

- **Qué construí:** el repositorio de código unido al de planeación, `main` en
  GitHub, `carril-a` creada y publicada.
- **Cómo lo resolví:** `git merge origin/main --allow-unrelated-histories`. Un solo
  conflicto, `README.md`: ganó el del código y el de planeación quedó en
  `docs/README-PLANEACION.md`. Se corrigió además el párrafo del README que decía
  «la planeación no vive aquí», que la fusión volvió falso.
- **Archivos modificados:** `README.md` · `.gitignore` · `.prettierignore` ·
  `scripts/verificar-residuos.mjs`
- **Criterio de aceptación:** ✅ `main` y `carril-a` en GitHub, `pnpm verify` en verde.
- **Nota:** Codex ya había creado `carril-b` y su worktree, así que `git branch
  carril-b` falló con «already exists». No toqué nada suyo.

### A-01 · Envoltorio `comando()`

- **Qué construí:** el envoltorio que resuelve, una vez y para todos los comandos,
  las ocho responsabilidades de `04-ARQUITECTURA §3`: validación zod, comprobación
  de rol, comprobación de paquete, transacción, clave de idempotencia, auditoría,
  correlation id y errores tipados.

- **Cómo lo resolví, y por qué así:**

  **Una sola transacción para todo.** Leer el paquete, reclamar la clave, ejecutar
  el cuerpo, auditar y guardar la respuesta ocurren dentro de la misma. R10 dice
  «o confirma todo, o no persiste nada», y eso incluye al propio envoltorio: una
  auditoría escrita después del commit dejaría cobros sin rastro. La primera
  versión abría dos transacciones (una sólo para leer el paquete) y las pruebas lo
  detectaron — ver Error 1.

  **La clave de idempotencia se reclama DENTRO de la transacción.** Es la mitad que
  se olvida. Si el cobro se revierte, la reversión libera la clave y el reintento
  vuelve a cobrar de verdad. Reclamarla fuera la quemaría, y el reintento
  devolvería un éxito guardado sin haber cobrado nada — el peor error posible en
  una caja. Además serializa dos peticiones simultáneas en el índice único, sin un
  solo candado en memoria, que es lo que no sobrevive a dos procesos.

  **El rol y el paquete se comprueban antes de mirar la entrada.** Si el 400
  llegara primero, un rol sin permiso podría sondear el esquema de un comando
  administrativo campo por campo, a base de entradas inválidas.

  **R16 se hace cumplir al DEFINIR el comando, no en una prueba.** Un comando cuya
  entrada declare `organizacion_id` —o cualquier clave de ámbito— lanza al
  definirse y el módulo no carga. La alternativa era una prueba que recorriera un
  registro de comandos, y un registro sólo contiene lo que alguien se acordó de
  registrar: un comando nuevo que se olvidara dejaría pasar la prueba con la regla
  incumplida. Fallar al definir no se puede olvidar.

  **El resultado es una unión, no una excepción.** `comando()` devuelve
  `{ ok: false, error }` en vez de lanzar. Un `throw` obliga a cada ruta a un
  `try/catch`, y un `catch` es exactamente donde se silencian los errores que R12
  prohíbe silenciar. Con la unión, ignorar el fallo es un error de tipos.

  **El puerto está parametrizado sobre el tipo de transacción.** El envoltorio no
  hace nada con `tx` salvo pasarlo, así que no necesita saber qué es. Eso permite
  enlazarlo a la `Transaccion` real de Kysely en producción y a un doble en las
  pruebas, sin simular Kysely y **sin un solo `any`**.

- **Archivos creados:**
  `packages/app/package.json` · `tsconfig.json` ·
  `packages/app/src/comando.ts` · `definicion.ts` · `repositorio.ts` ·
  `auditoria.ts` · `errores.ts` · `fallos.ts` · `saneado.ts` · `produccion.ts` ·
  `index.ts` ·
  `pruebas/dobles.ts` ·
  `comando.autorizacion.test.ts` · `comando.idempotencia.test.ts` ·
  `comando.transaccion.test.ts` · `comando.auditoria.test.ts` ·
  `comando.contrato.test.ts` · `comando.integracion.test.ts` ·
  `packages/contracts/src/comandos/ambito.ts` · `resultado.ts` · `index.ts` ·
  `packages/data/src/repos/comandos.ts` ·
  `packages/data/src/migraciones/sql/010_comandos_ejecutados.sql`

- **Archivos modificados:**
  `packages/contracts/src/index.ts` · `packages/data/src/index.ts` ·
  `packages/data/src/esquema.ts` (regenerado) ·
  `packages/data/bin/generar-tipos.mjs` (bug corregido) ·
  `scripts/verificar-estructura.mjs` · `eslint.config.mjs`

- **Migraciones aplicadas:** **010 `comandos_ejecutados`**, aplicada a Supabase
  `wyqmzhliurwyxuyxznpb`. Crea la tabla de idempotencia con
  `unique (organizacion_id, comando, idempotency_key)`, sus checks, RLS forzado, y
  los dos índices que le faltaban a `auditoria` (por acción y por correlation id).
  Ledger `_migraciones` en 7 filas.

- **Pruebas escritas:** 48 unitarias en 5 archivos.
  - *autorización* (11): entrada inválida no ejecuta el cuerpo · el campo que falló
    se nombra sin devolver el valor · propiedades no declaradas se rechazan · rol
    fuera de lista deniega · rol en lista permite · `PAQUETE_NO_INCLUYE` antes del
    caso de uso · el paquete se lee de la organización · paquete ilegible falla
    cerrado · el permiso se comprueba antes que la entrada · el paquete también.
  - *idempotencia* (7): comando que escribe sin clave se rechaza · uno que sólo lee
    no la exige · SALE-03 tres veces = un resultado · el reintento no audita otra
    vez · misma clave con otra entrada es conflicto · las claves no colisionan entre
    organizaciones · **un fallo NO quema la clave**.
  - *transacción* (9): el cuerpo lanza y nada queda confirmado · el éxito confirma ·
    inyección de fallo por nombre de paso · interrumpir un paso inexistente es error ·
    `ErrorDominio` llega como `REGLA_DE_NEGOCIO` · un error inesperado no filtra su
    mensaje · correlation id respetado si es uuid · generado si es basura.
  - *auditoría* (7): fila con acción, entidad y ámbito · una sola por ejecución ·
    declarar que escribe sin auditar es error · el rechazo deja rastro fuera de la
    transacción · el paquete no incluido también · la entrada inválida no se audita ·
    saneado de pin/hash/token a cualquier profundidad.
  - *contrato* (14): las 11 claves de ámbito rechazadas al definir · nombre fuera de
    `dominio.verbo` · lista de roles vacía · lista de paquetes vacía.

- **Mutaciones ejecutadas:** 17, con arnés automatizado que aplica el cambio al
  archivo real, corre la suite, y restaura. **Las 14 destructivas hacen fallar la
  suite; las 3 inocuas la dejan pasar; el estado final vuelve a verde.**

  | Destructiva | Suite tras la mutación |
  |---|---|
  | quitar la comprobación de rol | 3 fallan |
  | quitar la comprobación de paquete | 4 fallan |
  | validar la entrada antes del rol | 2 fallan |
  | quitar la transacción | 26 fallan |
  | reclamar la clave fuera de la transacción | 3 fallan |
  | no comparar la huella de la entrada | 1 falla |
  | no sanear el payload | 1 falla |
  | permitir que un comando que escribe no deje rastro | 1 falla |
  | aceptar cualquier correlation id | 1 falla |
  | filtrar el mensaje de Postgres | 1 falla |
  | permitir claves de ámbito en la entrada (R16) | 11 fallan |
  | no avisar de un paso inexistente | 1 falla |
  | no exigir clave de idempotencia | 1 falla |
  | auditar el rechazo dentro de la transacción revertida | 3 fallan |

  **Inocuas que PASAN:** renombrar una variable interna · agregar un comentario ·
  reordenar dos campos de la fila de auditoría.

- **Criterio de aceptación:** ✅ **cumplido con un hueco declarado.**
  «Un comando de juguete trae las siete cosas sin escribir línea extra» — cumplido:
  los comandos de las pruebas declaran nombre, entidad, roles, paquetes y esquema, y
  reciben todo lo demás.
  «**Mutación:** si el cuerpo lanza a mitad, no queda nada persistido — se verifica
  con inyección de fallos» — cumplido **a nivel de envoltorio** (se verifica que
  pide la reversión) y **a nivel de base** (ver §6), pero **no de punta a punta**
  por falta de `DATABASE_URL`. Ver §8.

---

## 4. Errores que encontré

### Error 1 — Abría dos transacciones, y la segunda confirmaba aunque el comando fallara

- **Qué pasaba:** leía el paquete de la organización en su propia transacción,
  antes de la del comando. Esa lectura confirmaba siempre, así que «la transacción
  del comando se revirtió» era cierto pero incompleto: había otra que no.
- **Cómo lo detecté:** lo vieron **las pruebas**. Tres afirmaban sobre transacciones
  confirmadas y salieron en rojo con conteos que no cuadraban.
- **Causa raíz:** tratar la lectura del paquete como un paso previo en vez de como
  parte del comando. R10 exige una sola transacción; dos son dos.
- **Cómo lo resolví:** todo dentro de una. Los rechazos se lanzan desde dentro y la
  reversión los cubre; la auditoría del rechazo se escribe después, aparte.
- **Prueba que impide que vuelva:** «un comando exitoso confirma la transacción»
  afirma exactamente **una** transacción confirmada, no «al menos una».
- **¿Estaba en verde para todas las puertas antes?** No llegó a existir en verde.

### Error 2 — Dos de mis propias aserciones probaban un detalle, no la propiedad

- **Qué pasaba:** una prueba afirmaba «no se abrió ninguna transacción» y otra «no
  hay nada confirmado», cuando lo correcto era «no se escribió nada del comando» y
  «la única fila confirmada es la auditoría del rechazo, y debe estar».
- **Cómo lo detecté:** las vi yo, al leer por qué fallaban tras el Error 1.
- **Causa raíz:** escribí la aserción mirando la implementación que tenía en la
  cabeza en vez de la propiedad que quería garantizar.
- **Cómo lo resolví:** reescribí las dos aserciones sobre las escrituras
  confirmadas por tabla.
- **Prueba que impide que vuelva:** la mutación «auditar el rechazo dentro de la
  transacción revertida» hace fallar 3 pruebas; con la aserción vieja no habría
  fallado ninguna.

### Error 3 — Bug real en el generador de tipos: `unknown | null`

- **Qué pasaba:** `packages/data/bin/generar-tipos.mjs` producía
  `respuesta: unknown | null` para una columna `jsonb` nula. `unknown` ya incluye
  `null`, así que la unión es redundante y `@typescript-eslint/no-redundant-type-constituents`
  la rechaza.
- **Cómo lo detecté:** lo vio **`pnpm lint`**, sobre el archivo generado.
- **Causa raíz:** el mapeo aplicaba `| null` uniformemente sin caso especial para
  `unknown`. No había salido antes porque las dos columnas `jsonb` anteriores
  (`configuracion.valores`, `auditoria.payload`) son `not null`.
- **Cómo lo resolví:** en el **generador**, no en el archivo generado. Editar el
  archivo generado habría durado hasta la siguiente regeneración.
- **Prueba que impide que vuelva:** `pnpm lint` sobre `esquema.ts`, que ya corre en
  la puerta.
- **¿Estaba en verde para todas las puertas antes?** Sí, porque la columna que lo
  provoca no existía hasta esta tarea.

### Error 4 — Un comentario SQL con backticks dentro de un template literal de JS

- **Qué pasaba:** al corregir el Error 3 escribí un comentario SQL con backticks
  dentro del template literal de JavaScript que contiene la consulta. El backtick
  cerró la cadena.
- **Cómo lo detecté:** `pnpm lint` → `Parsing error: ',' expected`.
- **Causa raíz:** escribir prosa con acento tipográfico dentro de una cadena
  delimitada por ese mismo carácter.
- **Cómo lo resolví:** reescribí el comentario con comillas dobles.
- **Prueba que impide que vuelva:** `pnpm lint`, que ya lo cazó.

### Error 5 — `comando.ts` llegó a 319 líneas y se pasó del límite

- **Qué pasaba:** el archivo del envoltorio superaba las 300 líneas que la regla
  fija sin excepción.
- **Cómo lo detecté:** lo vi yo, en la revisión final. **Ninguna puerta lo mira**:
  no hay contrato que cuente líneas.
- **Causa raíz:** las clases de señal y el atendedor de reintentos vivían en el
  mismo archivo que la orquestación, siendo otra responsabilidad.
- **Cómo lo resolví:** salieron a `packages/app/src/fallos.ts`. `comando.ts` quedó
  en 268 líneas y el arnés de mutación volvió a pasar 17/17 después del corte.
- **Prueba que impide que vuelva:** **ninguna.** Es un hueco declarado: el límite
  de 300 líneas no tiene contrato automático en este repositorio. Va a §8.

### Error 6 — La fusión de los dos repositorios rompió dos puertas

- **Qué pasaba:** al unir código y documentación, `format:check` marcó 32
  documentos de prosa y `verificar-residuos` marcó los documentos que **analizan**
  la retirada de la plataforma erradicada.
- **Cómo lo detecté:** `pnpm verify` tras la fusión.
- **Causa raíz:** los dos contratos se escribieron cuando la documentación vivía en
  otro repositorio, así que nunca la habían visto. El de residuos, en particular,
  marcaba prosa que **R6 permite de forma literal**: «sólo puede aparecer en
  evidencia histórica y en documentos de auditoría que expliquen la retirada».
- **Cómo lo resolví:** excluí la prosa de Prettier (no la reformateo: son 32
  archivos de zona neutral que Codex también edita) y acoté el escáner de residuos
  a la documentación de auditoría, **por prefijo de ruta y sólo para `.md`**.
- **Prueba que impide que vuelva:** validé el escáner mutando —
  **Destructivas que FALLAN:** residuo en `packages/domain/*.ts` · residuo en
  `README.md` · residuo en un `.ts` colocado dentro de `docs/fase-1/`.
  **Inocuas que PASAN:** los documentos de auditoría reales.

---

## 5. Decisiones que tomé sin preguntar

| Decisión | Alternativas | Por qué esta | ¿Va a DECISIONES.md? |
|---|---|---|---|
| `comando()` **sí** verifica el paquete | No verificarlo (lo que sugería un documento previo, apoyado en P1-14) | 16-CORTE T07 exige `403 PAQUETE_NO_INCLUYE` y `PAQ-01` es prueba obligatoria del corte; A-42 lo hace núcleo | No: ya está en A-42 |
| Roles declarados **en cada comando**, no en un mapa central | Mapa central en `politicas/` | Un mapa central es un archivo compartido que los dos carriles tendrían que editar en cada comando nuevo: conflicto garantizado. La matriz sigue siendo enumerable recorriendo las definiciones | Sí, **A-49** |
| Permisos por rol **estáticos** en F1.1 | Tabla `permisos_rol` del modelo de datos | Esa tabla no está en las 26 de F1.1-T02 y A-41 difiere la matriz configurable a F1.5. Cambiarla luego no toca ningún comando | Sí, **A-49** |
| Tabla `comandos_ejecutados` (migración 010) | Apoyarse en el `unique (organizacion_id, idempotency_key)` de `ordenes` y `pagos` | Esos índices resuelven una orden o un pago concretos, no el caso general. La idempotencia es responsabilidad del envoltorio | Sí, **A-49** |
| **Sin** `emitir()` ni outbox en F1.1 | Ponerlo como no-op para respetar la firma del molde | La tabla de eventos no existe en F1.1. Un `emitir` que no emite es peor que no tenerlo: parece que hay eventos | Sí, **A-49** |
| Resultado como unión, no excepción | `throw` + `try/catch` en cada ruta | Un `catch` es donde se silencian los errores que R12 prohíbe silenciar | Sí, **A-49** |
| Prosa de planeación fuera de Prettier | Reformatear los 32 documentos | Zona neutral: TEAM.md §3 dice agregar, no modificar lo ajeno. Y garantizaría conflictos con Codex | No: es configuración |
| `require-await` apagada **sólo en pruebas** | Reescribir cada método como `Promise.resolve` | Un doble que implementa un puerto asíncrono debe devolver promesa aunque no espere nada. La regla sigue entera en producción | No: es configuración |

---

## 6. Verificación ejecutada — evidencia, no promesas

| Comando | Resultado | Salida relevante |
|---|---|---|
| `pnpm verify` | ✅ salida 0 | 8 contratos en verde, build de Next incluido |
| `pnpm test:unit` | ✅ 206 pruebas (48 nuevas) | 11 archivos |
| `pnpm test:integracion` | ⬜ **no ejecutado** | falta `DATABASE_URL` |
| `pnpm test:e2e` | ⬜ no aplica a esta tarea | |
| `pnpm lint` | ✅ 0 errores | |
| `pnpm typecheck` | ✅ 7 workspaces | |
| `pnpm build` | ✅ | Next 16.3.4, 3 rutas |
| arnés de mutación | ✅ 14/14 destructivas fallan, 3/3 inocuas pasan | estado final verde |

**Contra la base real** (Supabase `wyqmzhliurwyxuyxznpb`, PostgreSQL 17.6, todo
dentro de una transacción revertida — la base quedó con 0 filas):

| Escenario | Resultado |
|---|---|
| Primera reclamación de la clave | pasó |
| Segunda reclamación de la MISMA clave | falló (unique) ✅ |
| La misma clave para OTRO comando | pasó ✅ |
| **Revertir LIBERA la clave: el reintento vuelve a ejecutar** | pasó ✅ |
| Nombre sin la forma `dominio.verbo` | falló (check) ✅ |
| Respuesta guardada sin `completado_en` | falló (check) ✅ |
| Huella que no es un sha256 | falló (check) ✅ |
| La fila de auditoría del envoltorio se acepta | pasó ✅ |

**Lo que NO probé contra la base real:** el camino completo
`comando() → Kysely → Postgres`. Ver §8.

---

## 7. Gate `morphiq-prs`

- **Superficies activadas:** S2 (login, por venir) · S5 (backend propio) ·
  S7 (Supabase) · S10 (dinero) · S11 (datos personales) · S14 (DB) · S15 (sistema
  crítico diario).
- **BLOCKERS abiertos:** ninguno en lo entregado.
  - §01 «cero secretos en frontend, repo o logs»: verificado con
    `git grep` de los patrones de clave sobre archivos rastreados → 0 coincidencias.
    `.env` confirmado ignorado (`git check-ignore` → `.gitignore:22`).
  - §12 «constraints reales; transacciones en operaciones multi-tabla»: la
    migración 010 trae unique + 3 checks, verificados contra la base.
  - §19 «errores en transacciones críticas hacen rollback»: verificado por 14
    mutaciones.
- **CRITICAL abiertos y aceptados:**
  - §13 «Security Advisor sin findings críticos» — **no reejecutado** tras la
    migración 010. Los dos WARN previos se cerraron en la migración 006; la 010 no
    introduce funciones ni extensiones, pero no lo comprobé.
- **Checks que NO pude verificar:** todo lo que exige la aplicación conectada
  (§01 build+deploy respondiendo, §22 estados de error, §06 teclado). Son de tareas
  posteriores y de la conexión que falta.

---

## 8. Lo que NO hice

**Lo más importante primero: el criterio de aceptación de A-01 está cumplido en
dos de sus tres niveles, no en los tres.**

1. **`pnpm test:integracion` no se ha ejecutado nunca.** Escribí
   `comando.integracion.test.ts` con 6 escenarios —incluida concurrencia real con
   `Promise.all`— y typecheckea y lintea, pero **no lo he corrido**. Falta
   `DATABASE_URL`. **No puedo afirmar que pasa.** Lo que sí verifiqué es:
   (a) que el envoltorio pide la reversión, con dobles; (b) que Postgres cumple las
   restricciones en que se apoya, con SQL real. El pegamento entre ambos —Kysely
   ejecutando el `insert` del comando dentro de la transacción del envoltorio— está
   escrito y tipado, **y nunca ha corrido**.

2. **`packages/data/src/repos/comandos.ts` no ha ejecutado una sola consulta.**
   Compila y sus tipos cuadran contra el esquema generado, que es una garantía
   real, pero eso no es lo mismo que haber corrido. En particular no he comprobado:
   que `set local lock_timeout` funcione en el pooler de Supabase (el pooler en modo
   transacción a veces rechaza `SET`); que `pg` devuelva `23505` y `55P03` con la
   forma que espera mi función `sqlstate`; ni que `respuesta: JSON.stringify(...)`
   se guarde bien en la columna `jsonb`.

3. **No pude poner `DATABASE_URL`.** La contraseña de la base no es recuperable por
   diseño: Supabase la guarda hasheada y el CLI sólo la acepta como entrada.
   Regenerarla por la API de gestión exige leer el token del CLI desde el
   Credential Manager de Windows, y **esa lectura fue bloqueada en este entorno**;
   no la rodeé. Considerué cambiarla por SQL con `ALTER USER` a través del MCP —el
   rol es `postgres` y tiene permiso— pero eso obligaba a escribir el secreto en el
   chat, y `supabase-vercel-produccion §9` lo prohíbe explícitamente. Codex chocará
   con la misma pared: no es un fallo del CLI, es que el dato no existe en ninguna
   parte. **Lo tiene que hacer Miguel.** Instrucciones exactas en §11.

4. **No verifiqué el Security Advisor tras la migración 010.**

5. **La comprobación de rol es un arreglo estático en cada comando, no la matriz
   configurable.** Está declarado y es lo que F1.1 pide (A-41 difiere la matriz a
   F1.5), pero si alguien lee «autorización por acción» esperando `permisos_rol`,
   no está.

6. **No hay ningún comando de negocio todavía.** A-01 entrega el molde; los
   comandos que lo usan son A-02 en adelante. Los «comandos de juguete» de las
   pruebas no son producto.

7. **`ctx.auditar` acepta el primer rastro y descarta los demás.** Si un comando
   llama a `auditar` dos veces, la segunda se ignora en silencio. Es coherente con
   «una fila por ejecución», pero **el descarte silencioso es exactamente el patrón
   que R12 desaprueba** y no escribí prueba para él. Queda declarado.

8. **No probé el camino `ocupada` (lock_timeout) del envoltorio.** El doble puede
   devolverlo pero ninguna prueba lo provoca; sólo se puede provocar de verdad con
   dos conexiones simultáneas, que es la prueba de integración que no corrí.

9. **No escribí un contrato que haga cumplir el límite de 300 líneas.** Lo
   descubrí por revisión manual, no por una puerta. Cualquiera puede pasarse otra
   vez sin que nada avise. Es barato de escribir y no lo hice: `scripts/` es zona
   neutral y no quise agregar un contrato que también le fallara a Codex sin
   habérselo avisado antes.

10. **No leí `06-DEFECTOS-Y-ERRADICACION.md` ni `11-CORTE-F1.4-RESTAURANTE.md` de
   forma directa.** Los leí a través de agentes que extrajeron su contenido. Para
   `03-MODELO-DE-DATOS` y `BITACORA` igual. Los cuatro documentos que sí leí
   completos y literales son TEAM.md, REGLAS.md, DECISIONES.md,
   18-REPARTO, 16-CORTE, 04-ARQUITECTURA y PLANTILLA.md. **Encontré que la síntesis
   de los agentes contenía dos afirmaciones falsas** —que `comando()` no debía
   verificar paquete, y que se apoyara en tablas `permisos_rol` y
   `capacidades_activas` que no existen en F1.1— y las corregí contra los
   documentos que sí leí directamente. Puede haber otras que no detecté.

---

## 9. Bugs ajenos detectados

| Archivo | Qué vi | Gravedad |
|---|---|---|
| `packages/contracts/tsconfig.json` | No tiene `allowImportingTsExtensions`, a diferencia de `data` y `app`. Sus imports internos van sin extensión, y eso es justo lo que rompió el CLI de migraciones en la sesión anterior: Node ESM no los resuelve, pero `typecheck` y `vitest` sí. Hoy no molesta porque `contracts` no tiene punto de entrada ejecutable. **No lo toqué**: es zona neutral y Codex está trabajando ahí; cambiar dos líneas existentes por consistencia no vale un conflicto | BAJA |

Ningún bug detectado en código del carril B. No entré a `morphiqpos-codex`.

---

## 10. Pendientes cruzados

| Necesito | De quién | Para qué tarea | ¿Puse un STUB? |
|---|---|---|---|
| `packages/domain/inventario/consumo.ts` y `packages/data/repos/stock.ts` | Codex (B-02, B-03) | **A-09** `cobrarOrden` | Todavía no: A-09 está a siete tareas |

**Para Codex, disponible ya en `main`:**

```ts
import { definirComando } from '@morphiqpos/app';
import { comando } from '@morphiqpos/app/produccion';
```

Un comando declara `nombre` (forma `dominio.verbo`), `entidad`, `escribe`, `roles`,
`paquetes`, `entrada` (zod) y `ejecutar(ctx, entrada)`. El contexto trae `ambito`,
`correlationId`, `ahora`, `tx`, `paso(nombre, fn)` y `auditar({ entidadId, payload })`.
**Un comando con `escribe: true` tiene que llamar a `ctx.auditar` o falla a propósito.**
Y su entrada **no puede declarar** `organizacion_id`, `sucursal_id`, `identidad_id`,
`empleo_id`, `terminal_id` ni `rol`: lanza al definirse.

---

## 11. Estado al cerrar

- **Tareas de mi carril terminadas:** 1 de 22 (A-01), más el montaje completo.
- **Rama integrada a `main`:** sí. `main` = `0a5a57f`, con `pnpm verify` en verde.
- **Bloqueos activos:** **uno, y lo tiene que resolver Miguel.**

  `DATABASE_URL`. Sin él la aplicación no se conecta, `pnpm db:migrate` no puede
  confirmar el ledger, `pnpm db:tipos` no se puede reejecutar, y **ninguna prueba
  de integración corre** — incluidas las que cierran A-01, A-05 (folios), A-08
  (caja) y A-09 (cobro).

  Toma menos de un minuto:

  1. Supabase → proyecto **MorphiqPOS** → Project Settings → Database
  2. **Reset database password** (no borra datos; el proyecto tiene 0 filas)
  3. Connection string → **Session pooler** → copiar
  4. Pegar la contraseña donde dice `[YOUR-PASSWORD]` y sustituir la línea
     `DATABASE_URL=` de `morphiqpos/.env`

  El archivo ya tiene el hueco marcado y el resto de variables puestas. Está en
  `.gitignore`, así que no se sube.

- **Siguiente tarea:** **A-02**, enrolamiento de terminal con código de un solo uso
  y expiración. Necesita `comando()` (hecho) y las tablas `terminales` (aplicada) —
  puede avanzar sin `DATABASE_URL`, pero su prueba de integración quedará igual sin
  ejecutar hasta que llegue.

---

## 12. Para el que retome esto

- **La reclamación de la clave de idempotencia va DENTRO de la transacción, y no es
  un detalle.** Si alguien la "optimiza" sacándola fuera, un cobro que falle dejará
  la clave quemada y el reintento devolverá un éxito que nunca ocurrió. Hay una
  mutación que lo caza; si la ves fallar, es esto.
- **El envoltorio está parametrizado sobre el tipo de transacción y parece
  innecesario.** No lo es: es lo que permite probar las ocho responsabilidades sin
  base de datos y sin un solo `any`. `packages/app/src/produccion.ts` es el único
  sitio que lo ata a Kysely.
- **`packages/data/src/repos/comandos.ts` no importa el puerto de `packages/app` a
  propósito.** La regla de dependencia va de `app` hacia `data`. Las funciones
  tienen la forma que el puerto pide y el tipado estructural las une; si añades un
  método al puerto, añade la función suelta aquí y compón en `produccion.ts`.
- **No hagas que `definirComando` deje de lanzar.** La comprobación de R16 vive ahí
  y no en una prueba porque un registro sólo contiene lo que alguien recordó
  registrar.
- **Lo que más falta por verificar es el pegamento con Postgres**, no la lógica.
  En cuanto haya `DATABASE_URL`, lo primero es `pnpm test:integracion`.
