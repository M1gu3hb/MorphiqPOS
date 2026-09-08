# Reporte 001 — Codex — Arranque y dominio de catálogo

- **Agente:** Codex
- **Carril:** B (catálogo, inventario, gestión y público)
- **Rama:** carril-b
- **Fecha inicio / fin:** 2026-09-07, hora local de Ciudad de México.
- **Commits de implementación:** a715ba8 (integración), 27940c3 (B-01); este reporte se publica en un commit posterior.
- **Tareas cubiertas:** montaje y B-01. Cierre formal PRS pendiente.

## 1. El prompt que recibí

```text
Eres desarrollador en MorphiqPOS. Empiezas de cero: no conoces el proyecto,
así que lo primero es leerlo completo. Trabajas EN PARALELO con otro agente
(Claude Code) y tienes AUTONOMÍA TOTAL.

═══════════════════════════════════════════════════════════════════════
PASO 1 — LEE TODO ESTO ANTES DE ESCRIBIR UNA LÍNEA
═══════════════════════════════════════════════════════════════════════

Repositorio: https://github.com/M1gu3hb/MorphiqPOS

  1. CONTEXTO_MAESTRO.md      ← qué es MorphiqPOS, quién es Miguel, arquitectura
  2. TEAM.md                  ← cómo trabajas con el otro agente. CRÍTICO.
  3. DECISIONES.md            ← 48 decisiones. Mandan sobre todo.
  4. REGLAS.md                ← 34 reglas. Si algo las viola, se rechaza.
  5. docs/fase-1/18-REPARTO-DOS-CARRILES.md   ← tu carril es el B
  6. docs/fase-1/15-AUDITORIA-F1.0-Y-REPLANTEAMIENTO.md
  7. docs/fase-1/16-CORTE-F1.1-POS-QUE-VENDE.md
  8. docs/fase-1/10-CORTE-F1.3-INVENTARIO-Y-COMPRAS.md  ← también tuyo
  9. docs/fase-1/12-CORTE-F1.5-QR-Y-CIERRE.md           ← el portal QR es tuyo
 10. docs/fase-1/03-MODELO-DE-DATOS-UNIFICADO.md
 11. docs/fase-1/04-ARQUITECTURA-Y-MONOREPO.md
 12. docs/fase-1/05-SISTEMA-DE-DISENO-Y-ESTILOS.md
 13. docs/fase-1/06-DEFECTOS-Y-ERRADICACION.md
 14. docs/reports/PLANTILLA.md
 15. docs/fase-1/BITACORA.md   ← dónde quedó la última sesión

Después revisa el CÓDIGO en D:\MIS PROYECTOS\Master POS\morphiqpos-codex:
el monorepo, packages/domain/dinero, packages/ui (36 primitivas tokenizadas),
packages/data (Kysely + migraciones), y las 26 tablas ya aplicadas.

Y revisa historico/ — ahí están los DOS sistemas originales de Miguel: un POS
de restaurante y uno de tienda. Son la ESPECIFICACIÓN de lo que hay que
construir. Se leen. NO se copia un solo archivo de ahí.

QUÉ ES ESTO: MorphiqPOS es UN PUNTO DE VENTA. Miguel ya tiene dos que vendió
a clientes reales; esto los une en uno solo, corregido y con más funciones.
No es una plataforma abstracta: se abre, se vende con él, y se le enseña a un
prospecto para cerrar la venta.

═══════════════════════════════════════════════════════════════════════
PASO 2 — MONTAJE
═══════════════════════════════════════════════════════════════════════

Tu carpeta: D:\MIS PROYECTOS\Master POS\morphiqpos-codex
Tu rama:    carril-b
Claude Code la crea con git worktree. Si no existe todavía, créala tú
(comandos en TEAM.md §2) y avísalo en tu reporte.

NUNCA cambias de rama ni entras a D:\MIS PROYECTOS\Master POS\morphiqpos.

Identidad de commits:
    git config user.name "M1gu3hb"
    git config user.email "enchuer2797@gmail.com"

Credenciales: Miguel tiene Supabase CLI instalado y te da permiso expreso
para sacar las claves del proyecto wyqmzhliurwyxuyxznpb y escribirlas en
.env (que está en .gitignore). Si Claude Code ya lo hizo, verifica que .env
esté completo. Si falló, hazlo tú.
Nunca pongas un secreto en el código, en un reporte ni en un commit: el
repositorio es público.
⚠️ El proyecto "Pasteleria Confetti" (ivqcxdpqxwjxfohiswqb) NO SE TOCA. Ni
para leer.

═══════════════════════════════════════════════════════════════════════
TU CARRIL: B — CATÁLOGO, INVENTARIO, GESTIÓN Y PÚBLICO
═══════════════════════════════════════════════════════════════════════

24 tareas, B-01 a B-24, en docs/fase-1/18-REPARTO-DOS-CARRILES.md §4.
Van F1.1 (catálogo, configuración, stock, pantallas de gestión, semillas,
despliegue), F1.3 (recetas, compras, gastos, fiado, devoluciones, conteos,
reportes, importación) y F1.4 (portal QR y panel del dueño) enteras.

EMPIEZA POR B-01: el dominio de catálogo. Es lógica pura, sin base de datos
ni dependencias — puedes arrancar de inmediato sin esperar a nadie.

Claude Code depende de ti en B-02 y B-03 (consumo.ts y stock.ts). Constrúyelos
pronto y súbelos apenas pasen sus pruebas: sin eso él no puede cerrar el cobro.

Tu única dependencia de él es packages/app/comando.ts, que es su primera
tarea. Si aún no está cuando lo necesites, avanza con dominio puro y pantallas.

Zonas de propiedad en TEAM.md §3. Migraciones: rango 040–069.
Si un archivo no es tuyo, no lo tocas. Aunque veas un bug. Lo anotas en tu
reporte, sección "Bugs ajenos detectados".

═══════════════════════════════════════════════════════════════════════
AUTONOMÍA
═══════════════════════════════════════════════════════════════════════

DECIDES TÚ y lo documentas: librerías, versiones, nombres, estructura,
orden de tareas, diseño de pruebas y mutaciones, bugs que encuentres,
diseño visual dentro de los tokens, y cualquier cosa reversible.

PREGUNTAS a Miguel sólo si: es irreversible, contradice DECISIONES.md o
REGLAS.md, o toca datos de un cliente real.

Si dudas entre preguntar y decidir: DECIDE y escríbelo.

═══════════════════════════════════════════════════════════════════════
NO SE NEGOCIA
═══════════════════════════════════════════════════════════════════════

· Cero lógica de negocio en RLS o Edge Functions. Todo en la API TypeScript
  con transacciones reales por Kysely. Miguel tiene que poder instalarle el
  backend completo a un cliente en su propia PC, sin internet.
· Precios y totales SIEMPRE en el servidor. El endpoint no acepta importes
  del cliente.
· Stock: ledger inmutable con decremento atómico. Falla en vez de silenciar
  la sobreventa. Nunca Math.max(0,...).
· Autorización en el servidor. Ocultar un botón no es autorización.
· El selector de paquete (Tienda·Ferretería·Farmacia·Cafetería·Restaurante)
  se verifica en el SERVIDOR: 403 PAQUETE_NO_INCLUYE, no botones ocultos.
· Dinero en bigint de centavos.
· TypeScript estricto. Cero any, cero @ts-ignore, cero catch vacío.
· Ningún archivo supera 300 líneas.
· historico/ se lee como especificación. No se copia un solo archivo.
· La prueba ANTES que el código, y después la mutación: quítala, confirma
  que falla, restaura. Una prueba que pasa igual con y sin la corrección no
  prueba nada.
· Los datos de demostración son creíbles. Cero "Producto 1, $100": Miguel se
  los va a enseñar a un cliente.
· El estándar de entrega es morphiq-prs, en el repositorio. Nada se declara
  terminado sin pasar su gate.

═══════════════════════════════════════════════════════════════════════
AL TERMINAR
═══════════════════════════════════════════════════════════════════════

Escribe tu reporte en docs/reports/NNN-codex-<tema>.md siguiendo
PLANTILLA.md. El folio es correlativo COMPARTIDO con Claude Code: mira el
número más alto que exista y toma el siguiente.

El campo "Lo que NO hice" es obligatorio y es el que más importa. Ahí va lo
que quedó fuera, lo que declaraste hecho con un hueco, y toda afirmación del
reporte que no puedas respaldar ejecutando algo.

Sube todo: código, documentación y reporte. Nada se queda en local.

Habla español, conciso y directo. Miguel usa voz a texto: si algo suena raro,
pregunta antes de asumir.

Arranca: lee los 15 documentos y el código, y luego B-01. Trabaja sin pedir
permiso. Avisa cuando termines.
```

