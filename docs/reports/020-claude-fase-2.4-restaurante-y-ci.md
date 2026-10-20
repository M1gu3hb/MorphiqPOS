# Reporte 020 — Claude Code — Etapa 2.4: el restaurante presentable y CI en verde tras la intervención

- **Agente:** Claude Code
- **Carril:** el encargo único de estabilización (los carriles de `TEAM.md` no aplican, como dice el encargo)
- **Rama:** `claude/morphiq-pos-stabilization-u5qfo1` · PR [#13](https://github.com/M1gu3hb/MorphiqPOS/pull/13) contra `main`
- **Fecha inicio / fin:** 19-10-2026 / 20-10-2026
- **Commits de esta entrega:** `bd3a803` … la punta del PR #13 (sobre `main` @ `5a5bf6f`), todos de `M1gu3hb <118588634+M1gu3hb@users.noreply.github.com>`, sin coautoría
- **Continúa:** el PR [#12](https://github.com/M1gu3hb/MorphiqPOS/pull/12) (fusionado por Miguel) y la intervención autorizada de Codex/ChatGPT (`c1ada17`…`5a5bf6f`, A-52/D-42), que esta rama trae por la fusión `df25286`

## 1. El prompt que recibí

El encargo, textual:

> Vas a continuar y cerrar la estabilización de Morphiq POS, repositorio "M1gu3hb/MorphiqPOS".
>
> Eres el desarrollador principal y responsable técnico de la implementación. Tienes autonomía para investigar, diseñar arquitectura, corregir problemas y mejorar las soluciones necesarias para cumplir el objetivo. No te limites a ejecutar literalmente una lista: usa criterio propio y resuelve también las causas y dependencias de los problemas encontrados.
>
> El objetivo es dejar los cinco modelos actuales —abarrotes, cafetería, restaurante, ferretería y estética/salón— funcionando de extremo a extremo, con dinero e inventario conciliados, permisos correctos, pruebas automatizadas y esquema compatible con el código.
>
> El dominio y DNS los resolveré yo. No los modifiques.
>
> 1. Primero entiende todo el proyecto
>
> Antes de editar código, ejecutar migraciones o modificar infraestructura, lee todo el contexto y la documentación del proyecto.
>
> Empieza por:
>
> - "AGENTS.md" y las instrucciones aplicables de cada carpeta.
> - "CONTEXTO_MAESTRO.md", "REGLAS.md", "DECISIONES.md" y "TEAM.md".
> - Documentación de arquitectura y ADR.
> - "docs/fase-2/00-LEEME-PRIMERO.md", mapa general, catálogo de funciones, estado, bitácora y excepciones.
> - Documentación completa de los cinco modelos: funciones, dinero/caja, inventario, interfaz, backend y mapas de archivos.
> - Reportes previos, pruebas, scripts de verificación y workflows.
> - El reporte "Auditoria_MorphiqPOS_2026-10-19.md", si está disponible. Si no está, continúa con este contexto y verifica los hallazgos directamente.
>
> La documentación tiene contradicciones y estados antiguos. Reconstruye el estado vigente contrastando documentos, código, historial, pruebas, despliegues y base real. No tomes una afirmación de “terminado” como evidencia suficiente.
>
> Actualización de responsabilidades: esta sesión de Claude Code se encarga de todo el desarrollo y de las decisiones técnicas necesarias. Miguel y ChatGPT dirigen, conversan y revisan. Las divisiones antiguas por carriles de "TEAM.md" no representan este encargo; actualízalas coherentemente sin interferir con trabajo ajeno activo.
>
> Al terminar la lectura, presenta un resumen breve de lo entendido, los riesgos y tu plan. Después continúa ejecutándolo sin esperar otra confirmación para las tareas ya autorizadas.
>
> Contexto verificado el 19 de octubre de 2026
>
> Estos datos son el punto de partida; comprueba si han cambiado:
>
> - Producción estaba en "main", commit "25c0fdd850c5110562b2f277a6304fc96af6e43c".
> - El avance más reciente estaba en "fase-2.4", commit "01782177aa561e59697bba712dd5032b77aecea1".
> - Supabase de Morphiq POS: "wyqmzhliurwyxuyxznpb".
> - Había 113 migraciones en disco y 112 aplicadas. Faltaba "181_pago_a_credito.sql"; los hashes de las anteriores coincidían.
> - El código de ferretería registraba pagos con método "credito", pero el CHECK desplegado todavía lo rechazaba.
> - Las unitarias dieron 4,038 aprobadas y 3 omitidas; TypeScript pasó.
> - Lint encontró 25 errores en "_exploracion-restaurante.spec.ts"; formato falló en ese archivo y en la ruta de autorización de supervisor.
> - "verify:adopcion" encontró siete componentes de restaurante en rojo. Algunos pueden ser falsos positivos por tratar componentes presentacionales como pantallas.
> - La última ejecución completa encontrada de CI falló en la suite básica de restaurante, alrededor del portal del comensal. El HEAD más reciente no tenía una corrida completa.
> - Las suites de día completo, permisos e aislamiento existían parcialmente, pero no estaban ejecutándose en el workflow actual.
> - La última bitácora registraba abarrotes y cafetería con día completo aprobado; estética fallando al guardar una fórmula; ferretería pendiente de correr; restaurante incompleto.
> - El puente de consultas aplicaba organización y recortes personales, pero no incorporaba una frontera general por sucursal derivada de sesión. Hay que comprobar y resolver ese alcance según rol.
> - El build de la auditoría quedó bloqueado por acceso a Google Fonts y la integración por falta de PostgreSQL desechable/Docker. Eso no demuestra un defecto de aplicación: reintenta correctamente en tu entorno.
>
> No toques el proyecto Supabase de Pastelería Confetti: "ivqcxdpqxwjxfohiswqb".
>
> 2. Cierra los flujos pendientes y sus causas
>
> Investiga y completa:
>
> - Crédito/remisiones de ferretería: venta, folio, pago a crédito, cartera, salida de inventario, devoluciones y conciliación, con el tratamiento correcto del cajón.
> - Estética: guardado de fórmula, expediente, agenda, walk-in/no-show y cualquier dependencia que impida completar su jornada.
> - Restaurante: termina la suite de día completo y los comportamientos que descubra incompletos.
> - Portal del comensal: reproduce el fallo de CI y distingue defecto funcional, fixture y expectativa obsoleta. Corrige lo que realmente esté mal.
> - Problemas relacionados en los otros modelos o componentes compartidos.
> - Gates fallidos, documentación contradictoria y pruebas exploratorias que hayan quedado dentro de la entrega.
>
> No pongas código artificial para satisfacer verificadores. Si un gate interpreta mal un componente, corrige su clasificación y prueba el verificador. Si falta comportamiento real, impleméntalo.
>
> Conserva la arquitectura útil. Refactoriza donde sea necesario para resolver responsabilidades, acoplamiento y contratos ambiguos, especialmente dinero y puente heredado. Evita una reescritura general sin justificación.
>
> 3. Comprueba cinco jornadas completas
>
> Construye o completa y ejecuta una jornada realista por modelo, usando PostgreSQL desechable y las pantallas/API que utiliza cada rol.
>
> Incluye, según corresponda:
>
> - Apertura, fondo, venta, pagos por método, mixtos y cambio.
> - Descuentos y autorización de supervisor.
> - Cancelaciones, devoluciones totales/parciales y reintentos.
> - Compras, entradas, consumo, ajustes y movimientos de inventario.
> - Gastos, retiros, cortes de turno y cierre diario.
> - Propinas, anticipos, crédito, comisiones y otros pasivos separados de ingresos.
> - Dos terminales/cajas y concurrencia donde el modelo lo requiera.
> - Flujos propios: mesa/comanda/cocina; barra/recogida; nota/remisión; agenda/servicio/expediente.
>
> Conciliar al centavo contra el servidor: ventas, pagos, cajón, devoluciones, saldos y pasivos; también cantidades y movimientos de inventario. Verifica persistencia después de recargar y volver a entrar.
>
> Añade pruebas negativas por rol, aislamiento entre organizaciones y entre dos sucursales de una misma organización. Define explícitamente qué roles pueden consultar información consolidada.
>
> Comprueba duplicación de cobros, último artículo, carreras y fallos intermedios. Una operación debe confirmar íntegra o revertirse, y un reintento no debe duplicar sus efectos.
>
> No ejecutes suites destructivas, reseteos ni siembras sobre negocios reales. Usa las guardas existentes y una base desechable; un nombre que empieza por “demo” no basta para asumir que un negocio es de pruebas.
>
> 4. Haz que CI compruebe el producto
>
> Integra al workflow las suites críticas de jornada completa, permisos y aislamiento. Que un generador esté actualizado no sustituye ejecutar las pruebas.
>
> Asegura que el avance que entregues se verifica automáticamente mediante su rama/PR y que el resultado corresponde al SHA exacto entregado.
>
> Ejecuta las comprobaciones aplicables: formato, lint, tipos, unitarias, integración, contratos, mutaciones pertinentes, build y E2E. Incluye escritorio, tablet y teléfono según los flujos. Justifica la cobertura de motores de navegador.
>
> Corrige causas de fallos intermitentes: reloj, datos compartidos, orden, fixtures o esperas incorrectas. No escondas problemas con skips, retries excesivos, umbrales reducidos ni expectativas debilitadas.
>
> Respeta las exclusiones comerciales documentadas: no necesitas incorporar PAC/CFDI, hardware de impresión o proveedores nuevos para terminar este corte. Mantén visibles y precisas esas exclusiones.
>
> 5. Alinea esquema, código y entrega verificable
>
> La alineación del esquema de Morphiq POS necesaria para este cierre está autorizada. Hazla mediante el proceso de migraciones del repositorio y con evidencia.
>
> Antes de modificar la base compartida:
>
> 1. Verifica el proyecto y el estado real.
> 2. Prueba las migraciones sobre PostgreSQL desechable, incluyendo actualización desde el esquema vigente.
> 3. Comprueba compatibilidad con la versión que todavía sirve producción.
> 4. Genera respaldo y comprueba su restauración en un entorno separado.
> 5. Prepara recuperación/rollback viable.
> 6. Aplica las migraciones necesarias y verifica ledger, hashes, restricciones, permisos y flujos afectados.
>
> No cambies migraciones históricas aplicadas, no falsifiques el ledger ni uses SQL manual sin trazabilidad para ocultar diferencias.
>
> Prueba el preview resultante desde fuera, con configuración y autenticación correctas. No promociones a producción una versión sin aceptación completa.
>
> Deja los cambios integrados en una rama clara, commits coherentes y un PR actualizado contra la base correcta. Conserva los cambios útiles de ramas anteriores; no asumas que el PR antiguo contiene todo el avance.
>
> DNS y dominio quedan fuera de tu trabajo. Tampoco abras todavía otra expansión de giros ni el generador de proyectos por cliente: este corte termina con los modelos actuales estabilizados y el esquema alineado.
>
> Forma de trabajar y entrega
>
> Mantén un plan y una bitácora vigentes para poder retomar en otra sesión. Actualiza documentación obsoleta y registra decisiones estructurales con alternativas y consecuencias.
>
> Tienes criterio propio para arquitectura y mejoras necesarias para cerrar el objetivo. Haz visibles los cambios de alcance; prioriza integridad, seguridad, comportamiento y mantenibilidad.
>
> No te detengas en un diagnóstico o una lista de recomendaciones: implementa, prueba, corrige y vuelve a verificar hasta completar lo autorizado. Si falta un acceso indispensable, identifica el bloqueo exacto y continúa con el trabajo independiente. No inventes resultados ni expongas secretos.
>
> Entrega un reporte final con:
>
> - Qué cambió y por qué.
> - Resultado de cada modelo y jornada completa.
> - Pruebas ejecutadas, resultados, SHA y enlaces de CI/preview/PR.
> - Migraciones aplicadas y evidencia de respaldo/restauración.
> - Defectos descubiertos y corregidos.
> - Limitaciones, exclusiones y bloqueos reales.
> - Estado explícito: qué está aprobado y qué todavía no.
>
> No declares “todo funciona” basándote sólo en que compila, carga o tiene muchos tests.
>
> ah, y aparte, todos los commits deben quedar a mi nombre en GitHub, usando mi identidad:
>
> - Usuario y autor: "M1gu3hb"
> - Correo: "118588634+M1gu3hb@users.noreply.github.com"
>
> Configura esa identidad localmente en este repositorio y verifica la autoría antes de cada commit. Usa mi cuenta conectada para subirlos. No pongas a Claude como autor ni añadas líneas "Co-Authored-By" de Claude o Anthropic. No reescribas commits anteriores.
>
> Si utilizas subagentes, no uses Opus como subagente. Reserva el razonamiento principal, la arquitectura, la coordinación y la revisión final para ti. Delega a Haiku o Sonnet según la dificultad, eligiendo el modelo más económico capaz de resolver correctamente cada tarea.
>
> Antes de delegar, divide el trabajo en encargos concretos y acotados. Cada subagente debe recibir contexto suficiente, objetivo, archivos permitidos, contratos que debe respetar, criterios de aceptación y verificaciones necesarias. Evita tareas ambiguas, exploraciones enormes y modificaciones simultáneas sobre los mismos archivos.
>
> Usa Haiku para tareas mecánicas o sencillas y Sonnet para implementación o análisis que necesiten más criterio. No despliegues agentes por desplegarlos: evalúa si ahorrarán trabajo y costo. Revisa sus resultados y verifica la integración antes de aceptarlos; un reporte de “terminado” no sustituye comprobar el trabajo.
> Detente tantito, porfa, pausa ya, corta, en un rato te digo que continúes, porfa

Y para retomar, `docs/reports/CONTINUAR-CLAUDE-2026-10-20.md` (en el repositorio): seguir y cerrar;
el restaurante operable, navegable y presentable como prioridad; el archivo del día del restaurante
que faltaba en CI, la CITA-1 de la estética y la galería; producción es `main` en
https://morphiqpos-kappa.vercel.app; no cambiar la cuenta «Miguel, Dueño general» ni reaplicar la
181/182.

## 2. Qué se me pidió

Cerrar la estabilización de los cinco modelos —tienda, cafetería, restaurante, ferretería y salón—
con el dinero y el inventario conciliados al centavo, los permisos correctos, las pruebas en CI
sobre el SHA exacto, el esquema alineado por el proceso de migraciones y el preview probado desde
fuera; y, después de la intervención, el restaurante primero: que Miguel lo pueda operar, recorrer y
presentar, en PC y en teléfono. Sin tocar negocios reales, la pastelería, el dominio ni el DNS, sin
promover a producción y sin abrir giros nuevos.

## 3. El encargo, punto por punto

| # | Lo que pidió | Estado | Evidencia |
| --- | --- | --- | --- |
| 1 | El estado real, no el escrito | ✅ | §5: tres puertas de `main` estaban rojas sin que nada lo dijera; el contrato de esquema, parchado a mano; un índice de producción fuera del ledger |
| 2a | Crédito y remisiones de ferretería | ✅ | D-37, la 181 y la 182 (aplicadas el 19-10 en la intervención); la jornada de ferretería en CI |
| 2b | Estética: fórmula, expediente, agenda, walk-in, no-show | ✅ el día; 🟨 mejoras | La jornada del salón llega al final y cuadra (fórmula en el expediente, cobro, comisiones, liquidación) en CI. Las mejoras del subagente que no hacían falta para el día quedan sin integrar (§8) |
| 2c | Restaurante: la jornada y lo que destape | ✅ | `dia-completo-restaurante` por el recorrido heredado en PC, tableta y teléfono, en CI (47.9 s, 47.5 s, 41.1 s); once defectos del producto arreglados antes de escribirlos como prueba (§4) |
| 2d | El portal del comensal | ✅ | Cerrado en la entrega anterior (PR #12) |
| 2e | Puertas rojas y documentos | ✅ | `verify:mutaciones-backend`, `verify:matriz`, tokens, adopción, cobertura y la suite del restaurante, rojas en `main`, en verde (§5) |
| 3 | Cinco jornadas conciliadas, negativas, aislamiento | ✅ | Las cinco en CI (corrida 39427748961, `b819b0c`), con la matriz de permisos y el aislamiento |
| 4 | CI sobre el SHA exacto | 🟨 | En verde menos la galería, que se regenera (§6) |
| 5a | Esquema alineado por migraciones | ✅ alineado; 🟨 183 sin aplicar | Ledger 114 = disco; esquema de producción = las migraciones + `mesas_numero_unico`, que la 183 crea (no-op en producción). §7 |
| 5b | El preview desde fuera | ✗ bloqueado | Sirve la entrada; entrar contesta 403 por una variable de Preview que esta sesión no puede crear (§9) |
| 5c | Rama, commits, PR | ✅ | PR #13, commits a nombre de M1gu3hb |

## 4. Qué hice

### El restaurante, por el recorrido que se presenta

`pruebas/e2e/dia-completo-restaurante.spec.ts` (`d395560`): cada puesto en su aparato y con su
terminal —la mesera sólo ve «Mesas y pedidos»—, caja con $1,500, tres mesas con comanda a cocina y a
barra, preparación, entrega, precuenta con 10 %, 15 % y sin propina, cobro en efectivo con cambio,
tarjeta y mixto, corte de turno, cierre a ciegas con $10 de faltante y su PDF, la dueña leyendo
ventas y propinas en su teléfono, el almacén bajando lo de las recetas, y el dinero contra el
servidor: cuadra al centavo y con un centavo de más NO. Tras recargar y volver a entrar por el
acceso central, el día sigue ahí. En el teléfono mide además que el botón del menú se lea en los
ocho estilos, claro y oscuro (D-43). `vigilarFallos` tumba el día ante cualquier 4xx/5xx de la API y
dice en qué pantalla llegó.

Defectos del producto que destapó, cada uno arreglado antes de escribirlo como prueba:

| Commit | Qué pasaba |
| --- | --- |
| `a3fadf9` | La cuenta no se tomaba con candado, cambiar de mesa fallaba y la división no cuadraba |
| `f7f5a96` | Las vistas adicionales no seguían la cuenta (la caja no se releía, la precuenta sin total) |
| `771be9a` | La mesera no podía pedir la cuenta: el corte era 403 para su rol. Ahora sabe si hay caja y ni un importe |
| `977a5cd` | La barra no la veía nadie; la cajera veía la caja de OTRA terminal y cada cobro le pedía abrir caja |
| `1a7ffca`, `5c2162c` | Cada puesto caía en pantallas ajenas; el cierre de la cajera no daba PDF (tres lecturas de costos en 403) |
| `1759aa5` | El botón del menú del teléfono y la tableta era invisible en 11 de 16 combinaciones de estilo, «noche» entre ellas |
| `86659a2` | «Guardar para el negocio» (Apariencia) contestaba 403: su `fetch` iba sin la cabecera de escritura |
| `fcac47a` | Caja anunciaba «No hay caja abierta» con la caja abierta mientras cargaba |
| `19d32d2` | Resetear la demo del restaurante reponía el PIN público a la cuenta general de Miguel y le borraba la concesión (D-45) |

### Lo que la intervención dejó rojo en CI

`937f262` (tokens, adopción y cobertura de dos componentes nuevos y un huérfano), `eaeee33` (la barra
lateral abría a 240 px en las pantallas de modelo y tumbaba la tienda y la ferretería en tableta),
`5b9fbd2` (la cafetería perdió «Baristas» y «Barras»), el salón —`e01257f` la CITA-1 (Cobrar leía las
citas una sola vez), `0bb509f` y `3fe9829` (la recepción y la estilista pedían lecturas que su rol no
tiene, D-44), `f04e058` (la reversa de una comisión negativa redondeaba un centavo)—, `c78ea6e` (el
Enter del conteo de la tienda) y `8082229` (el rastreo del restaurante, §5).

### Todos los commits

| Commit | Qué |
| --- | --- |
| `bd3a803` | ci: fuera la siembra duplicada antes de la suite del modelo |
| `a3fadf9` | fix(restaurante): la cuenta se toma con candado, cambiar de mesa funciona y la división cuadra |
| `f7f5a96` | fix(restaurante): las vistas adicionales siguen la cuenta: la caja se relee, la precuenta lleva su total |
| `771be9a` | fix(puente): el mesero sabe si hay caja, y ni un importe del corte |
| `977a5cd` | fix(restaurante): la cocina ve la barra, y la caja es la de esta terminal |
| `1a7ffca` | fix(restaurante): la pantalla de otro puesto no se pinta: cada quien vuelve a su inicio |
| `5c2162c` | fix(restaurante): la cajera baja el PDF de su corte, y la mesera no cae en la tienda |
| `d395560` | test(restaurante): el día completo por el recorrido que se presenta, en PC, tableta y teléfono |
| `1759aa5` | fix(heredado): el botón del menú del teléfono y la tableta se ve en los ocho estilos |
| `86659a2` | fix(apariencia): «Guardar para el negocio» guarda el estilo; antes contestaba 403 |
| `fcac47a` | fix(caja): no anuncia «No hay caja abierta» mientras todavía está leyendo |
| `937f262` | fix(sistema): la presentación y los accesos del dueño usan el sistema; fuera la entrada sin negocio |
| `eaeee33` | fix(layout): las pantallas de modelo vuelven a abrir con la barra plegada |
| `19d32d2` | fix(demo): resetear la demo del restaurante ya no le quita a Miguel su cuenta general |
| `5b9fbd2` | fix(menu): con la plantilla del restaurante, otro giro vuelve a nombrar su barra y a sus baristas |
| `e01257f` | fix(salon): «Cobrar» se mantiene al día sola: la cita que cierra la estilista aparece |
| `0bb509f` | fix(salon): la recepción sabe al agendar si alcanza el material de cabina |
| `3fe9829` | fix(salon): la estilista y la agenda sólo piden lo que su puesto lee |
| `c78ea6e` | fix(conteo): el Enter del buscador del conteo siempre contesta |
| `f04e058` | test(salon): el día del salón llega al final y cuadra al centavo |
| `8082229` | fix(rastreo): el rastreo del restaurante vuelve a alcanzar lo que enumera |
| `15724db` | fix(esquema): las migraciones reproducen producción; el contrato y la limpieza, al día |
| `dd4dbb8` | docs(decisiones): D-43 a D-45 · tres aparatos, lo que cada puesto pide y el dueño general |
| `46b3d2b` | test(mutaciones): salir revoca las dos sesiones, y el fondo de la caja se mira en el fuente |
| `e42cd77` | test(permisos): la matriz y el aislamiento, al día con los comandos |
| `b819b0c` | test(restaurante): la suite del modelo lee el menú que se presenta (D-42) |

## 5. Errores que encontré

### Error 1 — El rastreo del restaurante, rojo en `main` en los ocho estilos
- **Qué pasaba:** 215 de 1009 piezas «sin alcance» (21.3 %, techo 15 %).
- **Cómo lo detecté:** la corrida de `main` en `5a5bf6f`, trabajo por trabajo, y el rastreo local.
- **Causa raíz:** dos supuestos del rastreo dejaron de cumplirse con las pantallas heredadas como
  recorrido principal: recargar conservaba lo guardado en `localStorage` (la X de «Primeros pasos»), y
  un toque que agrega campos dentro de un diálogo corría de lugar a las piezas siguientes.
- **Cómo lo resolví:** reponer lo guardado antes de cada recarga y reubicar las piezas de la capa por
  alineación de firmas (`packages/testing/src/reubicar.ts`). El techo no se tocó.
- **Prueba que impide que vuelva:** el propio rastreo en CI (14.1 min, 0 piezas muertas) y las
  pruebas de `reubicar`.
- **¿Estaba en verde para todas las puertas antes?** No: estaba rojo y nadie lo había leído.

### Error 2 — Dos mutaciones del backend que nada mataba
- **Qué pasaba:** «logout limitado a borrar la cookie» sobrevivía desde `c1ada17` (la ruta revoca dos
  sesiones y la prueba buscaba el texto una vez); la mutación del fondo de la caja, que agregué yo en
  `771be9a`, no podía caer por el arnés porque la prueba miraba el módulo importado.
- **Cómo lo resolví:** `46b3d2b`: cada revocación con su cookie, una mutación gemela para la sesión de
  presentación, y el fondo comprobado en el fuente. 106 mutaciones rechazadas.
- **Lección:** una mutación nueva se valida por el arnés, no editando el archivo real.

### Error 3 — La matriz de permisos no conocía `/api/presentacion`
- `verify:matriz` rojo en `main` desde la intervención; regenerada con su generador (`e42cd77`).

### Error 4 — La suite del restaurante esperaba el menú de antes de D-42
- Expectativa obsoleta («Meseros», «Cocinas»); en `main` no llegaba a correr. `b819b0c`.

### Error 5 — El contrato de esquema, parchado a mano, y un índice fuera del ledger
- `scripts/esquema-esperado.json` traía la 181 escrita a mano y no la 182; y producción tiene
  `mesas_numero_unico`, que ninguna migración crea. §7.

### Error 6 — La tienda, colgada una vez en tableta en CI
- **Qué pasó:** en la corrida 39423569015 (`dd4dbb8`) el día de la tienda pasó en PC (34.5 s) y en la
  tableta se quedó a los 109 s, en la entrada de Jesica: la traza muestra la pantalla de acceso con su
  teclado pintado (el último cuadro, 109.22 s) y después ni un cuadro más ni una petición; el «3» no
  llegó a resolverse en 20 s y la captura del fallo salió en blanco. La página se congeló.
- **Por qué tardó 20 minutos en caer:** el clic sí falló a los 20 s; lo que esperó hasta el techo de la
  prueba fue `equipo.cerrar()`, que cierra cada contexto y no puede cerrar el de una página colgada.
- **Lo que no sé:** la causa del congelamiento. No se reprodujo en dos corridas locales en tableta
  (33.6 s y 44.9 s) ni en la siguiente corrida de CI (`b819b0c`, en verde). No lo doy por «intermitente»
  como explicación: queda registrado con su traza para mirarlo si vuelve, y una mejora posible es cerrar
  los contextos con un tiempo máximo para que un cuelgue caiga en segundos y no en veinte minutos.

## 6. Verificación ejecutada

| Comando | Resultado |
| --- | --- |
| `pnpm format:check` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm typecheck` | ✅ 7 de 7 |
| `pnpm test:unit` | ✅ 388 archivos · 4,264 pruebas · 3 omitidas (las de siempre) |
| `pnpm test:integracion` | ✅ 32 archivos · 84 pruebas, en una base nueva con las 183 migraciones |
| `pnpm verify:mutaciones-backend` | ✅ 106 mutaciones rechazadas |
| `pnpm verify:matriz` · `verify:limpieza` · `verify:aspecto` · `adopcion` · `primitivas` · `cobertura` | ✅ |
| `pnpm build` · `verify:cabeceras` | ✅ 244 páginas · 6 cabeceras, nonce por petición |
| Jornadas en local (base desechable) | Restaurante PC/tableta/teléfono 49.9 s / 50.4 s / 42.1 s; tienda PC/tableta; ferretería y salón en tableta; todas cuadradas |
| CI, PR #13 | Corrida 39427748961 (`b819b0c`): todo en verde menos la galería, que compara contra retratos de antes del menú de D-34, del «Mixto» y del «Casco»; se regenera con la corrida 39427772118 |

**Contra la base real:** sólo lecturas del catálogo y del ledger de `wyqmzhliurwyxuyxznpb` (§7).
Ninguna escritura, ninguna suite, ningún reseteo.

## 7. El esquema

- Ledger de producción: 114 filas, la última la 182 (`1fa2c7eec55c4fc3` y `5f87446d7f2c43c4`, aplicadas
  el 19-10 a las 22:36 UTC); el md5 de la lista `versión:hash` coincide con el de los 114 archivos.
- El esquema de producción, comparado por resúmenes de cada fila del catálogo (sin traer datos): las
  182 migraciones más `mesas_numero_unico` (único por negocio, `where activa`), y nada más.
- `183_numero_de_mesa_unico.sql` lo crea con `if not exists`; precondición (números repetidos: se
  detiene) y poscondición (otra definición: se detiene). Vista por sus cuatro caminos. Con las 183
  desde cero, el resumen es idéntico al de producción: 1727 columnas, 1362 restricciones, 439 índices.
- **No aplicada.** Es un no-op en producción; se aplica con `pnpm db:migrate`, con el respaldo de
  `MIGRACIONES-181-182.md` §5, cuando Miguel acepte. La sesión no tiene credenciales de la base.

## 8. Lo que NO hice

- **No promoví nada a producción.** Producción sirve `main` @ `5a5bf6f` (despliegue
  `dpl_7zPv9ugRunH5DqtiEDb3mULRW6n2`), que NO tiene los arreglos de este PR: ahí la mesera no puede
  pedir la cuenta, el botón del menú no se ve en «noche» en teléfono y tableta, y Apariencia no guarda.
- **No apliqué la 183** (no hace falta para el código; alinea el ledger).
- **No entré al preview** (§9).
- **Del parche del subagente de estética** integré lo que el día necesitaba; el resto —mejoras de
  fórmula, expediente, walk-in, no-show, «sin llegar», kardex y existencias de cabina— no lo revisé
  línea por línea y no entra: queda en `docs/fase-2/pendientes/estetica-subagente-2026-10-20.patch`.
- **Eliminar una mesa** la apaga (`activa = false`) y el editor la sigue enseñando: decisión de Miguel
  (una columna `eliminada_en` con su migración, o que el editor distinga las inactivas).
- **La galería:** se regenera por el flujo a mano (`actualizar_galeria`); hasta que sus retratos estén en la rama, su paso queda rojo en el PR.

## 9. Bloqueos reales

- **Preview:** `POST /api/auth/entrar` contesta 403 por el despliegue y por el alias de la rama: el
  `APP_URL_ALTERNAS` de Preview no incluye esta rama, y la API de Vercel le contesta 403 a esta sesión
  al leer o crear variables. Lo resuelve Miguel con
  `vercel env add APP_URL_ALTERNAS preview claude/morphiq-pos-stabilization-u5qfo1` y el valor
  `https://morphiqpos-git-claude-morphiq-pos-stab-033a30-mh-astral-systems.vercel.app`
  (`VERCEL-ENTORNO.md` §9).
- **Respaldo y aplicación de la 183:** sin credenciales de la base en la sesión.

## 10. Estado

**No aprobado todavía.** Aprobado en CI: las cinco jornadas, permisos, aislamiento, contratos, mutaciones, rastreo y el build. Falta: la galería regenerada en la rama, el preview desde fuera (bloqueado) y la aceptación de Miguel, que es fusionar el PR #13 (fusionar despliega a producción).

## 11. El recorrido para Miguel

Lo que sigue vale **después de fusionar el PR #13**: hoy producción (`5a5bf6f`) no tiene estos
arreglos. **Antes de fusionar, no resetees la demo del restaurante en producción**: el código de
`5a5bf6f` le repone el PIN público a tu cuenta general y le borra la concesión (lo arregla `19d32d2`).

1. Fusiona el PR #13 cuando su CI esté en verde. Vercel despliega producción; comprueba en Vercel que el
   despliegue de producción lleva el SHA del merge.
2. (Opcional, cuando quieras) desde tu máquina: `pnpm db:migrate --ensayo` y `pnpm db:migrate` para
   registrar la 183. No cambia nada en la base: el índice ya está.
3. En la PC, abre https://morphiqpos-kappa.vercel.app/login-pos → «Elige tu acceso» → «Equipo Morphiq ·
   dueño general» → tu tarjeta → tu PIN.
4. Tablero → «Modelos de negocio» (también en Configuración → Presentación) → tu PIN → «Restaurante».
5. En el restaurante: el tablero («Control del restaurante»), «Mesas y pedidos» (el mapa con su color
   por estado), «Cocina», «Caja», «Inventario», «Recetas», «Platillos», «Compras», «Registros»,
   «Portal QR» y «Configuración» → «Distribución de mesas» (crear, arrastrar; la posición se guarda) y
   «Apariencia» (ocho estilos; «Guardar para el negocio»).
6. Cambia a la tienda, la cafetería, la ferretería o la estética desde «Modelos de negocio», sin volver
   a teclear el PIN, y regresa al restaurante.
7. Sal → en el mismo `/login-pos` elige «Demo del acople · restaurante» y presenta los puestos, cada uno
   en su aparato:
   - **Lupita (mesera, 4567), en el teléfono:** sólo ve «Mesas y pedidos»; abre una mesa, agrega
     platillos y bebidas, «Enviar a Cocina» desde su carrito; más tarde «Solicitar cuenta».
   - **Toño (cocina, 5678), en la tableta:** ve la comanda de cocina y la de barra, la prepara y la entrega.
   - **Rosa (cajera, 3456), en la PC:** abre la caja si hace falta, cobra con efectivo y cambio, tarjeta
     o mixto, con propina; corte de turno y cierre con su PDF.
   - **Demo (dueña, 1234), en su teléfono:** lee ventas y propinas del día.
8. Para empezar limpia otra presentación: con el PR ya fusionado, resetear la demo del restaurante
   conserva tu cuenta general (D-45).
