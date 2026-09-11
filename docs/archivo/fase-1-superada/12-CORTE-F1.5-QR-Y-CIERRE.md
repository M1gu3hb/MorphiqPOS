# F1.5 — Portal QR, panel del dueño y cierre de Fase 1

**Objetivo:** cerrar el guion de demostración completo y firmar el Acta de Production Sign-Off de `morphiq-prs`.

**Esfuerzo estimado:** 10–14 jornadas · **Precondición:** F1.4 firmado.

---

## Fuera de alcance

Pedidos a domicilio, repartidores, tienda en línea completa, pagos en línea, marketplaces. Todo eso es rama F del catálogo y va después de la Fase 1.

---

## Tareas

### F1.5-T01 · Frontera pública separada — corrige **P0-06**

El portal QR **no usa la API interna**. Se construye `app/(publico)/api/` como borde propio:

- Token de mesa con **alcance, caducidad y rotación**.
- Rate limit por token y por IP.
- Respuesta de catálogo **pública y mínima**: nombre, precio, imagen, disponibilidad. Nada de costo, margen, stock ni datos internos.
- **Precio recalculado en servidor** desde el catálogo vigente.
- Comandos idempotentes.
- Cero acceso a entidades internas.
- Datos personales mínimos.

**Aceptación:**

- `QR-01` token inválido, inactivo o caducado → no expone datos ni permite comando.
- `SALE-04b` el cliente altera el precio de un producto variable → el servidor lo ignora y recalcula. Es el defecto exacto de `qrPedidoFlow.js`.
- Un endpoint público no puede leer ninguna tabla interna. Se verifica con prueba negativa sobre el esquema de respuesta.

### F1.5-T02 · Pedido desde el QR sin carreras — corrige **P0-06**

`crearPedidoQR` idempotente. **Se elimina el patrón de la Fuente A** de crear una venta y luego cancelar las competidoras.

**Aceptación:** `QR-03` doble envío o reintento → una sola orden, misma respuesta idempotente. Diez envíos concurrentes desde el mismo token → una sola orden.

### F1.5-T03 · Portal del comensal — **conservar de la Fuente A**

`(publico)/qr/[token]`: menú por secciones, carrito, pedido, solicitud de cuenta y de ayuda, valoración.
Portados: `CarritoQR`, `ProductoQRDialog` (19 KB), `PedirCuentaQR` (30 KB, reimplementado por su tamaño), `ValoracionEmoji`, `AtencionFAB`, `ProductoPlaceholder`.

**Aceptación:** `QR-02` pedido válido → catálogo y precio revalidados, orden creada una sola vez · `QR-04` solicitud repetida de ayuda o cuenta se deduplica según ventana definida.

### F1.5-T04 · Administración del portal QR

`(gestion)/portal-qr`: tokens por mesa, activar y desactivar, generar, descargar e imprimir QR, menú, solicitudes.
Portados: `MesasQRTab`, `MenuQRTab`, `ConfiguracionQRTab`, `SolicitudesQRTab`, `QRMesaDialog`, `QRCanvas`.

**Corrige SEC-XSS:** `QRMesaDialog` usaba `document.write` con HTML interpolado sin escape. Se reemplaza por render de componente seguro.

**Aceptación:** `SEC-01b` un nombre de negocio o de mesa con HTML se imprime como texto y no ejecuta script. Se prueba con una carga real en el nombre.

### F1.5-T05 · Panel del dueño en el teléfono

Vista móvil de `(gestion)/inicio`: venta del día, caja abierta, productos agotados, utilidad, comparativos, alertas. Portados `FinancialChart`, `ColoredStatCard`, `InteligenciaNegocio` (de la Fuente B).

**Aceptación:** es la **escena 7 del guion de demostración** — el argumento de venta más fuerte para un dueño. Se ve bien en un teléfono real, no en emulación.

### F1.5-T06 · Estilos `industrial` y `skeuomorfico` completos

Se cierran los cuatro estilos de `05-SISTEMA-DE-DISENO`. El selector de estilo entra en `(gestion)/configuracion`.

**Aceptación:** Miguel cambia de estilo enfrente de un cliente y **todas** las pantallas responden. Auditoría de contraste AA en los 4 estilos × 2 modos, automatizada.

### F1.5-T07 · Tenants de demostración completos

Los cinco: tienda de abarrotes, ferretería, farmacia, restaurante y cafetería. Todos con datos creíbles y `resetearDemo` en un clic.
Selector de tenant de demostración para cambiar de giro delante del cliente.

