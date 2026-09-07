# Arquitectura conceptual recomendada

Nada de este documento es una decisión tomada. Es una recomendación con fundamento, para que la conviertas en ADR firmado o la rechaces con razón.

---

## 1. Forma general

**Monolito modular, frontend separado, base de datos relacional, workers por eventos.**

Coincido con `ARQUITECTURA_OBJETIVO_REQUISITOS.md` y lo suscribo sin cambios de forma. La justificación, dicha claramente: los microservicios resuelven un problema organizacional (muchos equipos que se estorban) que tú no tienes, a cambio de un costo operativo (despliegues, redes, transacciones distribuidas, observabilidad) que sí pagarías. Un monolito modular con fronteras honestas se parte en servicios el día que haga falta; un microservicio prematuro no se vuelve a juntar nunca.

```
   Web (POS · Mesero · Cocina · Admin)      Portal público QR / tienda
                 │                                     │
        ┌────────▼────────┐                   ┌────────▼────────┐
        │  API interna    │                   │  API pública    │  ← borde separado:
        │  (autenticada)  │                   │  (token, rate   │    contrato estrecho,
        └────────┬────────┘                   │   limit, deny)  │    sin acceso a entidades
                 │                            └────────┬────────┘
                 └──────────────┬─────────────────────┘
                                │
                    ┌───────────▼────────────┐
                    │   Casos de uso         │  ← toda la lógica de negocio
                    │   (comandos/consultas) │     permisos · transacción · idempotencia
                    └───────────┬────────────┘
                                │
                    ┌───────────▼────────────┐
                    │   Dominio + Registry   │  ← reglas puras, máquinas de estado,
                    └───────────┬────────────┘     guardia de capacidades
                                │
                    ┌───────────▼────────────┐
                    │  Repositorios          │  ← único lugar que conoce SQL
                    └───────────┬────────────┘
                                │
              PostgreSQL  +  outbox  +  object storage
                                │
                    ┌───────────▼────────────┐
                    │  Workers               │  ← eventos, notificaciones,
                    └────────────────────────┘     reportes, integraciones, IA
```

**Regla de dependencia, verificada por lint en CI:** la UI no conoce SQL. Los casos de uso no conocen HTTP. El dominio no conoce nada. Un componente de React que importe el cliente de base de datos hace fallar el build. Es la lección directa de las 359 operaciones directas del sistema actual.

---

## 2. La decisión que hace posible la Etapa 5: el modelo de orden genérico

Esta es la recomendación más importante del documento (riesgo **R-04**).

### El problema

El modelo actual es de restaurante hasta los huesos: `Venta.mesa_id`, `Venta.tipo_venta ∈ {mesa, mostrador, para_llevar, delivery}`, `ProductoTerminado.area_preparacion ∈ {cocina, barra, ambos, ninguno}`, `PedidoPreparacion`. Si Etapa 1 congela esto, cuando llegue una estética con citas o una tienda en línea, el núcleo no da y toca reescribirlo.

### La solución

Separar **qué se vendió** de **cómo se entrega**:

```
Orden  ──┬── LíneaDeOrden ──── (producto | servicio | paquete | cargo)
         │
         ├── Cumplimiento ──── estrategia según el tipo de línea y el canal:
         │                       · inmediato        (mostrador, retail)
         │                       · preparación      (cocina/barra/KDS)   ← restaurante
         │                       · agendado         (cita, reserva)      ← servicios
         │                       · envío            (delivery)
         │                       · retiro           (pickup)
         │
         ├── Pago ──────────── uno o varios, con propina, cambio, método
         │
         ├── MovimientoStock ─ generado por consumo, receta, merma, devolución
         │
         └── Canal ─────────── mostrador · mesa · QR · tienda · integración · agenda
```

**Qué gana esto, en concreto:**

- Una venta de mostrador es una orden con cumplimiento *inmediato*.
- Una cuenta de mesa es una orden con canal *mesa* y cumplimiento *preparación*.
- Una cita es una orden con cumplimiento *agendado* que, al completarse, dispara el mismo `completeSale`.
- Un pedido de la tienda en línea es una orden con canal *tienda* y cumplimiento *envío*.

Los cuatro comparten: catálogo, precios, impuestos, pagos, caja, inventario, clientes, comisiones, reportes y auditoría. **Ese es el "todo conectado" que pediste**, y así es como se implementa de verdad: no cada módulo llamando a todos, sino todos escribiendo en el mismo par de conceptos.

**Costo hoy:** casi nulo. Es nombrar bien tres tablas y no meter `mesa_id` en el encabezado de la orden.
**Costo si se pospone:** reescribir el núcleo de ventas cuando ya haya clientes en producción.

