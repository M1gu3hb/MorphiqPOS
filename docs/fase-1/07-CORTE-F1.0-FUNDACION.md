# F1.0 — Fundación

**Objetivo:** dejar un monorepo que arranca, migra, prueba y construye desde un clon limpio, con las puertas de calidad instaladas y el sistema de diseño listo. **Cero features de negocio.**

**Esfuerzo estimado:** 5–7 jornadas · **Precondición:** ninguna. Es el primer corte.

> **Por qué este corte existe y no se salta:** todo lo que se construya después hereda estas decisiones. Instalar las puertas de calidad cuando ya hay 200 archivos cuesta diez veces más, y para entonces ya se colaron los defectos que estamos tratando de no repetir.

---

## Fuera de alcance

Nada de: productos, ventas, caja, inventario, mesas, usuarios reales, Supabase en la nube, despliegue. Si aparece la tentación de "aprovechar y agregar la tabla de productos", **no**. Este corte es infraestructura.

---

## Tareas

### F1.0-T01 · Crear el repositorio y la estructura
Repositorio `morphiqpos` (privado). Estructura de `04-ARQUITECTURA` §1: `apps/`, `packages/`, `capabilities/`, `infra/`, `docs/`, `historico/`.
`pnpm` con workspaces + Turborepo. `.gitignore` que excluye `.env`, `node_modules`, `.next`, `dist`, `coverage`.

**Aceptación:** `pnpm install` funciona desde un clon limpio. `historico/` está en `.gitignore` del build y excluido del `tsconfig`.

### F1.0-T02 · Clonar las dos fuentes como referencia local
```bash
git clone https://github.com/M1gu3hb/POS-MH-Tiendita.git historico/tiendita
# descomprimir el ZIP del restaurante en historico/restaurante/
```
**Aceptación:** ambas fuentes son legibles localmente y **excluidas del build, del lint, del type-check y del escaneo de residuos**. Verificar que `pnpm build` no las toca.

### F1.0-T03 · TypeScript estricto en todo
`tsconfig.base.json` con `strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`. **Sin `allowJs`.** Un `tsconfig.json` por paquete que extiende el base.

**Aceptación:** `pnpm typecheck` pasa con **cero** errores. Un `any` explícito hace fallar el lint.

### F1.0-T04 · ADR del acceso a Postgres
Evaluar `pg` con SQL escrito a mano vs Drizzle. Requisitos: transacciones reales anidables, SQL legible en revisión, tipos generados del esquema, migraciones versionadas.
Escribir el ADR en `docs/adr/0001-acceso-postgres.md` con contexto, opciones, elección, consecuencias y salida de reversa.

**Aceptación:** ADR aprobado por Miguel antes de escribir la primera migración.

### F1.0-T05 · Entorno local con Docker
`infra/docker/docker-compose.yml`: Postgres 16 + MinIO. Volúmenes persistentes. Puertos documentados.
Scripts: `db:up`, `db:down`, `db:reset`, `db:migrate`, `db:seed`.

**Aceptación:** `docker compose up -d && pnpm db:migrate` funciona sin internet y sin ninguna cuenta de terceros. Es el requisito A-27.

### F1.0-T06 · `packages/contracts` y `packages/domain` vacíos pero vivos
Ambos paquetes creados, con su `tsconfig`, su `package.json` y una prueba trivial que corre.
En `domain`: implementar el módulo `dinero/` completo — `Centavos`, `sumar`, `restar`, `aplicarPorcentaje`, `redondear`, `repartir`.

**Aceptación:** `dinero/` tiene pruebas que cubren los casos que rompen: redondeo de `.005`, reparto de una propina de 100 entre 3, IVA de 16 % sobre un total impar, suma de 1000 líneas sin deriva. **Cero uso de `Number` con decimales para dinero.**

### F1.0-T07 · Sistema de diseño base
`packages/ui` con: todos los tokens de `05-SISTEMA-DE-DISENO` §3 · las 4 perillas · los estilos `premium` y `editorial` en claro y oscuro · las 49 primitivas de shadcn en `.tsx` tokenizadas (`components.json` con `"tsx": true`).
Fuente tabular para `--fuente-numeros`.

**Aceptación:** ninguna primitiva contiene un color, radio, sombra o espacio literal. Se verifica con una regla de lint que prohíbe clases de color de Tailwind (`bg-blue-*`, `text-red-*`, etc.) dentro de `packages/ui/primitivas`.

### F1.0-T08 · Página `/estilos`
Muestra todas las primitivas en los 4 estilos × 2 modos × 3 densidades, con selector.

**Aceptación:** Miguel la abre y cambia de estilo en vivo. Es el primer entregable visible del proyecto y sirve de demo desde el día uno.

