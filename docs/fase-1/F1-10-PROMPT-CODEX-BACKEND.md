# F1-10 · Prompt para Codex — Blindaje del backend

Fecha: 10 de septiembre de 2026
Alcance: **sólo backend.** Nada de UI, features ni diseño.
Ejecuta: **Codex.** Claude Code hará el QA funcional después.

---

```
Eres el ingeniero de seguridad y solidez de backend de MorphiqPOS. Trabajas
SOLO y con autonomía total. No preguntes: decide, arregla, documenta, sigue.

Este prompt es largo a propósito. Trae la auditoría ya hecha, con archivo y
línea, para que no gastes tu sesión averiguando qué está mal. Léelo entero
antes de tocar nada.

╔══════════════════════════════════════════════════════════════════════╗
║ 0 · QUÉ ES ESTO Y DÓNDE ESTÁS                                        ║
╚══════════════════════════════════════════════════════════════════════╝

MorphiqPOS es el punto de venta de Miguel (marca Morphiq, México). Nació
como un POS de restaurante que él construyó en 4 meses sobre Base44. Base44
era el backend y desapareció. Se reconstruyó el backend desde cero y se
portó su frontend completo (244 archivos) encima.

Estado hoy:
· Next.js 16 App Router · TypeScript estricto en packages/ · Kysely + pg
· Postgres 17.6 en Supabase, proyecto wyqmzhliurwyxuyxznpb
· 17 migraciones en disco, 45 tablas + 3 vistas
· 65 comandos transaccionales · 78 rutas de API
· 244 archivos de frontend portados en apps/web/heredado/ (NO los toques)
· Desplegado en Vercel, proyecto morphiqpos
· Repositorio: github.com/M1gu3hb/MorphiqPOS

TU TRABAJO: blindar el backend. Nada más. No toques pantallas, no agregues
features, no rediseñes nada. Miguel va a meter más features después, así
que NO sobre-endurezcas: arregla lo que está mal, no inventes capas.

Claude Code hará el QA funcional después de ti. Tú haces QA de backend:
intentas romper tu propio backend y lo blindas.

╔══════════════════════════════════════════════════════════════════════╗
║ 1 · EL ESTÁNDAR DE ENTREGA — morphiq-prs                             ║
╚══════════════════════════════════════════════════════════════════════╝

Miguel tiene un estándar propio llamado morphiq-prs ("Zero Vibe-Code Gate").
TÚ NO LO TIENES como herramienta, así que te lo transcribo abajo, sólo las
secciones que aplican a backend. Esto NO es una sugerencia: es la definición
de terminado.

Severidades:
  BLOCKER   — no se entrega. Se arregla sí o sí.
  CRITICAL  — se resuelve antes de producción. Sólo queda pendiente con
              razón escrita.
  RECOMMENDED — calidad profesional. Se cumple salvo desproporción clara.

Mapa de superficies de ESTE proyecto (ya contestado):
  S2 login · S3 panel admin · S4 formularios · S5 backend propio
  S7 Supabase · S8 Vercel · S9 uploads · S10 maneja dinero
  S11 datos personales · S14 DB propia · S15 sistema crítico diario
  (S15 y S10 elevan el rigor de todo lo demás)

──────────────────────────────────────────────────────────────────────
§07 · ARQUITECTURA DE SEGURIDAD — CRITICAL
──────────────────────────────────────────────────────────────────────
· Inventario de datos sensibles: PII, credenciales, pagos, tokens, secretos.
· Roles y permisos definidos ANTES de implementar.
· Acciones de alto impacto identificadas: cobros, borrados, cambios de rol,
  exportaciones, uploads.
· Mínimo privilegio en DB, servicios, API keys, storage, CI/CD.
· Fronteras cliente/servidor explícitas: EL NAVEGADOR SIEMPRE ES NO CONFIABLE.
· Las decisiones de seguridad NO dependen de campos hidden, disabled,
  route guards de frontend ni IDs enviados por el cliente.
· Operaciones multi-paso fallan cerrado; si queda estado parcial, se revierte.

──────────────────────────────────────────────────────────────────────
§08 · CABECERAS Y CROSS-ORIGIN
──────────────────────────────────────────────────────────────────────
CRITICAL · CSP definida y probada; evitar unsafe-inline/unsafe-eval.
CRITICAL · frame-ancestors y/o X-Frame-Options.
CRITICAL · X-Content-Type-Options: nosniff.
CRITICAL · Referrer-Policy definida.
CRITICAL · TLS moderno, sin mixed content.
CRITICAL · Respuestas autenticadas con cache policy apropiada; no-store
           cuando no debe persistir.
CRITICAL · CORS sólo a orígenes necesarios; no reflejar Origin sin validar.
BLOCKER  · NUNCA Access-Control-Allow-Origin: * con credenciales.
CRITICAL · Cookies de sesión con Secure, HttpOnly, SameSite explícito.
RECOMMENDED · Prefijo __Host- cuando la arquitectura lo permita.
CONDITIONAL · HSTS tras verificar HTTPS estable.

──────────────────────────────────────────────────────────────────────
§09 · FORMULARIOS Y LÍMITES DE TASA
──────────────────────────────────────────────────────────────────────
BLOCKER  · Validación server-side de TODO input. La del cliente es UX.
CRITICAL · Límites de longitud, tipo, rango y cantidad para strings,
           arrays, JSON, paginación y CUERPOS DE REQUEST.
CRITICAL · Rate limits en login, reset, contacto, uploads, búsqueda y
           endpoints caros.
CRITICAL · Rate limit por IP + usuario/token cuando sea posible.
CRITICAL · Evitar doble submit; reintentos seguros.
CRITICAL · Los errores no filtran stack traces, SQL, rutas internas ni keys.
RECOMMENDED · Bloqueo temporal o challenge progresivo ante abuso, evitando
           lockouts explotables para DoS.

──────────────────────────────────────────────────────────────────────
§10 · AUTENTICACIÓN Y SESIONES
──────────────────────────────────────────────────────────────────────
BLOCKER  · Autorización server-side en CADA recurso y acción. Autenticar
           no es autorizar.
CRITICAL · Mensajes de login que no permiten enumerar usuarios.
CRITICAL · Throttling de login y defensa contra credential stuffing.
CRITICAL · Tokens de reset aleatorios, de un solo uso, con expiración.
CRITICAL · Cambio de credencial invalida o permite invalidar sesiones.
CRITICAL · EL LOGOUT REVOCA REALMENTE LA SESIÓN.
CRITICAL · Sesiones con expiración razonable; reautenticación en acciones
           de alto riesgo.
CRITICAL · Cero session IDs, refresh tokens o credenciales en
           localStorage/sessionStorage.
CONDITIONAL · Hashing adaptativo (Argon2id) con salt y parámetros actuales.

§10A · CSRF
BLOCKER  · Si la auth usa cookies, TODA operación que cambia estado tiene
           defensa CSRF server-side y validación de origen. SameSite es
           defensa en profundidad, no la única barrera.
CRITICAL · GET/HEAD/OPTIONS no cambian estado. Tokens CSRF no en URL.

──────────────────────────────────────────────────────────────────────
§11 · APIs Y AUTORIZACIÓN POR OBJETO
──────────────────────────────────────────────────────────────────────
BLOCKER  · Cada endpoint privado valida identidad Y autorización server-side.
BLOCKER  · BOLA/IDOR probado: el usuario A no puede leer, modificar ni
           borrar objetos de B cambiando IDs.
BLOCKER  · Funciones de admin no invocables por usuarios normales aunque
           conozcan la URL.
CRITICAL · Mass assignment evitado: allowlist explícita de campos editables.
CRITICAL · Las respuestas no incluyen columnas privadas "porque ya venían
           en el objeto".
CRITICAL · Métodos HTTP y content-types restringidos a lo necesario.
CRITICAL · Paginación con máximos; ninguna consulta devuelve colecciones
           ilimitadas.
CRITICAL · Timeouts y límites en llamadas salientes; reintentos con backoff.
CRITICAL · Webhooks entrantes verifican firma; idempotentes o deduplicados.
CRITICAL · Los errores inesperados fallan cerrado.

──────────────────────────────────────────────────────────────────────
§12 · BASE DE DATOS
──────────────────────────────────────────────────────────────────────
BLOCKER  · Constraints reales: NOT NULL, UNIQUE, FOREIGN KEY, CHECK.
CRITICAL · Transacciones en operaciones multi-tabla atómicas.
CRITICAL · Índices para consultas frecuentes y claves foráneas críticas.
CRITICAL · Migraciones versionadas y reproducibles. NUNCA editar producción
           a mano sin registro.
CRITICAL · Datos de staging/test sin PII real.
CRITICAL · Backups automáticos; restauración posible y documentada.
CRITICAL · Conexiones cifradas; credenciales fuera del frontend; rol de
           aplicación con mínimo privilegio.
RECOMMENDED · Prueba de restore periódica.
RECOMMENDED · Operaciones concurrentes consideradas: doble clic, dos
           usuarios editando, stock simultáneo, reintentos de red.

§12A · EFICIENCIA DE CONSULTAS
BLOCKER  · Cero consultas N+1.
BLOCKER  · Toda colección potencialmente grande con paginación real.
CRITICAL · Índices en columnas de WHERE, JOIN y ORDER BY; verificado con
           EXPLAIN que las consultas de más tráfico no hacen full scan.
CRITICAL · Pool de conexiones dimensionado al límite del proveedor.
CRITICAL · Sólo las columnas necesarias; cero SELECT * en producción.

──────────────────────────────────────────────────────────────────────
§13 · SUPABASE — el que más te importa hoy
──────────────────────────────────────────────────────────────────────
BLOCKER  · RLS habilitado en TODA tabla expuesta a APIs o clientes;
           políticas revisadas a mano.
BLOCKER  · Prueba cruzada anon / usuario A / usuario B / admin: A jamás
           accede a registros de B.
BLOCKER  · Buckets y políticas de Storage con el mismo rigor que las tablas;
           buckets privados cuando el contenido no es público.
BLOCKER  · service_role JAMÁS en navegador, bundle, localStorage, source map
           ni repositorio.
CRITICAL · Security Advisor revisado sin hallazgos críticos ignorados.
CRITICAL · Performance Advisor revisado.
CRITICAL · SSL Enforcement habilitado; Network Restrictions evaluadas.
CRITICAL · MFA en la cuenta administrativa.
CRITICAL · Backups y PITR evaluados según criticidad.

──────────────────────────────────────────────────────────────────────
§19 · LOGS Y OBSERVABILIDAD
──────────────────────────────────────────────────────────────────────
CRITICAL · Errores server-side con contexto útil y correlation ID.
CRITICAL · Login failures, denegaciones y cambios administrativos generan
           eventos auditables.
CRITICAL · Los logs NO guardan passwords, tokens, cookies completas ni PII
           innecesaria.
CRITICAL · Alertas de picos de 5xx, fallos de auth, abuso de rate limit.
CRITICAL · Las excepciones no muestran stack traces al usuario.
CRITICAL · Los errores en transacciones críticas hacen rollback.
RECOMMENDED · Runbook: qué revisar, cómo hacer rollback, cómo restaurar.

──────────────────────────────────────────────────────────────────────
§23A · RTO/RPO Y RESTAURACIÓN
──────────────────────────────────────────────────────────────────────
CRITICAL · RTO y RPO definidos según impacto de negocio.
CRITICAL · Pruebas de restore que miden tiempo real y punto restaurado.
CRITICAL · El rollback de aplicación considera compatibilidad con las
           migraciones de DB.
CRITICAL · Backups y credenciales de recuperación no dependen del mismo
           punto único de fallo que producción.

╔══════════════════════════════════════════════════════════════════════╗
║ 2 · LOS 30 HALLAZGOS — ordenados del más débil al más fuerte          ║
╚══════════════════════════════════════════════════════════════════════╝

Cada uno con archivo, línea, evidencia y qué hacer. Los arreglas EN ESTE
ORDEN. Si uno resulta ser falso positivo al leerlo, lo dices en el reporte
con la razón y sigues.

━━━ BLOCKERS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【B-0】 RLS APAGADO EN 8 TABLAS DE LA BASE VIVA
  VERIFICADO CONTRA wyqmzhliurwyxuyxznpb, no es análisis estático.
  Sin RLS: zonas, mesas, estaciones_preparacion, comandas, comanda_items,
  solicitudes_qr, menu_qr_secciones, proveedores.

  La migración ESTÁ BIEN. 045_restaurante.sql:820-865 habilita RLS + FORCE
  y revoca a anon/authenticated sobre esas 16 tablas y la vista. El bloque
  nunca se ejecutó porque las migraciones se aplicaron A MANO por la consola
  de Supabase, y el `do $$ ... end $$;` del final de un archivo de 900
  líneas se perdió al pegar por partes.

  Agravante: _migraciones registra 12 y el disco tiene 17. Las 045–049 se
  aplicaron fuera del ejecutor o no se registraron.

  Qué expone: con RLS apagado y los grants por omisión de Supabase, PostgREST
  publica esas tablas a cualquiera con la anon key, que es pública por
  definición. mesas y comandas llevan pedidos vivos con nombre de cliente y
  notas ("alergia al cacahuate"). proveedores lleva datos de proveedores.
  Mitigante: la app NO usa PostgREST ni la anon key (cero createClient, cero
  NEXT_PUBLIC_SUPABASE_*). Es defensa en profundidad perdida, no fuga activa.
  Pero si el Data API del proyecto está activo —lo está por omisión— la
  puerta está abierta.

  QUÉ HACER:
  1. Migración NUEVA 050_rls_faltante.sql. NUNCA edites 045: el ejecutor
     valida por hash y reventaría.
  2. Que sea idempotente: `alter table ... enable row level security` es
     seguro de repetir. Cúbrelas TODAS, no sólo las 8: verifica las 45.
  3. Aplícala CON EL EJECUTOR (pnpm db:migrate), no a mano.
  4. Reconcilia _migraciones: registra 045–049 con su hash real.
  5. Documenta en el runbook que aplicar a mano está prohibido.

【B-1】 configuracion.guardar REEMPLAZA el documento entero y deja a un
       administrador cambiar organizaciones.paquete
  packages/app/src/configuracion/configuracion.ts:134,141,151-182

  roles: ['dueno','administrador'] · hace .set({nombre, paquete}) sobre
  organizaciones · luego .set({valores, version}) con valores = {contacto,
  apariencia, impuesto} — es un REPLACE, no un merge. Destruye
  presentacion_password_hash, los 14 portal_qr_*, paquete_modo, propina_*,
  asignacion_mesas_activa.
  Y comando.ts:108 gatea TODOS los comandos por repoComandos.leerPaquete →
  organizaciones.paquete (packages/data/src/repos/comandos.ts:19-28), justo
  la columna que este comando deja escribir a un admin.

  QUÉ HACER: quita `paquete` de entradaGuardarConfiguracion. Convierte la
  escritura en merge parcial sobre las claves que este comando posee. O
  unifica los dos escritores en guardarConfiguracionParcial.

【B-2】 configuracion.cambiar_paquete escribe donde nadie lee
  packages/app/src/puente/presentacion.ts:189-212
  vs packages/data/src/repos/comandos.ts:19-28

  cambiarPaquete hace guardarConfiguracionParcial(..., {paquete_modo}) → al
  JSON. El gate real es organizaciones.paquete. Resultado: el comando
  protegido con roles:['dueno'] NO cambia el paquete efectivo, y el comando
  con roles:['dueno','administrador'] (B-1) SÍ. El guard de dueño es teatro.

  QUÉ HACER: decide UNA fuente de verdad del paquete. Si es
  organizaciones.paquete, cambiar_paquete debe escribir ahí y ser el único.

【B-3】 EL LOGOUT NO REVOCA NADA
  apps/web/app/api/auth/salir/route.ts:13-23
  packages/app/src/sesion/token.ts:20
  packages/app/src/identidad/entrar.ts:118

  POST /api/auth/salir sólo devuelve Set-Cookie con Max-Age=0. CargaSesion.sid
  se documenta como "identificador de esta sesión, para poder revocarla", se
  genera con nuevoIdDeSesion() y NUNCA se persiste ni se consulta (grep de
  `sid` en packages/: 6 coincidencias, todas en el token y sus pruebas).
  Una cookie copiada sigue valiendo hasta 8 h aunque el usuario cierre sesión.

  QUÉ HACER: tabla `sesiones` (o lista de revocación) con sid, organizacion_id,
  empleo_id, creada_en, revocada_en. resolverSesion la consulta. salir marca
  el sid revocado. Revoca también al cambiar de rol y al dar de baja un
  empleo. Purga por antigüedad.

【B-4】 EL PUENTE DE LECTURA NO TIENE AUTORIZACIÓN POR ENTIDAD
  packages/app/src/puente/mapa.ts:74-1285 — CERO de 24 entidades declaran
  rolesLectura. La comprobación de consultar.ts:120-123 es CÓDIGO MUERTO.

  Cualquier rol con sesión —cocina, mesero— puede hacer
  POST /api/datos/consultar {"entidad":"Venta"} y leer total, subtotal,
  descuentos. Y además:
    CorteCaja.efectivo_contado ......... mapa.ts:703
    GastoOperativo.monto ............... mapa.ts:1150
    CompraInsumo.total_compra .......... mapa.ts:1066
    LiquidacionPropina.total_liquidado . mapa.ts:1236
    Proveedor entero ................... mapa.ts:1119-1134
    Mesa.qr_token ...................... mapa.ts:789

  QUÉ HACER: declara rolesLectura por entidad en todo lo de dinero,
  proveedores y tokens. Y añade una prueba de contrato que FALLE si una
  entidad nueva no lo declara — si no, esto se vuelve a abrir solo.

━━━ CRITICAL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【C-5】 EL TOKEN DEL QR ES DERIVABLE, NO ROTABLE Y LO GENERA EL CLIENTE
  apps/web/heredado/utils/qrUtils.js:9-17
  packages/app/src/puente/mapa.ts:789
  packages/data/src/migraciones/sql/045_restaurante.sql:263

  'm' + hash31(mesaId).toString(36) + mesaId.slice(-4) — hash NO criptográfico,
  determinista sobre mesas.id, por tanto IRROTABLE. El valor lo escribe el
  NAVEGADOR vía Mesa.update({qr_token}) porque mapa.ts:789 no marca el campo
  escribible:false. La columna es text SIN índice único.
  Es la ÚNICA credencial de una API pública que escribe en cocina y en la
  cuenta del cliente.

  QUÉ HACER: genera el token en el SERVIDOR con
  randomBytes(24).toString('base64url'). Marca escribible:false en el mapa.
  Migración: create unique index mesas_qr_token_unico on mesas
  (organizacion_id, qr_token) where qr_token is not null.
  Comando restaurante.rotar_qr para poder rotarlo.
  OJO: qrUtils.js está en heredado/ — lo tocas SÓLO para que llame al comando
  nuevo en vez de derivar el token. No cambies nada más de ese archivo.

【C-6】 FUGA DE COSTOS POR LA PUERTA DE ATRÁS
  packages/app/src/puente/mapa.ts:631-636 vs :1306-1310

  MovimientoInventario.costo_unitario_en_momento tiene
  rolesLectura: VE_COSTOS_DE_INSUMO. Pero
  DESCUENTO_INVENTARIO_VENTA.costo_unitario_snapshot apunta a la MISMA tabla
  movimientos_stock y la MISMA columna costo_unitario_centavos, SIN
  rolesLectura. Un rol cocina pide {"entidad":"DescuentoInventarioVenta"} y
  se lleva los costos. Rompe la regla 12 que mapa.ts:48-61 dice aplicar
  ("cocina nunca ve costos ni márgenes").

  QUÉ HACER: añade rolesLectura: [...VE_COSTOS_DE_INSUMO] en :1306. Y escribe
  una prueba que compare campos que mapean la misma columna y exija la misma
  restricción.

【C-7】 /api/catalogo/productos DEVUELVE EL COSTO A CUALQUIER ROL
  packages/app/src/catalogo/consulta.ts:23
  packages/data/src/repos/catalogo.ts:46
  apps/web/app/api/catalogo/productos/route.ts:24-26

  ProductoResumen.costoUnitarioCentavos sale siempre. Un mesero llama al
  endpoint y obtiene el costo que el puente le oculta.

【C-8】 responderConsulta NO PUEDE COMPROBAR ROL — ninguna GET tiene
       autorización por rol
  apps/web/src/servidor/http.ts:148-173

  La firma es responderConsulta(consulta, paquetes?). No hay parámetro de
  roles. Afecta a 8 rutas: /api/identidad/accesos, /api/catalogo/configuracion,
  /api/catalogo/productos, /api/catalogo/inicio, /api/inventario/resumen,
  /api/inventario/recetas, /api/catalogo/categorias, /api/catalogo/sesion.

  QUÉ HACER: añade roles?: readonly Rol[] y exígelo en toda GET que no sea
  trivialmente pública.

【C-9】 /api/identidad/accesos EXPONE ESTADO DE BLOQUEO A CUALQUIER ROL
  apps/web/app/api/identidad/accesos/route.ts:14-22
  packages/app/src/identidad/consultas.ts:16-24,51-58

  Devuelve empleoId, nombre, rol, tienePin, bloqueadaHasta, intentosFallidos
  y el inventario de terminales. Sin hash —bien— pero un rol cocina ve quién
  está a un intento de bloquearse.
  QUÉ HACER: restringir a ['dueno','administrador'].

【C-10】 NO HAY LÍMITE DE TAMAÑO DE CUERPO EN NINGUNA RUTA
  Grep de sizeLimit|bodyParser|content-length en el repo: 0 coincidencias.

  ejecutarComandoHttp (apps/web/src/servidor/http.ts:76), conSesion (:113),
  rutaDeComando (packages/app/src/http/ruta.ts:115) y manejadorPublico
  (packages/app/src/portal/http.ts:139) hacen await peticion.json() sin
  comprobar content-length. Un POST de 50 MB se parsea entero.

  QUÉ HACER: una guarda compartida que lea content-length y rechace con 413
  antes de json(). 256 KB es razonable. Aplícala en las CUATRO vías.

【C-11】 guardarConfiguracionParcial ACEPTA CLAVES ARBITRARIAS SIN LÍMITE
  packages/app/src/puente/configuracion.ts:203-218

  for (const [clave, valor] of Object.entries(parche)) { resto[clave] = valor }
  Sin lista blanca, sin tope de claves, sin tope de longitud, sin profundidad.
  Sólo se bloquean NUNCA_SALEN (:95) y SOLO_POR_COMANDO (:108). Un gerente
  escribe megabytes en configuracion.valores. Combinado con C-10 es peor.
  nombre_negocio tampoco tiene tope antes del update (:210-216).

  QUÉ HACER: lista blanca de claves permitidas + tope de bytes del documento
  serializado.

【C-12】 EL CONTRATO ESQUEMA-vs-BASE NO ESTÁ EN pnpm verify Y SÓLO COMPARA
        NOMBRES
  scripts/verificar-esquema-aplicado.mjs · package.json:42

  No tiene alias en scripts y no está en la cadena de verify. Compara SÓLO
  nombres de tabla y columna. No mira tipos, not null, default, check, FK,
  índices, RLS ni grants. Y exige que alguien le pase a mano un JSON del
  information_schema.
  Esto ya falló antes: al aplicar 003 a mano, ordenes quedó con
  impuesto_centavos en vez de impuestos_centavos, dos columnas inventadas y
  CINCO faltantes, y el ledger decía que todo estaba bien.

【C-13】 NO EXISTE NINGÚN SCRIPT QUE VERIFIQUE RLS, GRANTS O ÍNDICES
  Grep de rowsecurity|relrowsecurity|pg_policies|has_table_privilege: 0.

  QUÉ HACER: script verify:rls que consulte pg_class.relrowsecurity,
  relforcerowsecurity, has_table_privilege('anon', tabla, 'SELECT') y la
  existencia de los índices únicos de 046. Métrelo en pnpm verify.
  ESTE ES EL QUE IMPIDE QUE B-0 VUELVA A PASAR.

【C-14】 limite_tasa CRECE PARA SIEMPRE
  packages/data/src/repos/limite.ts:76-82

  Grep de limpiarVencidos: UNA coincidencia, su propia definición. El
  comentario dice "la llama el propio limitador de vez en cuando" — no lo
  hace. Con el portal contando 300 consultas/min por token, la tabla acumula
  una fila por clave HMAC distinta.
  QUÉ HACER: llamarla probabilísticamente desde permitir/permitirPortal
  (1 de cada N), o un job.

━━━ RECOMMENDED ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【R-15】 comandos_ejecutados tampoco tiene purga.
        010_comandos_ejecutados.sql:72 crea el índice "para la purga por
        antigüedad" y no hay ningún borrado. Job de retención de 90 días.

【R-16】 conSesion no aplica la defensa CSRF que sí aplican las otras dos vías.
        apps/web/src/servidor/http.ts:105-119 vs :66. Afecta a
        /api/datos/consultar. Es lectura, así que hoy no explota, pero rompe
        la uniformidad.

【R-17】 La comprobación de origen usa new URL(peticion.url).origin, derivado
        del Host. apps/web/src/servidor/seguridad-http.ts:1-8 y
        packages/app/src/portal/http.ts:93-100. Compara contra
        validarEntorno(process.env).APP_URL, que ya está validado.

【R-18】 La clave de idempotencia del portal NO INCLUYE LA MESA.
        packages/app/src/portal/comando-publico.ts:129-155 e
        idempotencia.ts:56-66. El único es (organizacion_id, comando,
        idempotency_key) y la huella tampoco lleva mesaId. Un comensal que
        reutilice la clave de otra mesa con la misma entrada ({"tipo":"ayuda"})
        recibe la respuesta de aquélla y suprime la suya.
        Incluye tokenMesa o mesaId en la huella y en la clave lógica.

【R-19】 configuracion.desbloquear_presentacion sin límite de tasa y cuesta un
        Argon2id por intento. packages/app/src/puente/presentacion.ts:68-117.
        LIMITES (http/limite.ts:36-47) sólo cubre entrar, enrolar y
        mantenimiento. Añade una ventana.

【R-20】 GET /api/auth/empleados es anónimo y SIN límite de tasa.
        apps/web/app/api/auth/empleados/route.ts:24-48. Enumera nombre, rol y
        empleoId (UUID) de hasta 50 empleados. El empleoId es el primer factor
        de /api/auth/entrar. La decisión de que sea anónimo es defendible; el
        hueco es que no gasta cuota. Aplica permitir('entrar', ...) también aquí.

【R-21】 Falta Strict-Transport-Security. apps/web/next.config.mjs:29-48. Las
        otras cinco cabeceras están y verificar-cabeceras.mjs las comprueba en
        vivo. Añade
        {key:'Strict-Transport-Security', value:'max-age=63072000; includeSubDomains; preload'}
        y métela en EXIGIDAS.

【R-22】 El correlation id del middleware no lo consume nadie.
        apps/web/middleware.ts:21-42. rutaDeComando lee x-correlation-id y si
        falta genera otro. El id de la respuesta y el de auditoria son
        distintos. Lee x-morphiqpos-correlacion como fallback en las tres capas.

【R-23】 Logs no estructurados y sin alertas. Siete sitios con
        console.error('[modulo] texto', error). Sin JSON, sin nivel, sin
        organizacionId, sin correlationId parseable. Un registrar() que emita
        JSON con {nivel, modulo, correlationId, organizacionId, mensaje}.

【R-24】 No hay restauración ensayada ni RTO/RPO. docs/RUNBOOK.md:131-141 lo
        admite. Ensaya una restauración a un proyecto de prueba, MIDE el
        tiempo, y escribe el runbook con números reales.

【R-25】 ilike con los metacaracteres del usuario sin escapar.
        packages/data/src/repos/catalogo.ts:60-70. El valor va parametrizado
        (no hay inyección) pero % y _ del usuario se interpretan. Con 100
        caracteres de % el escaneo se dispara. Escapa %, _ y \ antes del patrón.

【R-26】 IntegrationSyncLog es escribible directamente con un campo JSON libre.
        packages/app/src/puente/mapa.ts:1266-1284. escritura:'directa',
        payload_snapshot sin tope. Márcala escritura:'lectura' mientras no haya
        trabajador que la consuma.

【R-27】 MenuQRSeccion.imagen_url y ProductoTerminado.imagen_url son texto libre
        que sale al portal PÚBLICO. mapa.ts:1040 y :83. La CSP limita img-src a
        'self' data: blob:, así que el daño hoy es una imagen rota. Valida con
        z.url() o restringe al prefijo del bucket propio.

【R-28】 tlsPara desactiva TLS por coincidencia de subcadena.
        packages/data/src/tls.ts:31 — cadena.includes('localhost'). Un host
        remoto llamado localhost.ejemplo.com conectaría sin TLS. Parsea con
        new URL() y compara exacto. Además ca: RAIZ_SUPABASE SUSTITUYE el
        almacén del sistema, no lo amplía — el comentario :27-28 dice lo
        contrario. Corrige el comentario o el código.

【R-29】 El fallo del límite de tasa está invertido: si la tabla falla, se deja
        pasar. packages/app/src/http/limite.ts:100-103 y portal/limite.ts:91-94
        hacen catch { return {ok:true} }. Es una decisión de disponibilidad
        legítima; DÉJALA. Pero emite una alerta, porque hoy sólo hay un
        console.error que nadie mira.

【R-30】 /api/archivos/subir NO EXISTE y tres pantallas lo llaman.
        apps/web/heredado/api/cliente.ts:232. ImageUploader.jsx,
        IdentidadNegocio.jsx y MenuQRTab.jsx hacen POST ahí. Hoy fallan.
        El diseño ya está escrito en
        docs/fase-1/F1-07-FUNCIONES-Y-AUTORIZACION.md:668-760 y es correcto.
        Debe tener:
          1. Sesión + rol.
          2. MIME POR LOS BYTES, no por la extensión ni el Content-Type del
             multipart — ambos los escribe el cliente. Admite jpeg, png, webp,
             avif. RECHAZA image/svg+xml SIN EXCEPCIÓN: es XSS almacenado
             servido desde el mismo origen, y estas imágenes se pintan en el
             login y en el portal QR público.
          3. 5 MB comprobados por Content-Length ANTES de bufferizar, más tope
             de dimensiones (6000x6000) contra bombas de descompresión.
          4. Nombre generado por el servidor:
             <prefijo>/<organizacion_id>/<aaaa>/<mm>/<uuid>.<ext-del-servidor>.
             El nombre del usuario no entra en la ruta.
          5. Bucket privado, prefijos privado/ y publico/. Lo público se marca
             en el comando que persiste la referencia, nunca por un parámetro
             del navegador.
          6. Límite de tasa y cuota por organización.
          7. Baja los límites del cliente de 8 MB a 5 en ImageUploader.jsx:27 y
             MenuQRTab.jsx:81.

╔══════════════════════════════════════════════════════════════════════╗
║ 3 · LO QUE ESTÁ BIEN — NO LO ROMPAS                                  ║
╚══════════════════════════════════════════════════════════════════════╝

Diecisiete cosas que están bien hechas. Al arreglar lo de arriba, no las
toques:

1. comando() y definirComando. Rol → paquete → validación → idempotencia →
   transacción → auditoría, en ese orden, para todos. definirComando RECHAZA
   AL CARGAR EL MÓDULO cualquier entrada que declare rol, organizacion_id,
   sucursal_id, empleo_id, identidad_id o terminal_id. No es una prueba que
   se pueda olvidar: el módulo no carga. Es la pieza que sostiene todo.
2. Un solo sitio donde nace un ámbito: sesion/resolver.ts para empleados,
   portal/ambito.ts para comensales. El token sólo lleva a QUIÉN; organización,
   sucursal y rol se releen de la base en cada petición.
3. AmbitoPortal NO tiene rol, a propósito. Darle al comensal un rol de empleado
   le regalaría cualquier comando futuro con ese rol.
4. La lista blanca del portal es POR INCLUSIÓN. Cero delete, cero ...resto. Las
   consultas seleccionan exactamente las columnas que salen.
5. El precio lo pone el servidor siempre. portal/pedido.ts:242 y
   venta/cobrar.ts:85-91 usan la MISMA cotizar. Los esquemas del portal no
   declaran ni un importe y strict() rechaza la petición si aparece uno.
6. Aritmética de dinero: bigint de centavos, desdeTexto en vez de
   Math.round(x*100), numeric como cadena, int8 como bigint nativo.
7. Cero SQL concatenado. Cero sql.raw, cero sql.lit en todo el repositorio.
8. Las migraciones habilitan RLS + FORCE en las 45 tablas y las 3 vistas, con
   el caso de las vistas resuelto (una vista hereda los permisos de quien la
   define) y la portabilidad a un Postgres sin roles de Supabase resuelta
   preguntando por pg_roles en vez de suponerlos.
9. CSP con nonce por petición, sin unsafe-inline en script-src, con verificador
   en vivo dentro de pnpm verify.
10. Idempotencia con huella canónica: misma clave + otra entrada ⇒
    IDEMPOTENCIA_CONFLICTO, no la respuesta guardada. Y el savepoint del portal
    para que un 23505 no aborte la transacción entera.
11. La extracción de IP toma el ÚLTIMO valor de x-forwarded-for, no el primero.
12. PIN con Argon2id + pimienta en servidor, bloqueo por credencial, y la misma
    respuesta para PIN incorrecto y empleo inexistente.
13. PUEDE_OTORGAR (identidad/empleados.ts:52-55): un administrador no puede
    fabricarse un dueño ni cambiarse su propio puesto.
14. reiniciar_todo NO crea ningún usuario con PIN 1234, a diferencia del
    sistema original.
15. comando() audita también los rechazos: hay fila de quién intentó borrar el
    negocio y no pudo.
16. Los errores nunca filtran el mensaje de Postgres ni el de zod. El detalle
    dice qué campo y por qué, nunca el valor recibido.
17. TLS a Postgres con rejectUnauthorized: true y la raíz de Supabase embebida.

╔══════════════════════════════════════════════════════════════════════╗
║ 4 · TU SEGUNDA MITAD: QA DE BACKEND — ROMPE TU PROPIO BACKEND        ║
╚══════════════════════════════════════════════════════════════════════╝

Después de arreglar, intenta romperlo. Escribe cada intento como prueba
automatizada, no como exploración manual. Lo que pase se queda en el
repositorio.

ESCRIBE Y EJECUTA ESTOS ATAQUES:

A) AUTORIZACIÓN CRUZADA (BOLA/IDOR) — §11 BLOCKER
   · Sesión de organización A pide, por cada uno de los 65 comandos y las 78
     rutas, un recurso con ID válido de organización B. Debe dar cero filas y
     respuesta indistinguible de "no existe".
   · GENERA esta prueba del registro de comandos, no la escribas a mano. Una
     escrita a mano se olvida en el comando 40.
   · Lo mismo para el puente: {"entidad":"Venta","filtro":{"id":"<id de B>"}}.

B) ESCALADA DE ROL — §10 BLOCKER
   · Por cada comando × cada rol SIN permiso: debe dar 403 y cero escrituras.
     Generada del registro, no a mano.
   · Un cajero intenta configuracion.guardar. Un mesero intenta
     mantenimiento.*. Un cocina intenta el puente de escritura.
   · Un administrador intenta crear un dueno (PUEDE_OTORGAR debe pararlo).
   · Un administrador intenta cambiarse su propio puesto.

C) FUGA DE CAMPOS — §11 CRITICAL
   · Por cada entidad del puente y cada rol: ninguna respuesta contiene
     pin_hash, device_token_hash, presentacion_password_hash, ni costos para
     roles que no los ven.
   · Recorre TODOS los endpoints y busca esos nombres en la respuesta.

D) EL PORTAL PÚBLICO
   · Token inválido, caducado, de otra organización, con caracteres raros,
     con longitud extrema.
   · Diez pedidos concurrentes con el mismo token: una sola orden.
   · Un pedido con un precio en el cuerpo: debe rechazarse por strict().
   · La misma clave de idempotencia desde dos mesas distintas (R-18).
   · Rate limit: supera la ventana y confirma el 429.

E) CUERPOS Y ENTRADAS EXTREMAS — §09 CRITICAL
   · Cuerpo de 50 MB → 413, no OOM.
   · JSON anidado 1000 niveles.
   · Strings de 10 MB en cada campo de texto.
   · Arrays de 100000 elementos.
   · Unicode, emojis, comillas, saltos de línea, NUL, RTL override.
   · Números fuera de rango, negativos donde no debe, NaN, Infinity.
   · __proto__ y constructor como claves de objeto.

F) CONCURRENCIA — §12 RECOMMENDED, pero aquí es donde se pierde dinero
   · Dos cobros simultáneos de la misma orden.
   · Dos ventas simultáneas del mismo insumo con stock justo.
   · Dos aperturas de caja en la misma terminal.
   · Dos dispositivos abriendo la misma mesa.
   · Cien cobros concurrentes: cien folios sin colisión ni hueco.
   Ejecútalas EN PARALELO DE VERDAD, no con sleeps.

G) FALLO A MEDIA TRANSACCIÓN
   · Interrumpe cobrarOrden después del pago y antes del stock: no debe
     quedar orden pagada, ni movimiento, ni folio consumido.
   · Lo mismo en enviarComanda, registrarCompra y devolverOrden.
   · VERIFICACIÓN OBLIGATORIA: quita la transacción, confirma que la prueba
     FALLA, restaura. Una prueba que pasa igual con y sin la corrección no
     prueba nada.

H) LA BASE VIVA — §13 BLOCKER
   · Con la anon key de Supabase, intenta leer cada una de las 45 tablas por
     PostgREST. Todas deben negar.
   · Confirma relrowsecurity y relforcerowsecurity en las 45.
   · Confirma que anon y authenticated no tienen SELECT en ninguna.
   · Confirma que las 3 vistas también están revocadas.

I) SESIÓN
   · Cookie modificada, firma alterada, exp vencido, sid de otra sesión.
   · Cookie copiada después de cerrar sesión (debe fallar tras arreglar B-3).
   · Sesión de un empleo dado de baja.
   · Sesión de una terminal desenrolada.

╔══════════════════════════════════════════════════════════════════════╗
║ 5 · REGLAS DE TRABAJO                                                ║
╚══════════════════════════════════════════════════════════════════════╝

· SÓLO BACKEND. No toques apps/web/heredado/ salvo las dos excepciones
  explícitas: qrUtils.js (C-5, para que llame al comando) y los límites de
  tamaño de ImageUploader.jsx y MenuQRTab.jsx (R-30 punto 7).
· No agregues features. No rediseñes. No refactorices lo que funciona.
· NO SOBRE-ENDUREZCAS. Miguel va a meter más features. Arregla lo que está
  mal; no inventes capas de abstracción nuevas.
· Migraciones NUEVAS, numeradas 050 en adelante. NUNCA edites una aplicada:
  el ejecutor valida por hash.
· Todo se aplica con pnpm db:migrate. Aplicar a mano por la consola es lo
  que causó B-0.
· Cero any, cero @ts-ignore, cero catch vacío en packages/.
· Ningún archivo nuevo sobre 300 líneas.
· La prueba antes que el código en todo lo crítico, y después la mutación:
  quítala, confirma que falla, restaura.
· Si dices que corriste mutaciones, EL ARNÉS SE COMMITEA Y SE ENGANCHA A
  pnpm verify. Si no está en verify, no cuenta.
· NO TOQUES el proyecto Pasteleria Confetti de Supabase
  (ivqcxdpqxwjxfohiswqb). Ni para leer.
· Commits pequeños con identificador: "B-0: RLS faltante en 8 tablas".
  A nombre de M1gu3hb <enchuer2797@gmail.com>.
· Nada se declara terminado sin haberlo EJECUTADO. Ni una migración que no
  se aplicó, ni una prueba que no corrió.

╔══════════════════════════════════════════════════════════════════════╗
║ 6 · CÓMO REPORTAS                                                    ║
╚══════════════════════════════════════════════════════════════════════╝

Un reporte en docs/reports/NNN-codex-blindaje-backend.md (toma el folio
siguiente al más alto que exista). Con:

1. Tabla de los 30 hallazgos: ID · estado (arreglado / falso positivo /
   pendiente) · commit · prueba que lo cierra · mutación que la valida.
2. Los falsos positivos con su razón. Si al leer el código descubres que un
   hallazgo mío está mal, dilo — prefiero saberlo.
3. Resultado de cada ataque del §4: qué intentaste, qué pasó, qué prueba
   quedó en el repositorio.
4. El estado de la base: RLS por tabla, migraciones registradas vs disco,
   grants de anon.
5. Gate morphiq-prs: BLOCKERS abiertos (deben ser cero), CRITICAL aceptados
   con su razón.
6. "LO QUE NO HICE" — obligatorio y es lo que más me importa. Qué quedó
   fuera, qué declaraste hecho con un hueco, y qué afirmación de este reporte
   no puedes respaldar ejecutando algo.

Avísame cuando cierres los cinco BLOCKERS (B-0 a B-4), aunque no hayas
terminado lo demás. Después sigue sin detenerte.

Arranca por B-0: la base viva tiene ocho tablas sin RLS y el código dice que
sí las tiene. Esa brecha entre lo que el repositorio cree y lo que la base
hace es el problema más grande que tienes enfrente.
```
