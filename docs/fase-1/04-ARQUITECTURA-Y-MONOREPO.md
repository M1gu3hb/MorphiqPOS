# 04 — Arquitectura y monorepo

---

## 1. Estructura de carpetas

```
morphiqpos/
├── apps/
│   ├── web/                        Next.js 14 App Router — LA aplicación
│   │   ├── app/
│   │   │   ├── (auth)/             login · enrolar-terminal
│   │   │   ├── (operacion)/        venta · escaner · mesero · cocina · caja
│   │   │   ├── (gestion)/          inicio · productos · inventario · compras
│   │   │   │                       recetas · registros · clientes · fiado
│   │   │   │                       configuracion · cuenta · empleados
│   │   │   ├── (publico)/          qr/[token] · vista-cliente
│   │   │   ├── api/                rutas de comandos y consultas
│   │   │   ├── layout.tsx
│   │   │   └── globals.css
│   │   ├── middleware.ts
│   │   └── next.config.mjs
│   └── worker/                     jobs, outbox, reconciliadores  (desde F1.3)
│
├── packages/
│   ├── contracts/                  tipos, DTOs, eventos, errores — SIN dependencias
│   ├── domain/                     reglas puras — SIN I/O, SIN React, SIN SQL
│   ├── data/                       repositorios + migraciones + acceso a Postgres
│   ├── app/                        casos de uso: comandos y consultas
│   ├── ui/                         sistema de diseño: tokens, primitivas, componentes
│   ├── registry/                   motor de capacidades y perfiles de giro
│   └── testing/                    fábricas de datos, helpers, fault injection
│
├── capabilities/                   una carpeta por capacidad activable
│   ├── catalogo/  ventas/  caja/  inventario/  compras/
│   ├── restaurante/  portal-qr/  clientes/  membresias/
│   └── (cada una: domain · data · app · ui · migraciones · capability.json · pruebas)
│
├── infra/
│   ├── docker/                     docker-compose: Postgres + MinIO
│   └── ci/                         workflows
│
├── docs/                           ESTE repositorio de documentación
├── historico/                      ZIP y auditoría — EXCLUIDO del build y del escaneo
├── package.json                    workspaces
├── turbo.json                      o el orquestador que se elija en F1.0
└── tsconfig.base.json
```

**Diferencia deliberada con tiendita:** ahí `app/` está en la raíz y `@/*` apunta a `./src/*`. Aquí `app/` vive dentro de `apps/web/` y cada paquete tiene su propio alias (`@morphiqpos/domain`). Es lo que permite que un proyecto de cliente **declare dependencias en vez de copiar código** (A-01, R3).

---

## 2. Las capas y su regla de dependencia

```
  contracts   ←  no depende de nada
      ↑
   domain     ←  depende sólo de contracts
      ↑
    data      ←  depende de contracts + domain
      ↑
     app      ←  depende de contracts + domain + data
      ↑
   apps/web   ←  depende de contracts + app + ui
      ↑
      ui      ←  depende sólo de contracts
```

**Cinco prohibiciones, verificadas por lint en CI (falla el build):**

1. `apps/web` **no importa** `data`. La UI nunca toca la base ni los repositorios.
2. `domain` **no importa** nada con I/O: ni Supabase, ni `fetch`, ni `fs`, ni React.
3. `ui` **no importa** `domain`, `data` ni `app`. Recibe datos por props.
4. Una capacidad **no importa** otra capacidad. Colaboran por `contracts` y eventos (R25).
5. **Nada importa** de `historico/`.

Esta es la lección directa del sistema anterior: 359 llamadas a datos desde componentes es lo que hizo imposible cambiar de plataforma. La regla de dependencia es lo que impide que vuelva a pasar.

---

## 3. Las capas en detalle

### `packages/contracts`
El único paquete que todos pueden importar. Contiene:

