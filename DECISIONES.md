# Registro de decisiones — MorphiqPOS

Formato: cada decisión lleva fecha, alternativas evaluadas, elección y consecuencia.
**Una decisión superada no se borra: se marca y se apunta a la nueva.**

---

## Decisiones vigentes

| ID | Fecha | Decisión | Elegido | Consecuencia principal |
|---|---|---|---|---|
| **A-01** | 6-sep-2026 | Modelo de distribución | **Proyecto ensamblado por cliente** (monorepo con paquetes versionados) | Un proyecto de cliente **declara dependencias, nunca copia código**. El generador no se construye hasta que exista el cliente 1 |
| **A-02** | 7-sep-2026 | Modelo de venta | **Una tabla `ordenes`** con estrategias de captura, cumplimiento y consumo de inventario | Caja, pagos, costos, clientes y reportes se escriben una vez y sirven a todos los giros. Habilita servicios, espacios, producción y e-commerce sin reescribir el núcleo |
| **A-03** | 6-sep-2026 | Capacidad de ejecución | **Medio tiempo, solo** (~15–20 h/semana ≈ 2.25 jornadas) | Fase 0 ~4–5 semanas; Corte 0 ~8–9 semanas |
| **A-04** | 6-sep-2026 | Sistema Base44 | **Erradicación total.** No hay nada que congelar ni migrar | Se elimina el entregable de mapa de migración de datos. Repo nuevo = cero residuos por construcción |
| **A-05** | 6-sep-2026 | Piloto externo | **Ninguno.** Tenants internos de demostración | Confeti queda intacto y sirve sólo como *validador* de escenarios, sin tocar su sistema |
| **A-16** | 6-sep-2026 | Infraestructura inicial | **Todo local.** Sin despliegue por ahora | Docker en la laptop. Es además requisito de la demo: se demuestra donde el wifi es malo o no hay |
| **A-17** | 6-sep-2026 | Base de código | **Los dos sistemas.** Arquitectura de POS-MH-Tiendita + features y reglas del POS de restaurante | Nada desde cero. Se hereda también la responsabilidad de corregir los defectos de la tiendita antes de agregar features |
| **A-18** | 6-sep-2026 | Modelo de negocio | **No es SaaS.** Boutique, sistemas personalizados | No habrá autoservicio en línea. "No vende sacos, toma medidas" |
| **A-19** | 6-sep-2026 | Alcance del catálogo | **Todo el catálogo se construirá eventualmente** | El total no ordena el trabajo; el orden sí. Regla de admisión por corte |
| **A-20** | 7-sep-2026 | Stack del frontend | **Next.js 14 App Router único.** Sin segunda app en Vite | Las pantallas de operación son rutas 100% cliente: se sienten como SPA sin partir el proyecto, el build, el diseño ni la sesión |
| **A-21** | 7-sep-2026 | Dónde vive la lógica crítica | **API TypeScript con transacciones reales** contra Postgres (pg/Drizzle) | Nada de lógica de negocio en RPC de PL/pgSQL, RLS ni Edge Functions. Testeable, versionada y lista para exponerse por MCP a la IA |
| **A-22** | 7-sep-2026 | Stripe y suscripciones | **Fuera del núcleo** → capacidad opcional `membresias` | Sirve a clientes que sí venden suscripciones (gimnasios, academias). La cobranza de rentas de Miguel se maneja aparte |
| **A-23** | 7-sep-2026 | Motor de estilos | **Tokens + 4 perillas estructurales**: densidad, redondeo, elevación, movimiento | Se cambia entre premium, editorial e industrial sin duplicar componentes. Es feature de producto y jugada de venta |
| **A-24** | 7-sep-2026 | Primer corte | **Núcleo endurecido + motor de diseño al mismo tiempo** | Cero features nuevas. Las pantallas nacen sobre tokens en vez de retrofitearlos en 100 componentes |
| **A-25** | 7-sep-2026 | Multi-tenant | **Se conserva `negocio_id`** en todas las tablas | No para SaaS: para tener varios negocios de demostración y cambiar de giro frente al prospecto. Multisucursal es concepto aparte, llega con franquicias |
| **A-26** | 7-sep-2026 | Offline | **Sin offline por ahora.** Sólo online | El caso "cliente sin internet" se resuelve con servidor local propio, no con sincronización offline |
| **A-27** | 7-sep-2026 | Portabilidad del backend | **El backend completo debe poder correr en el servidor privado del cliente** (PC con Postgres, en su local) | **Regla dura:** cero lógica de negocio en RLS, Edge Functions o servicios propietarios. Todo desplegable con Docker. Es lo que impide repetir Base44 con otro proveedor. Miguel lo venderá como opción: "con internet o sin internet" |
| **A-28** | 7-sep-2026 | Acceso de empleados | **Terminal dada de alta + PIN por empleado verificado en servidor; correo y contraseña para el dueño** | Rápido entre cliente y cliente, seguro de verdad, y con trazabilidad de quién cobró qué. Corrige el agujero que tienen los dos sistemas |
| **A-29** | 7-sep-2026 | Pruebas | **Pirámide mínima obligatoria en el núcleo** (~20–25 % del tiempo) | Unitarias, integración contra Postgres real, concurrencia, inyección de fallos, idempotencia, aislamiento de tenant, E2E del guion de demo |
| **A-30** | 7-sep-2026 | Orden de ramas | **Restaurante → completar retail (variantes, lotes, series) → servicios y citas** | Restaurante primero: mejor demo, ~70 % construido, y valida `ordenes` con una segunda estrategia real |

