# Pendientes cruzados

Lo que un carril necesita del otro. Se anota aquí y se sigue con otra tarea; no se
implementa en zona ajena (TEAM.md §6).

| # | Quién necesita | Qué | De quién | Para qué tarea | Estado |
|---|---|---|---|---|---|
| X-01 | Carril A | `packages/domain/src/inventario/consumo.ts` → `calcularConsumo(lineas)` y `packages/data/src/repos/stock.ts` → `aplicarMovimientos(movimientos, tx)`, con el decremento atómico dentro | Codex (B-02, B-03) | **A-09** `cobrarOrden` | ✅ Cerrado en `carril-b`; publicado a `main` al terminar el gate |
| X-02 | Carril B | Resolvedor de `Ambito` desde la cookie de sesión y exportación real `@morphiqpos/app/produccion` | Claude Code (X-01) | B-05, B-06 y B-07: cablear pantallas | ✅ **Entregado.** Guía abajo. Los exports que faltaban (`./produccion`, `./http`, `./sesion`) ya están en `packages/app/package.json` y `pnpm typecheck` pasa con ellos |

---

## X-01 · Cómo cablear una pantalla al backend  ← **empieza por aquí, carril B**

**Los imports de abajo están verificados: `pnpm typecheck` pasa con ellos.** La vez pasada
documenté `@morphiqpos/app/produccion` sin que ese export existiera; ahora
`packages/app/package.json` declara `./produccion`, `./http`, `./sesion`, `./venta`,
`./caja` e `./identidad`.

### 1 · Exponer un comando por HTTP — dos líneas

```ts
// apps/web/app/api/catalogo/crear-producto/route.ts   ← existe, es la ruta de ejemplo
import { crearProducto } from '@morphiqpos/app/catalogo';
import { manejadorDeComando } from '@/servidor/ruta';

export const POST = manejadorDeComando(crearProducto);
export const runtime = 'nodejs';
```

Eso ya trae: sesión resuelta desde la cookie, ámbito del servidor, validación zod, rol,
paquete, transacción, idempotencia, auditoría, correlation id y traducción a status HTTP.
**No hay nada más que escribir.**

`runtime = 'nodejs'` no es opcional: el envoltorio abre transacciones con `pg`, y en el
runtime `edge` no hay sockets TCP. Eso falla al desplegar, no al compilar.

### 2 · Llamarlo desde React

```tsx
'use client';
import { invocarComando, ErrorApi, nuevaClave } from '@/cliente/api';

const [clave] = useState(nuevaClave); // la MISMA entre reintentos

async function guardar() {
  try {
    const { id } = await invocarComando<{ id: string }>(
      '/api/catalogo/crear-producto',
      { nombre, precioVentaCentavos },
      { idempotencyKey: clave },
    );
  } catch (error) {
    if (error instanceof ErrorApi) setMensaje(error.error.mensaje);
    else throw error;
  }
}
```

`invocarComando` genera la clave si no se la das. **Pásala tú y consérvala entre
reintentos**: es lo que hace que un doble clic no cobre dos veces.

### 3 · El ámbito, para una ruta que NO es un comando

```ts
import { resolverSesion } from '@morphiqpos/app/sesion';
import { leerCookie, NOMBRE_COOKIE } from '@morphiqpos/app/http';

const sesion = await resolverSesion({
  secreto: entorno.SESSION_SECRET,
  token: leerCookie(peticion.headers.get('cookie'), NOMBRE_COOKIE),
});
// sesion.ambito → { organizacionId, sucursalId, terminalId, identidadId, empleoId, rol }
```

Para comandos no hace falta: `manejadorDeComando` ya lo hace.

### 4 · Rutas de autenticación que ya existen

| Ruta | Qué hace |
|---|---|
| `POST /api/auth/enrolar` | Canjea un código de 6 dígitos por la cookie de dispositivo |
| `GET /api/auth/empleados` | Lista quién puede entrar en esta terminal (nombre y rol) |
| `POST /api/auth/entrar` | PIN → cookie de sesión |
| `POST /api/auth/salir` | Caduca la cookie |

### Tres cosas que sorprenden

1. **`apps/web` no puede importar `@morphiqpos/data`**, ni con `import type`. Es la primera
   prohibición de `04-ARQUITECTURA §2`. Por eso `manejadorDeComando` recibe
   `DefinicionServible<E, S>`, que ya trae la transacción ligada.
2. **Un comando con `escribe: true` DEBE llamar a `ctx.auditar`**, o falla a propósito.
3. **La entrada no puede declarar claves de ámbito.** El comando lanza al definirse (R16).

### Lo que este puente todavía NO tiene

