# TEAM.md — Cómo trabajan dos agentes en MorphiqPOS

**Lee esto antes de escribir una sola línea.** No estás solo en este repositorio.

Última actualización: 8 de septiembre de 2026

---

## 1. Quiénes somos

| Agente | Carril | Carpeta de trabajo | Rama |
|---|---|---|---|
| **Claude Code** | **Carril A — Venta, dinero y restaurante** | `D:\MIS PROYECTOS\Master POS\morphiqpos` | `carril-a` |
| **Codex** | **Carril B — Catálogo, inventario, gestión y público** | `D:\MIS PROYECTOS\Master POS\morphiqpos-codex` | `carril-b` |
| Cowork (Claude) | Arquitectura, auditoría y reparto | — | — |
| **Miguel** | Dueño. Decide. Los commits van a su nombre | — | `main` |

**Los dos trabajan al mismo tiempo, sobre el mismo repositorio, en carpetas distintas.**

---

## 2. Preparación: dos carpetas, un repositorio

Git no permite dos ramas en la misma carpeta. La solución es un *worktree*: mismo repositorio, segunda carpeta de trabajo.

```bash
cd "D:\MIS PROYECTOS\Master POS\morphiqpos"
git branch carril-a
git branch carril-b
git switch carril-a
git worktree add "..\morphiqpos-codex" carril-b
```

A partir de ahí:
- Claude Code trabaja en `morphiqpos` sobre `carril-a`.
- Codex trabaja en `morphiqpos-codex` sobre `carril-b`.
- **Ninguno cambia de rama ni entra a la carpeta del otro. Nunca.**

Identidad de los commits, en ambas carpetas:

```bash
git config user.name "M1gu3hb"
git config user.email "enchuer2797@gmail.com"
```

---

## 3. Zonas de propiedad — la regla que evita el sabotaje

> **Si un archivo no está en tu zona, no lo tocas. Aunque veas un bug. Aunque sea de una línea.**
> Lo anotas en tu reporte y sigues.

### Carril A — Claude Code

| Qué | Detalle |
|---|---|
| **Tablas** | `terminales` · `identidades` · `credenciales_pin` · `empleos` · `personas` · `folios` · `ordenes` · `orden_lineas` · `orden_linea_modificadores` · `pagos` · `sesiones_caja` · `movimientos_caja` · `auditoria` · `mesas` · `zonas` · `estaciones_preparacion` · `comandas` · `comanda_items` · `orden_ajustes` · `liquidaciones_propina` |
| **Migraciones** | Números **010–039** |
| **Dominio** | `packages/domain/venta/` · `estados/` · `preparacion/` |
| **Comandos** | `identidad/` · `venta/` · `caja/` · `mesa/` · `preparacion/` |
| **Rutas** | `app/(auth)/**` · `app/(operacion)/**` · `app/api/auth/**` · `app/api/venta/**` · `app/api/caja/**` · `app/api/mesa/**` · `app/api/comanda/**` |
| **Infra compartida** | `packages/app/comando.ts` (el envoltorio) — **A lo construye, B lo consume** |

### Carril B — Codex

| Qué | Detalle |
|---|---|
| **Tablas** | `organizaciones` · `sucursales` · `configuracion` · `categorias` · `productos` · `modificadores` · `modificador_opciones` · `producto_modificadores` · `insumos` · `almacenes` · `movimientos_stock` · `existencias` · `recetas` · `compras` · `compra_lineas` · `proveedores` · `gastos` · `clientes` · `movimientos_credito` · `devoluciones` · `conteos_inventario` · `solicitudes_qr` · `menu_qr_secciones` |
| **Migraciones** | Números **040–069** |
| **Dominio** | `packages/domain/catalogo/` · `inventario/` · `finanzas/` · `importacion/` |
| **Comandos** | `catalogo/` · `inventario/` · `compras/` · `clientes/` · `configuracion/` |
| **Rutas** | `app/(gestion)/**` · `app/(publico)/**` · `app/api/catalogo/**` · `app/api/inventario/**` · `app/api/compras/**` · `app/api/publico/**` |
| **Infra compartida** | `packages/domain/inventario/consumo.ts` y `packages/data/repos/stock.ts` — **B los construye, A los consume** |

### Zona neutral — se toca con aviso en el reporte

`packages/contracts/**` · `packages/ui/**` · `packages/testing/**` · `scripts/**` · `.github/**` · configuración raíz.

**Regla en zona neutral: sólo se AGREGA, nunca se modifica ni se borra lo del otro.** Cada quien crea sus archivos. Si necesitas cambiar un archivo compartido existente, lo anotas en tu reporte y avisas en el commit.

---

## 4. Las dos dependencias cruzadas

Sólo hay dos, y las dos se resuelven publicando el contrato temprano.

### El envoltorio `comando()` — A lo entrega primero
**Claude Code lo construye como su PRIMERA tarea** y hace commit apenas pase sus pruebas. Resuelve: validación zod, comprobación de rol, comprobación de paquete, transacción, idempotencia, auditoría, correlation id y errores tipados.

