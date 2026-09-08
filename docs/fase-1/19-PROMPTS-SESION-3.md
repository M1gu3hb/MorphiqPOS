# 19 — Prompts de la sesión 3

Fecha: 9 de septiembre de 2026
Estado tras la auditoría de la sesión 2.

---

## Estado verificado contra el código

| | Carril A (Claude Code) | Carril B (Codex) |
|---|---|---|
| Tareas terminadas | **1 de 22** (A-01) | **5 de 24** (B-01…B-05) + 2 a medias |
| Commits | 3 | 5 |
| Pruebas | 64 | 312 en total del repo |
| Mutaciones enganchadas | 0 | **45**, las tres en `verify` |

**Lo que existe de verdad:** el envoltorio `comando()` con transacción real, idempotencia por tabla y auditoría · dominio de dinero, catálogo e inventario en `bigint` · **decremento de stock genuinamente atómico** con la guarda en el `WHERE` · 7 comandos de catálogo y configuración, server-side y auditados · 28 tablas con restricciones y llaves compuestas · sistema de diseño con 36 primitivas y 4 estilos.

---

## EL HALLAZGO QUE MANDA SOBRE TODO LO DEMÁS

> **`apps/web` no tiene una sola conexión con el backend.**
>
> Grep de `@morphiqpos/app` y `@morphiqpos/data` en todo `apps/`: **cero coincidencias.**
> Cero rutas de API. Cero Server Actions. Cero resolvedor de sesión.
> Las pantallas de productos y configuración que se entregaron son **maquetas con `useState`**: al recargar, los datos vuelven a la muestra.

Los dos carriles construyeron **motor sin cableado**. Por eso Miguel sigue viendo `/estilos` y nada más, después de tres sesiones.

**La sesión 3 tiene un solo objetivo: cablear.** Nada de dominio nuevo, nada de comandos nuevos que no se usen, nada de repositorios que nadie llame.

---

## Decisión A-49 — no cambiamos de base

Anoche recomendé evaluar mudarse al repositorio de la tiendita, porque el monorepo llevaba 10 % y nada funcionaba. **La auditoría de hoy revisa esa recomendación.**

El motor está mucho más avanzado de lo que yo había contado: dominio, comandos, repositorios, restricciones y pruebas con mutación. Lo que falta para que un cajero venda son **~10–12 tareas de cableado y flujo de venta**, no meses. Cambiar de base ahora costaría más que terminar.

**Se sigue en el monorepo.** Y las pantallas del restaurante de Miguel se portan en el carril A a partir de A-15, como estaba planeado — su código de mesero, cocina y mesas se reutiliza, no se reinventa.

---

## Dos defectos que hay que corregir

**1. `stock.ts` falla cuando no existe la fila de `existencias`.** Si un insumo nunca se inventarió, el `UPDATE` afecta 0 filas y lanza `STOCK_INSUFICIENTE` **aunque el producto permita venta sin stock**. Un producto marcado "vende sin stock" no se puede vender jamás. Corrige carril B.

**2. La pantalla de configuración afirma algo que no respalda.** Muestra al usuario *"Los permisos de X se vuelven a comprobar en cada comando del servidor"* y esa pantalla no hace una sola llamada al servidor. Se quita el texto o se cablea la pantalla.

**Y un punto inflado del reporte 003:** el 403 por paquete se prueba con un comando de juguete definido dentro del test. **Todos los comandos reales declaran los cinco paquetes**, así que hoy no hay una sola función que aparezca o desaparezca según el giro. El selector de paquete todavía no tiene nada detrás. Se arregla en esta sesión.

---

## PROMPT — Claude Code · Carril A · Sesión 3