Advertencia honesta: no construyas hoy las cinco estrategias de cumplimiento. Construye **una** (`inmediato`) en el primer corte y **una segunda** (`preparación`) en el corte de restaurante. Lo importante es que la abstracción exista con dos implementaciones reales — con una sola, la abstracción sería inventada; con dos, está validada.

### El mismo problema con los actores

`UsuarioPOS` mezcla cuatro cosas (identidad, persona, empleo y credencial) y es la raíz de P0-01 y P0-02. Separar:

```
Identidad     → cómo entra alguien al sistema (credencial, sesión, MFA futuro)
Persona       → el ser humano (nombre, contacto) — una sola vez en el sistema
Empleo        → Persona × Organización × Sucursal × Rol × vigencia
Cliente       → Persona en su rol de comprador (puede o no tener Identidad)
Terminal      → el dispositivo/caja donde ocurre la operación
```

Consecuencias que resuelven problemas reales: un mesero que trabaja en dos sucursales es una persona con dos empleos. Un cliente que se registra en el portal QR es una persona con identidad y sin empleo. Un empleado que también es cliente no se duplica. El PIN es una credencial hasheada, no un campo de la tabla de empleados que se descarga al navegador.

---

## 3. Multiempresa: cómo se hace bien

Recomendación: **base compartida con `organizacion_id`, defensa en tres capas.** Es lo que dice D-07 y coincido, con la condición de que el aislamiento se pruebe, no se confíe.

1. **Esquema:** toda tabla operativa lleva `organizacion_id` (y `sucursal_id` donde aplique), obligatorio, con índice compuesto **como primera columna** de cada índice de consulta.
2. **Consulta:** ningún repositorio acepta una consulta sin ámbito. El ámbito viene de la sesión del servidor, **jamás de un parámetro del cliente**. Se aplica de forma centralizada, no repositorio por repositorio.
3. **Base de datos:** RLS como red de seguridad de último recurso — no como el mecanismo principal. Si RLS es tu única defensa, un bug en la sesión expone todo.

**Prueba obligatoria en CI (`TEN-01`):** un usuario de la organización A intenta leer, escribir, exportar, reportar y adjuntar recursos con IDs válidos de la organización B. Cero resultados, respuesta indistinguible de "no existe", registro de auditoría. Esta prueba se ejecuta contra **todos** los comandos y consultas, generada automáticamente del registro de rutas — no escrita a mano una por una, porque una escrita a mano se olvida en la ruta 40.

**Dedicada cuando se pague:** misma imagen, base de datos aparte. La topología no cambia el código.

---

## 4. Comandos, transacciones e idempotencia

El corazón de los P0-03 a P0-06.

**Un comando crítico es una unidad indivisible con esta forma, sin excepciones:**

```
comando completeSale
  ámbito         organización + sucursal + terminal + sesión de caja
  permiso        ventas.cobrar
  capacidad      ventas (rechaza si no está habilitada para el tenant)
  idempotencia   clave provista por el cliente; repetir devuelve el MISMO resultado
  precondición   orden confirmada · sesión de caja abierta · stock según política
  transacción    UNA sola: orden + líneas + pagos + movimiento de caja
                 + movimientos de stock + folio + auditoría → todo o nada
  eventos        VentaCompletada (vía outbox, en la misma transacción)
  errores        catálogo tipado y estable, nunca cadenas libres
```

**Tres reglas derivadas, no negociables:**

- **El precio nunca llega del cliente.** El cliente manda producto, cantidad y unidad; el servidor cotiza con el catálogo vigente. Mata SEC-PRICE-010 de raíz.
- **Ningún error crítico se silencia.** El `catch(() => {})` que absorbe fallos de inventario es la causa directa de que existan ventas pagadas sin stock descontado. En la base nueva, si el paso falla, la transacción falla.
- **El stock es un ledger inmutable.** Nunca `leer saldo → calcular → escribir saldo`. Se insertan movimientos y el saldo se deriva (con proyección materializada por rendimiento). Elimina P1-03 estructuralmente: dos ventas concurrentes no pueden pisarse porque nadie sobreescribe un total.

**Máquinas de estado explícitas.** Ningún `update` libre de `estado`. Cada transición declara origen, destino, permiso y evento; una transición no declarada es un error del sistema. Aplica a orden, pago, cumplimiento, mesa, sesión de caja y compra.

**Contra las respuestas fuera de orden (P1-08, KDS-04):** cada entidad con estado lleva número de versión monotónico. Una actualización con versión menor a la almacenada se descarta. Es un campo entero y una condición en el `WHERE`; resuelve una clase entera de bugs de la cocina actual.

---

## 5. El registry de capacidades

Es lo que convierte "modularidad" en algo verificable.