- **Tipos de entidad** generados del esquema (no escritos a mano).
- **DTOs** de entrada y salida de cada comando.
- **Errores tipados**: `ErrorDominio` con código estable, nunca strings libres.
- **Eventos**: `OrdenConfirmada`, `OrdenCobrada`, `ComandaEnviada`, `StockMovido`…
- **Puntos de extensión**: firmas de los hooks que un paquete de cliente puede implementar.

Regla: **un cambio incompatible aquí sube la versión mayor** y CI reporta quién lo usa.

### `packages/domain`
Reglas puras. Entra un objeto, sale un objeto. **Cero I/O.** Por eso se prueba con unitarias rápidas y sin base de datos.

```
domain/
  dinero/         Centavos, sumar, aplicarPorcentaje, redondear, repartir
  catalogo/       precioDeLinea, convertirUnidad, resolverTipoVenta
  venta/          calcularTotales, aplicarDescuento, calcularImpuesto, repartirPropina
  inventario/     consumoDeLinea, aplicarExclusiones, validarDisponibilidad
  finanzas/       utilidad, margen, costoPonderado
  preparacion/    rutearAEstaciones, agruparPorMesa
  estados/        maquinaOrden, maquinaPago, maquinaComanda, maquinaMesa, maquinaCaja
  importacion/    validadores, csv
```

**Aquí aterrizan los 16 archivos levantados del restaurante** (`02-ESTRATEGIA` §4, operación 3).

Sobre `dinero/`: **todo el dinero es `bigint` en centavos.** Ninguna operación monetaria usa `Number` con decimales. El redondeo se define una vez (`ROUND_HALF_UP` sobre centavos) y se prueba con los casos que rompen: `.005`, división de propina entre 3, IVA sobre un total impar. Corrige P2-02.

### `packages/data`
El único lugar que conoce SQL.

```
data/
  cliente.ts        pool de conexiones a Postgres
  transaccion.ts    helper withTransaction(fn)
  repos/            organizaciones · productos · ordenes · pagos · caja
                    inventario · mesas · comandas · clientes · …
  migraciones/      001_… hasta NNN_…
  seeds/            datos sintéticos y tenants de demostración
```

Se conserva el patrón de tiendita: funciones sueltas exportadas, tipadas, con `organizacion_id` explícito. Con tres cambios:

1. **`import 'server-only'` en todo el paquete.** En tiendita sólo 3 de 22 repos lo tenían; los otros 19 corrían en el navegador. Aquí ninguno puede.
2. Los repositorios reciben un **cliente de transacción opcional**: `getProductos(orgId, {tx})`. Es lo que permite componer un comando atómico.
3. **Pool de conexiones**, no un cliente por request.

### `packages/app`
Los casos de uso. Toda la lógica crítica vive aquí (A-21).

```
app/
  comandos/       una carpeta por dominio (ver 02-ESTRATEGIA §4, operación 5)
  consultas/      lecturas optimizadas para pantallas y reportes
  politicas/      autorización por acción, evaluada contra permisos_rol
  middleware/     idempotencia · ámbito · auditoría · correlation id
```

**El molde de un comando** — todos se ven igual:

```ts
export const cobrarOrden = comando({
  nombre: 'venta.cobrar',
  permiso: 'venta.cobrar',
  capacidad: 'ventas',
  entrada: CobrarOrdenInput,          // validado con zod
  idempotente: true,
  async ejecutar({ input, ambito, tx, emitir }) {
    // 1. cargar y validar precondiciones
    // 2. recalcular totales con domain — NUNCA usar los del cliente
    // 3. escribir orden + líneas + pagos + movimientos_caja
    //    + movimientos_stock + existencias + folio + auditoría
    // 4. emitir evento a outbox, dentro de la MISMA transacción
    // 5. devolver el resultado
  },
});
```

El envoltorio `comando()` resuelve, una sola vez y para todos: validación de entrada, verificación de permiso, verificación de capacidad activa, apertura de transacción, clave de idempotencia, registro de auditoría, correlation id, y traducción de errores. **Ningún comando reimplementa eso.**

