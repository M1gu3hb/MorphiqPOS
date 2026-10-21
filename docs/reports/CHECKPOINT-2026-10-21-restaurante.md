# Checkpoint · cierre del restaurante para la presentación del 21-10

Rama: `claude/restaurante-dominio-qr-presentacion` (sale de `main` = `cc92c66`). Commits como
`M1gu3hb <118588634+M1gu3hb@users.noreply.github.com>`, sin coautorías. Sin secretos aquí.

## Hecho y comprobado

| Qué | Evidencia |
| --- | --- |
| **Dominio**: `www.pos-mh-astral-systems.com` no estaba entre los orígenes de escritura (403 en el PIN). | Sondeo por HTTP: `Origin: https://www…` → 403, apex/kappa → 401. Variables de producción cambiadas con el CLI de Vercel (surten efecto en el próximo despliegue): `APP_URL=https://www.pos-mh-astral-systems.com`, `APP_URL_ALTERNAS=https://pos-mh-astral-systems.com,https://morphiqpos-kappa.vercel.app`, `ORGANIZACION=demo-acople-restaurante,demo-acople-cafeteria,demo-acople-tienda,demo-acople-ferreteria,demo-acople-estetica` (sin `mh-restaurante`; sus datos siguen intactos). |
| **QR 422**: el portal pedía «el» negocio del despliegue antes de mirar el token. | `negocioDelTokenDeMesa` / `negociosDelPortal` (`packages/app/src/negocio/despliegue.ts`); integración `portal/varios-negocios.integracion.test.ts` 5/5 con host público y seis negocios, **5/5 rojas sin el arreglo**. |
| Administración de QR: sólo mesas activas, clave `['mesas', …]`, esqueleto, URL pública. | `MesasQRTab.jsx`, `qrUtils.js`, `<html data-url-publica>`. |
| **Modo presentación** en un contexto espejo interno. | `packages/app/src/presentacion/*`; integración `espejo.integracion.test.ts` 7/7 (preparar, encender, la mesera entra con su PIN y cae en el espejo, el dueño queda delegado, apagar, reencender sin duplicar, huella del real intacta). |
| Menú sin «Modelos de negocio» ni «Vistas adicionales»; switch en Configuración → Presentación. | D-52; `rutas-por-puesto.test.ts`, `inicio-del-restaurante.test.ts`. |
| Imágenes de 26 platillos (Commons, licencias CC0/CC BY/CC BY-SA). | `apps/web/public/platillos/` con `CREDITOS.md` y `manifiesto.json`. Falta «Refresco de toronja» (no hay foto genérica con licencia válida). |

## Corte por límite de uso (21-10, ~00:30 hora MX)

Los seis subagentes se DETUVIERON a medias por el límite de uso. Su trabajo está en sus worktrees
(`.claude/worktrees/agent-*`, ramas `worktree-agent-*`), en su mayoría SIN commit: revisar cada
diff antes de integrar, nada se integró todavía salvo las imágenes.

| Worktree | Encargo | Estado al cortar |
| --- | --- | --- |
| `agent-ac84d977660b33d42` | Caché, esqueletos, mesas encimadas | 1 commit `wip` + cambios sin commit |
| `agent-a2a2eb40892216220` | Recetas/Platillos/Inventario alineados, costo desconocido, imagen con alternativa | cambios sin commit (Recetas, Productos, Inventario, esqueletos, `ImagenDePlatillo`) |
| `agent-a4cedbde9cb04d426` | Separar mesas, entregado en grupo, supervisor atado, cierre de caja C10, comandas colgadas | cambios sin commit (supervisor, caja/sesion, MesaActiva…) |
| `agent-a62cc4272781e4bcd` | Historial de 30 días `packages/app/src/presentacion/historial.ts` | sin commit; conectar a `preparar` en `/api/presentacion/modo` (devolver `pendientes`) |
| `agent-a402002f1362c7ccf` | Marca Morphiq (estilo inicial), nombres visibles, voces | 4 commits (marca, estilo `morphiq`, voz por dispositivo, `docs/fase-2/VOCES.md`); falta montar `ConfiguracionDeVoz` en Configuración |
| `agent-ab2b222208ee9e9c6` | Prueba concurrente de 12 mesas | apenas empezaba |

Suite unitaria completa de esta rama (con la máquina saturada por los subagentes): 4,296 bien,
13 mal en 7 archivos ajenos a estos cambios (`tomas-inventario`, `traspasos`, `unidades`…);
probablemente tiempos agotados por carga. **Re-correr esos archivos solos antes de integrar.**

Base local de verificación lista: `morphiq_e2e` (restaurante y cafetería sembrados, dueño general de
prueba con PIN 24680 sólo local; `.work/verificacion/dueno-general-local.mjs`). Guion de producción:
`.work/verificacion/produccion.mjs` (línea base del 21-10: `www` → 403 y nombre técnico visible).

## En curso (subagentes Sonnet en worktrees `.claude/worktrees/agent-*`)

- Caché, esqueletos y mesas encimadas (pantallas heredadas).
- Recetas/Platillos/Inventario alineados y costo desconocido.
- Operación entre puestos: separar mesas, entregado en grupo, autorización de supervisor atada,
  cierre de caja con cuentas pendientes en servidor, comandas colgadas.
- Historial simulado de 30 días (`packages/app/src/presentacion/historial.ts`).
- Marca Morphiq (estilo inicial, nombres técnicos) y voces.

## Pendiente para publicar

1. Integrar las ramas de los subagentes (revisar cada diff), conectar el historial a `preparar`.
2. Producción, en este orden: desplegar; renombrar `organizaciones.nombre` de
   `demo-acople-restaurante` a «Restaurante MH»; poner `imagen_url` de los 26 platillos;
   sanear comandas colgadas con la función del subagente.
3. Comprobar en el dominio: PIN de cada puesto, QR desde «Abrir portal» y desde el código,
   encender/apagar presentación.

## Datos de referencia (leídos en producción el 20-10)

- `demo-acople-restaurante` = el restaurante de Miguel (su cuenta general, su distribución de seis
  mesas en Interior, estilo `morphiq`). `mh-restaurante` = siembra de septiembre casi intacta.
- Comanda fantasma de cocina: `73f655b9-…` (barra, «nuevo», orden pagada el 25-09, Mesa 1 vieja).