```
Sesión 3. Codex ya te desbloqueó: consumo.ts y stock.ts existen, están en
main y sus firmas son las de TEAM.md §4. Borra tu STUB.

═══════════════════════════════════════════════════════════════════════
CARGA ESTAS SKILLS
═══════════════════════════════════════════════════════════════════════

/morphiq-prs
/contratos-por-mutacion
/full-output-enforcement
/supabase-vercel-produccion
/vercel-react-best-practices
/impeccable
/ui-ux-pro-max

═══════════════════════════════════════════════════════════════════════
LEE — SÓLO ESTO, NO 15 DOCUMENTOS
═══════════════════════════════════════════════════════════════════════

  1. docs/fase-1/19-PROMPTS-SESION-3.md   ← este archivo, completo
  2. TEAM.md §3 y §4                      ← zonas y dependencias
  3. docs/fase-1/BITACORA.md              ← dónde quedaron los dos
  4. docs/reports/003-codex-*.md §8       ← lo que Codex declaró pendiente

El resto ya lo leíste. No lo vuelvas a leer.

═══════════════════════════════════════════════════════════════════════
EL PROBLEMA
═══════════════════════════════════════════════════════════════════════

apps/web NO IMPORTA NADA del backend. Cero rutas de API, cero Server
Actions, cero sesión. Tres sesiones y Miguel sigue viendo /estilos.

Construiste un envoltorio de comandos excelente que NADIE puede invocar
desde el navegador.

Esta sesión eso se acaba.

═══════════════════════════════════════════════════════════════════════
TU OBJETIVO: QUE UN CAJERO PUEDA VENDER
═══════════════════════════════════════════════════════════════════════

Al terminar, Miguel abre el navegador, entra con PIN, agrega productos,
cobra en efectivo y le sale un ticket. Punto. Eso es todo lo que importa.

MÍNIMO 8 TAREAS. No aceptes menos.

  A-02  Enrolamiento de terminal: código de un solo uso, expiración,
        token de dispositivo en cookie HttpOnly.
  A-03  PIN con Argon2id y pimienta, verificado en servidor, rate limit,
        bloqueo progresivo, sesión HttpOnly Secure SameSite.
  X-01  ★ EL RESOLVEDOR DE SESIÓN Y EL PUENTE HTTP ★
        Esto es lo que falta y bloquea a los dos carriles.
        · Un helper que lee la cookie, resuelve { organizacionId,
          sucursalId, terminalId, empleoId, rol, paquete } y se lo pasa
          al envoltorio comando().
        · El patrón de ruta de API: app/api/<dominio>/<accion>/route.ts
          que recibe el body, resuelve el ámbito de la sesión, invoca el
          comando y traduce ErrorDominio a status HTTP.
        · Un helper de cliente tipado para llamarlo desde React.
        · UNA ruta de ejemplo funcionando de punta a punta.
        PUBLÍCALO Y HAZ PUSH EN CUANTO PASE SUS PRUEBAS. Codex lo necesita
        para cablear sus pantallas. No lo dejes para el final de la sesión.
        Documenta el patrón en docs/reports/PENDIENTES-CRUZADOS.md con un
        ejemplo copiable, y VERIFICA QUE EL IMPORT RESUELVA de verdad —
        la vez pasada documentaste @morphiqpos/app/produccion y ese export
        no existe en el package.json. Arréglalo también.
  A-05  Folios atómicos con UPDATE ... RETURNING dentro de la transacción.
  A-06  La orden como carrito: crearOrden en borrador, agregarLinea,
        quitarLinea, cambiarCantidad.
  A-07  cotizarOrden — precio, impuesto y totales calculados EN SERVIDOR.
        Levanta ventaTotales.js y financialUtils.js de historico/restaurante.
        El endpoint NO acepta ningún importe del cliente.
  A-08  Sesión de caja: abrir, movimientos, cerrar con arqueo y diferencia.
  A-09  cobrarOrden — UNA transacción: orden + líneas + pagos + movimiento
        de caja + movimientos de stock (llamando a aplicarMovimientos de
        Codex) + folio + auditoría. Pago mixto = varias filas en pagos.
  A-10  La pantalla de venta, (operacion)/venta, CABLEADA DE VERDAD.
        Catálogo, búsqueda, carrito, cobro, cambio. Operable sólo con
        teclado. Que se vea bien: es lo primero que Miguel le enseña a un
        cliente. Usa /impeccable aquí.
  A-12  Ticket en carta, render seguro, sin document.write.

Si te sobra sesión: A-11 (pantalla de caja) y A-13 (escáner).

═══════════════════════════════════════════════════════════════════════
CALIBRACIÓN — LEE ESTO, ES POR QUÉ VAS LENTO
═══════════════════════════════════════════════════════════════════════

La sesión pasada entregaste UNA tarea de 22, con 234 líneas de código y
583 líneas de reporte. Codex entregó cinco. La diferencia no fue calidad:
fue alcance.

Qué cambia:
  · Reporte de UNA PÁGINA. Qué hiciste, qué no, huecos, decisiones. Lo
    demás está en los commits.
  · Mutaciones SÓLO donde se pierde dinero o datos: cobrarOrden, folios,
    stock, PIN, permisos. En un formateador o un componente, la prueba
    basta.
  · Y si dices que corriste mutaciones, EL ARNÉS SE COMMITEA. La vez
    pasada reportaste 17 mutaciones con tabla de 14 filas y ese script no
    está en el repositorio. Codex enganchó los suyos a package.json como
    verify:catalogo, verify:inventario y verify:comandos-catalogo. Haz lo
    mismo: si no está en verify, no cuenta.
  · No partas archivos a media tarea por la regla de 300 líneas: diseña
    los módulos chicos desde el principio.

═══════════════════════════════════════════════════════════════════════
NO SE NEGOCIA
═══════════════════════════════════════════════════════════════════════

· Precios y totales SIEMPRE en el servidor.
· Cobro, caja y stock transaccionales e idempotentes.
· El PIN nunca sale de la base. Ninguna respuesta lo contiene.
· Autorización en el servidor. Ocultar un botón no es autorización.
· Dinero en bigint de centavos. Cero any, cero @ts-ignore, cero catch vacío.
· Ningún archivo sobre 300 líneas.
· historico/ se lee como especificación. No se copia un archivo.
· Migraciones en tu rango: 010–039.
· Si un archivo no es tuyo, no lo tocas. Lo anotas.
· NO se toca Pasteleria Confetti (ivqcxdpqxwjxfohiswqb).

═══════════════════════════════════════════════════════════════════════
AL TERMINAR
═══════════════════════════════════════════════════════════════════════

Reporte 004 en docs/reports/, UNA PÁGINA, con "Lo que NO hice" completo.
Bitácora actualizada. Merge de carril-a a main. Todo subido.
Commits a nombre de M1gu3hb.

Y dime en una línea cómo abrir la pantalla de venta para probarla.

Arranca por X-01: es lo que desbloquea a los dos.
```