### `packages/ui`
```
ui/
  tokens/         los tokens y las 4 perillas (ver 05-SISTEMA-DE-DISENO)
  estilos/        premium · editorial · industrial · skeuomorfico
  primitivas/     las 49 de shadcn, en .tsx y tokenizadas
  componentes/    compuestos sin lógica de negocio: DataTable, MoneyInput,
                  QuantityInput, StatusBadge, EmptyState, ConfirmDialog…
  layouts/        gestion · operacion · publico
  hooks/          useDensidad · useEstilo · useAtajos
```

### `packages/registry`
El motor de capacidades. Lee los `capability.json`, valida dependencias e incompatibilidades, decide qué está activo para una organización, y expone el guardia que usan los comandos y el enrutador.

### `capabilities/*`
Cada capacidad es una rebanada vertical completa:

```
capabilities/restaurante/
  capability.json        las 12 declaraciones de R23
  domain/                reglas propias de restaurante
  data/                  repos + migraciones propias
  app/                   comandos propios
  ui/                    pantallas y componentes propios
  pruebas/               unitarias, integración y E2E propias
```

Regla R25: **una capacidad no importa otra capacidad.** `restaurante` no importa `inventario`; publica y consume eventos, y usa contratos.

---

## 4. Frontera cliente / servidor

```
Navegador                    │  Servidor
─────────────────────────────┼────────────────────────────────
componentes 'use client'     │  app/api/*/route.ts
  ↓                          │    ↓
hooks (TanStack Query)       │  packages/app  (comandos y consultas)
  ↓                          │    ↓
fetch('/api/…')  ────────────┼──▶ packages/domain + packages/data
                             │    ↓
                             │  Postgres  (pool, transacciones)
```

**El navegador nunca habla con Postgres ni con Supabase directamente.** Es el cambio más importante respecto a tiendita, donde 19 de 22 repositorios corrían en el navegador. Cierra de un golpe: precios manipulables, totales calculados en el cliente, y escrituras sin autorización de servidor.

**Consulta de sólo lectura:** `GET /api/…` → consulta → repositorio.
**Comando:** `POST /api/…` con `Idempotency-Key` → comando → transacción.

### Tiempo real
Las pantallas de cocina, mesero y caja necesitan actualizarse solas. Se conserva el mecanismo de tiendita (Supabase Realtime sobre tablas concretas) **pero como notificación, no como fuente de datos**: llega el aviso, el cliente revalida por la API. Así el servidor sigue siendo el único que decide qué puede ver cada quien.

Cada entidad con estado lleva `version` entero monotónico; una actualización con versión menor se descarta. Corrige P1-08 y KDS-04.

---

## 5. Entorno local (A-16, A-27)

```bash
docker compose up -d      # Postgres 16 + MinIO
npm run db:migrate
npm run db:seed
npm run dev
```

Sin cuentas, sin claves de terceros, sin internet. `docker-compose.yml` vive en `infra/docker/`.

**Esto no es sólo para desarrollo.** Es el requisito A-27: el mismo compose es lo que se instala en la PC de un cliente que no quiere depender de internet. Por eso **cero lógica de negocio en RLS o en servicios propietarios** (R7): si la lógica está en la API TypeScript y los datos en Postgres, el sistema completo cabe en una máquina local.

**Ruta a Supabase, cuando Miguel lo decida:** cambiar `DATABASE_URL`, correr migraciones, y cambiar la implementación de `ServicioArchivos` de MinIO a Supabase Storage. Un archivo. La lógica no se toca.

**Demo en red local:** `next dev -H 0.0.0.0`; la tablet y el teléfono entran por la IP local o el hotspot. Es el requisito del guion de demostración.

---

## 6. Configuración y decisiones de tooling

