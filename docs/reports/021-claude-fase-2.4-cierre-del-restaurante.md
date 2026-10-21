# Reporte 021 — Claude Code — Etapa 2.4: el cierre del restaurante para el 21-10, publicado

- **Agente:** Claude Code
- **Carril:** el encargo único del cierre del restaurante (los carriles de `TEAM.md` no aplican)
- **Rama:** `claude/morphiq-pos-stabilization-u5qfo1` · PR [#13](https://github.com/M1gu3hb/MorphiqPOS/pull/13) contra `main`
- **Fecha inicio / fin:** 20-10-2026 / 21-10-2026
- **Commits de esta entrega:** `a3a2407` … la punta del PR #13 que se fusiona (sobre `5e6e0b4`), todos de `M1gu3hb <118588634+M1gu3hb@users.noreply.github.com>`, sin coautoría
- **Continúa:** el reporte [020](020-claude-fase-2.4-restaurante-y-ci.md)
- **Subagentes:** dos (Sonnet), cada uno en su worktree y con su base y su servidor: las operaciones de mesa por las vistas adicionales, y los estilos del negocio con el contraste de los estados de mesa. Sus archivos se copiaron y se revisaron aquí; sus commits no se integraron.

## 1. El prompt que recibí

> Vas a cerrar y entregar el RESTAURANTE de Morphiq POS. Es la prioridad absoluta para mi presentación del miércoles 21 de octubre. Necesito una versión operable, presentable y publicada; no otro reporte de “terminado” con cambios pendientes en una rama.
>
> Eres responsable de arquitectura, implementación, pruebas y entrega. Usa criterio propio para resolver causas y dependencias. No amplíes el alcance con funciones ajenas al cierre.
>
> PRIMERO RECUPERA EL CONTEXTO
>
> Lee CONTEXTO_MAESTRO.md, REGLAS.md, DECISIONES.md, TEAM.md, docs/MASTER-POS-VIGENTE.md, documentación del restaurante, estado y bitácora de fase 2, reporte 020 y reporte de rescate. Contrasta sus afirmaciones con código, CI, base y despliegue.
>
> Revisa trabajo local y remoto antes de modificar nada. Conserva cambios ajenos y no reescribas historia.
>
> La última auditoría encontró:
> - main y producción en 5a5bf6f.
> - PR #13 abierto, rama claude/morphiq-pos-stabilization-u5qfo1, punta e5cdd5d, con 30 commits posteriores.
> - 4,267 unitarias aprobadas, tipos de siete paquetes aprobados y 84 pruebas de integración aprobadas en CI.
> - Jornada del restaurante aprobada en PC, tablet y teléfono.
> - CI del PR todavía rojo por la captura de Productos de cafetería.
> - Preview protegido y sin validación externa completa.
> - Migración 183 pendiente de registrar; su índice ya existe en producción.
> Revalida estos datos: pueden haber cambiado desde la auditoría.
>
> EL OBJETIVO DEL PRODUCTO
>
> Morphiq POS es MI sistema maestro interno para mí y mi equipo: demostramos los modelos y reutilizamos sus piezas para proyectos independientes de clientes. No impongas accesos obligatorios por dirección de negocio ni reconstruyas un SaaS.
>
> El dueño general entra por el login central, ve el dashboard y puede recorrer todos los modelos y sus pantallas. Al salir, vuelve al mismo login y puede demostrar cada puesto con sus permisos limitados. Conserva la cuenta Miguel y su PIN actual; no crees cuentas duplicadas ni publiques credenciales.
>
> CIERRA LOS PROBLEMAS CONOCIDOS
>
> 1. Cobro y propinas:
> La pantalla nueva rechaza una operación normal: cuenta completa con tarjeta y propina exclusivamente en efectivo. Resuelve el caso desde los contratos y el backend hasta la interfaz y los reportes. No inventes un centavo de venta en efectivo para conseguir que pase. Comprueba también efectivo, tarjeta, transferencia y mixtos, cambio y propina por método.
>
> 2. Protección del dueño general:
> La versión anterior podía sobrescribir el PIN y borrar las concesiones de Miguel al resetear la demo. Revisa la corrección y su prueba contra PostgreSQL. No ejecutes ese reseteo en producción con el código vulnerable. La cuenta, credencial y concesiones deben conservarse después de resetear y volver a entrar.
>
> 3. Permisos y navegación:
> El control general de rutas revisaba NAV_ITEMS y dejaba rutas como /pos fuera. Audita todas las rutas del restaurante, incluidas las adicionales y las abiertas mediante URL directa.
> - Dueño general: dashboard y todas las pantallas correspondientes.
> - Mesero: atención de mesas y acciones autorizadas, sin caja ni costos.
> - Cocina: preparación y estaciones autorizadas.
> - Cajero: caja, cobro y cortes permitidos, sin costos restringidos.
> La interfaz debe respetar el puesto y el servidor debe negar cada lectura y escritura no autorizizada.
>
> 4. Publicación y CI:
> Resuelve la diferencia visual de cafetería que bloquea la integración, identificando si corresponde a código, datos, fixture o referencia desactualizada. No regeneres toda la galería para tapar diferencias ni relajes umbrales.
> Prepara un preview verificable por los mecanismos autorizados. Si necesitas corregir orígenes permitidos, limita el cambio al hostname real del preview; no desactives la protección ni uses comodines amplios.
>
> VALIDA EL RESTAURANTE COMPLETO
>
> Comprueba los recorridos principales heredados y las pantallas adicionales, incluyendo sus cruces:
>
> - Login, restauración de sesión, recarga, salida y cambio de modelo.
> - Dashboard del dueño: ventas, cajas abiertas o pendientes, alertas, inventario y acceso a configuración.
> - Configuración de mesas: crear, editar, acomodar, guardar posiciones y eliminar/desactivar con un resultado comprensible.
> - Estados de mesa distinguibles por texto y señales visuales, además del color.
> - Abrir mesa, agregar platillos, bebidas, modificadores y notas.
> - Enviar a cocina y barra; preparar, marcar listo, recoger y entregar.
> - Solicitar cuenta y generar precuenta con sus totales y propina.
> - Cambiar y unir mesas, dividir cuentas y cobrar sus partes sin duplicar cocina ni perder dinero.
> - Descuentos y autorización de supervisor; anulaciones, cancelaciones y devoluciones según los flujos existentes.
> - Cobro, cambio, propinas, inventario por receta, corte de turno y cierre diario con PDF.
> - Portal QR: consulta, pedido y solicitud de cuenta según las funciones existentes; una mesa reutilizada no debe heredar solicitudes del grupo anterior.
> - Dos usuarios operando la misma mesa, reintentos de red, doble clic y dos terminales cuando corresponda.
> - Persistencia después de recargar y volver a entrar.
>
> No basta recibir HTTP 200. Comprueba el resultado visible y lo persistido: dinero al centavo, inventario, estados, auditoría y ausencia de duplicados. Extiende la jornada existente con los casos faltantes; que el recorrido feliz pase no certifica todas las combinaciones.
>
> DISEÑO Y USABILIDAD TAMBIÉN SON PARTE DEL CIERRE
>
> Revisa PC, tablet y teléfono. Corrige botones ocultos, superposiciones, menús duplicados, nombres confusos, scroll roto y acciones que no explican su resultado.
>
> Los ocho estilos deben poder elegirse, guardarse y mantenerse al recargar y entrar desde otro dispositivo. Comprueba contraste y legibilidad en pantallas reales del restaurante.
>
> Preserva las pantallas y funciones completas que ya existen. No las sustituyas por versiones simplificadas ni afirmes paridad con Base44 sin una referencia comprobable. Tienes autonomía para mejorar la UX necesaria para que dueño y empleados puedan utilizarlo sin que yo los guíe constantemente.
>
> BASE, SEGURIDAD Y ALCANCE
>
> - Sólo Morphiq: Supabase wyqmzhliurwyxuyxznpb.
> - Pastelería Confetti no se toca, ni para leer.
> - Pruebas destructivas, siembras y reseteos: exclusivamente en una base desechable con las guardas correspondientes.
> - Cualquier migración necesaria sigue el proceso del repositorio: ensayo, respaldo y verificación. No edites migraciones aplicadas ni falsifiques el ledger.
> - Revisa la 183 y registra correctamente su aplicación si corresponde.
> - No integres automáticamente el parche pendiente de estética: no está revisado.
> - Dominio y DNS los resuelvo yo.
> - PAC/CFDI, hardware nuevo y funciones comerciales futuras quedan fuera de este cierre.
>
> ENTREGA Y AUTONOMÍA
>
> Autorizo integrar a main y desplegar las correcciones de este cierre cuando cumplan los criterios técnicos. No te detengas al abrir el PR ni me pidas otra confirmación genérica para publicar lo que ya autoricé. No publiques con fallos funcionales conocidos ni ocultes un bloqueo.
>
> Ejecuta las comprobaciones pertinentes y verifica CI en el SHA exacto que vas a entregar. Evita repetir suites completas sin cambios o evidencia que lo justifique. Después del despliegue comprueba que el enlace público sirve ese mismo código y realiza un ensayo no destructivo del acceso, navegación y lecturas del restaurante.
>
> Todos los commits van a nombre de M1gu3hb, correo 118588634+M1gu3hb@users.noreply.github.com, sin coautorías de IA.
>
> Si delegas, usa únicamente Sonnet o Haiku según la tarea, nunca Opus. Encargos concretos, entregables claros y revisión tuya antes de integrar. Guarda checkpoints para continuar si se agota el uso.
>
> CRITERIO DE CIERRE
>
> Sólo declara cerrado el restaurante cuando:
> - Los recorridos y casos anteriores estén comprobados.
> - No queden fallos funcionales conocidos dentro de este alcance.
> - CI esté aprobado para el código entregado.
> - Main, producción y esquema sean compatibles.
> - Miguel pueda entrar, presentar la operación y cambiar de puesto sin instrucciones técnicas ni errores.
> - Queden documentados los cambios, la evidencia y las exclusiones comerciales.
>
> Al terminar dame aquí un resumen corto: qué corregiste, pruebas, commit publicado, enlace de producción, recorrido para probarlo y pendientes reales. Si algo impide cerrar, identifica exactamente qué falla y qué falta para resolverlo; no lo presentes como terminado.

## 2. Qué se me pidió

Cerrar y PUBLICAR el restaurante para la presentación del 21-10: cobro y propinas por método sin
inventar un centavo, el dueño general a salvo de los reseteos, cada puesto con sus pantallas y el
servidor negando lo demás, CI en verde sobre el SHA entregado y un preview verificable; validar el
restaurante entero —con lo persistido, no con el HTTP 200— en PC, tableta y teléfono y en los ocho
estilos; integrar a `main`, desplegar, comprobar que producción sirve ese código y ensayar sin
destruir nada. Sin ampliar el alcance, sin tocar la pastelería ni el dominio.

## 3. El encargo, punto por punto

| # | Lo que pidió | Estado | Evidencia |
| --- | --- | --- | --- |
| 1 | Cobro y propinas: tarjeta por la cuenta, propina sólo en efectivo; efectivo, tarjeta, transferencia, mixto, cambio, propina por método | ✅ | `a3a2407` (184, D-46), la jornada cobra con tarjeta + propina en billete y por transferencia (`a10b64c`); integración contra Postgres con pagos por método, cajón, arqueo y corte |
| 2 | El dueño general tras resetear y volver a entrar | ✅ | `de72d19` (prueba contra Postgres, D-45); reseteo con cuenta dividida, `e2ee4f2` (185, D-51) |
| 3 | Permisos y navegación por puesto, también tecleando la dirección; el servidor niega | ✅ (los P1); 🟨 P2/P3 documentados | `e064b9b` (D-49), `b3fc9fb`; ensayo del preview: cada dirección ajena regresa a su pantalla y el servidor contesta 403 (§6) |
| 4 | Publicación y CI; preview verificable | ✅ | `c098b59` (D-47); ensayo de sólo lectura del preview con la base intacta (§6); CI del PR en verde sobre cada punta (§6) |
| 5 | El restaurante completo, con lo persistido | ✅ con pendientes | La jornada (PC, tableta, teléfono), el portal QR con mesa reutilizada, la concurrencia, las operaciones de mesa, los estilos y los estados, en CI (§4, §6). Pendientes reales en §10 |
| 6 | Diseño: tres aparatos, ocho estilos que persisten, contraste | ✅ | `acb94b9`, `8291028`; `estilos-del-negocio` 11/11, `estados-de-mesa` 18/18 en PC y teléfono |
| 7 | Migraciones por el proceso; la 183 | ✅ | 183 y 184 (20-10) y 185 (21-10) en producción con ensayo, respaldo, vuelta atrás y verificación (§7) |
| 8 | Integrar a `main`, desplegar, comprobar el SHA, ensayo no destructivo | ver §11 | |

## 4. Qué hice

| Commit | Qué |
| --- | --- |
| `a3a2407` | La cuenta con tarjeta y la propina sólo en efectivo (184, `repartirPagos`, la pantalla nueva y la caja heredada) |
| `de72d19` | El dueño general vuelve a entrar después de dos reseteos (prueba contra Postgres) |
| `c098b59` | El preview acepta escrituras desde sus hostnames exactos |
| `a10b64c` · `ea608d2` | La jornada cobra tarjeta + propina en billete y transferencia; el arnés de mutaciones vigila el renglón vacío y la venta negativa |
| `c7336df` | Mesas: la zona se guarda, una mesa en servicio no se quita del mapa, «Quitar del mapa» y «Reactivar» |
| `e064b9b` | Cada puesto abre sólo sus pantallas (`/pos`, `/mesas`, `/restaurante/*`) y el servidor niega lo que no le toca (PIN, costos, devoluciones, alta rápida, gramajes) |
| `8cebd23` | El grupo de mesas se recoge entero al cobrar o cancelar; la cuenta dividida cobra lo que enseña (descuento, IVA fuera, descuento a una parte) |
| `a8b138a` | El portal del comensal (dos grupos en la misma mesa) y la concurrencia en CI; la caja heredada dice en español que el cobro pudo hacerse; la mesera con sus mesas en «Barra» llega a ellas |
| `acb94b9` | El estado de cada mesa se lee en claro y en el teléfono (medido con WCAG contra el degradado) |
| `b3fc9fb` | Cada puesto llega a su pantalla al entrar, sin rebotar por otro modelo (lo encontró el ensayo del preview) |
| `e2ee4f2` | La demo con una cuenta dividida se resetea (185) y cancelar un grupo apaga la cocina de la mesa unida |
| `8291028` | La mesa unida no se ofrece libre; las perillas de Apariencia sobreviven a recargar; el mapa de la dueña se lee en el teléfono y en `terminal` |
| `07725a0` | Las operaciones de mesa, el estilo del negocio y los estados de mesa, en CI |
| `e333538` | La demo se vuelve a sembrar antes de los estados de mesa (corren sobre mesas libres) |
| `edd793e` | La etiqueta de la mesa chica se lee también como la pinta CI; la demo del salón abre hoy en el reloj del negocio |
| `d72ab2c` | Los retratos del restaurante, regenerados en CI: la etiqueta de la mesa con la letra de cuerpo en Terminal |
| `f20a540` | (PR de seguimiento) El pago que salda la última cuenta de la ferretería deja su aviso: lo encontró el CI de `main` sobre la fusión |
| (docs) | D-46 a D-51, `VERCEL-ENTORNO` §9.1, la bitácora y este reporte |

## 5. Errores que encontré

Cada uno con una prueba que estuvo en rojo antes del arreglo.

1. **La cuenta con tarjeta y la propina en billete no se podía cobrar** — la base, el servidor y las
   dos pantallas lo impedían; la heredada cobraba sin la propina sin avisar. `a3a2407`.
2. **El preview contestaba 403 a todo** — su hostname no estaba entre los orígenes permitidos. `c098b59`.
3. **La zona de una mesa no se guardaba y una mesa en servicio se podía dar de baja** con su cuenta
   colgando. `c7336df`.
4. **Pantallas de otro puesto tecleando la dirección** (la mesera en el mostrador, la cocina en el
   cobro) **y lecturas de más en el servidor** (costos para caja y mesero, gramajes para la cocina,
   el PIN del dueño desde un administrador, devoluciones desde la cocina). `e064b9b`.
5. **Al cobrar un grupo de mesas, sólo la principal quedaba recogida; la cuenta dividida con
   descuento o IVA aparte no cuadraba.** `8cebd23`.
6. **«Failed to fetch» al perderse la respuesta del cobro, y la mesera con mesas sólo en «Barra» sin
   llegar a ellas.** `a8b138a`.
7. **Seis de diez estados de mesa ilegibles en claro** («En preparación», 2.36:1; el chip del
   teléfono, blanco sobre blanco). `acb94b9`.
8. **La cocina entraba y se quedaba en `/abarrotes/cobrar`** — la pantalla de acceso navegaba dos
   veces, una con la plantilla de omisión (`tienda`). Sólo con la red del preview. `b3fc9fb`, con
   una prueba que reproduce la red lenta.
9. **Tras dividir una cuenta, el reseteo de la demo contestaba 500** (la 070 comparaba una madre ya
   borrada). 185.
10. **Cancelar la cuenta de un grupo dejaba viva en cocina la comanda de la mesa unida.** `e2ee4f2`.
11. **La mesa unida se ofrecía «libre»; las perillas guardadas se perdían al recargar; el mapa de la
    dueña enseñaba `en_espera_entrega` crudo, se desbordaba en el teléfono con `taller` y `bloque`
    y su leyenda quedaba bajo el botón flotante.** `8291028`.
12. **«Esperando entrega» en la mesa chica bajaba a 3.9-4.2:1 en CI** (en local pasaba): la etiqueta
    va en dos renglones casi del ancho de su pastilla, y los extremos redondos de la píldora dejaban
    las puntas de cada renglón sobre el verde sin oscurecer. Una réplica con el texto 1.8 px más
    ancho, como lo pinta CI, da 4.15 y 3.91 con la píldora y 7.12 con esquinas de 4 px. `edd793e`.
13. **La demo del salón, sembrada de las 18:00 a la medianoche de México, salía cerrada el resto del
    día** y lo cobrado no comisionaba: el horario y la regla de comisión regían desde el día en UTC,
    que a esa hora ya es mañana. Lo vio la galería al correr a las 18:23. Ahora rigen desde hoy en la
    zona del negocio; la prueba nueva pone al negocio en una zona donde hoy es otro día que en UTC.
    `edd793e`.
14. **En la ferretería, el pago que salda la última cuenta borraba su propio aviso** y la pantalla
    decía «Todavía no le das crédito a nadie.» con el cliente recién cobrado: la vista vacía de
    Cuentas no pintaba el aviso. El pago sí entraba. Lo vio el CI de `main` sobre la fusión (la
    prueba pasaba si alcanzaba a ver el aviso antes de la relectura); es anterior a este PR.
    `f20a540`, con la prueba ya determinista: espera la relectura y después exige el aviso.

## 6. Verificación ejecutada

| Qué | Resultado |
| --- | --- |
| Unitarias (`pnpm test:unit`) | 390 archivos · 4,304 pruebas · 3 omitidas (las de siempre) |
| Integración contra Postgres | 42 archivos · 131 pruebas (con la 185 y la siembra del salón) |
| `pnpm lint` · `pnpm typecheck` · `format:check` · puertas de diseño y estructura | ✅ |
| e2e local, base desechable | jornada del restaurante en PC; operaciones 15/15; estilos del negocio 11/11; estados de mesa 36/36 en PC y en teléfono (con la etiqueta de `edd793e`); suite del restaurante 3/3 (la carrera al entrar, en PC, tableta y teléfono); jornada de la ferretería en PC y tableta con `f20a540` (roja sin él) |
| CI del PR | `c7336df` 39474081863 ✅ · `acb94b9` 39510224126 ✅ · `b3fc9fb` 39514176320 ✅ 16/16 · la punta que se fusiona: ver §11 |
| Recorrido del dueño general (local, una cuenta general de prueba) | entra, tablero, «Modelos de negocio» con su PIN, cambia a cafetería, tienda y restaurante, recarga, sale al mismo login con la sesión y el desbloqueo revocados |
| Ensayo de sólo lectura del preview de `b3fc9fb` | login central (26 tarjetas, 7 del restaurante, 1 de dueño general); el dueño abre su tablero, recarga y abre las 12 pantallas del menú y las 11 vistas del restaurante; Lupita, Toño y Rosa llegan a su pantalla y las ajenas los regresan; el servidor niega a cada puesto lo suyo (403); «Salir» vuelve al login y la sesión deja de responder |
| La base, antes y después del ensayo | mesas, órdenes, existencias, configuración, sesiones de caja y empleos con el mismo md5; sólo sesiones, auditoría, bitácora de comandos y una terminal («Caja 17», la del navegador del ensayo) |

## 7. El esquema

- 183 (`mesas_numero_unico`, no-op en producción) y 184 (`pago_solo_de_propina`): aplicadas el
  20-10 con ensayo, respaldo `respaldo_183_184` y verificación (bitácora).
- 185 (`division_sin_madre`): aplicada el 21-10. Registro 116/184 = disco; ensayo con `rollback` sin
  residuo; respaldo de la función en `respaldo_185` con la vuelta atrás ensayada; después, registro
  117/185 y la misma huella, función y conteos (2,088 columnas · 1,366 restricciones · 442 índices)
  que una base migrada de cero hasta la 185.
- Los dos esquemas de respaldo se borran después del ensayo en producción (§11).

## 8. Lo que NO hice, a propósito

- **Fuera de este cierre:** PAC/CFDI, hardware nuevo y funciones comerciales futuras; el dominio y
  el DNS (los resuelve Miguel); el parche de estética del subagente, sin revisar
  (`docs/fase-2/pendientes/estetica-subagente-2026-10-20.patch`); la Pastelería Confetti, ni para
  leer.
- **No entré con la cuenta de Miguel** ni usé su PIN: su recorrido de modelos se comprobó en local con
  una cuenta general de prueba en la base desechable.
- **No ejecuté nada destructivo contra la base compartida:** el preview y producción sólo se
  ensayaron leyendo.

## 9. Decisiones

D-46 (renglón sólo de propina), D-47 (hostnames del preview), D-48 (quitar una mesa del mapa),
D-49 (rutas y lecturas por puesto), D-50 (grupos y divisiones), D-51 (la 185), en
`docs/fase-2/05-DECISIONES.md`.

## 10. Pendientes reales (no bloquean la presentación)

- **D-2** · No hay botón «Separar» en la mesa activa: un grupo unido por error se deshace al cobrarlo
  o cancelarlo, o por la ruta `restaurante.separar_mesas`.
- **D-3** · «Marcar entregado» en la principal no entrega lo que la cocina dejó listo para la mesa
  unida; la cocina sí puede retirarlo de su tablero.
- **D-5** · La autorización del supervisor dura dos minutos y no va atada a una cuenta ni a un
  importe: la misma cajera podría presentarla en otra cuenta en ese lapso.
- **C10** · `caja.cerrar` no rechaza el cierre con una mesa abierta; lo impiden las dos pantallas de
  cierre. Un candado en el servidor necesita decidir qué pasa con varias cajas en una sucursal.
- Auditoría de permisos, P2/P3 (B6, B8–B15, A7–A11): lecturas de más que el servidor aún permite
  a algunos puestos y guardas de página sólo en el cliente; ninguna abre dinero ni costos de la
  cuenta. Detalle en la bitácora del 20-10.
- `limpiar_solicitudes` audita aunque no borre nada, en cada carga del marco: ruido en la
  auditoría.
- **Los respaldos `respaldo_183_184` y `respaldo_185` siguen en producción.** El borrado pidió una
  confirmación que no llegó y se canceló; no se reintentó. Son copias de 24 filas de `mesas`, 15 de
  `pagos` y la definición anterior de una función; nada depende de ellos. Para borrarlos, en
  producción: `drop table respaldo_183_184.mesas, respaldo_183_184.pagos,
  respaldo_185.funcion_division; drop schema respaldo_183_184; drop schema respaldo_185;`
- Al tocar «Salir» en la caja, la lectura de `Venta` que la pantalla repite cada segundo puede
  salir después de que el servidor revocó la sesión y antes de que el navegador reciba la
  respuesta: contesta 403, como debe. No se ve (la página se reemplaza al terminar «Salir»); si
  molesta, se cancelan las lecturas antes de salir.
- El mapa de la mesera en PC no se opera con teclado (las mesas son `div` con clic; en el teléfono
  sí son botones).
- Las vistas adicionales del restaurante son de dirección: mesero y caja no las tienen en su menú
  (decisión de producto).

## 10b. Estado

**Publicado.** El PR #13 se fusionó a `main` (`ffed55e`) con CI en verde sobre su punta exacta,
producción sirve esa fusión y el ensayo de sólo lectura en producción pasó sin mover un dato del
negocio (§11). El CI de `main` sobre la fusión destapó un defecto anterior de la ferretería, que
corrige el PR de seguimiento (`f20a540`) sin tocar el restaurante. Lo que queda son los pendientes
de §10, ninguno en el recorrido que se presenta.

## 11. Publicación y el recorrido para Miguel

- **Punta del PR #13:** `d72ab2c`, CI corrida 39526173928, 16 de 16 en verde.
- **Fusión a `main`:** `ffed55e` (21-10, 01:35 UTC; autor M1gu3hb, sin coautorías).
  **Despliegue de producción:** `dpl_HGH4QaraKEeoXfMuGewYc4NGdtit`, `READY` a las 01:36 UTC con
  `githubCommitSha = ffed55e`, con el alias https://morphiqpos-kappa.vercel.app (y el dominio
  propio) sin error de alias. `/login-pos` contesta 200, y el JavaScript que la app carga trae la
  etiqueta de `edd793e` (esquinas de 4 px): lo que se sirve es esta fusión.