---

## PROMPT — Codex · Carril B · Sesión 3

```
Sesión 3. Hiciste cinco tareas, muy por encima de la sesión anterior, y con
calidad: el decremento atómico de stock está bien hecho, las 45 mutaciones
están enganchadas a verify, y tu reporte coincide con el código casi punto
por punto. Eso se queda.

Pero hay un problema grande que hay que arreglar hoy.

═══════════════════════════════════════════════════════════════════════
LEE — SÓLO ESTO
═══════════════════════════════════════════════════════════════════════

  1. docs/fase-1/19-PROMPTS-SESION-3.md   ← este archivo, completo
  2. TEAM.md §3 y §4
  3. docs/fase-1/BITACORA.md
  4. docs/reports/PENDIENTES-CRUZADOS.md  ← ahí publicará Claude Code el
                                             puente HTTP que necesitas

El resto ya lo leíste.

═══════════════════════════════════════════════════════════════════════
EL PROBLEMA: TUS PANTALLAS NO ESTÁN CONECTADAS
═══════════════════════════════════════════════════════════════════════

Grep de @morphiqpos/app y @morphiqpos/data en todo apps/: CERO
coincidencias.

(gestion)/productos renderiza PRODUCTOS_FERRETERIA de demostracion.ts.
ProductosPantalla.guardar sólo hace setProductos(...). Al recargar, todo
vuelve a la muestra.

Tu propio reporte lo declara con honestidad en §8 y marcaste B-06 y B-07
con 🟨, no con ✅. Correcto. Ahora hay que cerrarlo.

Y tu repositorio catalogo.ts —con cursor, pg_trgm y columnas explícitas—
está bien hecho y NO LO LLAMA NADIE. Es código muerto hasta que lo cablees.

═══════════════════════════════════════════════════════════════════════
TU OBJETIVO: QUE LAS PANTALLAS SEAN DE VERDAD
═══════════════════════════════════════════════════════════════════════

MÍNIMO 8 TAREAS.

  B-06b ★ CABLEAR (gestion)/productos ★
        Rutas de API bajo app/api/catalogo/**, siguiendo el patrón que
        Claude Code publica en PENDIENTES-CRUZADOS.md (tarea X-01).
        La pantalla lee de la base, da de alta, edita, cambia precio y
        asigna código de barras — todo por comando, con auditoría.
        Al recargar, los datos SIGUEN AHÍ.
        Si X-01 aún no está publicado cuando llegues: escribe tú las rutas
        de API de tu dominio con el patrón obvio, y ajusta después. NO te
        quedes esperando.

  B-07b ★ CABLEAR (gestion)/configuracion ★
        Lee y guarda de verdad, con el control de versión que ya escribiste.
        Y QUITA el texto que le promete al usuario que "los permisos se
        comprueban en cada comando del servidor" mientras la pantalla no
        haga una sola llamada. O lo cableas, o lo quitas.

  B-08  ★ EL SELECTOR DE PAQUETE, DE VERDAD ★
        Hoy no tiene nada detrás: TODOS tus comandos declaran los cinco
        paquetes, así que ninguna función aparece o desaparece según el
        giro. El 403 sólo lo prueba un comando de juguete definido dentro
        del test.
        Arréglalo: cada comando declara los paquetes que REALMENTE le
        corresponden, la navegación se arma desde el paquete activo, y
        una prueba real verifica que un comando fuera del paquete devuelve
        403 PAQUETE_NO_INCLUYE.
        Esta es la jugada de venta de Miguel: la usa enfrente del cliente.
        Hoy es humo.

  BUG-01 ★ stock.ts falla cuando no existe la fila de existencias ★
        Si un insumo nunca se inventarió, el UPDATE afecta 0 filas y lanzas
        STOCK_INSUFICIENTE aunque permiteNegativo sea true. Un producto
        marcado "vende sin stock" NO SE PUEDE VENDER NUNCA.
        Corrígelo (upsert, o crear la fila al alta del insumo) y escribe la
        prueba y la mutación.

  B-09  Pantalla (gestion)/inicio cableada: venta del día, caja abierta,
        últimas ventas, productos bajo mínimo. Los números salen de la base.

  B-10  Semillas de demostración CREÍBLES en la base real: abarrotes,
        ferretería y cafetería. Nombres, precios y categorías de verdad.
        Comando resetearDemo. Cero "Producto 1, $100" — Miguel se lo va a
        enseñar a un cliente.

  B-11  Comandos y pantalla de insumos y almacenes: alta, inventario
        inicial, ajuste de stock. Todo con movimientos, nada sobrescribiendo
        saldos.

  B-12  Recetas: comandos y pantalla. Al cambiar el costo de un insumo se
        recalcula costo, utilidad y margen de los productos que lo usan.

Si te sobra sesión: compras y proveedores (B-13, B-14).

═══════════════════════════════════════════════════════════════════════
LO QUE HICISTE BIEN Y NO CAMBIA
═══════════════════════════════════════════════════════════════════════

· El decremento atómico con la guarda en el WHERE. Perfecto.
· Los tres arneses de mutación enganchados a verify. Ese es el estándar.
· Marcar B-06 y B-07 con 🟨 en vez de ✅. Esa honestidad es lo que hace
  que se pueda confiar en tus reportes.
· El ritmo: cinco tareas. Mantenlo.

Dos cosas que sí ajustar:
· "Verificado en navegador" en la tabla de evidencia era estado local
  moviéndose. Si no pasó por la base, no va en la tabla de evidencia: va
  en "Lo que NO hice".
· Regenera packages/data/src/esquema.ts con db:tipos en cuanto haya
  DATABASE_URL. Hoy tiene la columna insumo_base_id puesta a mano.

═══════════════════════════════════════════════════════════════════════
NO SE NEGOCIA
═══════════════════════════════════════════════════════════════════════

· Precios y totales SIEMPRE en el servidor.
· Stock: ledger inmutable, decremento atómico, falla en vez de silenciar.
· Autorización en el servidor. Ocultar un botón no es autorización.
· Dinero en bigint de centavos. Cero any, cero @ts-ignore, cero catch vacío.
· Ningún archivo sobre 300 líneas.
· Migraciones en tu rango: 040–069.
· historico/ se lee como especificación. No se copia un archivo.
· Si un archivo no es tuyo, no lo tocas. Lo anotas.
· NO se toca Pasteleria Confetti (ivqcxdpqxwjxfohiswqb).

═══════════════════════════════════════════════════════════════════════
AL TERMINAR
═══════════════════════════════════════════════════════════════════════

Reporte 005 en docs/reports/, una página, con "Lo que NO hice" completo.
Bitácora actualizada. Merge de carril-b a main. Todo subido.
Commits a nombre de M1gu3hb.

Y dime en una línea cómo abrir la pantalla de productos para probarla.

Arranca por B-06b: cablear lo que ya escribiste.
```