**Cada capacidad tiene un manifiesto versionado en Git:**

```jsonc
{
  "clave": "restaurante",
  "version": "1.0.0",
  "estado": "estable",              // experimental | beta | estable | deprecado
  "ambito": "sucursal",             // organizacion | sucursal | terminal | canal
  "requiere":   ["ventas@^2", "catalogo@^2"],
  "recomienda": ["inventario@^1"],
  "incompatible_con": [],
  "permisos": ["mesas.abrir", "mesas.transferir", "comanda.enviar", "comanda.transicionar"],
  "migraciones": ["0031_mesas", "0032_comandas"],
  "eventos_publica": ["MesaAbierta", "ComandaEnviada", "ItemListo"],
  "eventos_consume": ["VentaCompletada"],
  "extiende": ["cumplimiento.preparacion"],
  "configuracion": { "usa_estaciones": false, "asignacion_mesas": false },
  "al_desactivar": "conservar_historico_solo_lectura",
  "chunk_ui": "restaurante"
}
```

**Qué hace cumplir el motor, automáticamente:**

- Activar `restaurante` sin `ventas` → rechazo con explicación, sin estado parcial (escenario `CAP-02`).
- Comando de una capacidad deshabilitada → `403 CAPACIDAD_NO_HABILITADA` antes de llegar al caso de uso (escenario `CAP-01`).
- Permisos de capacidades deshabilitadas → no aparecen ni son asignables.
- Chunk de UI → no se descarga.
- Migraciones → no se aplican a ese tenant.
- Al desactivar → el histórico se conserva legible según permiso; **nunca se borra en silencio**.
- Documentación comercial → se genera del registry, solo capacidades `estable`.

**Perfiles de giro** (la corrección al riesgo R-03) son combinaciones certificadas:

```jsonc
{
  "clave": "perfil-restaurante-completo",
  "version": "1.0.0",
  "capacidades": ["catalogo","ventas","caja","inventario","compras","restaurante","portal-qr","reportes"],
  "tema": "oscuro-operativo",
  "layouts": { "mesero": "tablet", "cocina": "kds", "caja": "escritorio" },
  "certificado_en": "matriz de regresión perfil-restaurante"
}
```

Solo los perfiles y un conjunto acotado de deltas comunes entran a la matriz de regresión. Combinaciones libres se permiten y se marcan **no certificadas** — lo cual es honesto contigo mismo y con el cliente.

---

## 6. Proveedores: cómo no repetir Base44 (riesgo R-05)

La regla no negociable #1 no dice "no uses servicios gestionados". Dice "no dependas de una plataforma que controle tu código o infraestructura". La diferencia práctica es **cuánto cuesta salirte**.

| Pieza | Recomendación | Costo de salir | Cómo se protege |
|---|---|---|---|
| Base de datos | PostgreSQL gestionado (Supabase, Neon, RDS…) | **Bajo** — Postgres estándar es portable con `pg_dump` | Nada exótico del proveedor. Migraciones en el repo, no en la consola web |
| Autenticación | Propia o gestionada, **detrás de una interfaz** `ProveedorIdentidad` | **Medio** | Sesiones y permisos son tuyos; el proveedor solo verifica credenciales |
| Storage | S3-compatible detrás de `ServicioArchivos` | **Bajo** | URLs nunca se guardan crudas en entidades: se guarda una clave y se resuelve |
| Lógica de negocio | **Tu API. Siempre.** | — | Nunca en RLS, nunca en Edge Functions, nunca en la UI |
| Despliegue | Contenedor estándar | **Bajo** | Nada que dependa de un runtime propietario |
| Frontend hosting | Vercel u otro | **Bajo** | Un build estático es portable |

**La línea roja, dicha una vez y de forma tajante:** *ninguna regla de negocio vive en una política RLS ni en una función del proveedor.* RLS es defensa en profundidad, no lógica. Las funciones del proveedor son adaptadores, no casos de uso. Ese es exactamente el error de Base44 —lógica repartida en la plataforma— y es donde más fácil se repite sin darte cuenta, porque *funciona bien al principio*.

Con esa línea respetada, usar Supabase para Postgres + storage es una decisión de eficiencia, no un lock-in. Sin ella, es Base44 con otro logo.

**Prueba de independencia (`ZERO-01`):** el sistema arranca, migra, corre pruebas y opera con el DNS del proveedor original bloqueado, desde un clon limpio. Se ejecuta en CI, no una sola vez al final.

---

## 7. Seguridad mínima del día uno

Todo esto entra en el primer corte. No es "de la fase de endurecimiento".

