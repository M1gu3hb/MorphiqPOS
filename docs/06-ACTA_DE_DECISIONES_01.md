# Acta de decisiones 01

Fecha: 6 de septiembre de 2026
Decide: Miguel
Estado: **vigente.** Este documento manda sobre cualquier recomendación previa de los documentos 00–04.

---

## 1. Decisiones tomadas

| ID | Decisión | Lo elegido | Mi recomendación previa |
|---|---|---|---|
| **A-01** | Modelo de distribución | **Proyecto ensamblado por cliente** (monorepo con paquetes + composición por proyecto) | Un código, muchos tenants |
| **A-03** | Capacidad de ejecución | **Medio tiempo, solo** (~15–20 h/semana ≈ 2.25 jornadas) | — |
| **A-04** | Sistema Base44 | **No aplica. Erradicación total.** No hay nada que congelar ni migrar | Congelar en mantenimiento |
| **A-05** | Piloto 1 | **Ninguno. Tenant interno de prueba.** No hay cliente próximo de sistema; Confeti queda como está y no se toca | Confeti |
| **A-16** *(nueva)* | Infraestructura inicial | **Todo local.** Backend, base de datos y frontend corren en tu máquina. Supabase entra después, solo como Postgres y storage gestionados | Compatible |

### Contexto declarado que cambia el plan

- **No hay clientes esperando un sistema.** La demanda actual son sitios web.
- **Confeti opera bien y no requiere cambios.** Su sistema queda intacto.
- **Base44 sale por completo** — no es migración, es construcción desde cero.
- **Sin despliegue por ahora.** Primero construir, luego desplegar.

---

## 2. Consecuencias de A-01 (ensamblaje por cliente)

Acepto la decisión. Estas son las consecuencias reales y cómo se hace que la decisión sea la versión sostenible de sí misma.

### La buena noticia: el 95 % del trabajo es idéntico en ambos modelos

Los dos modelos construyen exactamente lo mismo: `core`, `contracts`, `capabilities/*`, `ui`, `registry`, con contratos estrictos entre paquetes. **La diferencia aparece solo en el último paso**, el de entregar:

- Un código configurable → una app que carga capacidades según el tenant, en tiempo de ejecución.
- Ensamblaje por cliente → un generador que produce un proyecto con solo los paquetes elegidos.

Si los paquetes están bien delimitados, **soportan las dos salidas**. Y como hoy no existe el cliente 1, la maquinaria de ensamblaje no hay que construirla todavía.

### Regla operativa derivada

> **Construir el monorepo con paquetes desde el día uno. No construir el generador de proyectos hasta que exista el primer cliente real.**

Con eso: cero trabajo desperdiciado, el camino que elegiste queda abierto, y si algún día prefieres el otro modelo, la estructura ya lo soporta.

### La condición que hace sostenible el ensamblaje

> **Un proyecto de cliente DECLARA dependencias. Nunca COPIA código.**

Esta regla es al Modelo B lo que "fork prohibido" era al Modelo A, y es la línea que separa el escenario sostenible del catastrófico:

| | Proyecto que **declara** | Proyecto que **copia** |
|---|---|---|
| Parche de seguridad | Subir una versión + correr pruebas | Editar N repositorios a mano |
| A los 2 años | 8 proyectos en versiones conocidas y rastreables | 8 sistemas distintos que nadie entiende |
| Costo del cliente 9 | Horas | Igual que el cliente 1 |

Concretamente, el proyecto de un cliente es esencialmente esto:

```jsonc
// proyectos/cliente-x/package.json
{
  "dependencies": {
    "@masterpos/core":       "^1.4.0",
    "@masterpos/catalogo":   "^2.1.0",
    "@masterpos/ventas":     "^3.0.0",
    "@masterpos/caja":       "^2.2.0",
    "@masterpos/inventario": "^1.4.0"
  }
}
// + su tema, su configuración y, si aplica, su paquete de extensiones
```

Cero archivos de Master POS copiados dentro.

### Lo que hay que construir por haber elegido este modelo

Se agregan al plan tres cosas que el otro modelo no necesitaba. Ninguna es urgente, pero deben quedar apuntadas:

1. **Publicación de paquetes versionados** — workspace del monorepo al inicio; registro privado cuando existan proyectos separados.
2. **Pruebas de contrato por paquete**, no solo por aplicación. Un cambio en `core` debe fallar en CI si rompe a `ventas`, antes de publicarse.
3. **Registro de trazabilidad por cliente** — qué versión de cada paquete tiene cada proyecto. Es exactamente el problema que hoy sufres con tres versiones divergentes del POS actual: no debe repetirse.