---

## Decisiones superadas

| ID | Decisión original | Estado |
|---|---|---|
| A-01 (recomendación inicial) | "Un código configurable por tenant, muchos inquilinos" | **Superada** por A-01 vigente. Miguel eligió ensamblaje por cliente. El análisis comparativo se conserva en `docs/01_MODELO_MASTER_POS.md` §2 |
| A-05 (recomendación inicial) | Confeti como piloto 1 | **Superada.** No hay cliente próximo de sistema; Confeti opera bien y no se toca |
| Híbrido Next + Vite | Dos aplicaciones separadas | **Superada** por A-20. El objetivo real (pantallas de operación rápidas) se logra con rutas cliente dentro de Next |

---

## Decisiones pendientes

| ID | Decisión | Recomendación | Bloquea |
|---|---|---|---|
| **A-31** | Formato de ticket en v1: carta / 80 mm / 58 mm / combinación | Definir con Miguel. El historial del POS de restaurante muestra migración hacia carta con iframe y corte en A4 | Diseño de impresión del Corte 0 |
| **A-32** | Nombres de los perfiles de giro: ¿se conservan Esencial / Operativo / Restaurante Pro, o se renombran a `retail` / `restaurante` / `servicios`? | Renombrar por giro. Los nombres comerciales viejos describen paquetes de precio, no giros | Registry de capacidades |
| **A-33** | ¿Este repositorio se vuelve privado? | **Sí, privado.** Ver advertencia en `README.md` | Publicación de la auditoría de seguridad completa |
| **A-34** | Hardware del primer corte: impresora, cajón, báscula, escáner | "Sólo navegador e impresora de hojas" es respuesta válida y la más rápida | Alcance del Corte 0 |

---

## Reglas derivadas que no son negociables

Extraídas de las decisiones anteriores. Si una propuesta las viola, se rechaza.

1. Un proyecto de cliente **declara dependencias, nunca copia código**. El fork está prohibido.
2. **Cero lógica de negocio** en RLS, Edge Functions o servicios propietarios. El backend debe correr en una PC del cliente.
3. **Los precios se calculan en el servidor.** Nunca se confía en el total que manda el cliente.
4. **Cobro, comanda, stock, caja y mesa son transaccionales e idempotentes.** O confirma todo, o no persiste nada.
5. **Los permisos se aplican en servidor.** Ocultar un botón no es autorización.
6. **Ningún error crítico se silencia.** Nada de `catch(() => {})`.
7. **El stock es un ledger inmutable.** Nunca leer-calcular-escribir un saldo.
8. **Ninguna función se declara terminada sin su prueba**, y sin pasar el estándar `morphiq-prs`.
9. **Cada corte debe agregar un capítulo al guion de demostración**, o ser cimentación obligatoria de algo que sí lo hace.
10. **Ningún PIN, contraseña, token ni dato de cliente** se copia a documentación o a este repositorio.

---

## Registro de sesiones

| Fecha | Dónde | Qué se resolvió |
|---|---|---|
| 6-sep-2026 | Cowork local | Lectura del paquete de auditoría Fase 0 (34 documentos). Interpretación de la visión, riesgos y contradicciones. Decisiones A-01, A-03, A-04, A-05, A-16 |
| 6-sep-2026 | Cowork local | Reencuadre: MorphiqPOS es herramienta de venta antes que producto. Guion de demostración. Decisiones A-17, A-18, A-19 |
| 7-sep-2026 | Cowork local | Auditoría del repo `POS-MH-Tiendita`. Catálogo de 9 ramas / ~180 capacidades / 30 giros. Entrevista dirigida: decisiones A-02, A-20 a A-30. Publicación de este repositorio |
