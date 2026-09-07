# Modelo de producto — Master POS, núcleo, módulos y proyectos de cliente

---

## 1. Las cuatro cosas, explicadas con precisión

Tu texto usa cuatro términos que en la práctica se confunden todo el tiempo. Esta es la definición que propongo usar de aquí en adelante, y las consecuencias de cada una.

### El Núcleo (`core`)

**Qué es:** el conjunto de capacidades sin las cuales ningún negocio puede operar, con independencia de su giro. No es negociable, no se activa ni se desactiva, y todo cliente lo tiene.

Identidad y sesiones · organizaciones y sucursales · terminales · empleados, roles y permisos · configuración por ámbito · dinero, impuestos y redondeo · folios y numeración · registro de auditoría · almacenamiento de archivos · eventos y outbox · registro de capacidades · migraciones · observabilidad · sistema de diseño.

**Consecuencia:** el núcleo es el único lugar donde un error es catastrófico para todos los clientes a la vez. Por eso es lo primero, lo más probado, y lo que menos cambia.

### Los Módulos (`capabilities`)

**Qué son:** unidades de funcionalidad de negocio activables, con contrato declarado. Catálogo, Ventas, Caja, Inventario, Compras, Restaurante/KDS, Portal QR, CRM, Citas, Lealtad…

Cada módulo declara —y esto lo verifica CI, no la buena voluntad— exactamente lo que tú enumeraste: clave y versión, ámbito, dependencias, incompatibilidades, permisos que introduce, migraciones y datos que crea, eventos que publica y consume, configuración y valores por defecto, cómo se activa y desactiva, qué pasa con su histórico al desactivarse, y cómo se prueba aislado y conectado.

**Consecuencia:** un módulo no es una carpeta. Es un contrato. Si `Citas` puede consumir inventario, es porque `Inventario` publica un contrato `consumirInsumos(origen)` que no sabe nada de citas. Si `Citas` importa código de `Inventario`, la modularidad ya se rompió y solo queda el nombre.

### Master POS (la plataforma madre)

**Qué es:** el repositorio único donde viven el núcleo, todos los módulos, el sistema de diseño, las pruebas y la documentación. Es **un solo código**, no una colección de plantillas.

**Consecuencia clave:** Master POS no es "una copia que se clona". Es la única versión que existe. Un cliente no recibe una copia de Master POS; recibe **una configuración de Master POS**.

### Los Proyectos de Cliente

**Qué son:** la instancia operativa de un cliente = *el mismo código de Master POS* + su perfil de giro + sus capacidades contratadas + su configuración + su identidad visual + (si aplica) su paquete de extensiones específico.

**Consecuencia:** "el proyecto de Confeti" no es un repositorio. Es un registro: `tenant Confeti → perfil mostrador_esencial → capacidades [catalogo@2.1, ventas@3.0, caja@2.2, inventario@1.4] → tema confeti → extensiones [confeti-etiquetas-pedido@1.0]`.

### Diagrama mental

```
                    ┌──────────────────────────────────┐
                    │        MASTER POS (1 repo)       │
                    │                                  │
                    │   NÚCLEO (siempre presente)      │
                    │   ├─ identidad, org, sucursal    │
                    │   ├─ permisos, auditoría         │
                    │   ├─ dinero, folios, config      │
                    │   └─ eventos, registry, diseño   │
                    │                                  │
                    │   MÓDULOS (activables)           │
                    │   catálogo · ventas · caja       │
                    │   inventario · compras · KDS     │
                    │   portal QR · CRM · citas · ...  │
                    └───────────────┬──────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
     ┌────────▼───────┐    ┌────────▼───────┐    ┌────────▼───────┐
     │  Confeti       │    │  Restaurante X │    │  Demo pública  │
     │  perfil:       │    │  perfil:       │    │  perfil:       │
     │  mostrador     │    │  restaurante   │    │  todos         │
     │  + tema        │    │  + tema        │    │  + datos seed  │
     │  + 1 extensión │    │                │    │                │
     └────────────────┘    └────────────────┘    └────────────────┘
             Mismo código. Distinta configuración.
```

---

## 2. La decisión #1: ¿ensamblar código o configurar una plataforma?