- **Ensayo en producción** (sólo lectura, el mismo del preview, con el token de aparato del ensayo:
  no da de alta otra terminal): **53 comprobaciones bien, 0 mal**; login central con 30 tarjetas (7
  del restaurante, 1 de dueño general); el dueño en su tablero, al recargar y en 22 pantallas (las 11 del menú y las 11 vistas del restaurante);
  mesera, cocina y caja en la suya y devueltas desde las ajenas; el servidor negando a cada puesto lo
  que no le toca; «Salir» al mismo login. Ninguna petición que no fuera lectura y ninguna 5xx. La
  demo del restaurante antes y después: los seis md5 iguales (mesas, órdenes, existencias,
  configuración, sesiones de caja, empleos); sólo +4 sesiones (las cuatro entradas), +32 auditoría y
  +32 bitácora de comandos (el mantenimiento automático de avisos QR) y las mismas 17 terminales.
- **CI de `main` sobre `ffed55e`** (39528164412): 50 de 51. El rojo, la jornada de la ferretería:
  defecto 14 de §5, anterior a este PR, corregido en `f20a540`.
- **Respaldos:** siguen en producción (ver §10).

### El recorrido para Miguel

1. En la PC: https://morphiqpos-kappa.vercel.app/login-pos → «Equipo Morphiq · dueño general» → tu
   tarjeta → tu PIN. Llegas al tablero.
