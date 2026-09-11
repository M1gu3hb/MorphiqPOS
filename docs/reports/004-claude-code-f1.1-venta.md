# 004 · Carril A · F1.1 · La venta, de punta a punta

**2026-09-08 · Claude Code · rama `carril-a` → `main`**

## Lo que ahora se puede hacer

Abrir el navegador en `/venta`, entrar con PIN, buscar un producto, agregarlo,
pulsar F2, cobrar en efectivo y ver el ticket. Eso era lo que faltaba desde la
sesión 1: `apps/web` ya no es un envoltorio sin nadie que lo invoque.

## Tareas entregadas — 10

| Tarea | Qué quedó |
|---|---|
| **X-01** | Puente HTTP: token de sesión firmado, ámbito resuelto en la base por petición, `rutaDeComando`, `manejadorDeComando`, `invocarComando`. Publicado y empujado primero (`b84a089`), con guía copiable para Codex y **los imports verificados con `typecheck`** — el fallo que señalaste de la sesión pasada. |
| **A-02** | Enrolamiento de terminal: código de 6 dígitos, 15 min de vigencia, se quema al usarse, cookie de dispositivo de un año. Pantalla `/enrolar`. |
| **A-03** | PIN con Argon2id (19 MiB, t=2, p=1) + pimienta HMAC, bloqueo progresivo tras 5 intentos, fallos uniformes. Pantalla `/entrar`. |
| **A-05** | Folio atómico: `update … set siguiente = siguiente + 1 returning siguiente - 1`, dentro de la transacción del cobro. |
| **A-06** | Carrito = orden en borrador, persistida por línea. Recargar la pestaña recupera la venta (P1-10). |
| **A-07** | Cotización siempre en servidor. IVA extraído con enteros; descuento con tope en el subtotal. |
| **A-08** | Caja: apertura con fondo, movimientos con signo puesto por el servidor, corte con arqueo **derivado** (P2-10). |
| **A-09** | `cobrarOrden`: ocho efectos en UNA transacción. Stock antes del folio. Pago mixto = varias filas (P1-11). |
| **A-10** | Pantalla de venta operable sólo con teclado (↑↓ Enter F2 F4 Esc), el buscador nunca suelta el foco porque un escáner es un teclado veloz. |
| **A-12** | Ticket en JSX + `window.print()`. Cero `document.write`, cero `innerHTML`. Lee los totales **congelados**, no un recálculo. |

## Dos errores míos que encontré al validar los contratos

1. **El corte de caja mentía.** El efectivo esperado era `fondo + ventas en
   efectivo`: contaba el fondo dos veces —ya entra como movimiento de apertura—
   y **no restaba los retiros**. Un cajero que sacara dinero con permiso
   aparecía con un faltante por esa cantidad. Ahora el esperado es la suma de
   `movimientos_caja`, y hay dos contratos que lo sujetan.
2. **`numeroVentas` contaba filas de `pagos`.** Un pago mixto valía tres ventas.
   Ahora es `count(distinct orden_id)`.

## El arnés está en el repositorio

`pnpm verify:venta`, enganchado a `pnpm verify`. 15 contratos, 15 destructivas
de contrato, 8 destructivas de prueba, 3 inocuas. Los contratos recortan el
cuerpo de la función y afirman sobre él sin comentarios; los de orden comparan
índices, no distancias.

Una inocua —partir un `.where` en cuatro líneas— **hizo fallar un contrato** y
me obligó a relajarlo a la propiedad en vez de a la forma. Esa es la prueba de
que las inocuas sirven.

**Destructivas que FALLAN:** folio antes que stock · cotizar fuera de la
transacción · cobrar sin exigir total vigente · cobrar con caja cerrada ·
aceptar pago que excede el total · cambio en tarjeta · cobrar dos veces la misma
orden · folio leído y luego escrito · esperado = fondo + efectivo · esperado
desde columna almacenada · apertura sin movimiento de fondo · cobro sin
movimiento de caja · cerrar antes de arquear · GET en ruta de comando · precio
de línea desde el cliente · efectivo insuficiente sin comprobar · renglón de
pago en cero · cantidad truncada a entero · medio centavo hacia abajo · signo
perdido en devolución · IVA sumado en vez de extraído · descuento sin tope.

**Inocuas que PASAN:** línea en blanco de más · partir el `.where` en cuatro
líneas · renombrar un local del reparto de pagos.

## Lo que NO hice

- **No se ha ejecutado una sola consulta contra Postgres.** Sigue faltando
  `DATABASE_URL` (Supabase → Reset password → Session pooler → `.env`). Todo lo
  transaccional está verificado por tipos, contratos y mutación estática. **La
  primera venta real puede fallar por algo que ninguna puerta ve**, y el
  candidato más probable es un nombre de columna que no coincida con el esquema.
- **`cerrarCaja` no tiene pantalla.** El comando y la ruta existen; el corte se
  invoca por API. Es la deuda más visible de A-08.
- **A-11 (devoluciones) y A-13 (reimpresión) no se tocaron.**
- **El pago mixto está en el servidor pero no en la pantalla.** `repartirPagos`
  acepta hasta cinco renglones; `DialogoCobro` manda uno solo.
- **Sin límite de tasa en `/api/auth/entrar`.** El bloqueo por intentos vive en
  la base, por empleo. Un atacante con muchos empleos distintos no encuentra
  freno de IP. `morphiq-prs §09` lo pide.
- **Recetas no descuentan.** `planearConsumo` sólo traduce productos con
  estrategia `sku`; lo demás se omite en vez de inventarle un insumo. Es F1.3.
- **El impuesto está fijo en 1600 pb.** Sale de `configuracion` cuando esa
  pantalla lo escriba.
- **Sin pruebas de integración ni E2E de la venta.** Las 361 que pasan son
  unitarias y de contrato.
- **No revertí el cambio de Codex en `verificar-residuos.mjs`**: sustituyó mi
  exclusión acotada por un `'docs'` general, así que un `.ts` bajo `docs/`
  escaparía al escaneo. Es zona neutral y lo tocó él; queda anotado en
  `PENDIENTES-CRUZADOS.md`.

## Para probarlo

```bash
pnpm dev
```

Luego `http://localhost:3000/venta` — sin sesión, la pantalla te manda a
`/entrar`; si la terminal no está enrolada, ofrece `/enrolar`. Hace falta
`DATABASE_URL` en `.env` y la base migrada con `pnpm db:migrate`.