> **⚠ DECIDIDO el 6-sep-2026 — ver `05_ACTA_DE_DECISIONES_01.md` §2.**
> Miguel eligió **Modelo B: proyecto ensamblado por cliente.** El análisis de esta sección se conserva como registro de por qué se evaluó cada opción, pero la recomendación de "Modelo A" **queda superada**. Lo que aplica hoy:
> - Monorepo con paquetes versionados desde el día uno.
> - El generador de proyectos **no se construye** hasta que exista el primer cliente real.
> - Regla equivalente al "fork prohibido": **un proyecto de cliente declara dependencias, nunca copia código.**
> Los §§3–7 de este documento (niveles de personalización, sostenibilidad, versiones, organización) siguen vigentes tal cual en ambos modelos.

Esto es la contradicción **C-01** y hay que resolverla antes que nada, porque determina todo lo demás.

### Modelo A — Plataforma configurable (un código, muchos tenants)

Un repositorio. Un despliegue (o varios idénticos). Las capacidades se activan por tenant en base de datos. La personalización es configuración, tema y extensiones declaradas.

| A favor | En contra |
|---|---|
| Un parche de seguridad protege a todos, hoy | Todos los clientes comparten el mismo riesgo de despliegue |
| Un solo CI, una matriz de pruebas | Cambiar el núcleo exige cuidar a todos a la vez |
| Cliente nuevo = registro + configuración (horas) | El bundle "contiene" código que ese cliente no contrató |
| Un solo lugar donde arreglar un bug | Requiere disciplina real de contratos desde el día uno |
| Sostenible con 1–3 personas | |

### Modelo B — Ensamblaje de código por cliente (N repos generados)

Un generador o monorepo con paquetes publicados; cada cliente obtiene un proyecto compuesto con solo sus paquetes.

| A favor | En contra |
|---|---|
| El proyecto contiene físicamente solo lo contratado | Un parche de seguridad se aplica y despliega N veces |
| Cliente aislado de cambios ajenos | Los clientes divergen de versión; a los 2 años tienes 8 sistemas distintos |
| Un cliente puede quedarse en una versión vieja | La matriz de pruebas se multiplica por cliente |
| | Cada proyecto nuevo cuesta días de plomería, no horas |
| | **Es el modelo que hunde a los estudios pequeños** |

### Mi recomendación: **Modelo A, con dos matices**

**Elige Modelo A.** Es la única opción sostenible para una marca boutique pequeña, y es compatible con todo lo que quieres lograr. Los dos matices que lo hacen suficiente:

**Matiz 1 — La topología de despliegue es independiente del código.**
Que haya un solo código no obliga a un solo servidor. Tres topologías, misma imagen:

- *Compartida* (por defecto): varios tenants, una base de datos con `organizacion_id` y aislamiento probado. Es lo barato.
- *Dedicada*: un cliente, su propia base de datos y su propio dominio, **misma imagen de código**. Para quien lo exija o lo pague.
- *Local/on-premise*: futuro, misma imagen, para el caso de operación sin internet.

Así resuelves "cada cliente su proyecto" sin fragmentar el código. La separación de datos —que es lo que al cliente realmente le importa— la tienes en las tres.

**Matiz 2 — "Solo las piezas necesarias" se cumple, pero en el lugar correcto.**
Tu requisito real no es que el archivo JavaScript carezca físicamente del módulo de citas. Tu requisito real es que ese cliente **no vea, no pueda usar, no pueda invocar y no pague** funciones que no contrató. Eso se cumple con:

- **Backend:** el registry rechaza cualquier comando de un módulo no habilitado. No es un `if` en la UI; es un guardia antes del caso de uso, con prueba negativa en CI.
- **Base de datos:** las migraciones de un módulo no habilitado no se aplican a ese tenant, o sus tablas quedan vacías y sin escritura.
- **Frontend:** cada módulo es un *chunk* con carga diferida. Si no está habilitado, **el navegador nunca lo descarga**. Físicamente no llega al cliente. Esto satisface el requisito literal sin forkear nada.
- **Comercial:** los *entitlements* (qué compró) son una tabla distinta de los *permisos* (qué puede hacer un usuario). Nunca se mezclan — el paquete lo dice bien en D-18 y es correcto.

Con esos dos matices, Modelo A cumple tu visión completa. **Modelo B no aporta nada que Modelo A no logre, y cuesta muchísimo más.**

