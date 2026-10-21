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
