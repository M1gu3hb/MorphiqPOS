# F1.1 — Núcleo

**Objetivo:** identidad, organización, permisos reales, configuración y auditoría. Es el corte que **corrige los P0 de seguridad** de ambos sistemas antes de que exista una sola venta.

**Esfuerzo estimado:** 12–16 jornadas · **Precondición:** F1.0 firmado.

> **Por qué antes que la venta:** si el cobro se construye sobre una identidad insegura y sin permisos, después hay que reescribirlo. Los dos sistemas fuente demuestran exactamente ese error.

---

## Fuera de alcance

Productos, ventas, caja, inventario, mesas. Nada que un cliente pueda vender todavía. Al terminar este corte el sistema **no vende**: administra quién puede entrar y qué puede hacer.

---

## Tareas

### F1.1-T01 · Migraciones del núcleo

`organizaciones` · `sucursales` · `terminales` · `personas` · `identidades` · `credenciales_pin` · `empleos` · `permisos_rol` · `capacidades_activas` · `configuracion` · `folios` · `auditoria` · `eventos_outbox`.

Según `03-MODELO-DE-DATOS-UNIFICADO` §1. Índices compuestos con `organizacion_id` primero. Restricción única de configuración por ámbito y sección.

**Aceptación:** `db:migrate` y `db:reset` funcionan. Intentar insertar una segunda configuración activa de la misma sección y ámbito es rechazado por la base (`CFG-02`).

### F1.1-T02 · Repositorios del núcleo

En `packages/data/repos/`, siguiendo el patrón de tiendita (funciones sueltas, tipadas, `organizacion_id` explícito) con las tres correcciones de `04-ARQUITECTURA` §3: `server-only` en todo el paquete, cliente de transacción opcional, ámbito desde la sesión.

**Aceptación:** ningún repositorio es importable desde `apps/web`. La regla de capas de CI lo verifica.

### F1.1-T03 · Envoltorio `comando()`

El molde de `04-ARQUITECTURA` §3. Resuelve una sola vez: validación zod, permiso, capacidad activa, transacción, idempotencia, auditoría, correlation id, errores tipados.

**Aceptación:** un comando de juguete escrito con el envoltorio ya trae las siete cosas sin escribir una línea extra. Se prueba con inyección de fallo: si el cuerpo lanza, no queda nada persistido.

### F1.1-T04 · Enrolamiento de terminal

Comando `enrolarTerminal`: el dueño genera un código de un solo uso con expiración; la terminal lo canjea y recibe un token de dispositivo de larga vida en cookie `HttpOnly`.

**Aceptación:** un código usado dos veces falla. Un código expirado falla. El token no es reutilizable en otro dispositivo (se liga a un identificador de dispositivo).

### F1.1-T05 · Autenticación por PIN — corrige **P0-01**

`credenciales_pin` con **Argon2id + pimienta** del entorno. `POST /api/auth/pin` con límite de intentos por identidad y por terminal, bloqueo progresivo, auditoría de cada intento.
Sesión de empleado en cookie `HttpOnly` `Secure` `SameSite=Lax` con expiración corta y renovación.

**Aceptación:**

- `AUTH-01` credencial válida → sesión con ámbito y perfil **sin ningún secreto** en la respuesta.
- `AUTH-02` credencial inválida repetida → rechazo, rate limit, auditoría, y **el mensaje no revela si el usuario existe**.
- **Prueba automática sobre todos los endpoints:** ninguna respuesta contiene `pin_hash` ni el PIN en claro.
- El PIN nunca viaja en una URL ni queda en logs.

### F1.1-T06 · Autenticación del dueño por correo

Correo + contraseña (o enlace mágico) para acceso remoto desde el teléfono. Sesión distinta de la de terminal, con expiración propia.

**Aceptación:** el dueño entra desde un dispositivo no enrolado y ve el panel de gestión, pero **no** puede operar caja sin terminal enrolada.

### F1.1-T07 · Autorización por acción — corrige **P0-02**

Tabla `permisos_rol` sembrada con la matriz por defecto de los 7 roles. El envoltorio `comando()` verifica antes de ejecutar. Consultas también verifican.

**Aceptación:**

- `AUTH-03` un cajero abre una URL de administración → 403 del backend y ruta bloqueada en UI.
- **Prueba negativa generada automáticamente** del registro de comandos: para cada comando × cada rol sin permiso → 403 y cero escrituras. Si se agrega un comando y se olvida su permiso, la prueba falla.

### F1.1-T08 · Aislamiento por organización — corrige **P0-08**