**Aceptación:** `DEMO-02` los cinco se siembran, se resetean y se cambia entre ellos sin recargar la sesión.

### F1.5-T08 · Modo presentación — **conservar de la Fuente A**

Oculta datos sensibles y bloquea acciones destructivas durante una demo.
**Se corrige:** la contraseña sale del bundle; se valida en servidor.

**Aceptación:** en modo presentación no se puede borrar nada ni ver datos de otro tenant. La contraseña no aparece en el bundle — se verifica por escaneo.

### F1.5-T09 · Observabilidad y alertas

Logs estructurados con `correlation_id` e `idempotency_key`. Métricas por comando: latencia, errores, uso. Alertas de invariantes activas (las cuatro de F1.3 más las dos de F1.4).

**Aceptación:** una venta se rastrea de punta a punta por su `correlation_id`, desde el clic hasta el movimiento de stock.

### F1.5-T10 · Respaldos, RTO y RPO

Respaldo automático programado. **Restauración ensayada con tiempo medido.** RTO y RPO definidos y documentados según el impacto: un POS es S15 — el cliente depende de él todos los días.
`docs/runbooks/`: respaldo y restauración · incidente · rollback · alta de cliente nuevo.

**Aceptación:** la restauración se ejecutó y su tiempo real cumple el RTO declarado. Si no lo cumple, **se corrige el plan antes del sign-off**, no después.

### F1.5-T11 · Auditoría completa `morphiq-prs`

Ejecutar el Prompt Maestro de Auditoría (§26 del estándar) sobre todo el sistema. Contestar el Mapa de Superficies. Resolver todos los BLOCKERS. Documentar y aceptar formalmente cada CRITICAL que quede abierto.

**Aceptación:** reporte de auditoría con las secciones A–H del formato del estándar.

### F1.5-T12 · Acta de Production Sign-Off

Llenar el acta de `morphiq-prs` §27: proyecto, commit SHA, mapa de superficies activado, gate final, riesgos aceptados, firmas.

**Aceptación:** el acta está firmada por Miguel con resultado `READY` o `READY WITH ACCEPTED RISKS`. **Nunca `NOT READY`** — si lo está, la Fase 1 no terminó.

### F1.5-T13 · Documentación de cierre

- `docs/baseline/` con las fichas de flujo de todo lo conservado.
- Matrices de conservación y de corrección, completas y verdes.
- `capabilities/*/capability.json` de las 8 capacidades, con sus 12 declaraciones.
- `docs/adr/` completo.
- Actualizar `/CONTEXTO_MAESTRO.md` y `/DECISIONES.md` con todo lo aprendido.
- `BITACORA.md` cerrada.

**Aceptación:** un agente nuevo lee el repositorio y puede continuar con la Fase 2 sin preguntar nada que ya esté decidido.

---

## Pruebas obligatorias del corte

| ID         | Escenario                                                                              | Tipo                        | Cierra    |
| ---------- | -------------------------------------------------------------------------------------- | --------------------------- | --------- |
| `QR-01`    | Token inválido, inactivo o caducado → nada expuesto                                    | Seguridad + E2E             | P0-06     |
| `QR-02`    | Pedido QR válido → precio revalidado, orden creada una vez                             | Integración                 | P0-06     |
| `QR-03`    | Diez envíos concurrentes del mismo token → una sola orden                              | Concurrencia                | P0-06     |
| `QR-04`    | Solicitud repetida de ayuda o cuenta se deduplica                                      | Integración                 | conservar |
| `QR-05`    | Un endpoint público no lee ninguna tabla interna                                       | Seguridad, generada         | P0-06     |
| `SALE-04b` | Precio de producto variable alterado desde el QR → recalculado                         | Seguridad                   | P0-06     |
| `SEC-01b`  | HTML en nombre de mesa se imprime como texto                                           | Seguridad                   | SEC-XSS   |
| `DEMO-02`  | Cinco tenants se siembran, resetean y alternan                                         | E2E                         | —         |
| `EST-01`   | Contraste AA en 4 estilos × 2 modos, todas las pantallas                               | Accesibilidad, automatizada | —         |
| `OBS-01`   | Una venta se rastrea de punta a punta por `correlation_id`                             | Observabilidad              | —         |
| `BKP-02`   | Restauración ejecutada, tiempo real cumple el RTO                                      | Operación                   | —         |
| `GUION-01` | **Las 8 escenas del guion de demostración, seguidas, en 3 dispositivos, sin internet** | E2E                         | la Fase 1 |