### Lo único que se prohíbe

**El fork.** Si un cliente necesita algo que la configuración, la composición y las extensiones no pueden dar, la respuesta correcta **no** es copiar el repositorio y modificarlo. Es agregar un punto de extensión al núcleo, que a partir de ese momento sirve para todos. La primera vez que forkees, Master POS deja de existir y vuelves a tener N sistemas.

---

## 3. Los cuatro niveles de personalización

Esta es la mecánica que hace que "bespoke" sea rentable. Toda petición de cliente se clasifica en un nivel, y **siempre se intenta el nivel más bajo posible**.

| Nivel | Qué es | Quién lo hace | Costo típico | % esperado |
|---|---|---|---|---|
| **1. Configuración** | Datos: nombres, colores, impuestos, catálogo, roles, textos, unidades, horarios, mensajes de ticket | El cliente o tú, desde la UI de administración | Minutos | ~70 % |
| **2. Composición** | Activar/desactivar capacidades, elegir perfil de giro, elegir layout y tema, elegir flujos declarados (ej. "la propina la decide el mesero" vs "la decide caja") | Tú, desde el registry, sin escribir código | Horas | ~20 % |
| **3. Extensión** | Código específico del cliente en un **paquete aislado** que solo usa puntos de extensión publicados: un reporte a medida, una integración con su sistema contable, una regla de precios propia, un formato de etiqueta | Tú, en `extensions/<cliente>/` | Días | ~9 % |
| **4. Núcleo** | La petición revela un hueco genérico. Se construye **en Master POS**, para todos, versionado | Tú, en el core o en un módulo | Semanas | ~1 % |
| ~~5. Fork~~ | ~~Copiar el repo y modificarlo~~ | — | — | **Prohibido** |

**La regla operativa:** cuando un cliente pide algo, la pregunta no es "¿cómo se lo hago?" sino "**¿en qué nivel cae?**". Si cae en 4 con demasiada frecuencia, tu modelo de capacidades está mal diseñado y hay que arreglarlo, no seguir empujando.

### Cómo se ve un punto de extensión

Un punto de extensión no es "código libre en cualquier parte". Es un lugar declarado del núcleo donde un paquete de cliente puede engancharse:

```
Puntos de extensión previstos (v1):
  precio.calcular          → ajustar precio antes de cerrar la cotización
  venta.antesDeConfirmar   → validar/bloquear con reglas del cliente
  venta.despuesDeConfirmar → disparar integraciones (sin poder abortar)
  ticket.render            → formato de impresión propio
  reporte.registrar        → añadir un reporte al catálogo
  navegacion.registrar     → añadir una entrada de menú
```

Cada punto tiene firma tipada, contrato versionado y **pruebas de contrato**: si un cambio en el núcleo rompe la extensión de Confeti, CI falla antes de desplegar. Es lo que te permite actualizar sin miedo.

---

## 4. ¿Es sostenible la estrategia de extracción y ensamblaje?

Respondo directo a tu punto 3.

### Sostenible: sí, con tres correcciones

**Corrección 1 — Extraer capacidades no significa extraer código del ZIP.**
Tu texto dice "recuperar las funciones existentes". El riesgo es interpretarlo como portar archivos. Con 1,592 errores de tipos, 359 accesos directos a datos y lógica de negocio dentro de pantallas, portar archivos importa los defectos con ellos. Lo que se extrae del ZIP son **decisiones**: qué campos necesita un mesero, qué estados tiene una comanda, cómo se reparte una propina mixta, qué imprime una precuenta. Esas decisiones se escriben como especificación y se reimplementan. El código es el testigo, no el material.

**Corrección 2 — El ensamblaje debe ser por configuración, no por composición de código** (§2).

**Corrección 3 — Falta el eslabón "perfil de giro" entre módulo y cliente** (riesgo R-03).
Sin él, cada cliente es una combinación única y no probada. Con él, tienes 4–6 combinaciones certificadas y los clientes son "perfil + pocos deltas". Es lo que hace probable que el sistema del cliente 12 funcione a la primera.

### El ejemplo de "Citas" que diste, resuelto

Tenías razón en que Citas no es una pantalla con calendario. Así se descompone en este modelo — y fíjate cuánto **ya existe** o existirá en el núcleo:

