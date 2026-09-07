# 02 — Estrategia de fusión

Este es el documento central de la Fase 1. Explica **cómo** se convierten dos sistemas en uno, en qué orden, y por qué de esa forma y no de otra.

---

## 1. Qué significa "fusionar" aquí

Miguel lo dijo así: *"que funcionen igual, en la misma aplicación, sin tener que cambiar entre uno u otro"*.

Traducido a algo verificable:

> **Un solo repositorio, un solo despliegue, una sola base de datos, un solo sistema de diseño y una sola sesión.** Un negocio configurado como tienda ve el POS de mostrador. Un negocio configurado como restaurante ve mesas, mesero y cocina. **Es el mismo binario, la misma pantalla de login y el mismo cajero.** Lo único que cambia es qué capacidades tiene activadas ese negocio.

Y lo que **no** significa:

- No es poner los dos proyectos en carpetas hermanas y un menú que salte entre ellos.
- No es copiar los archivos de uno dentro del otro.
- No es mantener dos modelos de venta que se sincronizan.

---

## 2. La decisión de fondo: base heredada + reimplementación dirigida

Hay tres formas de fusionar dos sistemas. Sólo una funciona aquí.

| Estrategia | Qué sería | Veredicto |
|---|---|---|
| **Copiar A dentro de B** | Meter las páginas del restaurante en el proyecto de tiendita y cambiarles el cliente de datos | **Descartada.** 359 llamadas directas, 1,592 errores de tipos y lógica de negocio dentro de pantallas. Se importarían todos los defectos y la deuda quedaría permanente |
| **Reescribir todo desde cero** | Proyecto nuevo, ambos como referencia | **Descartada.** Tira 3–4 meses de arquitectura correcta ya construida en tiendita y meses de reglas de negocio descubiertas en el restaurante |
| **Base heredada + reimplementación dirigida** | La **arquitectura** de tiendita es la base viva del monorepo. Del restaurante se **levanta** lo portable y se **reimplementa** lo acoplado, capa por capa | **Elegida** |

### Cómo se decide, archivo por archivo

Cada archivo de la Fuente A cae en uno de cuatro cubos. La clasificación **no es opinión**: se decide con el inventario de acoplamiento.

| Cubo | Criterio | Qué se hace | Volumen |
|---|---|---|---|
| **LEVANTAR** | Cero referencias a Base44 y sin acceso a datos | Se copia a `packages/domain/`, se convierte a `.ts`, se le escriben pruebas | 16 utils + ~6 libs ≈ **80 KB de reglas** |
| **PORTAR** | Componente de UI con poco o ningún acceso a datos | Se convierte a `.tsx`, se le quitan las llamadas a datos, se cablea a hooks/repositorios nuevos, se re-tokeniza el estilo | **~90 componentes** |
| **REIMPLEMENTAR** | Página o utilidad con lógica de negocio y acceso a datos mezclados | Se lee como especificación, se escribe de nuevo sobre casos de uso | **13 páginas + 5 utils** |
| **DESCARTAR** | Defectuoso, legado o propio de la plataforma | No entra. Queda como evidencia histórica | Ver `01-ANALISIS` §2.4 |

**Regla de ejecución:** ningún archivo pasa de un cubo a otro sin registrarlo en `BITACORA.md`. Si un componente que parecía PORTAR resulta tener lógica de negocio adentro, se reclasifica a REIMPLEMENTAR y se anota — no se "arregla rápido".

---

## 3. El orden importa: de adentro hacia afuera

La fusión se hace por **capas**, no por pantallas. Esta es la razón: si empiezas por la pantalla de Mesero, necesitas mesas, comandas, catálogo, precios, inventario y caja funcionando. Si empiezas por el dominio, cada capa se apoya en la anterior y se puede probar sola.

```
Capa 5 · Interfaz          páginas, componentes, temas          ← al final
Capa 4 · Aplicación        casos de uso, comandos, permisos
Capa 3 · Datos             repositorios, migraciones
Capa 2 · Dominio           reglas puras, tipos, máquinas de estado
Capa 1 · Fundación         monorepo, tooling, CI, Docker         ← primero
```

