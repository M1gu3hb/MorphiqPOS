# 21 — Prompt de cierre de F1.1

Pégalo tal cual en una sesión nueva de Claude Code, abierta en `D:\MIS PROYECTOS\Master POS\morphiqpos`.

---

```
Sesión de cierre de F1.1. Trabajas SOLO: Codex se quedó sin uso. Tienes
autonomía total y eres dueño de TODO el repositorio.

═══════════════════════════════════════════════════════════════════════
CARGA ESTAS SKILLS
═══════════════════════════════════════════════════════════════════════

/morphiq-prs
/contratos-por-mutacion
/full-output-enforcement
/supabase-vercel-produccion
/vercel-deploy-to-vercel
/vercel-react-best-practices
/impeccable

═══════════════════════════════════════════════════════════════════════
LEE — SÓLO ESTOS TRES
═══════════════════════════════════════════════════════════════════════

  1. docs/fase-1/20-PLAN-CIERRE-F1.1.md   ← COMPLETO. Es tu plan.
  2. docs/fase-1/BITACORA.md
  3. docs/reports/PENDIENTES-CRUZADOS.md

Nada más. Ya leíste el resto en sesiones anteriores.

═══════════════════════════════════════════════════════════════════════
DOS COSAS QUE CAMBIAN RESPECTO A TODO LO ANTERIOR
═══════════════════════════════════════════════════════════════════════

1. TEAM.md QUEDA SUSPENDIDO. Ya no hay dos agentes ni zonas de propiedad
   ni rangos de migraciones por carril. Eres dueño de todo el repositorio.
   Si algo está mal en cualquier archivo, lo arreglas.

2. NADA SE DECLARA TERMINADO SIN HABERLO EJECUTADO. Ni una pantalla
   "cableada" que no abriste, ni una consulta que nunca corrió, ni un
   comando que nunca invocaste. Si no se ejecutó, va en "Lo que NO hice".

═══════════════════════════════════════════════════════════════════════
LA VERDAD SOBRE EL ESTADO ACTUAL — LÉELA ANTES DE EMPEZAR
═══════════════════════════════════════════════════════════════════════

Tu motor de venta es lo mejor del proyecto. cobrarOrden hace ocho efectos
en una transacción, recalcula el precio en servidor, exige idempotencia y
toma el folio DESPUÉS del stock para que una reversión no deje hueco. Eso
está bien pensado y bien protegido.

Y no sirve todavía, por tres razones que ninguna de tus puertas detectó:

A) NADIE PUEDE ENTRAR. credenciales_pin tiene 0 filas y NINGÚN archivo del
   repositorio inserta ahí. hashearPin() existe y nadie la llama.
   generarCodigoDeEnrolamiento() existe y ningún callsite la invoca. Sin
   cookie de dispositivo, /api/auth/empleados devuelve lista vacía. Es un
   bucle cerrado sin puerta.

B) EL FLUJO DE VENTA NUNCA CORRIÓ CONTRA POSTGRES. Los datos de Supabase
   —3 organizaciones, 14 productos, 2 órdenes pagadas, 16 movimientos de
   stock— son atrezzo insertado por SQL directo en las migraciones 042 y
   043. La prueba: auditoria tiene 0 filas, y tu envoltorio audita
   obligatoriamente toda escritura. Toda la capa Kysely está sin estrenar.

C) carril-b NO ESTÁ MERGEADO. main = carril-a = 51aa0fd. carril-b = 6036ba5.
   Ahí viven las pantallas de gestión cableadas, el arreglo del bug de
   stock y las migraciones 041/042/043. Y como la base se migró desde ese
   worktree, main tiene 8 migraciones y Supabase tiene 11: el código y el
   esquema YA DIVERGIERON.

Tu reporte 004 fue honesto y lo dijo. Pero el titular decía "abrir el
navegador y cobrar" y eso nunca se pudo hacer. Hoy se arregla.

═══════════════════════════════════════════════════════════════════════
EL OBJETIVO
═══════════════════════════════════════════════════════════════════════

Al terminar, Miguel abre pos-mh-astral-systems.com desde su teléfono,
entra con PIN, vende, cobra y le sale un ticket. Con datos creíbles,
porque se lo va a enseñar a un cliente para venderlo.

20 tareas en tres hitos. El plan completo está en 20-PLAN-CIERRE-F1.1.md
§4. No lo repito aquí: léelo.

  HITO 1 · C-01 a C-09 — que se pueda vender de verdad
  HITO 2 · C-10 a C-15 — el día completo del cajero
  HITO 3 · C-16 a C-20 — en línea en el dominio

Si se acaba la sesión, párate en un hito, no a media tarea.

═══════════════════════════════════════════════════════════════════════
TRES TRAMPAS QUE TE VAN A FRENAR SI NO TE LAS AVISO
═══════════════════════════════════════════════════════════════════════

TRAMPA 1 — El bucle del primer PIN.
Para crear un PIN necesitas un comando. Para ejecutar un comando necesitas
sesión. Para tener sesión necesitas un PIN. Circular.
NO intentes resolverlo con un comando. Se rompe con un SCRIPT (C-04,
pnpm db:bootstrap) que corre en el servidor con acceso directo a la base y
crea el primer dueño con PIN más el código de enrolamiento. Es la única
excepción legítima al envoltorio, se ejecuta una vez, y va documentada.
Si te atoras aquí, es por esto. Sigue el C-04 y avanza.

TRAMPA 2 — El merge tiene un explosivo.
verificar-inventario.mjs de carril-b busca literalmente la línea
'if (movimiento.permiteNegativo) {', que SÓLO existe en la versión
arreglada de stock.ts. Si mergeas el script sin el arreglo, pnpm verify
revienta con "No se encontró la protección" y parece un desastre.
Por eso: MERGEA LA RAMA COMPLETA, jamás cherry-pick. Y antes revisa
`git log --oneline main..carril-b` y el diff, porque el worktree de Codex
tiene archivos tuyos sin merge registrado en su reflog.

TRAMPA 3 — La primera venta real probablemente va a fallar.
Tu propio reporte lo predijo: "el candidato más probable es un nombre de
columna que no coincida". Toda la capa Kysely está sin estrenar. Cuando
falle, no es un desastre: es C-09. Arréglalo, escribe la prueba que lo
habría cazado, y sigue.

═══════════════════════════════════════════════════════════════════════
LA PRUEBA QUE CIERRA EL HITO 1
═══════════════════════════════════════════════════════════════════════

Una sola consulta:

    select count(*) from auditoria;   -- tiene que ser > 0

Esa fila prueba que sesión, comando, transacción, Kysely y Postgres
funcionaron de punta a punta. Hoy es 0 y lleva tres sesiones siéndolo.

Cuando deje de ser 0, avísame de inmediato aunque no hayas terminado el
resto. Es el hito que llevamos tres días persiguiendo.

═══════════════════════════════════════════════════════════════════════
VERCEL Y EL DOMINIO
═══════════════════════════════════════════════════════════════════════

Proyecto: UNO SOLO, llamado morphiqpos, conectado a M1gu3hb/MorphiqPOS,
rama main.

DATABASE_URL en Vercel tiene que ser la del SESSION POOLER de Supabase.
La conexión directa no sirve en serverless: se agotan las conexiones.

Dominio: pos-mh-astral-systems.com — Miguel ya lo tiene comprado.
Agrégalo en Vercel y ANOTA EN EL REPORTE LOS REGISTROS DNS EXACTOS que
Vercel pida, en formato copiable. Ese último paso lo hace Miguel en su
registrador: tú no tienes acceso ahí. Déjalo escrito y sigue con lo demás.

═══════════════════════════════════════════════════════════════════════
LO QUE NO ENTRA HOY — NO LO EMPIECES
═══════════════════════════════════════════════════════════════════════

Todo el restaurante (mesas, mesero, cocina, comandas, propinas): cero
líneas hoy, va con su propio plan. El consumo por receta al vender
(planearConsumo hoy descarta todo lo que no sea 'sku'). Devoluciones,
reimpresión, escáner. Compras, proveedores, gastos, fiado. Portal QR.

Si terminas los tres hitos y te sobra sesión, avísame antes de abrir nada
de eso.

═══════════════════════════════════════════════════════════════════════
NO SE NEGOCIA
═══════════════════════════════════════════════════════════════════════

· Precios y totales SIEMPRE en el servidor.
· Cobro, caja y stock transaccionales e idempotentes.
· El PIN nunca sale de la base.
· Autorización en el servidor. Ocultar un botón no es autorización.
· Stock: ledger inmutable, decremento atómico, falla en vez de silenciar.
· Dinero en bigint de centavos. Cero any, cero @ts-ignore, cero catch vacío.
· Ningún archivo sobre 300 líneas.
· historico/ se lee como especificación. No se copia un archivo.
· Si dices que corriste mutaciones, EL ARNÉS SE COMMITEA Y SE ENGANCHA A
  verify. Lo hiciste bien con verificar-venta.mjs: ese es el estándar.
· NO se toca Pasteleria Confetti (ivqcxdpqxwjxfohiswqb).

═══════════════════════════════════════════════════════════════════════
CÓMO TRABAJAS
═══════════════════════════════════════════════════════════════════════

· Tareas en orden, C-01 a C-20. Una a la vez.
· Commits pequeños con el identificador: "C-08: primera venta real".
· Reporte 006 al final, UNA PÁGINA, con "Lo que NO hice" completo.
· Bitácora actualizada. Merge a main. Todo subido. Commits a nombre de
  M1gu3hb.
· Avísame al cerrar cada hito, no al final de todo.
· No me pidas permiso. Decide, documenta y sigue.

Arranca por C-01: mergear carril-b. Sin eso, todo lo demás se hace sobre
un repositorio que ya no coincide con su propia base de datos.
```