| Decisión | Elección | Razón |
|---|---|---|
| Gestor de paquetes | **pnpm** con workspaces | Enlaces duros entre paquetes; es lo que hace que "declarar dependencias" funcione bien en monorepo |
| Orquestador | **Turborepo** | Caché de tareas; `build`, `test` y `lint` sólo corren en lo que cambió |
| TypeScript | **`strict: true` en todo.** Sin `allowJs` | Rompe con la mezcla `.jsx`/`.tsx` de tiendita a propósito (R19) |
| Validación | **zod** | Ya está en tiendita; valida entradas de comando y variables de entorno |
| Acceso a Postgres | **`pg` + consultas escritas a mano**, o Drizzle | Se decide en F1.0-T04 con un ADR. Requisito: transacciones reales y SQL legible |
| Pruebas | **Vitest** (unitarias e integración) + **Playwright** (E2E) | |
| Formato | **Biome** o Prettier + ESLint | Se decide en F1.0. Debe incluir la regla de dependencia entre capas |
| Estilos | **Tailwind v3** + tokens CSS | Continuidad con ambos sistemas |
| Componentes | **shadcn/ui con `"tsx": true`** | Cambio explícito respecto a tiendita |
| Toasts | **sonner**, único | Se eliminan `react-hot-toast` y el toast de Radix |
| Estado de servidor | **TanStack Query v5** con **factory de query keys centralizada** | Corrige el punto de fricción #1 de tiendita |
| Iconos | **lucide-react** | Ambos ya lo usan |

---

## 7. Convenciones de código

- **Idioma:** identificadores de dominio, comentarios y documentación en **español**. Palabras clave técnicas en inglés. Es lo que ya hacen ambos sistemas y funciona.
- **Archivos:** componentes en `PascalCase.tsx`; primitivas de `ui/` en `kebab-case.tsx` (convención shadcn); módulos de dominio y repos en `camelCase.ts`; migraciones en `NNN_snake_case.sql`.
- **Nada de `any`.** Si un tipo no se conoce, se modela con `unknown` y se estrecha.
- **Nada de `catch {}` vacío** (R12). Todo error se maneja o se propaga.
- **Nada de `console.log` en código de producción.** Logger estructurado.
- **Ningún componente supera 300 líneas.** Si crece, se parte. Es la regla que evita repetir `Caja.jsx` de 81 KB.
- **Ningún archivo de página contiene lógica de negocio.** La página orquesta; el dominio decide.
- **Los mensajes de commit llevan el identificador de tarea:** `F1.2-T09: cobro atómico con idempotencia`.

---

## 8. Variables de entorno

```
DATABASE_URL              postgres://…            (local: docker)
STORAGE_ENDPOINT          http://localhost:9000   (local: MinIO)
STORAGE_BUCKET
STORAGE_ACCESS_KEY / STORAGE_SECRET_KEY
SESSION_SECRET            firma de cookies de sesión
PIN_PEPPER                pimienta para el hash de PIN
APP_URL
NODE_ENV
```

Validadas con zod al arrancar: **si falta una, el proceso no inicia.** Nada de valores por defecto silenciosos.

`.env.example` versionado y completo. `.env` en `.gitignore`. Cero secretos en el repositorio (R31).

---

## 9. Señales de que la arquitectura se está desviando

Revisar al cerrar cada corte. Si aparecen dos, se para y se corrige antes de seguir.

1. Un componente de React importa algo de `packages/data`.
2. `packages/domain` tiene un `import` con I/O.
3. Una capacidad importa otra capacidad directamente.
4. Hay dos lugares donde se calcula un total, un impuesto o un consumo de stock.
5. Un comando crítico necesita más de un request desde la UI.
6. Un archivo supera 300 líneas y sigue creciendo.
7. Aparece un `any` o un `@ts-ignore` para "salir del paso".
8. Se agrega un `if (giro === 'restaurante')` en el núcleo en vez de una estrategia o una capacidad.

El número 8 es el más peligroso, porque parece inocente y es como se pierde la modularidad.