## 2. Qué se me pidió

Leer la especificación, montar el worktree B, empezar con el dominio puro de catálogo y publicar código y reporte. Priorizar después B-02 y B-03 para que A integre inventario en el cobro.

## 3. Qué hice — tarea por tarea

### Montaje y lectura

- Creé `morphiqpos-codex` y `carril-b` desde el código local 05f94a8 mediante `git worktree add`, usando metadatos Git sin entrar a la carpeta de A.
- Leí los 15 documentos indicados desde las copias locales disponibles y contrasté el árbol remoto; consulté también la bitácora local actualizada de la ejecución anterior.
- Revisé monorepo, dinero, contratos, cliente Kysely, tipos generados, esquema de catálogo y stock, tokens y configuración de validación.
- Reconstruí `historico/` ignorado: restaurante desde su ZIP, tienda por clon y auditoría mediante junction al paquete local. Leí las tres utilidades señaladas y usos de mayoreo de tienda. Ningún archivo histórico entró a implementación.
- Uní las historias de código y documentación. Único conflicto: README, conservado del remoto; el README de código permanece completo en `docs/ARRANQUE-CODEX.md`.
- Configuré la identidad solicitada y origin. Publiqué `carril-b`; no cambié de rama ni integré a main.
- Supabase CLI confirmó 26 tablas operativas más `_migraciones`, todas con RLS. Recuperé claves API sólo de MorphiqPOS y las guardé en `.env` ignorado. Generé secretos nuevos de sesión/PIN. No apliqué migraciones ni cambié datos operativos.