### F1.0-T09 · Puertas de CI
Workflow que corre en cada push y bloquea el merge:
`format` · `lint` · `typecheck` · `test:unit` · `test:integration` (contra Postgres en contenedor) · `build` · `audit` (falla con vulnerabilidades altas explotables) · **`scan:residuos`** (los patrones de `06-DEFECTOS` §1) · **`lint:capas`** (las 5 prohibiciones de `04-ARQUITECTURA` §2).

**Aceptación:** un PR con un `import` de `packages/data` dentro de `apps/web` **falla**. Un PR que introduce la cadena `base44` fuera de `historico/` **falla**. Se verifica creando ambos PRs a propósito.

### F1.0-T10 · Andamiaje de pruebas
Vitest configurado para unitarias y para integración con Postgres real (contenedor efímero por corrida). Playwright instalado. `packages/testing` con fábricas de datos y el helper de inyección de fallos.

**Aceptación:** `pnpm test` corre las tres capas. El helper de fallos puede interrumpir una transacción a mitad — se prueba con un caso de juguete.

### F1.0-T11 · `apps/web` mínima
Next.js 14 con `app/layout.tsx`, los tres layouts vacíos (`(auth)`, `(gestion)`, `(operacion)`), `middleware.ts` con el esqueleto de sesión, providers (tema, query client), `sonner` como único sistema de toast.
**Factory de query keys centralizada** desde el primer día.
Cabeceras de seguridad: CSP, `nosniff`, `frame-ancestors`, `Referrer-Policy`, `Permissions-Policy`.

**Aceptación:** `pnpm dev` levanta; `/estilos` se ve; las cabeceras aparecen en la respuesta.

### F1.0-T12 · Variables de entorno validadas
`packages/contracts/env.ts` con esquema zod. **Si falta una variable, el proceso no arranca.** `.env.example` completo y versionado.

**Aceptación:** borrar una variable de `.env` produce un error claro al arrancar, no un fallo silencioso a las tres pantallas.

### F1.0-T13 · Documentación de arranque
`README.md` del repositorio: qué es, cómo levantarlo en 5 minutos, cómo correr las pruebas, dónde está la documentación de fase.
`docs/adr/` con los ADR de F1.0. `docs/fase-1/BITACORA.md` iniciado.

**Aceptación:** alguien que nunca vio el proyecto lo levanta siguiendo sólo el README.

---

## Pruebas obligatorias del corte

| ID | Escenario | Tipo |
|---|---|---|
| `F1.0-P1` | Clon limpio → `pnpm install` → `docker compose up` → `db:migrate` → `test` → `build` | E2E de entorno |
| `F1.0-P2` | Dinero: redondeo, reparto, IVA, suma de 1000 líneas sin deriva | Unitaria |
| `F1.0-P3` | Un import prohibido entre capas hace fallar CI | Meta-prueba |
| `F1.0-P4` | La cadena `base44` fuera de `historico/` hace fallar CI | Meta-prueba |
| `F1.0-P5` | Contraste AA en las 49 primitivas, en 2 estilos × 2 modos | Accesibilidad |
| `F1.0-P6` | El sistema arranca con el DNS a `*.base44.com` bloqueado | `ZERO-01` |

---

## Gate `morphiq-prs` de este corte

Mapa de superficies aplicable: **S5** (backend propio), **S14** (DB propia). Todavía no S1, S2, S3, S4, S9, S10, S11.

| Sección | Check | Estado esperado |
|---|---|---|
| 01 | Build de producción sin errores | ✅ |
| 01 | Cero secretos en frontend, repo o logs | ✅ |
| 01 | Cero errores de runtime en consola | ✅ |
| 03 | Cero componentes de scaffold visibles (favicon de framework, "Get Started") | ✅ |
| 08 | CSP, `nosniff`, `frame-ancestors`, `Referrer-Policy` presentes | ✅ |
| 12 | Migraciones versionadas y reproducibles | ✅ |
| 12A | Pool de conexiones dimensionado, no un cliente por request | ✅ |
| 20 | Lockfile versionado, build reproducible, cero secretos en historia | ✅ |
| 20 | Acciones de terceros fijadas a SHA completo | ✅ |
| 20 | Build/lint/typecheck/tests bloquean el merge | ✅ |
| 06 | Contraste AA, foco visible, navegación por teclado | ✅ |

---

## Definición de terminado

Se firma sólo si **todas** son ciertas:

- [ ] Un clon limpio llega de cero a `build` verde sin intervención manual.
- [ ] `pnpm typecheck` y `pnpm lint` en **cero** errores.
- [ ] Las 6 pruebas del corte pasan.
- [ ] Las dos meta-pruebas de CI se verificaron creando PRs que fallan a propósito.
- [ ] `/estilos` funciona y Miguel cambió de estilo en vivo.
- [ ] El módulo `dinero/` está completo y probado.
- [ ] Todo corre sin internet y sin cuentas de terceros.
- [ ] Los ADR de F1.0 están escritos y aprobados.
- [ ] `BITACORA.md` tiene una entrada por tarea.
- [ ] Ningún check BLOCKER de `morphiq-prs` aplicable queda abierto.
