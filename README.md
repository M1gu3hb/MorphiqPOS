# MorphiqPOS

Punto de venta de **Morphiq**. Un solo sistema que opera una tienda de mostrador y un
restaurante completo, sin cambiar de aplicación.

> **La planeación no vive aquí.** Está en [`M1gu3hb/MorphiqPOS`](https://github.com/M1gu3hb/MorphiqPOS):
> contexto, las decisiones con su razón, las 34 reglas no negociables y el plan de los
> seis cortes de Fase 1. Este repositorio es sólo el código.
>
> Antes de tocar nada, lee `CONTEXTO_MAESTRO.md`, `DECISIONES.md` y `REGLAS.md` de ese
> repositorio. Si algo no está escrito ahí, no está decidido.

**Corte actual: F1.0 — Fundación.** Monorepo, puertas de calidad, entorno local y sistema
de diseño. Cero features de negocio todavía: eso empieza en F1.1.

---

## Levantarlo en cinco minutos

Necesitas **Node 20.11 o superior**, **Docker Desktop** y nada más. Sin cuentas, sin claves
de terceros, sin internet después de la primera instalación — es el requisito A-27: el
sistema completo tiene que correr en la PC de un cliente que no quiere depender de nadie.

```bash
corepack enable                 # habilita pnpm en la versión que fija el repositorio
pnpm install

cp .env.example .env            # y GENERA tus secretos, no uses los de ejemplo
pnpm db:up                      # Postgres 16 + almacenamiento, en contenedores

pnpm dev                        # http://localhost:3000
```

La aplicación abre en **`/estilos`**: el sistema de diseño en vivo. Cambia de estilo, de
modo y de densidad desde ahí y verás la interfaz entera cambiar. En F1.1 la raíz pasa a
ser el panel del negocio.

### Genera tus secretos

`SESSION_SECRET` y `PIN_PEPPER` **no tienen valor por defecto**: el proceso no arranca sin
ellos, a propósito.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

`PIN_PEPPER` es la pimienta del hash de los PIN de empleado. **Rotarla invalida todos los
PIN** y obliga a reenrolar a todo el mundo, así que se fija una vez y no se toca.

---

## Los comandos que vas a usar

| Comando                                           | Qué hace                                                        |
| ------------------------------------------------- | --------------------------------------------------------------- |
| `pnpm dev`                                        | Levanta la aplicación                                           |
| `pnpm verify`                                     | **La puerta completa.** Es lo que decide si algo está terminado |
| `pnpm test:unit`                                  | Pruebas unitarias. Menos de un segundo, sin base de datos       |
| `pnpm test:integracion`                           | Contra Postgres real. Necesita Docker                           |
| `pnpm test:e2e`                                   | Playwright. Necesita un build                                   |
| `pnpm lint` · `pnpm typecheck`                    | Cero errores, siempre                                           |
| `pnpm db:up` · `db:down` · `db:reset` · `db:logs` | El entorno local                                                |
| `pnpm ui:tokenizar`                               | Tokeniza una primitiva recién agregada de shadcn                |

### `pnpm verify` es la definición de terminado

No es un atajo de conveniencia: encadena todas las puertas, en el mismo orden que CI.

```
estructura · histórico · tsconfig · entorno · residuos · primitivas
   → formato · lint · tipos → pruebas → build → cabeceras en vivo
```

Si `pnpm verify` no está en verde desde un clon limpio, el corte no se firma.

---

## Cómo está organizado

```
apps/web/            La aplicación. Next.js App Router único
packages/
  contracts/         Tipos, errores tipados y validación del entorno. Sin dependencias
  domain/            Reglas puras. Cero I/O, cero React, cero SQL
  data/              El único lugar que conoce SQL          (contenido: F1.1)
  app/               Casos de uso: comandos y consultas     (contenido: F1.1)
  ui/                Tokens, las 4 perillas y 36 primitivas
  registry/          Motor de capacidades                   (contenido: F1.2)
  testing/           Inyección de fallos, datos sintéticos, arranque de Postgres
capabilities/        Una carpeta por capacidad activable    (contenido: F1.2)
infra/docker/        Postgres + almacenamiento
historico/           Las dos fuentes. Evidencia, no plantilla. NO se versiona
```

### Las reglas que hace cumplir el código, no la buena voluntad

Cada una tiene una puerta automática detrás. No son recordatorios:

| Regla                                                               | Quién la hace cumplir                                                                                                         |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| La interfaz nunca importa `packages/data`                           | `pnpm lint` — y `import 'server-only'` rompe el build                                                                         |
| `packages/domain` no hace I/O                                       | `pnpm lint` **y el compilador**: su `tsconfig` no incluye los tipos de Node ni el DOM, así que ahí no existe ni `console.log` |
| Ningún componente escribe un color, una altura o una sombra literal | `pnpm verify:primitivas`                                                                                                      |
| Cero residuos de la plataforma erradicada                           | `pnpm verify:residuos`                                                                                                        |
| El dinero nunca pasa por punto flotante                             | El tipo `Centavos` es un `bigint` con marca: una suma escrita fuera de `domain/dinero` **no compila**                         |
| Un `await` olvidado en una transacción                              | `no-floating-promises`, con información de tipos                                                                              |
| `historico/` no se compila, no se lintea, no se importa             | `pnpm verify:historico`                                                                                                       |

---

## Antes de escribir código

1. **La prueba va primero** (R17). No "compila" ni "la pantalla se ve".
2. **Si corriges un defecto, quita la corrección y comprueba que la prueba falla.** Una
   prueba que pasa igual con y sin el arreglo no prueba nada.
3. **Ningún archivo pasa de 300 líneas.** Si crece, se parte.
4. **Cero `any`, cero `@ts-ignore`.** Si no conoces el tipo, usa `unknown` y estréchalo.
5. **Los mensajes de commit llevan el identificador de tarea:** `F1.1-T07: …`
6. **Al terminar una tarea, escribe su entrada en `docs/fase-1/BITACORA.md`** del
   repositorio de documentación. Es lo que permite que otra sesión retome sin preguntar.

### Agregar una primitiva de shadcn

```bash
cd packages/ui
pnpm dlx shadcn@latest add <nombre>
cd ../.. && pnpm ui:tokenizar && pnpm verify:primitivas
```

El codemod es obligatorio. Lo que genera shadcn trae alturas fijas que puentean la perilla
de densidad, `transition-all` que anima la altura, y la variante `dark:` en vez de la
nuestra. `pnpm verify:primitivas` lo rechaza si te lo saltas.

---

## Documentación técnica

- **[`docs/adr/`](docs/adr/)** — decisiones de arquitectura con sus alternativas, sus
  consecuencias y su salida de reversa.
  - [`0001-acceso-postgres.md`](docs/adr/0001-acceso-postgres.md) — por qué Kysely sobre
    `pg` y no Drizzle.
- La estrategia, el modelo de datos y el plan por cortes viven en el repositorio de
  documentación, no aquí.

---

## Qué falta en este corte

Escrito para que nadie lo descubra a la mala:

- **`pnpm db:migrate` y `db:seed` fallan a propósito**: necesitan `packages/data`, que
  llega en F1.1. No hay ninguna migración todavía.
- **El workflow de CI no se ha ejecutado nunca.** Este repositorio no tiene remoto
  (decisión A-35). Cada paso invoca el mismo script que corre en local, y esos sí están
  verificados.
- **Las pruebas E2E emulan la tablet sobre Chromium.** El iPad real (WebKit) entra en
  F1.4, con la pantalla de mesero.