### B-01 · Dominio de catálogo

- **Qué construí:** cuatro tipos de venta, subtotal exacto, mayoreo optativo, cantidades con cuatro decimales, conversiones compatibles, empaques con equivalencia explícita y porciones explícitas o derivadas.
- **Cómo:** bigint en diezmilésimas para cantidades, centavos existentes para dinero y una sola llamada al redondeo ya construido. Los errores son `ErrorDominio`, no ceros silenciosos.
- **Archivos creados:** nueve archivos en `packages/domain/src/catalogo/`; `scripts/verificar-catalogo-codex.mjs`; contrato `docs/fase-1/B01-CATALOGO-CONTRATO.md` y pendientes cruzados.
- **Archivos modificados:** `packages/domain/package.json` agrega exportación; `packages/contracts/src/errores/index.ts` agrega tres códigos. Aviso de zona neutral en commit y pendientes. No se retiraron exportaciones ni códigos existentes.
- **Migraciones aplicadas:** ninguna.
- **Pruebas:** `cantidades.test.ts` cubre parser, rango, alias, dimensiones y precisión; `precio.test.ts` cubre los cuatro tipos, mayoreo, redondeo, límites y enteros; `porciones.test.ts` cubre división exacta del contenedor y contenido del empaque. Total: 62.
- **Antes de implementar:** primero falló la resolución del módulo; después, con firmas que lanzaban, fallaron 32 de 57 aserciones. La ampliación de porciones/equivalencias falló con 3 de 5 antes de completarla.
- **Mutaciones:** 18 retiradas concretas, todas detectadas por aserciones fallidas y restauradas. Incluyen redondeo, precisión monetaria, mayoreo, cero/negativos, límites, unidades, empaques, porciones y desbordamiento. Reproducibles con el script publicado.
- **Aceptación:** cálculo por peso y porción verificado; cierre formal pendiente del gate completo. No equivale a tener catálogo persistido o una pantalla de productos.

## 4. Errores que encontré

### Error propio — lector del reporte JSON de Vitest

- Supuse que `--reporter=json` devolvía JSON por stdout; esta versión escribe un archivo y muestra su ubicación. El verificador falló con SyntaxError antes de mutar.
- Lo detecté al ejecutar el script y revisar la salida con la habilidad de depuración sistemática. Cambié a un `--outputFile` explícito bajo `coverage/` y lectura de ese archivo.
- Verificación: 18 mutaciones detectadas y restauración verde. Un error de importación o sintaxis sin aserciones fallidas no cuenta como mutación detectada.
- No estaba en verde antes. Las dos primeras aplicaciones de patches también fallaron por contexto de parche; no alteraron el código.

## 5. Decisiones que tomé sin preguntar

| Decisión                                 | Alternativas                | Razón                                       | Registro                                               |
| ---------------------------------------- | --------------------------- | ------------------------------------------- | ------------------------------------------------------ |
| Cantidades bigint con escala 10000       | Number / biblioteca decimal | Exactitud del esquema sin dependencia nueva | Contrato B01; aplicación de R15, no cambio estructural |
| Rechazar conversión no representable     | Truncar / redondear stock   | No perder inventario silenciosamente        | Contrato B01                                           |
| Incrementos desde cero                   | Desde mínimo                | Regla determinista, explícita y probada     | Contrato B01; supuesto de implementación               |
| Conservar `src/catalogo`                 | Crear otro árbol sin src    | Respeta exports y tsconfig existentes       | Contrato B01                                           |
| Preservar ambos README al unir historias | Descartar uno               | Mantener arquitectura y arranque            | Este reporte y commit de integración                   |

## 6. Verificación ejecutada — evidencia, no promesas