Y sobre esas capas, los cortes verticales:

```
F1.0  Fundación         ────────────────────────────────  capa 1
F1.1  Núcleo            ──────────────────────  capas 2·3·4 (tenant, identidad, permisos)
F1.2  Catálogo y venta  ──────────────────────  capas 2·3·4·5 → TIENDA OPERANDO
F1.3  Inventario        ──────────────────────  capas 2·3·4·5 → RETAIL VENDIBLE
F1.4  Restaurante       ──────────────────────  capas 2·3·4·5 → FUSIÓN COMPLETA
F1.5  QR y cierre       ──────────────────────  capa 5 + endurecimiento
```

**Por qué el catálogo antes que el inventario:** se puede vender sin descontar stock (política `permitir_venta_sin_stock`), pero no se puede descontar stock sin catálogo. Y el corte F1.2 es el que primero pone una tienda a operar, que es el criterio de admisión (R5).

**Por qué el restaurante hasta F1.4:** necesita catálogo con modificadores, inventario con recetas, y caja con propinas. Adelantarlo obliga a construir la mitad de F1.2 y F1.3 primero, mal y sin probar.

---

## 4. Las siete operaciones de fusión

Cada una tiene un método definido. No se improvisa.

### Operación 1 — Unificar el modelo de datos

Las 25 entidades del restaurante y las 29 tablas de tiendita se convierten en **un solo esquema Postgres**. Detalle completo en `03-MODELO-DE-DATOS-UNIFICADO.md`.

Las tres transformaciones clave:

- `ventas` (B) + `Venta` (A) → **`ordenes`**, con `estrategia_captura`, `estrategia_cumplimiento` y `estrategia_consumo`.
- `detalle_ventas` (B) + `DetalleVenta` (A) → **`orden_lineas`**, con modificadores, exclusiones y los tres tipos de venta.
- El descuento de stock deja de ser un `UPDATE` sobre `productos.stock_actual` y pasa a ser **movimientos inmutables** con saldo proyectado.

**Método:** migraciones nuevas y numeradas desde `001`, en un esquema limpio. **No se migran las migraciones de tiendita tal cual** — se reescriben incorporando lo aprendido, porque hay que cambiar el modelo de venta de todos modos. Las 18 migraciones existentes son la especificación, no el punto de partida.

### Operación 2 — Erradicar Base44

Cero SDK, cero `base44.*`, cero `VITE_BASE44_*`, cero `base44/`, cero URLs, IDs o activos remotos. Como el repositorio es nuevo, **la erradicación es por construcción**: nada de eso entra nunca.

La puerta automática de CI (patrones prohibidos) se instala en F1.0 aunque pase trivialmente. Existe para que nadie los introduzca al portar. Detalle en `06-DEFECTOS-Y-ERRADICACION.md`.

### Operación 3 — Levantar el dominio

Los 16 utils sin acoplamiento y las 6 libs portables del restaurante se convierten en `packages/domain/`:

```
packages/domain/
  dinero/          money.ts            ← nuevo: enteros en centavos, redondeo definido
  catalogo/        tipoVenta.ts        ← de tipoVentaUtils.js
                   unidades.ts         ← de unidadesMedida.js + unitConversions.js
                   modificadores.ts    ← extraído de ModificadoresEditor
  venta/           totales.ts          ← de ventaTotales.js
                   propinas.ts         ← de tipsUtils.js
  inventario/      consumo.ts          ← de inventoryUtils.js
                   validacion.ts       ← de inventarioValidation.js
                   matchers.ts         ← de ingredienteMatcher.js + productoMatcher.js
  finanzas/        margenes.ts         ← de financialUtils.js
  preparacion/     ruteo.ts            ← de preparacionEstacionUtils.js + estacionUtils.js
  importacion/     validadores.ts      ← de importValidators.js
                   csv.ts              ← de csvParser.js
  estados/         maquinas.ts         ← nuevo: transiciones de orden, pago, comanda, mesa, caja
```

