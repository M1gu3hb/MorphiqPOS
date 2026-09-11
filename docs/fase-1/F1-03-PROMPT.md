# F1-03 · Prompt de la Fase 1

Pégalo tal cual en una sesión nueva de Claude Code, abierta en `D:\MIS PROYECTOS\Master POS\morphiqpos`.

---

```
Fase 1 de MorphiqPOS. Trabajas SOLO, con AUTONOMÍA TOTAL, y no te detienes
hasta terminar. No me preguntes nada: decide, documenta y sigue.

═══════════════════════════════════════════════════════════════════════
CARGA ESTAS SKILLS ANTES DE NADA
═══════════════════════════════════════════════════════════════════════

/morphiq-prs
/full-output-enforcement
/contratos-por-mutacion
/supabase-vercel-produccion
/vercel-react-best-practices
/vercel-composition-patterns
/vercel-deploy-to-vercel
/impeccable
/web-design-guidelines

═══════════════════════════════════════════════════════════════════════
LEE ESTOS TRES, COMPLETOS. NADA MÁS.
═══════════════════════════════════════════════════════════════════════

  1. docs/fase-1/F1-01-AUDITORIA-DEL-RESTAURANTE.md
  2. docs/fase-1/F1-02-PLAN-DE-RESURRECCION.md    ← tu plan, 60 tareas
  3. docs/fase-1/BITACORA.md

Todo lo anterior está ARCHIVADO en docs/archivo/ y NO se consulta.
Si algo de ahí contradice estos dos documentos, mandan estos dos.

═══════════════════════════════════════════════════════════════════════
QUÉ SALIÓ MAL Y QUÉ VAS A HACER
═══════════════════════════════════════════════════════════════════════

Miguel construyó en 4 meses un POS de restaurante completísimo: mesas,
mesero, cocina con estaciones, propinas, recetas con costeo, productos por
peso y por porción, portal QR para el comensal, cortes, importación por
Excel. Operable de mil maneras. Base44 era su backend y desapareció.

Durante tres días construimos un POS NUEVO desde cero con otro diseño, en
vez de revivir el suyo. Su código estuvo todo el tiempo en historico/
restaurante/ y nadie lo abrió. Eso se corrige ahora.

TU MISIÓN: revivir SU frontend completo sobre el backend nuevo.
Cuando Miguel abra la URL tiene que ver SU sistema. Su diseño, sus
pantallas, sus rutas, sus funciones. El backend nuevo NO lo debe notar.

═══════════════════════════════════════════════════════════════════════
LO QUE CAMBIA RESPECTO A TODO LO ANTERIOR — LÉELO DOS VECES
═══════════════════════════════════════════════════════════════════════

1. REGLAS.md R30 QUEDA DEROGADA. Decía que historico/ es evidencia y no se
   copian archivos. FALSO A PARTIR DE HOY: historico/restaurante/ SE COPIA.
   Es la fuente del frontend. Ese fue el error de fondo de tres días.

2. TEAM.md queda SUSPENDIDO. No hay dos agentes ni zonas. Eres dueño de
   todo el repositorio.

3. El aspecto lo manda SU index.css, no el sistema de tokens que
   construimos. Los tokens se quedan donde ya están y no se aplican a sus
   pantallas.

4. Sus tres paquetes mandan: esencial, operativo, restaurante_pro, con su
   packageConfig.js tal cual. El selector de cinco giros se ELIMINA.

5. El enrolamiento de terminal se ELIMINA. Vuelve su login: tarjetas de
   usuario y PIN de 4 dígitos. La ÚNICA diferencia es que el PIN se valida
   en el servidor con Argon2id. Eso no se negocia: era su agujero P0-01.

6. La regla de 300 líneas aplica al código NUEVO. Los archivos portados se
   parten extrayendo componentes SIN CAMBIAR una clase CSS ni un texto.

7. Cero any y allowJs:false siguen para packages/*. Su código va a
   apps/web/heredado/ CON SU PROPIO tsconfig permisivo. Tipar 244 archivos
   antes de que algo funcione es lo que te haría atorarte.

═══════════════════════════════════════════════════════════════════════
LAS SIETE TRAMPAS — están en F1-02 §8 con su salida. Resumen:
═══════════════════════════════════════════════════════════════════════

T1  verify:residuos va a fallar en cuanto copies el primer archivo (su
    código tiene 359 referencias a base44). Portea EN LOTES PEQUEÑOS: cada
    lote quita sus referencias en el MISMO commit y deja el escaneo verde.

T2  Su código usa React Router y la app es Next. Crea heredado/enrutado.ts
    que reexporta los equivalentes de Next CON LOS NOMBRES de React Router.
    Sus componentes no cambian una línea. Su App.jsx no se porta: sus rutas
    se vuelven carpetas de app/ con las MISMAS URLs.

T3  El alias @/ debe resolver a heredado/. Y @/api/base44Client se
    sustituye por heredado/api/cliente.ts con la misma firma.

T4  DescuentoInventarioVenta, IntegrationSyncLog y User no tienen tabla.
    El primero es una VISTA sobre movimientos_stock. El segundo, tabla
    simple. El tercero desaparece: el rol lo da empleos.

T5  comando() exige clave de idempotencia de 8+ caracteres. api.comandos.*
    la genera y la conserva mientras el diálogo esté abierto.

T6  El resolvedor de sesión exige terminal enrolada. Si quitas el
    enrolamiento sin tocarlo, NADIE ENTRA. El ámbito sale del empleo;
    terminal_id pasa a ser opcional y se llena solo.

T7  Instala lo que SU código importa de verdad, no lo que el proyecto nuevo
    eligió. Sus dependencias muertas (three, react-leaflet, react-quill,
    @stripe/*) NO se instalan.

═══════════════════════════════════════════════════════════════════════
LA PIEZA CLAVE: EL PUENTE
═══════════════════════════════════════════════════════════════════════

No reescribas las 359 llamadas. Construye un puente (F1-02 §3):

  LECTURAS  → un endpoint genérico POST /api/datos/consultar que traduce
              entre sus nombres (Venta, DetalleVenta, Mesa...) y los del
              backend (ordenes, orden_lineas, mesas...). Con ámbito de
              sesión SIEMPRE, lista blanca de entidades y de campos, y
              límite de filas.
              La lista blanca de campos cierra una fuga real: hoy el portal
              QR expone presentacion_password y los IDs de Google a
              cualquiera que escanee.

  ESCRITURAS→ las 14 operaciones transaccionales (F1-01 §6) son comandos.
              Esas sí se reescriben en el frontend. Son ~15 sitios.

  La traducción vive en UN archivo, packages/app/src/puente/mapa.ts, y cada
  entidad lleva una prueba de ida y vuelta. Sin esa prueba, un campo mal
  mapeado rompe una pantalla en silencio.

═══════════════════════════════════════════════════════════════════════
LO QUE NO PUEDES ROMPER — F1-01 §3, las doce reglas
═══════════════════════════════════════════════════════════════════════

Las cinco que más se rompen sin querer:

· Venta.total es la venta SIN propina. Nunca la infles.
· Las propinas no entran en ventas, utilidad, costos ni margen.
· El desglose de propinas por método es EXACTO, nunca proporcional.
· El inventario se descuenta SÓLO al cobrar. Nunca al enviar a cocina ni
  al pedir desde el QR.
· Cocina nunca ve costos, márgenes ni gramajes.

Y respeta sus defensas: ventaTotales.js rescatando totales en cero, el
latch anti-parpadeo, detectarHuerfano con sus 4 reglas, los guards
if (!cfg?.id) return. Son cicatrices de bugs reales de producción. El
backend nuevo debe hacerlas innecesarias, no borrarlas a ciegas.

═══════════════════════════════════════════════════════════════════════
ORDEN DE TRABAJO — 61 tareas, once etapas
═══════════════════════════════════════════════════════════════════════

  E0  Preparación                 5    merge, .env, limpieza
  E1  Que se vea suyo             5  ← su CSS, su layout, su marca, su tablero
  E2  Que entre como antes        3  ← su login + PIN en servidor
  E3  El puente                   6    tablas faltantes + traducción
  E4  Catálogo y operación        8    productos, inventario, recetas, compras
  E5  Venta de mostrador          4
  E6  Restaurante                 9  ← mesas, mesero, cocina, caja
  E7  Portal QR                   4
  E8  Registros y reportes        3
  E9  Lo nuevo                    4    escáner + extras con precio
  E10 Configuración y paquetes    4
  E11 Endurecimiento y despliegue 6    Vercel + su dominio

El detalle tarea por tarea está en F1-02 §5.

AVÍSAME AL TERMINAR E1 Y E2, aunque no hayas hecho nada más. Ahí Miguel ya
puede abrir la URL, reconocer su sistema y entrar con su PIN. Es lo que
lleva tres días esperando.

Después de eso NO te detengas hasta E11.

═══════════════════════════════════════════════════════════════════════
DECIDES TÚ, SIN PREGUNTAR
═══════════════════════════════════════════════════════════════════════

Librerías y versiones · nombres de archivos y funciones · cómo partir un
componente · el orden dentro de una etapa si encuentras una dependencia que
el plan no vio · cómo escribir cada prueba · qué mutación usar · bugs que
encuentres, incluidos los míos en la documentación · cualquier cosa
reversible.

Si dudas entre preguntar y decidir: DECIDE y escríbelo en la bitácora.
No hay limitantes. Tienes permiso para todo: Supabase CLI, Vercel, GitHub,
credenciales. Miguel lo autorizó expresamente.

Lo único que NO tocas: el proyecto Pasteleria Confetti de Supabase
(ivqcxdpqxwjxfohiswqb). Ni para leer.

═══════════════════════════════════════════════════════════════════════
NO SE NEGOCIA
═══════════════════════════════════════════════════════════════════════

· Precios y totales SIEMPRE en el servidor. El endpoint no acepta importes
  del cliente.
· Cobro, caja, stock, mesa y pedido: transaccionales e idempotentes.
· El PIN nunca sale de la base.
· Autorización en el servidor, por sesión. NUNCA por un campo del body —
  sus 5 funciones de mantenimiento hacen eso hoy y cualquiera puede borrar
  el negocio entero mandando {"rol":"administrador"}. Es el peor defecto
  del sistema y se corrige en E10-4.
· Stock: ledger inmutable, decremento atómico, falla en vez de silenciar.
· Dinero en bigint de centavos.
· Los 24 catch(()=>{}) de Caja, POS y Mesero desaparecen. Los otros 92
  (sonido, voz, localStorage) se quedan: son degradación legítima.
· NADA SE DECLARA TERMINADO SIN HABERLO EJECUTADO Y ABIERTO EN EL
  NAVEGADOR. Tres sesiones se cerraron sin que una consulta tocara Postgres.

═══════════════════════════════════════════════════════════════════════
CÓMO SE SABE QUE UNA PANTALLA ESTÁ TERMINADA
═══════════════════════════════════════════════════════════════════════

Las tres, obligatorias:
  1. Se abre en el navegador con datos reales de la base.
  2. SE VE IGUAL QUE LA ORIGINAL. Ábrela al lado de la del ZIP y compara.
  3. Sus escrituras pasan por comandos transaccionales.

Si falla cualquiera, no está terminada — aunque compile y aunque las
pruebas pasen.

═══════════════════════════════════════════════════════════════════════
AL TERMINAR
═══════════════════════════════════════════════════════════════════════

Commits pequeños con identificador: "E6-4: enviarPedido transaccional".
Bitácora al cerrar cada etapa. Reporte de una página al final, con "Lo que
NO hice" completo. Todo subido, commits a nombre de M1gu3hb.

Y dime en una línea cómo abrir la aplicación para probarla.

Arranca por E0-1: archivar el plan viejo. Después E1: su diseño.
```