| Comando                                     | Resultado     | Evidencia                                                                                 |
| ------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`            | 0             | Sin cambio al lockfile                                                                    |
| `pnpm test:unit`                            | 0             | 220 pruebas, 9 archivos; 62 de catálogo                                                   |
| `node scripts/verificar-catalogo-codex.mjs` | 0             | 18 mutaciones detectadas; código restaurado                                               |
| `pnpm lint`                                 | 0             | Sin errores; aviso existente de ruta pages de Next                                        |
| `pnpm typecheck`                            | 0             | Seis paquetes                                                                             |
| `pnpm build`                                | 0             | Build de web; rutas existentes / y /estilos                                               |
| Prettier de archivos B-01                   | 0             | Todos conformes                                                                           |
| `pnpm format:check`                         | 1             | Documentación importada no conforme; también señaló caché temporal de CLI ya retirada     |
| `pnpm verify`                               | 1             | Se detiene en 14 referencias históricas de documentación detectadas por `verify:residuos` |
| `pnpm audit --audit-level high --prod`      | 0             | Sin vulnerabilidades conocidas                                                            |
| `git diff --check`                          | 0             | Sin errores de whitespace                                                                 |
| `pnpm test:integracion` / `pnpm test:e2e`   | No ejecutados | Este cambio es dominio puro; no prueba endpoints ni SQL transaccional                     |

**Base real:** consultas por Management API a metadatos de tablas/RLS, únicamente en MorphiqPOS. No se ejecutaron pruebas de transacciones, concurrencia o cobro. Una consulta de metadatos no demuestra esos comportamientos.

## 7. Gate `morphiq-prs`

- **Superficie de este cambio:** dominio monetario S10, preparatorio de backend S5. No se añadieron UI, endpoints ni persistencia.
- **BLOCKERS:** no está disponible el estándar completo; sólo gates resumidos en documentos. `pnpm verify` global está rojo por documentación histórica integrada.
- **CRITICAL aceptados:** ninguno; no se presume aceptación de riesgos.
- **No verificado:** gate completo, CI remoto, autorizaciones/paquetes, integración PostgreSQL, demo de un día. No se declara PRS aprobado.

## 8. Lo que NO hice

- No completé B-02 a B-24 ni `consumo.ts`/`stock.ts`. Este arranque implementa B-01, que fue la primera tarea solicitada.
- No declaro ninguna tarea formalmente terminada mientras el gate esté pendiente; B-01 sí tiene implementación comprobada.
- No completé `.env`: faltan DATABASE_URL y credenciales de almacenamiento. Las claves API no son la contraseña de PostgreSQL ni credenciales S3.
- No leí línea por línea la totalidad de ambos sistemas históricos ni audité cada primitiva UI. La lectura de código se concentró en arquitectura y especificación de B-01.
- No comprobé cada una de las 62 pruebas con una mutación distinta: se comprobaron las 18 protecciones explícitas del script.
- No afirmo cobertura total, aislamiento de tenant en endpoints, inventario atómico, precios protegidos por un servidor ya integrado ni despliegue listo.
- No cambié archivos del carril A para arreglar los gates. No integré a main con verificación roja.
- No pude localizar `morphiq-prs`: busqué en el remoto, copias locales de documentación y directorios de habilidades. Se solicitó su ruta a Miguel; pendiente de respuesta.

## 9. Bugs ajenos detectados

| Archivo                                    | Qué vi                                                                         | Gravedad             |
| ------------------------------------------ | ------------------------------------------------------------------------------ | -------------------- |
| `scripts/verificar-residuos.mjs` (neutral) | Rechaza referencias de las propias auditorías al reunir documentación y código | Bloquea verify       |
| Documentación remota / Prettier (neutral)  | No comparte el formato exigido por el código                                   | Bloquea format:check |
| `eslint.config.mjs` (neutral)              | Aviso de directorio pages en raíz aunque web vive en apps/web                  | Menor; lint sale 0   |

## 10. Pendientes cruzados

`docs/reports/PENDIENTES-CRUZADOS.md`: A entrega `comando()`; B debe entregar aún consumo/stock. Sin STUB de negocio publicado. Los stubs de la fase roja fueron retirados antes del commit.

## 11. Estado al cerrar

- **Tareas formalmente terminadas:** 0 de 24; B-01 implementado, probado y publicado con cierre PRS pendiente.
- **Rama integrada a main:** no; gates globales rojos. Código en `carril-b`, commit 27940c3.
- **Bloqueos:** ruta del estándar completo para certificar entrega; credenciales PostgreSQL/almacenamiento para la integración posterior.
- **Siguiente tarea:** B-02 y B-03; consumo puro primero, repositorio con pruebas contra PostgreSQL real después.

## 12. Para el que retome esto

Importa `@morphiqpos/domain/catalogo`, no una segunda copia de fórmulas. El servidor arma ProductoParaPrecio con datos persistidos; captura sólo lleva cantidad y unidad. No confundas subtotal con total de orden. El contrato B01 explica unidades de mayoreo, equivalencias y precisión; lee los pendientes antes de integrar. Los archivos mutados siempre se restauran mediante finally.