| Pieza que mencionaste | Dónde vive | Estado en el plan |
|---|---|---|
| Calendarios, horarios, disponibilidad | Módulo `agenda` | Nuevo (Etapa 5) |
| Empleados, recursos, cabinas | Núcleo (`empleados`) + `recursos` | Núcleo ya planeado |
| Servicios | Módulo `catalogo` — un servicio es un producto sin stock | **Ya existe si el catálogo se diseña genérico** |
| Clientes, historial | Módulo `crm` | Nuevo (Etapa 5) |
| Recordatorios | Módulo `notificaciones` | Nuevo |
| Anticipos, cancelaciones, no-show | Módulo `pagos` + estados de `agenda` | Pagos ya en núcleo |
| Paquetes/membresías | Módulo `lealtad` (ledger de saldo) | Nuevo |
| Comisiones | Módulo `comisiones` sobre eventos de venta | Nuevo |
| Insumo consumido en el servicio | Módulo `inventario` vía `consumirInsumos(origen: cita)` | **Ya existe** |
| Cobro y facturación | `ventas` + `pagos` vía cumplimiento de la cita | **Ya existe** |
| Reportes de ocupación | `reportes` consumiendo eventos de agenda | Motor ya existe |
| Historial del cliente | `crm` consumiendo eventos de orden | Nuevo |

**La lección:** de 14 piezas, 5 ya están cubiertas por el núcleo y los módulos de la Etapa 2–4, **si y solo si** el catálogo, el inventario y las ventas se diseñan sin suponer restaurante. Citas se vuelve un módulo mediano en vez de un producto entero. Eso es exactamente lo que quieres, y es la justificación concreta del riesgo R-04.

### Lo que hace insostenible el ensamblaje (señales de alarma)

Vigila estas cinco. Si aparecen, algo se está rompiendo:

1. Un módulo importa código de otro módulo directamente, en vez de usar su contrato.
2. Existen dos cálculos distintos de precio, impuesto o stock.
3. Una capacidad se desactiva y algo se rompe (deja datos huérfanos o rompe un reporte).
4. Un cliente necesita algo y la respuesta natural es "copio el repo".
5. Agregar un cliente nuevo cuesta más que el anterior en vez de menos.

---

## 5. Master POS es cuatro productos: cómo conviven

Contradicción **C-05** resuelta:

| Rol que le diste | Cómo se implementa | Por qué así |
|---|---|---|
| **Plataforma de producción** | El repositorio y sus despliegues estables | Es la base; manda sobre las demás |
| **Biblioteca de módulos** | El propio repositorio con el registry de capacidades | No hay biblioteca aparte: la biblioteca *es* el código |
| **Laboratorio** | Capacidades marcadas `estado: experimental` en el registry, detrás de bandera, **en el mismo repo** | Un laboratorio separado se pudre y diverge. Experimental significa: no se le puede vender a un cliente, no bloquea el release, sí corre en CI |
| **Demo / catálogo de ventas** | Tenants de demostración, uno por perfil de giro, sembrados con datos sintéticos y **reseteados cada noche** | Un tenant es una fila, no un sistema. Cuesta casi nada y siempre refleja la verdad |
| **Herramienta de ventas** | Página de capacidades **generada desde el registry**, no escrita a mano | Es la mejor pieza de este diseño: no puedes prometer algo que no existe, porque el material comercial se genera de lo que está marcado `estable`. Cero riesgo de vender humo |
| **Estándar de calidad** | Las puertas de CI y los ADR | La calidad que no se automatiza no ocurre |

---

## 6. Versiones y actualizaciones entre clientes

Respondo a tu punto 10.

### Qué se versiona

| Cosa | Esquema | Ejemplo |
|---|---|---|
| Plataforma (release train) | SemVer | `masterpos@1.4.0` |
| Cada capacidad | SemVer independiente | `inventario@2.1.0` |
| Cada contrato de dominio | Versión explícita | `contratos/venta@v1` |
| Cada perfil de giro | SemVer | `perfil-restaurante@3.0.0` |
| Cada extensión de cliente | SemVer + rango de compatibilidad | `confeti-etiquetas@1.2.0` requiere `contratos/venta ^1` |
| Esquema de datos | Migraciones numeradas, solo hacia adelante | `0042_agregar_almacenes.sql` |

