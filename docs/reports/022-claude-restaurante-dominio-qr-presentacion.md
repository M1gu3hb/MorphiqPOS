# Reporte 022 — Claude Code — Restaurante: dominio, QR, modo presentación, marca y cargas

- **Rama:** `claude/restaurante-dominio-qr-presentacion` · PR [#15](https://github.com/M1gu3hb/MorphiqPOS/pull/15)
- **Fecha:** 20/21-10-2026 · commits de `M1gu3hb <118588634+M1gu3hb@users.noreply.github.com>`, sin coautorías
- **Subagentes (Sonnet):** caché/esqueletos, tablas/costos, historial de 30 días, marca/voces, imágenes,
  operación entre puestos y concurrencia, cada uno en su worktree. Se integraron los cinco primeros
  después de revisarlos; operación entre puestos y concurrencia quedaron a medias (ver §5).
- **Decisiones:** D-52 a D-55 en `docs/fase-2/05-DECISIONES.md`.

## 1 · Causas encontradas

| Síntoma | Causa | Arreglo |
| --- | --- | --- |
| PIN con 403 en `www.pos-mh-astral-systems.com` | `www` no estaba entre los orígenes de escritura (el apex redirige 308 a `www`) | `APP_URL=https://www…`, `APP_URL_ALTERNAS` con apex y kappa, en Production (D-55) |
| Todo QR con 422 en el dominio | El portal exigía UN negocio del despliegue antes de mirar el token; producción sirve seis | El negocio sale del token, sólo entre los servidos y sus espejos (D-53) |
| QR con mesas retiradas y «No hay mesas» al cargar | Lista de todas las mesas con `initialData: []` | Sólo activas, clave `['mesas',…]`, esqueleto, error con «Reintentar», URL pública |
| Dos restaurantes para elegir | `mh-restaurante` (siembra de septiembre) y la demo donde Miguel trabaja | Visible sólo «Restaurante MH» (`demo-acople-restaurante` renombrado); `mh-restaurante` fuera de `ORGANIZACION`, datos intactos (D-52) |
| Pedido «Mesa 1» en cocina | Comanda de barra `nuevo` de una orden pagada el 25-09 en la Mesa 1 dada de baja | Retirada de la cola (`cancelado`) con auditoría |
| Cortes «$0.00 · 0 tickets» | El puente declaraba derivados los totales de cada caja y no los derivaba | Totales por método, propinas y cuentas desde los pagos de la sesión |
| Mesas encimadas / cargas falsas | Claves de consulta compartidas entre consultas distintas y caché global | Claves por filtro y contexto, caché por sesión, esqueletos (subagente, revisado) |

## 2 · Modo presentación al cliente (D-54)

Contexto espejo interno por restaurante, nunca listado: sembrado con la máquina de la demo, toma del
real su configuración, mesas (con tokens propios) y carta. Gemelos del personal. Encendido, la entrada
con PIN al real abre la sesión en el gemelo (el dueño general, delegada); apagado, las sesiones del
espejo contestan 401 con aviso y cada puesto vuelve al real. Historial de 30 días que termina ayer
(México), por tramos e idempotente por día: ventas, pagos y propinas por método, comandas entregadas,
consumo de inventario por ledger, compras, gastos y cortes cuadrados. Un dueño del restaurante puede
preparar; encender/apagar es del dueño general desbloqueado.

## 3 · Verificación ejecutada

| Qué | Resultado |
| --- | --- |
| Integración (Postgres 18 local desechable) | QR varios negocios + host público 5/5 (5/5 rojas sin el arreglo); espejo 9/9 (historial sembrado, huella del real idéntica); generador 29/29; totales de caja 1/1 |
| Unitarias de lo tocado | navegación, rutas por puesto, reseteo (19/19), puente (135), historial (45), marca y voz |
| Tipos, lint, formato, puertas de estilo/aspecto/adopción/matriz/lecturas | en verde en local |
| Navegador contra build local (morphiq_e2e) | 17/17: dueño general, sin «Demo del acople»/«MH Astral», sin «Modelos de negocio»/«Vistas adicionales», logo oficial, recetas alineadas (27 filas, una columna), encender/apagar presentación, mesera en otro dispositivo cae en la presentación y vuelve al acceso al apagar, portal QR con imágenes, cero errores de consola y cero 5xx |
| Historial local | 30 días, 638 tickets pagados, ventas = pagos = corte por día al centavo, sin comandas vivas |

## 4 · Producción

Ver §6 (se completa al publicar): SHA servido, CI del SHA exacto, verificación en el dominio,
escrituras hechas y su alcance.

## 5 · Pendientes reales

- **Operación entre puestos** (separar mesas D-2, entregado en grupo D-3, supervisor atado D-5,
  cierre de caja con cuentas pendientes C10): el subagente quedó a medias en
  `.claude/worktrees/agent-a4cedbde9cb04d426`, sin commit; no se integró sin revisión. La mesa activa
  sí se abre desde la mesa del mesero (dividir, unir, cambiar).
- **Prueba concurrente de 12 mesas**: sin terminar.
- «Refresco de toronja» sin foto (no hay una genérica con licencia válida).
- El gráfico financiero heredado agrupa por su propia fecha: en 7 días del historial local dio
  $2 menos que la suma de los cortes; la base cuadra al centavo por día.
- Voces neuronales (Chatterbox/MeloTTS): evaluadas en `docs/fase-2/VOCES.md`, no integradas
  (requieren servidor con GPU/CPU propio).