- **Rate limit por IP en las rutas de auth.** El bloqueo del PIN cuenta por credencial, no
  por origen: frena el ataque a una cuenta, no un barrido de muchas.
- **CSRF por token.** Hoy sólo `SameSite=Lax`, que `morphiq-prs §10A` llama defensa en
  profundidad y no barrera única. Falta validar `Origin`.
- **Verificación contra Postgres.** Sin `DATABASE_URL` no ha corrido de punta a punta.

---

## Lo que el carril A ya entregó y el B puede consumir

**`comando()` — disponible en `main` desde `0a5a57f`.**

```ts
import { definirComando } from '@morphiqpos/app';
import { comando } from '@morphiqpos/app/produccion';

export const crearProducto = definirComando({
  nombre: 'catalogo.crear_producto',   // forma dominio.verbo, obligatoria
  entidad: 'producto',                 // va a auditoria.entidad
  escribe: true,                       // ⇒ transacción + clave de idempotencia + auditoría
  roles: ['dueno', 'administrador', 'gerente'],
  paquetes: ['tienda', 'ferreteria', 'farmacia', 'cafeteria', 'restaurante'],
  entrada: z.object({ nombre: z.string().min(1), precioVentaCentavos: z.number().int() }),
  async ejecutar(ctx, entrada) {
    const fila = await ctx.paso('insertar_producto', () =>
      ctx.tx.insertInto('productos')
        .values({ organizacion_id: ctx.ambito.organizacionId, nombre: entrada.nombre })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );
    ctx.auditar({ entidadId: fila.id, payload: { nombre: entrada.nombre } });
    return { id: fila.id };
  },
});
```

Y desde una ruta:

```ts
const salida = await comando(crearProducto, {
  entrada: await peticion.json(),
  ambito,                                   // de la sesión del servidor, NUNCA del cuerpo
  idempotencyKey: peticion.headers.get('Idempotency-Key') ?? undefined,
  correlationId: peticion.headers.get('x-correlation-id') ?? undefined,
});
if (!salida.ok) return Response.json(salida, { status: ESTADO_HTTP[salida.error.codigo] });
```

### Tres cosas que sorprenden si no se saben

1. **Un comando con `escribe: true` DEBE llamar a `ctx.auditar`.** Si no, falla a
   propósito: declarar sensible algo que no deja rastro convierte la auditoría en un
   adorno.
2. **La entrada no puede declarar `organizacion_id`, `sucursal_id`, `identidad_id`,
   `empleo_id`, `terminal_id` ni `rol`** — en ninguna de las dos ortografías. El
   comando **lanza al definirse** y el módulo no carga. Es R16: el ámbito viene de la
   sesión del servidor.
3. **`comando()` nunca lanza por un fallo de negocio.** Devuelve
   `{ ok: false, error: { codigo, mensaje } }`. Los códigos y su estado HTTP están en
   `@morphiqpos/contracts` (`CODIGOS_COMANDO`, `ESTADO_HTTP`).

### Lo que todavía no tiene

- **`emitir()` / outbox de eventos.** La tabla no existe en F1.1. Cuando llegue, se
  agrega al contexto sin tocar ningún comando.
- **Matriz de permisos configurable.** Los roles se declaran en cada comando; la tabla
  `permisos_rol` llega en F1.5 y la sustituirá sin tocar los comandos (A-49).
- **Verificación contra Postgres de punta a punta.** Falta `DATABASE_URL`. La lógica
  está probada con dobles y las restricciones de base con SQL real, pero el pegamento
  Kysely no ha corrido nunca. Ver el reporte 002 §8.

---

## Notas del carril B

- `@morphiqpos/domain/catalogo` está disponible desde `27940c3`: cuatro tipos de
  producto, cantidades exactas, porciones y mayoreo.
- B-02 y B-03 cerraron X-01 con cálculo puro exacto, agrupación por insumo,
  decremento atómico y ledger dentro de la transacción recibida.
- Los gates completos de `morphiq-prs` están expresados como tablas en la
  documentación del proyecto; no se requiere un archivo o skill separado.
- La CLI confirmó 26 tablas operativas y `_migraciones`, todas con RLS, en el proyecto
  MorphiqPOS. No se consultó ni modificó ningún otro proyecto.
- `.env` local contiene las claves API y secretos locales, está ignorado por Git y
  sigue sin `DATABASE_URL` ni credenciales S3.

Avisos de zona neutral del carril B: se agregaron tres códigos a
`packages/contracts/src/errores/index.ts`, la exportación `./catalogo` al manifiesto
de domain y un verificador de mutaciones de catálogo. Se preservaron las
exportaciones existentes.
