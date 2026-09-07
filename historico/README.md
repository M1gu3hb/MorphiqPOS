# historico/ — evidencia, no plantilla

Aquí viven las dos fuentes de MorphiqPOS. **No se versionan** (ver `.gitignore`):
describen sistemas que hoy operan con clientes reales, y publicarlos equivale a
repartir el mapa para atacarlos (R34).

## Qué va aquí

| Carpeta | Qué es | Cómo se obtiene |
|---|---|---|
| `historico/tiendita/` | Repo `M1gu3hb/POS-MH-Tiendita` | `git clone https://github.com/M1gu3hb/POS-MH-Tiendita.git historico/tiendita` |
| `historico/restaurante/` | ZIP del POS MH Restaurante (Base44) | Descomprimir `pos-mh completo.zip` del paquete de auditoría de Fase 0 |
| `historico/auditoria-fase-0/` | Paquete de auditoría de Fase 0 | Copia local del paquete `POSMH_FASE_0_CLOUD_COWORK_2026-09-06` |

## Reglas que aplican a esta carpeta

- **No se compila.** Excluida de `tsconfig`, de los workspaces de pnpm y del build.
- **No se lintea.** Excluida de ESLint y del formateador.
- **No se importa.** Ningún archivo del monorepo puede tener un `import` que
  apunte aquí. Lo verifica `lint:capas` en CI (prohibición 5 de
  `04-ARQUITECTURA §2`).
- **No se escanea.** El escaneo de residuos de Base44 (`scan:residuos`) la
  excluye a propósito: aquí *sí* debe aparecer Base44, es la evidencia.
- **No se copian archivos desde aquí** sin pasar por el proceso de clasificación
  de `02-ESTRATEGIA-DE-FUSION §2` (LEVANTAR · PORTAR · REIMPLEMENTAR · DESCARTAR),
  y todo movimiento se registra en `BITACORA.md`.

> R30 — *el ZIP histórico y los repositorios fuente son evidencia, no plantilla.
> Se leen al lado; no se copian archivos. No se conservan defectos por conservar
> comportamiento.*