---

## 3. El riesgo que ahora domina el proyecto

Con A-04 y A-05, dos riesgos desaparecen y uno nuevo se vuelve el principal.

**Desaparecen:**
- **R-01 (impuesto de sistema doble):** ya no existe. No hay sistema viejo que mantener.
- **Migración de datos:** ya no existe. El entregable F0-6 (mapa de migración) **se elimina del plan** — ahorra 3–4 jornadas.
- **Oleadas D y E del plan de erradicación** (migrar datos y activos, eliminación física): ya no aplican. Repo nuevo = cero residuos por construcción.

**Aparece — y es ahora el riesgo número uno:**

### R-09 — Proyecto ambicioso, medio tiempo, en solitario, sin cliente y sin fecha

Los tres modos de falla, dichos sin rodeos:

1. **Sin criterio externo de "suficiente", el alcance crece.** Cuando nadie espera nada, siempre se puede agregar una función más antes de dar algo por terminado.
2. **Sin retroalimentación real, construyes lo que imaginas que necesitan.** Es cómo se llega a un sistema técnicamente impecable que no encaja con ninguna operación real.
3. **Medio tiempo y solo alarga el ciclo.** Sin resultados visibles, la motivación se agota antes del primer entregable.

### Mitigaciones concretas

**M-1 · Nueva regla de admisión.** La anterior ("solo entra lo que un cliente paga") ya no sirve porque no hay cliente. La sustituyo por una operativa:

> **Solo entra al corte actual lo que un negocio real necesitaría para operar un día completo sin ti presente.**

Ese es tu criterio de "suficiente". No es opinión: es una pregunta con respuesta sí/no.

**M-2 · Confeti como validador, no como cliente.** No tocas su sistema, no le prometes nada, no asumes riesgo. Pero su operación real —que conoces bien— es el caso de prueba del Corte 0: *¿podría Confeti trabajar un día completo con esto?* Retroalimentación real, riesgo cero.

**M-3 · Hitos demostrables cada 2–3 semanas.** No cada tres meses. Algo que abras, uses y veas funcionando localmente. A medio tiempo son ~5 jornadas por hito.

**M-4 · Fecha autoimpuesta para el Corte 0.** Sin cliente, la fecha la pones tú o no existe. Propuesta: **Corte 0 funcionando localmente en 3 meses.** Si a los 3 meses no está, el problema no es de ritmo: es que el alcance del corte estaba mal y hay que recortarlo, no extenderlo.

### Observación sobre la demanda real

Dijiste que lo que más te piden son sitios web, no sistemas. Es un dato relevante y lo dejo anotado sin empujarlo: existe un cruce natural entre lo que ya vendes y Master POS —sitio web + menú digital + pedidos en línea + portal QR— que es puerta de entrada al POS y usa el mismo catálogo. Si en algún momento quieres que Master POS produzca ingreso antes de estar completo, ese es el punto más probable. No cambia el plan de hoy; solo conviene no cerrarle la puerta al diseñar el catálogo y el canal público.

---

## 4. Consecuencias de A-16 (todo local)

**Estoy de acuerdo, y por una razón que refuerza tu regla no negociable #1:** si el sistema funciona completo sin ninguna nube, es portable **por construcción**. Desarrollar local primero es la mejor garantía posible de que no te vuelvas a acoplar a un proveedor. Es una decisión mejor de lo que parece.

### Entorno local objetivo

```
docker compose up          → PostgreSQL + object storage compatible S3 (MinIO)
npm run migrate            → migraciones versionadas del repo
npm run seed               → datos sintéticos
npm run dev                → API + web
npm run test               → unitarias, integración, E2E, concurrencia, fallos
```

Sin cuentas, sin claves de terceros, sin costos, sin internet.

### El paso a Supabase, cuando lo quieras

Si se respeta la línea roja de `02_ARQUITECTURA_CONCEPTUAL.md` §6 —**cero reglas de negocio en RLS o Edge Functions**— el cambio es:

- Postgres local → Postgres de Supabase: cambiar una cadena de conexión y correr migraciones.
- MinIO → Supabase Storage: cambiar la implementación de `ServicioArchivos`, un archivo.
- Lógica de negocio: **no cambia nada.** Sigue en tu API.

Ese es el resultado de haber puesto la lógica donde va. Si en cambio la lógica termina en RLS, el paso a Supabase se vuelve irreversible y repites el patrón Base44 con otro nombre.

### Una precisión sobre "primero todas las features, luego desplegamos"