### Cómo se actualiza sin romper clientes

Porque el código es uno solo (Modelo A), **todos los clientes están siempre en la misma versión de código.** Eso elimina de raíz el problema de mantener 8 versiones. Lo que queda por gestionar son dos cosas:

**1. Cambios de esquema — expandir, migrar, contraer.** Nunca un cambio destructivo de golpe:
- *Expandir:* agregar la columna/tabla nueva; el código escribe en ambas.
- *Migrar:* rellenar histórico por lotes, reconciliar conteos.
- *Contraer:* cuando nada lee lo viejo, eliminarlo. Semanas después, no el mismo día.

**2. Cambios de contrato — deprecación con ventana.** Un contrato no se cambia: se publica `v2` junto a `v1`, se marca `v1` deprecado con fecha, y CI reporta quién sigue usándolo. Se elimina cuando el contador llega a cero.

**Cómo un cliente puede "quedarse atrás" sin forkear:** no en el código, sino en el **comportamiento**. Si el flujo de propinas cambia y Confeti quiere el anterior, eso se vuelve una opción de configuración con valor por defecto nuevo y Confeti conserva el viejo. Si la diferencia es demasiado grande para ser una opción, entonces son dos capacidades distintas, ambas soportadas y versionadas. En ningún caso es una copia del código.

### Trazabilidad

Cada tenant tiene un registro auditable de: perfil y versión, capacidades y versiones, extensiones y versiones, migraciones aplicadas, versión de plataforma, y quién cambió qué y cuándo. Sin eso, "qué tiene el cliente 7" es una conversación de memoria — y es exactamente el problema que hoy tienes con tres versiones divergentes del POS actual (ZIP / borrador / En vivo). **Ese problema no debe repetirse: es el pecado original que estás pagando ahora.**

---

## 7. Organización de código, documentación y decisiones

Respondo a tu punto 11.

```
master-pos/
├─ apps/
│  ├─ web/                    # UI: React, chunks por capacidad
│  ├─ api/                    # backend: casos de uso, comandos
│  └─ worker/                 # jobs, outbox, integraciones
├─ packages/
│  ├─ core/                   # identidad, tenancy, permisos, dinero, folios, auditoría
│  ├─ contracts/              # DTOs, eventos, errores, puntos de extensión (versionados)
│  ├─ capabilities/
│  │  ├─ catalogo/            # cada una: dominio + api + ui + migraciones + pruebas + capability.json
│  │  ├─ ventas/
│  │  ├─ caja/
│  │  ├─ inventario/
│  │  ├─ compras/
│  │  ├─ restaurante/
│  │  └─ portal-qr/
│  ├─ profiles/               # perfiles de giro certificados
│  ├─ ui/                     # sistema de diseño, temas, layouts
│  ├─ registry/               # motor de capacidades: dependencias, activación, guardias
│  └─ testing/                # utilidades, fábricas de datos, fault injection
├─ extensions/
│  └─ confeti/                # código específico de cliente, solo puntos de extensión
├─ tenants/                   # configuración declarativa por cliente (versionada en Git)
├─ docs/
│  ├─ adr/                    # decisiones: contexto, opciones, elección, consecuencias, reversa
│  ├─ baseline/               # especificación funcional: Given/When/Then por flujo
│  ├─ capabilities/           # ficha por capacidad (las 12 declaraciones)
│  ├─ runbooks/               # operación: respaldo, restauración, incidentes, alta de cliente
│  └─ producto/               # perfiles de giro, catálogo comercial generado
└─ historico/                 # ZIP y auditoría, EXCLUIDO del build y del escaneo
```

**El flujo de una decisión, siempre igual:**

```
Necesidad (cliente o núcleo)
   → RFC corto: problema, opciones, recomendación
   → ADR: decisión firmada, con consecuencias y salida de reversa
   → Ficha de capacidad: las 12 declaraciones
   → Escenarios de prueba escritos ANTES del código
   → Implementación
   → Puertas de CI verdes
   → Documentación de operación
```

Ninguna capacidad se construye sin ficha. Ninguna decisión estructural sin ADR. **Ningún código sin escenario de prueba escrito antes** — es tu propio principio no negociable ("no se construye una función sin definir cómo se prueba") y aquí queda como paso obligatorio del flujo, no como buena intención.