**Mientras tanto Codex trabaja en dominio puro** (`packages/domain/catalogo/`), que no necesita nada de eso.

### El consumo de inventario — B lo entrega temprano
`cobrarOrden` (carril A) tiene que descontar stock (tablas de carril B). **Codex publica en sus primeras tres tareas:**

```ts
// packages/domain/inventario/consumo.ts
export function calcularConsumo(lineas: LineaParaConsumo[]): MovimientoPlaneado[]

// packages/data/repos/stock.ts
export async function aplicarMovimientos(
  movimientos: MovimientoPlaneado[],
  tx: Transaccion
): Promise<void>
```

Con el decremento atómico y el `CHECK` de política de stock negativo adentro. **Claude Code lo llama, no lo reimplementa.**

Si Codex no lo ha entregado cuando A llegue a `cobrarOrden`: A escribe la firma en `packages/contracts`, hace un doble temporal marcado `// STUB — reemplazar por la implementación de carril B`, sigue, y lo anota en su reporte. **No escribe la implementación real.**

---

## 5. Sincronización

**Cada 3 o 4 tareas terminadas**, o siempre que toques zona neutral:

```bash
git add -A && git commit -m "F1.x-Tnn: ..."
git push origin <tu-rama>

git fetch origin
git merge origin/main          # trae lo que el otro ya integró
# resuelve conflictos SÓLO en tus archivos
pnpm verify                    # tiene que quedar en verde
git switch main && git merge <tu-rama> && git push origin main
git switch <tu-rama>
```

**Nunca haces `push --force`. Nunca reescribes historia de `main`.**

Si `pnpm verify` falla **por algo del otro carril**: no lo arregles. Anótalo en tu reporte, avisa en el commit, y sigue con lo tuyo. Miguel decide.

---

## 6. Protocolo de conflicto

| Situación | Qué haces |
|---|---|
| Encuentras un bug en la zona del otro | Lo anotas en tu reporte, sección **"Bugs ajenos detectados"**. No lo tocas |
| Necesitas un cambio en la zona del otro | Lo escribes en `docs/reports/PENDIENTES-CRUZADOS.md` con qué necesitas y por qué. Sigues con otra tarea |
| Conflicto de merge en un archivo tuyo | Lo resuelves tú |
| Conflicto de merge en un archivo del otro | `git checkout --theirs` y sigues |
| Conflicto en `pnpm-lock.yaml` | El que llega segundo: borra el lock, `pnpm install`, commit |
| Los dos necesitan la misma migración | El primero la hace en su rango. El segundo la consume |
| No sabes de quién es un archivo | Es zona neutral: sólo agregas |

---

## 7. Reportes — obligatorio, uno por sesión

Carpeta `docs/reports/`, numerados con folio correlativo **compartido entre los dos agentes**:

```
docs/reports/
  001-claude-code-f1.1-motor-de-venta.md
  002-codex-f1.1-catalogo.md
  003-claude-code-f1.1-caja-y-cobro.md
  ...
  PENDIENTES-CRUZADOS.md
```

Antes de crear el tuyo, mira el número más alto que exista y toma el siguiente. Si los dos toman el mismo número, el segundo en integrar lo renumera.

**Un reporte por prompt.** Lo escribes al terminar, antes de avisar. Contenido obligatorio en `docs/reports/PLANTILLA.md`.

---

## 8. Reglas que aplican a los dos

1. **`morphiq-prs` es la definición de terminado.** No se declara nada listo sin pasar su gate.
2. **La prueba antes que el código**, y después la mutación: quítala, confirma que falla, restaura. Una prueba que pasa igual con y sin la corrección no prueba nada.
3. **Ningún archivo supera 300 líneas.**
4. **Cero `any`, cero `@ts-ignore`, cero `catch` vacío.**
5. **`historico/` se lee como especificación. No se copia un solo archivo.**
6. **Los secretos van en `.env`, que está en `.gitignore`.** Nunca en el código, nunca en un reporte, nunca en un commit.
7. **Commits pequeños con identificador de tarea**, a nombre de `M1gu3hb`.
8. **Todo se sube.** Nada se queda sólo en local.
9. **Nunca se toca el proyecto `Pasteleria Confetti`** de Supabase (`ivqcxdpqxwjxfohiswqb`). Ni para leer.
10. **Autonomía total dentro de estas reglas.** Se decide y se documenta; no se pregunta salvo lo irreversible.

---

## 9. Qué NO hace nadie

- Cambiarse de rama o entrar a la carpeta del otro.
- Refactorizar código del otro carril "de paso".
- Modificar o borrar archivos ajenos en zona neutral.
- `push --force`, rebase de `main`, o reescribir historia.
- Cambiar decisiones de `DECISIONES.md` sin registrarlo.
- Declarar terminado algo sin su prueba y su mutación.
- Reportar como hecho algo que no se verificó ejecutando.
