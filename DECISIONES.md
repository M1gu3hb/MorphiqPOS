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
| **A-35** | 8-sep-2026 | Repositorio de código | **Local por ahora**, sin remoto | Se conecta cuando F1.1 despliegue |
| **A-36** | 8-sep-2026 | Versiones del stack | **Next 16.3.4 · React 19.2.8 · TypeScript 6.0.3** | A-20 fijaba Next 14, que dejó de publicarse el 11-dic-2025. TS 6 y no 7 porque `typescript-eslint` sólo soporta `<6.1.0`, y sin él no hay reglas con información de tipos — que es lo que hace cumplir R19 |
| **A-37** | 8-sep-2026 | Acceso a Postgres | **Kysely** sobre `pg` (ADR 0001) | El esquema vive entero en `.sql` y los tipos se derivan de la base migrada. Con Drizzle habría dos fuentes de verdad del esquema: triggers, `check` e índices parciales no caben en TypeScript |
| **A-38** | 8-sep-2026 | Tailwind | **v4.3.3**, no v3 | La razón de v3 era "continuidad con ambos sistemas" y no aplica: repo nuevo, cero configuración reutilizada. `@theme` de v4 mapea directo sobre las variables CSS del motor de tokens |
| **A-39** | 8-sep-2026 | Infraestructura principal | **Supabase gestionado** — proyecto `MorphiqPOS`, ref `wyqmzhliurwyxuyxznpb`, us-east-2, Postgres 17.6. Sustituye a Docker | Supera a A-16. El `docker-compose` **se conserva y corre en CI como prueba de portabilidad**: si el sistema deja de arrancar contra un Postgres pelón, se coló una dependencia de Supabase y muere la promesa A-27 |
| **A-40** | 8-sep-2026 | Despliegue | **Un solo proyecto en Vercel**, conectado al repositorio | F1.1 termina desplegado y abierto desde el teléfono |
| **A-41** | 8-sep-2026 | **Secuencia de la Fase 1** | **Replanteada: producto vendible al final de F1.1**, no de F1.3 | El plan original secuenciaba por capa de arquitectura y violaba su propia regla de admisión ("cada corte agrega un capítulo al guion de demostración"). F1.0 no agregó ninguno. Se mantiene la **correctitud** (transacciones, precios en servidor, auth en servidor) y se difiere la **completitud** (matriz de permisos, registry con grafo, config multi-ámbito) |
| **A-42** | 8-sep-2026 | Forma del sistema de capacidades | **Selector de paquete en configuración**: Tienda · Ferretería · Farmacia · Cafetería · Restaurante | Resuelve A-32. Es lo que Miguel pidió y lo que usará frente a un cliente. El registry existe por debajo; lo que se ve y se usa es un desplegable. Se verifica en servidor, no ocultando botones |
| **A-43** | 8-sep-2026 | Autonomía del agente de desarrollo | **Total dentro de las reglas escritas.** Pregunta sólo ante lo irreversible, lo que contradice la documentación, o lo que toca datos de clientes reales | Con medio tiempo, esperar respuesta cuesta más que corregir una decisión escrita |
| **A-44** | 8-sep-2026 | Versión de Postgres | **17** | Supabase corre 17.6; el compose se alinea |

---

## Decisiones superadas

| ID | Decisión original | Estado |
|---|---|---|
| A-16 | "Todo local, Docker, sin despliegue" | **Superada** por A-39. Supabase gestionado es el entorno principal; el compose queda como prueba de portabilidad |
| A-20 (versión) | Next.js 14 | **Superada** por A-36. Next 14 dejó de publicarse en dic-2025. La forma (Next único, operación como cliente puro) sigue vigente |
| A-32 | Nombres de perfiles de giro, pendiente | **Resuelta** por A-42: selector de paquete con cinco giros |
| Secuencia F1.0→F1.5 original | Fundación → núcleo → catálogo → inventario → restaurante | **Superada** por A-41. Ver `docs/fase-1/15-AUDITORIA-F1.0-Y-REPLANTEAMIENTO.md`. Los documentos 08–12 no se tiran: su contenido se redistribuye |
| A-01 (recomendación inicial) | "Un código configurable por tenant, muchos inquilinos" | **Superada** por A-01 vigente. Miguel eligió ensamblaje por cliente. El análisis comparativo se conserva en `docs/01_MODELO_MASTER_POS.md` §2 |
| A-05 (recomendación inicial) | Confeti como piloto 1 | **Superada.** No hay cliente próximo de sistema; Confeti opera bien y no se toca |
| Híbrido Next + Vite | Dos aplicaciones separadas | **Superada** por A-20. El objetivo real (pantallas de operación rápidas) se logra con rutas cliente dentro de Next |

---

## Decisiones pendientes

| ID | Decisión | Recomendación | Bloquea |
|---|---|---|---|
| **A-31** | Formato de ticket en v1: carta / 80 mm / 58 mm / combinación | Carta con `@media print` en F1.1; dejar la ruta abierta a 80 mm | F1.1-T16 |
| **A-33** | ¿Este repositorio se vuelve privado? | **Sí, privado.** Ver advertencia en `README.md` | Publicación de la auditoría de seguridad completa |
| **A-34** | Hardware del primer corte: impresora, cajón, báscula, escáner | Escáner de cámara y físico entran en F1.1-T17. Báscula, cajón y térmica se difieren | F1.1 cerrado |

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
| 7-sep-2026 | Cowork local | **Fase 0 cerrada.** Análisis estructural de ambas fuentes. Estrategia de fusión, modelo de datos unificado (~45 tablas), arquitectura del monorepo, sistema de diseño, mapa de defectos, y el plan completo de Fase 1 en 6 cortes. Ver `docs/fase-1/` |
| 7/8-sep-2026 | Claude Code | **Corte F1.0 ejecutado**, 12 de 13 tareas. Monorepo, TypeScript estricto, sistema de diseño con 36 primitivas tokenizadas, CSP con nonce, CI, 149 pruebas y 28 mutaciones. Decisiones A-35 a A-38. **SHA-256 del ZIP verificado: coincide.** Tres defectos encontrados por pruebas que la inspección no habría visto |
| 8-sep-2026 | Cowork local | **Auditoría independiente de F1.0 y replanteamiento.** F1.0 entregó fundación excelente y cero producto: 2 rutas, sin BD, sin auth, sin pantallas de negocio — culpa del plan, no de la ejecución. Decisiones A-39 a A-44. Nuevo corte **F1.1 POS que vende**. Ver `docs/fase-1/15` y `16` |