**Método por archivo:**
1. Copiar el `.js` al paquete.
2. Convertir a `.ts` con tipos explícitos, sin `any`.
3. **Escribir las pruebas ANTES de tocar la lógica** — capturan el comportamiento actual.
4. Corregir solo lo que la auditoría marcó como defecto, y solo con su prueba de corrección.
5. Registrar en `BITACORA.md` qué se conservó y qué se corrigió.

Esta operación es la de **mejor relación valor/riesgo de toda la Fase 1**: recupera meses de conocimiento de negocio con muy poco riesgo técnico.

### Operación 4 — Unificar la capa de datos

Los 22 repositorios de tiendita son el molde. Se conserva su patrón exacto:

```ts
// packages/data/productos.ts
import type { Producto } from '@morphiqpos/contracts';

export async function getProductos(orgId: string, opts?: {...}): Promise<Producto[]>
export async function createProducto(data: ProductoCreate): Promise<Producto>
```

Tres cambios respecto a tiendita:

1. **Los repositorios no llaman a Supabase desde el navegador.** Van detrás de la API. El navegador habla con `/api/*`, no con la base. Esto cierra la clase entera de defectos de "el cliente inserta lo que quiere".
2. **Tipos desde `packages/contracts/`**, generados del esquema, no escritos a mano en `types.ts`.
3. **Nada de `negocio_id` recibido por parámetro desde el cliente.** El ámbito viene de la sesión del servidor (R16).

### Operación 5 — Construir los casos de uso

Aquí vive la lógica crítica (A-21). Cada comando tiene la forma definida en `/CONTEXTO_MAESTRO.md` §4:

```
packages/app/comandos/
  identidad/    autenticarTerminal · autenticarEmpleado · cerrarSesionEmpleado
  caja/         abrirSesionCaja · registrarMovimientoCaja · cerrarSesionCaja
  venta/        crearOrden · cotizarOrden · agregarLinea · quitarLinea
                confirmarOrden · cobrarOrden · cancelarOrden · devolverOrden
  preparacion/  enviarComanda · transicionarItem · entregarItem
  mesa/         abrirMesa · transferirMesa · solicitarCuenta · liberarMesa
  inventario/   registrarMovimiento · ajustarStock · recibirCompra · registrarMerma
                registrarConteo
  catalogo/     crearProducto · actualizarPrecio · asignarCodigoBarras
```

**Todo comando crítico:** transacción real contra Postgres, clave de idempotencia, permiso verificado en servidor, ámbito de la sesión, evento emitido, errores tipados. Sin excepción.

`cobrarOrden` es el que absorbe y corrige el defecto central de **ambos** sistemas.

### Operación 6 — Portar la interfaz

Un solo Next.js. Las rutas de operación son cliente puro (A-20).

**Estructura de rutas final:**

```
app/
  (auth)/          login · enrolar-terminal
  (operacion)/     venta · escaner · mesero · cocina · caja        ← 'use client' completo
  (gestion)/       inicio · productos · inventario · compras · recetas
                   registros · clientes · fiado · configuracion · cuenta
  (publico)/       qr/[token] · vista-cliente
  api/             comandos y consultas
```

**Por qué `(operacion)` separado:** esas cinco rutas comparten requisitos que las demás no tienen — velocidad, tiempo real, funcionamiento en tablet, densidad compacta, cero renderizado de servidor. Agruparlas permite darles un layout, un provider de tiempo real y una densidad propios sin duplicar la app.

**Método de porteo de un componente:**
1. Copiar el `.jsx` a su lugar en el monorepo, renombrar a `.tsx`.
2. Eliminar toda llamada a datos; reemplazar por props o por un hook.
3. Reemplazar colores y tamaños literales por tokens (`05-SISTEMA-DE-DISENO`).
4. Tipar props sin `any`.
5. Verificar accesibilidad mínima: foco, teclado, contraste, `aria-label` en botones de icono.
6. Registrar en `BITACORA.md`.

**Los dos monstruos** —`Caja.jsx` (81 KB) y `Mesero.jsx` (65 KB)— **no se portan: se reimplementan por casos de uso.** Se leen para extraer los flujos, y se reconstruyen como una página delgada que orquesta componentes y comandos. Es la tarea de mayor riesgo de la Fase 1 y por eso tiene su propio corte (F1.4).

