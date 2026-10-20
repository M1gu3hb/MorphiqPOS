# TEAM.md — Quién hace qué en MorphiqPOS

**Lee esto antes de escribir una sola línea.**

Última actualización: 19 de octubre de 2026 (cierre de la estabilización 2.4)

---

## 1. Quiénes somos, hoy

| Quién | Papel |
|---|---|
| **Miguel** (`M1gu3hb`) | Dueño del producto. Dirige, decide lo comercial y lo irreversible —dominio y DNS, contratación de proveedores (PAC/CFDI), promoción a producción— y revisa. Todos los commits van a su nombre. |
| **ChatGPT** | Conversa con Miguel, prepara los encargos y revisa las entregas junto con él. Normalmente no desarrolla. Miguel autorizó expresamente la intervención de recuperación del 19/20 de octubre mientras Claude Code agotó su uso; ver el reporte de rescate. |
| **Claude Code** (la sesión de desarrollo) | Hace TODO el desarrollo y toma las decisiones técnicas necesarias para el encargo: arquitectura, código, migraciones por el proceso del repositorio, pruebas, CI, documentación y reporte. Responde por lo que entrega. |
| Subagentes de Claude Code (Sonnet o Haiku, nunca Opus) | Encargos acotados que la sesión de desarrollo delega, revisa y se integra ella misma. No publican nada. |

**Los carriles A/B de septiembre (Claude Code y Codex en dos carpetas) ya no aplican.** Están
resumidos al final, en «Histórico», porque explican la numeración de las migraciones y de
los reportes. No hay hoy un segundo agente con zona propia; si vuelve a haberlo, este archivo
se actualiza ANTES de que empiece.

---

## 2. Identidad de los commits

```bash
git config user.name "M1gu3hb"
git config user.email "118588634+M1gu3hb@users.noreply.github.com"
```

- Se verifica la autoría antes de cada commit (`git log --format='%an <%ae>' -1`).
- Sin líneas `Co-Authored-By` de Claude ni de Anthropic. Sin reescribir commits ya publicados
  —nada de `push --force` ni rebase de lo que está en el remoto—.
- Se sube con la cuenta conectada de Miguel.

---

## 3. Cómo se trabaja una entrega

1. **Primero se entiende:** documentación, código, historial, pruebas, despliegue y base real.
   Un «terminado» escrito no es evidencia; se comprueba ejecutándolo.
2. **Una rama por encargo** (`claude/<encargo>`), con commits coherentes y un PR contra
   `main`. Lo útil de ramas anteriores se trae; no se asume que un PR viejo lo contiene todo.
3. **La prueba antes que el código, y después la mutación:** se quita la corrección, la
   prueba se pone roja, se restaura.
4. **CI comprueba el producto, no sólo que compila:** las jornadas completas, la matriz de
   permisos y el aislamiento corren en `verificar.yml` sobre el SHA del PR (D-39).
5. **El esquema se cambia sólo por migración** del repositorio, ensayada en una base
   desechable desde el esquema vigente, con respaldo comprobado antes de aplicar en la base
   compartida (`docs/fase-2/ROLLBACK-ACOPLE.md`, F2.3-REGLAS §4).
6. **Se deja una bitácora que permita retomar** (`docs/fase-2/BITACORA.md`), el estado al día
   (`docs/fase-2/07-ESTADO.md`), las decisiones estructurales con alternativas y
   consecuencias (`docs/fase-2/05-DECISIONES.md`) y un reporte por entrega
   (`docs/reports/NNN-…`).

---

## 4. Subagentes

- Se usan cuando ahorran trabajo o tiempo de verdad, no por usarlos.
- **Haiku** para lo mecánico; **Sonnet** para implementación o análisis con criterio. Opus no.
- Cada encargo lleva: contexto, objetivo, archivos que SÍ puede tocar, zona prohibida,
  contratos que respeta, criterios de aceptación y cómo se verifica.
- Trabajan en un **worktree propio** (`.claude/worktrees/…`, ignorado por git), con su base
  desechable y su servidor en puertos distintos (base 5436/5437…, servidor 3201/3202…).
- **No hacen commit ni push.** La sesión de desarrollo revisa su diff, lo integra en su rama,
  lo verifica ella misma (tipos, lint, pruebas, la suite que corresponda) y lo commitea. Un
  reporte de «terminado» no sustituye comprobarlo.
- Si un subagente se corta (límite de uso, reinicio), su trabajo se guarda como parche y otro
  lo continúa desde un archivo de progreso.

---

## 5. Reglas que no cambian

1. **`morphiq-prs` es la definición de terminado.**
2. **Ningún archivo nuevo de aplicación supera 300 líneas.**
3. **Cero `any`, cero `@ts-ignore`, cero `catch` vacío** ni `.catch(() => null)` que esconda un
   fallo como si fuera un dato.
4. **`historico/` se lee como especificación. No se copia un solo archivo.**
5. **Los secretos van en `.env`**, que está en `.gitignore`. Nunca en el código, en un reporte
   ni en un commit. El repositorio es público.
6. **Nunca se toca el proyecto `Pasteleria Confetti`** de Supabase (`ivqcxdpqxwjxfohiswqb`).
   Ni para leer.
7. **Nada destructivo sobre negocios reales:** reseteos, siembras y suites destructivas sólo
   sobre una base desechable y con las guardas por ID de `packages/contracts/src/negocios`.
   Que un slug empiece por `demo-` NO lo vuelve de prueba: tres negocios reales lo hacen.
8. **Dominio y DNS los resuelve Miguel.** No se modifican.
9. **No se promueve a producción** fuera de lo autorizado por Miguel. La intervención de recuperación fue solicitada expresamente; no equivale a certificar completa la fase 2.4.

---

## 6. Qué NO hace nadie

- Cambiar migraciones ya aplicadas, falsificar el ledger o corregir la base con SQL suelto.
- `push --force`, rebase de `main` o reescribir historia publicada.
- Cambiar decisiones de `05-DECISIONES.md` sin registrarlo.
- Declarar terminado algo sin su prueba y su mutación, o algo que no se verificó ejecutando.
- Esconder un fallo con `skip`, reintentos, umbrales relajados o expectativas debilitadas.

---

## Histórico · los carriles de septiembre de 2026

Del 8 de septiembre a la fase 2.3 trabajaron dos agentes a la vez: **Claude Code** en el
carril A (venta, dinero, restaurante; migraciones 010–039) y **Codex** en el carril B
(catálogo, inventario, gestión y público; migraciones 040–069), cada uno en su worktree y su
rama, con zonas de propiedad, `docs/reports/PENDIENTES-CRUZADOS.md` para lo que cruzaba de
un carril a otro y un folio de reportes compartido. Ese reparto ya no existe; los rangos de
migraciones y los reportes 001–019 vienen de ahí.