El ámbito se resuelve en el servidor desde la sesión y se inyecta en todo comando y consulta. **Ningún endpoint acepta `organizacion_id` del cliente.**
RLS habilitado como defensa en profundidad.

**Aceptación:** `TEN-01` generada automáticamente: para cada comando y consulta, un usuario de A intenta operar con IDs válidos de B → cero resultados, respuesta indistinguible de "no existe", auditoría registrada.

### F1.1-T09 · Configuración por secciones — corrige **P1-01**

Comandos `leerConfiguracion(seccion, ambito)` y `guardarConfiguracion`. Diez secciones. Valores por defecto versionados.

**Aceptación:** `CFG-01` devuelve exactamente una configuración activa por sección y ámbito, siempre. No existe ningún `[0]` de una lista en el código.

### F1.1-T10 · Alta de empleados — corrige **P1-12**

Pantalla `/empleados` y comandos `crearPersona`, `crearEmpleo`, `asignarPin`, `desactivarEmpleo`.

**Aceptación:** E2E completo — el dueño da de alta un cajero desde la UI, le asigna un PIN, el cajero entra en la terminal y aparece registrado en `auditoria`. Es el hueco más visible de tiendita y aquí se cierra.

### F1.1-T11 · Auditoría inmutable

Tabla `auditoria` sin políticas de escritura desde el cliente. El envoltorio `comando()` escribe automáticamente en toda acción sensible.

**Aceptación:** un intento de insertar en `auditoria` desde el navegador falla. Toda acción sensible deja rastro con quién, qué, cuándo, desde dónde y con qué resultado.

### F1.1-T12 · Folios atómicos — corrige **P1-09**

Tabla `folios` con `UPDATE … RETURNING` dentro de la transacción del comando.

**Aceptación:** prueba de concurrencia con 100 solicitudes simultáneas: cero colisiones, cero huecos, secuencia estricta.

### F1.1-T13 · Servicio de archivos — corrige **SEC-UPLOAD**

`ServicioArchivos` detrás de una interfaz, implementado sobre MinIO. Allowlist por **contenido real** (no por MIME declarado), re-codificación de imágenes, nombres generados, límites de tamaño y dimensiones, buckets privados con URLs firmadas.

**Aceptación:** `FILE-01` un archivo disfrazado (extensión de imagen, contenido ejecutable) es rechazado. Un archivo privado no es accesible sin firma.

### F1.1-T14 · Registry de capacidades

`packages/registry` lee los `capability.json`, valida dependencias e incompatibilidades, y expone el guardia que usa `comando()`.

**Aceptación:**

- `CAP-01` un comando de capacidad deshabilitada → `403 CAPACIDAD_NO_HABILITADA` **antes** de llegar al caso de uso.
- `CAP-02` activar una capacidad con dependencia ausente → rechazo con explicación y **sin estado parcial**.

### F1.1-T15 · Pantallas de gestión mínimas

Layout `(gestion)` completo. `/login`, `/enrolar-terminal`, `/empleados`, `/configuracion` con las secciones de identidad, contacto y apariencia (incluido el selector de estilo).

**Aceptación:** el flujo completo se hace desde la UI, sin tocar la base a mano. **Componentes portados de la Fuente A** — `IdentidadNegocio`, `ColoresSistemaSection`, `UsuarioPOSDialog` — reimplementados sobre comandos, tokenizados y sin acceso a datos.

### F1.1-T16 · Respaldo y restauración

Script de respaldo del Postgres local. **Restauración ensayada al menos una vez**, documentada en `docs/runbooks/respaldo-restauracion.md` con tiempo real medido.

**Aceptación:** se restauró un respaldo en una base vacía y el sistema arrancó. Un respaldo sin restauración probada no cuenta (R20).

---

## Pruebas obligatorias del corte