### Operación 7 — Unificar el diseño

Un solo sistema de tokens que da los tres estilos intercambiables. Detalle en `05-SISTEMA-DE-DISENO-Y-ESTILOS.md`.

Punto de partida favorable: **ambos sistemas usan el mismo set de 49 primitivas de shadcn/ui.** Las primitivas se adoptan una sola vez, en `.tsx`, tokenizadas, y sirven a los dos mundos.

Las clases `skeu-*` de tiendita **no se conservan como CSS plano**: se convierten en un estilo (`skeuomorfico`) del motor de estilos, con sus valores expresados como tokens. Así el look actual de tiendita sobrevive como una opción, en vez de desaparecer o de quedarse hardcodeado.

---

## 5. Qué se rompe en la fusión, dicho de frente

Ser honesto con esto evita sorpresas a mitad del camino.

| Se rompe | Consecuencia | Mitigación |
|---|---|---|
| **La numeración de migraciones de tiendita** | Las 18 migraciones no se reutilizan; se reescriben desde `001` | Son la especificación. Reescribirlas cuesta días, no semanas, y es inevitable porque el modelo de venta cambia |
| **Los datos de los 3 clientes actuales** | Sus sistemas siguen en producción **sin tocarse**. MorphiqPOS arranca con base vacía | A-05: no hay migración de clientes en Fase 1. Se evalúa después, cliente por cliente |
| **Las query keys inline de tiendita** | Hay que centralizarlas en un factory | Se hace en F1.0, antes de que haya 200 usos |
| **La mezcla `.jsx`/`.tsx`** | Todo el código nuevo es `.tsx` estricto | Regla R19: cero errores de tipos desde el primer commit |
| **Los tres sistemas de toast** | Se queda uno solo (`sonner`) | Se decide en F1.0 |
| **`components.json` con `"tsx": false`** | Se cambia a `true` para que shadcn genere `.tsx` | Trivial, pero hay que hacerlo antes de agregar primitivas |
| **`app/` en la raíz** | En el monorepo pasa a `apps/web/app/` | Se resuelve con la estructura nueva, no con parches de alias |

---

## 6. La regla que evita que la fusión se desvíe

> **Cada corte termina con el sistema operando, no con el sistema a medias.**

Después de F1.2 una tienda puede vender un día completo. Después de F1.4 un restaurante también. En ningún momento existe un estado de "ya casi, faltan tres pantallas para que funcione algo".

Concretamente, al cerrar cada corte:

1. `npm run verify` en verde desde un clon limpio (lint + tipos + pruebas + build).
2. Los escenarios de prueba del corte, pasando.
3. Los checks de `morphiq-prs` que aplican al corte, sin BLOCKERS.
4. `BITACORA.md` actualizado.
5. El cuadro de estado de `00-INDICE-Y-COMO-USAR.md` actualizado.
6. Miguel lo abre en su máquina y lo usa.

**Si un corte no puede demostrarse, no está terminado**, aunque el código exista.

---

## 7. Resumen de la estrategia en diez líneas

1. La arquitectura de tiendita es la base viva; el restaurante aporta features y reglas.
2. Base44 se erradica por construcción: el repositorio es nuevo.
3. Los 16 utils sin acoplamiento se levantan a `packages/domain/` con pruebas. Es el mayor ahorro.
4. Los ~90 componentes de UI se portan a `.tsx` tokenizado, sin acceso a datos.
5. Las 13 páginas se reimplementan sobre casos de uso; `Caja` y `Mesero` son el trabajo duro.
6. El modelo de venta se unifica en `ordenes` con tres estrategias.
7. La lógica crítica vive en comandos transaccionales e idempotentes de la API TypeScript.
8. Un solo Next.js, con las rutas de operación como cliente puro.
9. Un solo sistema de tokens que da tres estilos intercambiables; `skeu-*` sobrevive como uno de ellos.
10. Se avanza por capas de adentro hacia afuera, y cada corte deja el sistema operando.