Separo dos ejes que no están ligados, porque creo que te refieres al primero:

- **Desplegar o no desplegar:** de acuerdo. Cero despliegues hasta que tú quieras. Puedes tener cinco cortes terminados y ninguna nube. Ningún problema.
- **Construir todo antes de terminar algo:** eso sí es riesgoso, y no por el despliegue. Un corte vertical **terminado y probado** es lo único que demuestra que la maquinaria (transacción, idempotencia, concurrencia, permisos) funciona de verdad. Si se construyen quince funciones a medias antes de cerrar la primera, los errores de cimentación aparecen los quince a la vez y ya están copiados quince veces.

Propuesta que respeta lo que dijiste: **cortes verticales completos y probados, todos locales, sin desplegar nada.** Terminar no significa publicar.

---

## 5. Plan ajustado a medio tiempo, sin cliente y en local

A ~2.25 jornadas efectivas por semana.

### Fase 0 recortada — ~9 jornadas ≈ 4–5 semanas

| # | Entregable | Cambio respecto al plan original | Esfuerzo |
|---|---|---|---|
| F0-1 | Custodia | Solo verificar el hash del ZIP. Sin repositorio de evidencia aparte | 0.5 j |
| F0-2 | Decisiones de producto | **Hecho.** Este documento | ✔ |
| F0-3 | ADR de arquitectura | Reducido: stack local, Postgres, identidad, modelo `Orden/Cumplimiento`, estructura de paquetes, registry | 2.5 j |
| F0-4 | Baseline funcional | **Solo del Corte 0 (mostrador).** El del restaurante se escribe antes de la Etapa 3 | 4 j |
| F0-5 | Matrices conservación/corrección | Solo las del Corte 0 | 1 j |
| ~~F0-6~~ | ~~Mapa de migración de datos~~ | **Eliminado.** No hay datos que migrar | — |
| F0-7 | Backlog del Corte 0 | Tareas pequeñas con aceptación, prueba y rollback | 1 j |

### Después — Corte 0: ~17 jornadas ≈ 7–8 semanas

Alcance sin cambios respecto a `03_SECUENCIA_Y_PRIMER_CORTE.md` §3, con dos ajustes:
- Estructura de **monorepo con paquetes** desde el primer commit (consecuencia de A-01).
- Todo local: Docker, sin proveedores, sin despliegue.

### Horizonte realista

**~3 meses hasta un esqueleto vertical funcionando en tu máquina:** login seguro, catálogo, venta, cobro, caja, corte, ticket, stock, con transacciones, idempotencia, aislamiento, pruebas de concurrencia y de fallo, y CI en verde.

No suena espectacular. Es la diferencia entre una cimentación y quince pantallas que se caen la primera vez que dos cajeros cobran al mismo tiempo.

---

## 6. Qué sigue

**Tres cosas de tu lado, cortas:**

1. Verificar el hash del ZIP (comando en `00_DICTAMEN_Y_LECTURA.md` §1).
2. Confirmar o corregir el horizonte de 3 meses y el alcance del Corte 0.
3. Responder las preguntas que siguen abiertas (§7).

**Del mío, cuando lo autorices:** escribir los ADR, el baseline del mostrador, las matrices y el backlog del Corte 0. Sigo sin escribir código.

---

## 7. Preguntas que siguen abiertas

Las que ya no aplican quedan cerradas: Q-01 (respondida por A-01), Q-02 (no hay clientes en producción), Q-03 (medio tiempo), Q-07 (no hay datos que migrar).

**Siguen bloqueando el baseline del Corte 0:**

- **Q-06 · Formato de ticket en v1:** ¿carta, 80 mm, 58 mm o combinación? Cambia el diseño de impresión desde el inicio.
- **Q-13 · Perfiles:** ¿los tres paquetes actuales (Esencial / Operativo / Restaurante Pro) se conservan como perfiles certificados con esos nombres, o se rediseñan ahora que habrá capacidades reales?
- **Q-17 *(nueva)* · Alcance del Corte 0:** confirmo que el primer corte sigue siendo **mostrador genérico** —no restaurante—, porque es el corte más pequeño posible y además es la base sobre la que se construye el restaurante después. ¿De acuerdo?

**Se pueden diferir sin costo** (ya no hay cliente que las fuerce): Q-04 fiscalidad · Q-05 hardware · Q-08 disponibilidad · Q-14 demo pública · Q-15 SaaS de autoservicio.

**Sigue siendo útil, sin prisa:** Q-16 · ¿cuál es el segundo giro que tienes en la mira? Saberlo permite dejar los ganchos correctos sin construir de más.