- Sesiones en cookie `HttpOnly` `Secure` `SameSite`. **Nunca** el usuario completo en `sessionStorage` (P0-01).
- PIN con hash lento (Argon2id), verificado en servidor, con límite de intentos y bloqueo progresivo. El campo PIN **jamás** sale en una respuesta.
- Autorización por acción y recurso en el servidor. Guardias de UI solo como comodidad. Prueba negativa por rol para **cada** comando, generada automáticamente.
- Sin credenciales por defecto en el bundle. Enrolamiento inicial de un solo uso, con expiración (SEC-CREDS-003).
- API pública separada: token con alcance y caducidad, rate limit, catálogo público mínimo, precio recalculado, comandos idempotentes, cero acceso a entidades internas.
- Sin `document.write` ni HTML interpolado sin escape (SEC-XSS-006). Impresión con render seguro.
- Archivos: allowlist por contenido real, re-codificación de imágenes, nombres generados, servidos desde origen aislado.
- Cabeceras: CSP, `nosniff`, `frame-ancestors`, `Referrer-Policy`, `Permissions-Policy`.
- Secretos solo en gestor de secretos. **Todas las credenciales heredadas se rotan**; ningún PIN del sistema actual se importa como válido.
- Auditoría inmutable de acciones sensibles: quién, qué, cuándo, desde dónde, con qué resultado.

---

## 8. Interfaz, temas y accesibilidad

Un sistema de diseño con **tokens** (color, tipografía, espacio, radio, sombra, densidad) y componentes que solo consumen tokens. Un tema es un conjunto de valores de tokens, no una copia de componentes.

Tres ejes independientes que se combinan:

- **Tema:** claro/oscuro + identidad de marca del cliente (colores, logo, tipografía, fondo).
- **Densidad:** cómoda (tablet de mesero, dedos) vs. compacta (caja con teclado, velocidad).
- **Layout por rol y dispositivo:** mesero-tablet, cocina-KDS, caja-escritorio, dueño-móvil, admin-escritorio.

Accesibilidad como puerta de CI, no como buena intención: contraste AA, foco visible, navegación por teclado en los flujos de venta y cobro, objetivos táctiles ≥44 px, sin depender solo del color para comunicar estado. Un POS se usa 10 horas seguidas; la accesibilidad aquí es rendimiento del empleado, no cumplimiento normativo.

Esto ya lo tienes parcialmente resuelto: `ConfiguracionNegocio` en el sistema actual ya maneja colores, logos, fondos y opacidad. La idea es correcta; lo que falta es sacarla de una entidad-monstruo de ~100 campos y volverla tokens.

---

## 9. IA y MCP: la frontera correcta

Lo dejas para Etapa 6 y estoy de acuerdo. Pero la decisión de arquitectura se toma antes, porque afecta cómo se escriben los comandos desde el primer día.

**Principio:** la IA no accede a la base de datos. La IA invoca **los mismos casos de uso que la UI**, con la misma sesión, los mismos permisos, el mismo ámbito, la misma auditoría y las mismas transacciones.

```
Asistente IA ──► Servidor MCP ──► Casos de uso  ◄── UI web
                      │              (permisos, tenant, auditoría)
                 sesión propia
                 alcance reducido
                 solo lectura por defecto
                 escritura → confirmación humana explícita
```

Consecuencias prácticas:
- Toda pregunta de negocio ("¿cuánto vendí hoy?") es una **consulta ya existente** expuesta como herramienta. Cero código nuevo de datos.
- Toda acción ("crea la orden de compra") es un **comando ya existente** con confirmación humana obligatoria.
- Si un caso de uso está bien hecho, exponerlo por MCP cuesta horas. Si la lógica está en la UI, es imposible.

**Por eso esto es un argumento para la arquitectura, no un módulo futuro:** cada caso de uso bien construido hoy es una herramienta de IA gratis mañana. Es la mejor razón práctica para no dejar lógica en las pantallas.

---

## 10. Observabilidad, respaldo y recuperación

- `correlation_id` y `idempotency_key` en cada comando, propagados a logs, trazas y eventos.
- Logs estructurados, sin secretos, con tenant y usuario.
- Métricas: latencia y errores por comando, profundidad de colas, y **alertas de invariantes** — que son las que de verdad importan aquí:
  - venta pagada sin líneas,
  - mesa con dos ventas activas,
  - saldo de caja distinto de la suma de sus movimientos,
  - stock negativo donde la política lo prohíbe,
  - comanda huérfana sin orden.
- Reconciliadores automáticos que corren de noche y reportan desviaciones.
- Respaldos cifrados automáticos + **restauración ensayada con calendario**. Un respaldo no probado no cuenta (D-19, y es literal: la mitad de los respaldos que nunca se probaron no funcionan).
- Despliegue gradual con rollback y migraciones reversibles en operación.