> `GUION-01` es la prueba que cierra la Fase 1 completa.

---

## Gate `morphiq-prs` — auditoría completa

Mapa de superficies final: **S1** (portal público) · **S2** · **S3** · **S4** · **S5** · **S7** (cuando se conecte Supabase) · **S9** · **S10** · **S11** · **S14** · **S15**.

Se recorre el estándar completo, sección por sección. Los que importan especialmente en este corte:

| Sección | Check                                                                              | Severidad   |
| ------- | ---------------------------------------------------------------------------------- | ----------- |
| 01      | Cero placeholders, Lorem ipsum, estadísticas inventadas o testimonios ficticios    | BLOCKER     |
| 01      | Todos los botones, enlaces y CTAs funcionan y apuntan al destino correcto          | BLOCKER     |
| 01      | Ruta de rollback o restauración documentada y practicable                          | CRITICAL    |
| 03      | Identidad correcta; cero componentes de scaffold; microcopy específico             | BLOCKER     |
| 04      | Páginas privadas y de administración **no indexables**                             | BLOCKER     |
| 06      | WCAG 2.2 AA completo en las pantallas públicas y de operación                      | CRITICAL    |
| 08      | CSP probada sin `unsafe-inline`; CORS sólo a orígenes necesarios                   | CRITICAL    |
| 09      | Rate limits en el portal público y en endpoints caros                              | CRITICAL    |
| 11      | BOLA/IDOR probado en la API pública                                                | BLOCKER     |
| 11A     | SSRF: si el servidor hace requests con datos del usuario                           | CONDITIONAL |
| 18      | Aviso de privacidad; recolectar sólo lo necesario; PII fuera de logs y URLs        | CRITICAL    |
| 18A     | Bitácora de vulneraciones y capacidad técnica para solicitudes ARCO                | CRITICAL    |
| 19      | Alertas de 5xx, fallos de auth, abuso de rate limit, latencia                      | CRITICAL    |
| 23A     | RTO y RPO definidos; restore medido; rollback compatible con migraciones           | CRITICAL    |
| 24      | Documento de handoff: qué incluye, qué no, garantía, accesos, owner de cada cuenta | BLOCKER     |
| 27      | **Acta de Production Sign-Off firmada**                                            | —           |

---

## Definición de terminado — y cierre de la Fase 1

- [ ] `GUION-01`: las 8 escenas del guion de demostración, seguidas, en 3 dispositivos, en red local, **sin internet**.
- [ ] P0-06 y SEC-XSS cerrados con verificación.
- [ ] Las 12 pruebas del corte pasan.
- [ ] **Los 8 P0 y los 15 P1 de la auditoría original están cerrados**, cada uno con su prueba verificada.
- [ ] Matriz de conservación completa y verde: **no se perdió ninguna función** de las dos fuentes que se decidió conservar.
- [ ] Matriz de corrección completa y verde: **no se copió ningún defecto**.
- [ ] Auditoría `morphiq-prs` completa, **cero BLOCKERS**, CRITICAL restantes aceptados por escrito.
- [ ] Acta de Production Sign-Off firmada por Miguel.
- [ ] Documentación de cierre completa; `/CONTEXTO_MAESTRO.md` y `/DECISIONES.md` actualizados.
- [ ] Un agente nuevo puede continuar leyendo sólo el repositorio.

---

## Lo que sigue después de la Fase 1

No entra a este plan, pero queda anotado para que la Fase 2 no empiece de cero:

1. **Completar retail** — variantes de talla y color, lotes y caducidad, números de serie. Cubre boutique, calzado, celulares y refaccionaria con lo que ya existe.
2. **Servicios y citas** — la rama C del catálogo. El mercado nuevo más grande.
3. **Multisucursal** — requisito para franquicias, que es a donde Miguel quiere llegar.
4. **Despliegue** — Supabase gestionado, dominio, entornos. Sólo cambia `DATABASE_URL` y una implementación de `ServicioArchivos`.
5. **Generador de proyectos de cliente** — se construye cuando exista el primer cliente real, no antes (A-01).
6. **Hardware** — impresora térmica, cajón de dinero.
7. **MCP e IA** — cada comando bien construido en la Fase 1 es una herramienta de IA casi gratis.