| ID         | Escenario                                                            | Tipo                  |
| ---------- | -------------------------------------------------------------------- | --------------------- |
| `AUTH-01`  | Credencial válida → sesión sin secretos                              | Integración + E2E     |
| `AUTH-02`  | Credencial inválida repetida → rechazo, rate limit, auditoría        | Integración           |
| `AUTH-03`  | Cajero abre URL administrativa → denegado                            | E2E negativa          |
| `AUTH-04`  | Manipular cookie o storage no otorga privilegios                     | Seguridad             |
| `AUTH-05`  | Ninguna respuesta de ningún endpoint contiene el hash del PIN        | Seguridad, generada   |
| `TEN-01`   | Organización A no ve nada de B, en todo comando y consulta           | Integración, generada |
| `PERM-01`  | Cada comando × cada rol sin permiso → 403 y cero escrituras          | Integración, generada |
| `CFG-01`   | Configuración activa: exactamente una por sección y ámbito           | Integración           |
| `CFG-02`   | Segunda configuración activa → rechazada por la base                 | Base de datos         |
| `CAP-01`   | Comando de capacidad deshabilitada → bloqueado antes del caso de uso | Integración           |
| `CAP-02`   | Activar con dependencia ausente → rechazo sin estado parcial         | Dominio               |
| `FOLIO-01` | 100 folios concurrentes → sin colisiones ni huecos                   | Concurrencia          |
| `FILE-01`  | Archivo disfrazado o fuera de límites → rechazado                    | Seguridad             |
| `TERM-01`  | Código de enrolamiento usado dos veces → falla                       | Integración           |
| `EMP-01`   | Alta de cajero de punta a punta desde la UI                          | E2E                   |
| `BKP-01`   | Respaldo restaurado en base vacía, sistema arranca                   | Operación             |

---

## Gate `morphiq-prs` de este corte

Superficies que se activan aquí: **S2** (login), **S3** (panel admin), **S4** (formularios), **S9** (uploads), **S11** (datos personales).

| Sección | Check                                                                                       | Severidad            |
| ------- | ------------------------------------------------------------------------------------------- | -------------------- |
| 01      | Autorización server-side en todo dato sensible y acción privilegiada                        | BLOCKER              |
| 07      | Roles y permisos definidos **antes** de implementar                                         | CRITICAL             |
| 07      | El navegador se considera no confiable; cero decisiones por campos hidden o IDs del cliente | CRITICAL             |
| 07      | Operaciones multi-paso fallan cerrado                                                       | CRITICAL             |
| 09      | Validación server-side de todo input                                                        | BLOCKER              |
| 09      | Rate limits en login y en endpoints caros                                                   | CRITICAL             |
| 09      | Errores no filtran stack traces, SQL ni rutas internas                                      | CRITICAL             |
| 10      | Autorización por recurso y acción; autenticación ≠ permiso                                  | BLOCKER              |
| 10      | Reset y códigos de un solo uso, con expiración                                              | CRITICAL             |
| 10      | Logout revoca la sesión de verdad                                                           | CRITICAL             |
| 10      | **Cero session IDs o credenciales en localStorage/sessionStorage**                          | CRITICAL             |
| 10      | Hashing adaptativo (Argon2id) con salt y parámetros actuales                                | CONDITIONAL → aplica |
| 11      | BOLA/IDOR probado: A no accede a objetos de B cambiando IDs                                 | BLOCKER              |
| 11      | Mass assignment evitado con allowlist de campos                                             | CRITICAL             |
| 15      | Panel admin con auth y autorización server-side, no ruta oculta                             | BLOCKER              |
| 16      | Allowlist de tipos; verificar contenido real, no Content-Type                               | BLOCKER/CRITICAL     |
| 16      | Buckets privados + URLs firmadas                                                            | CRITICAL             |
| 18      | Recolectar sólo datos necesarios; PII fuera de logs y URLs                                  | CRITICAL             |
| 19      | Login failures y cambios administrativos generan eventos auditables                         | CRITICAL             |
| 22      | 401 y 403 diferenciados; sesión expirada no ejecuta con estado ambiguo                      | CRITICAL             |
| 23A     | RTO/RPO definidos; restauración medida                                                      | CRITICAL             |

---

## Definición de terminado

- [ ] Los P0-01, P0-02 y P0-08 están cerrados **con su prueba verificada** (falla al quitar la corrección).
- [ ] P1-01, P1-09 y P1-12 cerrados.
- [ ] SEC-CREDS, SEC-STORAGE y SEC-UPLOAD cerrados.
- [ ] Las 16 pruebas del corte pasan.
- [ ] Las pruebas generadas (`AUTH-05`, `TEN-01`, `PERM-01`) cubren el 100 % de comandos y consultas registrados.
- [ ] El flujo completo funciona desde la UI: enrolar terminal → dar de alta empleado → entrar con PIN → cambiar configuración → ver la auditoría.
- [ ] Un cajero **no puede** hacer nada de administrador, ni por URL ni por API.
- [ ] Restauración de respaldo ensayada y documentada con tiempo real.
- [ ] Cero BLOCKERS de `morphiq-prs` abiertos.
- [ ] `BITACORA.md` y el cuadro de estado actualizados.