2. «Modelos de negocio» (arriba del menú) → tu PIN → «Restaurante». Recorre «Mesas y pedidos», «Cocina»,
   «Caja», «Ventas», «Recetas», «Platillos», «Inventario», «Compras», «Registros», «Portal QR» y
   «Configuración» (Mesas: crear, mover, quitar del mapa y reactivar; Apariencia: los ocho estilos y
   sus perillas, «Guardar para el negocio»). En «Vistas adicionales»: el mapa de la dueña, la mesa
   activa (dividir, unir, cambiar de mesa), la precuenta, el cobro y el cierre diario con su PDF.
3. Cambia a la cafetería, la tienda, la ferretería o la estética desde «Modelos de negocio» y regresa al
   restaurante.
4. «Salir» → el mismo login → «Demo del acople · restaurante» → cada puesto con su PIN de demostración
   (`ACCESOS-DEMO.md` §2):
   - **Lupita (mesera), en el teléfono:** sólo sus mesas; abre una, pide platillos y bebidas, «Enviar a
     Cocina» desde su carrito, «Solicitar cuenta». Tecleando `/caja` o `/pos`, regresa a sus mesas.
   - **Toño (cocina), en la tableta:** la comanda de cocina y la de barra, «Listo», y entregar.
   - **Rosa (cajera), en la PC:** cobra con efectivo y cambio, con tarjeta y la propina en billete, por
     transferencia o mixto; corte de turno; cierre con su PDF.
5. Para empezar limpia otra presentación, el reseteo de la demo (`configuracion.resetear_demo`: la
   ruta `/api/catalogo/demostracion/resetear` con la palabra `RESETEAR`, como dueño, o
   `scripts/sembrar-demos.mjs --solo demo-acople-restaurante`). Conserva tu cuenta general (D-45) y ya
   funciona aunque se haya dividido una cuenta (D-51). **No** uses en la demo «Configuración →
   Mantenimiento → Reiniciar sistema para cliente»: es para dejar en blanco un negocio nuevo y borra el
   catálogo entero (platillos, recetas, mesas); tu cuenta y su concesión no se tocan, pero la demo
   queda sin carta.
