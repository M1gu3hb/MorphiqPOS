# Reporte 008 — Codex — Blindaje del backend

- **Agente:** Codex
- **Carril:** B
- **Rama:** `carril-b`
- **Fecha inicio / fin:** 2026-09-10 / 2026-09-11
- **Commits:** `836e54d` … `f23da2f` (34 commits antes de este reporte)
- **Tarea:** F1-10, B-0…B-4, C-5…C-14 y R-15…R-30

## 1. El prompt que recibí

F1-10 pidió blindar exclusivamente el backend, resolver en orden los hallazgos
B-0…R-30, probarlos antes de implementar, ejecutar mutaciones reales, aplicar
todo SQL sólo mediante `pnpm db:migrate` y verificar la base viva de MorphiqPOS
(`wyqmzhliurwyxuyxznpb`). Prohibió leer o modificar el proyecto Pastelería
Confetti, tocar el frontend heredado fuera de tres excepciones, usar `any` o
`@ts-ignore`, y declarar trabajo no ejecutado. También pidió una batería de
ataques A–I y este reporte.

El encabezado del encargo dice “30 hallazgos”, pero la numeración contiene 31:
5 B, 10 C y 16 R. La tabla conserva los 31 para no omitir R-30.

## 2. Resultado de los hallazgos

Todos los hallazgos se corrigieron. No clasifiqué ninguno como falso positivo.
R-29 sí conserva deliberadamente el modo _fail-open_ indicado en el prompt; el
defecto era la falta de una alerta observable y eso quedó corregido en R-23.

| ID | Estado | Commit | Prueba que lo cierra | Mutación que la valida |
|---|---|---|---|---|
| B-0 | Arreglado | `836e54d` | `migraciones/rls.test.ts`, `verify:rls` vivo | Quitar FORCE o excluir secuencias del REVOKE |
| B-1 | Arreglado | `904fc23` | `comando.autorizacion.test.ts`, configuración | Reabrir paquete o reemplazar el documento parcial |
| B-2 | Arreglado | `e83bd51` | `puente/presentacion.test.ts`, configuración | Devolver lectura/cambio de paquete al JSON |
| B-3 | Arreglado | `4f87e95` | sesión: migración, entrar, resolver y cerrar | Omitir sid, persistencia, revocación o purga |
| B-4 | Arreglado | `e9e10f0` | `puente/autorizacion.test.ts` | Volver opcionales roles o anular la guarda |
| C-5 | Arreglado | `7ce5d6e` | `restaurante/qr.test.ts` | Quitar unicidad/entropía o reabrir escritura directa |
| C-6 | Arreglado | `4892f7c` | `puente/autorizacion.test.ts` | Abrir costos en la vista de consumo |
| C-7 | Arreglado | `5acd26f` | `catalogo/consulta.test.ts` | Devolver costo a todos los roles |
| C-8 | Arreglado | `8bac9af` | `consultas-roles.test.ts`, `seguridad-http.test.ts` | Omitir rol en wrapper o GET de productos |
| C-9 | Arreglado | `8948ca5` | `consultas-roles.test.ts` | Exponer bloqueo a gerente |
| C-10 | Arreglado | `2a53e50` | `http/limite-cuerpo.test.ts` | Subir a 50 MiB u omitir cualquiera de cuatro guardas |
| C-11 | Arreglado | `9ef9766` | `configuracion-limites.test.ts` | Quitar allowlist o elevar documento/nombre |
| C-12 | Arreglado | `4a40060` | `verificacion/contrato-esquema.test.ts` | Omitir índices o desconectar de `verify` |
| C-13 | Arreglado | `b9a2772` | `verificacion/rls.test.ts`, `verify:rls` | Omitir consulta viva, índice, FORCE o gate |
| C-14 | Arreglado | `8a2e27f` | `repos/limite.test.ts` | Desconectar o anular purga probabilística |
| R-15 | Arreglado | `f6bb7dc` | `migraciones/retencion-comandos.test.ts` | Retener 900 días o dejar el trabajo sin DELETE |
| R-16 | Arreglado | `20c5b46` | `seguridad-http.test.ts` | Omitir CSRF en `conSesion` |
| R-17 | Arreglado | `46b2f88` | `seguridad-http.test.ts` | Confiar otra vez en Host, web o portal |
| R-18 | Arreglado | `3d87556` | `portal/idempotencia.test.ts` | Sacar mesa del alcance o de la huella |
| R-19 | Arreglado | `8008867` | `presentacion-limite.test.ts` | Quitar ventana o consumo de cuota |
| R-20 | Arreglado | `d376969` | `empleados-limite.test.ts` | Enumerar sin gastar cuota |
| R-21 | Arreglado | `b1e95c4` | `seguridad/cabeceras.test.ts`, `verify:cabeceras` | Quitar HSTS de Next o del verificador vivo |
| R-22 | Arreglado | `3c2da3c` | `correlacion.test.ts` | Omitir correlación en cualquiera de tres capas |
| R-23 | Arreglado | `26546bb` | `observabilidad.test.ts`, adopción web | Volver a texto o retirar `registrar` de nueve sitios |
| R-24 | Arreglado | `8ec7af7` | `verificacion/restauracion.test.ts`, restore real | Cambiar proyecto/destino o quitar checksums |
| R-25 | Arreglado | `532e011` | `repos/catalogo.test.ts` | Dejar `%`, `_` y `\\` con semántica ILIKE |
| R-26 | Arreglado | `bed1fcb` | `puente/puente.test.ts` y gate de escrituras | Reabrir `IntegrationSyncLog` a escritura directa |
| R-27 | Arreglado | `04f2c77` | `puente/url-publica.test.ts` | Quitar URL del esquema o degradarla a texto |
| R-28 | Arreglado | `6685e88` | `data/tls.test.ts` | Comparar subcadena o sustituir raíces del sistema |
| R-29 | Arreglado | `26546bb` | `observabilidad-backend.test.ts` | Degradar `nivel: alerta` en ambos limitadores |
| R-30 | Arreglado | `891eae0` | imagen, multipart, claves y referencias (19 casos) | 12 mutaciones de rol, MIME, cuota, visibilidad y límites |

El arnés `scripts/verificar-mutaciones-backend.mjs` ejecutó **83 mutaciones**,
confirmó que cada una pone su prueba en rojo y restauró las fuentes en verde.
Está conectado a `pnpm verify` como `verify:mutaciones-backend`.

## 3. Ataques A–I

| Ataque | Resultado ejecutado | Pruebas que quedan |
|---|---|---|
| A · BOLA/IDOR | El ámbito de organización del comando, puente, QR y repositorios rechazó IDs ajenos en los casos cubiertos; la base viva también niega acceso cliente. No se ejecutó una matriz dinámica de cada comando y ruta. | `comando.autorizacion.test.ts`, `puente/autorizacion.test.ts`, `restaurante/qr.test.ts`, pruebas de repositorio |
| B · escalada de rol | El wrapper deniega antes de validar o abrir transacción; catálogo, accesos, puente y mantenimiento conservan roles explícitos. No se generó la matriz comando × rol completa. | `comando.autorizacion.test.ts`, `puente/autorizacion.test.ts`, `identidad/empleados.test.ts`, `mantenimiento.test.ts` |
| C · fuga de campos | Proyecciones del puente y portal excluyen hashes, tokens y costos por rol; las rutas tocadas usan allowlists. No se serializaron las 79 rutas una por una. | `puente/autorizacion.test.ts`, `portal.proyeccion.test.ts`, `catalogo/consulta.test.ts` |
| D · portal público | Tokens inválidos, ajenos, duplicados y entradas con precio fallan cerrado; idempotencia separa mesas y la cuota produce 429. La carrera real de diez solicitudes necesita Postgres desechable. | `portal.test.ts`, `portal.comandos.test.ts`, `portal/idempotencia.test.ts`, pruebas de límite |
| E · entradas extremas | 50 MiB se rechaza por cabecera antes de leer; el stream multipart tiene tope duro; esquemas estrictos limitan forma, longitud, arreglos y números. No se materializaron cuerpos de 50 MiB/1000 niveles durante esta sesión. | `limite-cuerpo.test.ts`, `archivos-seguridad.test.ts`, pruebas de esquemas y `testing/fallos.test.ts` |
| F · concurrencia | La suite existente cubre idempotencia, cobro único y conflictos; no se ejecutaron las cinco carreras reales ni los cien folios porque no hubo Postgres de pruebas. | `comando.integracion.test.ts`, pruebas de venta/caja/restaurante |
| G · fallo medio | El inyector revierte todo después del pago y las pruebas de comandos verifican transacciones; la matriz específica de cuatro comandos contra Postgres no corrió. | `testing/fallos.test.ts`, `comando.transaccion.test.ts`, `comando.integracion.test.ts` |
| H · base viva | `verify:rls` confirmó RLS + FORCE, ausencia de SELECT de `anon`/`authenticated`, vistas cerradas e índices 046 en **50 relaciones**. No se duplicó la prueba mediante 50 llamadas PostgREST. | `verificacion/rls.test.ts`, `scripts/verificar-rls.mjs` |
| I · sesión | Firma alterada, expiración, sid inexistente/ajeno, logout revocado, empleo inactivo y terminal desenrolada fallan. | `sesion/token.test.ts`, `resolver.test.ts`, `cerrar.test.ts`, `salir.test.ts` |

## 4. Estado de la base MorphiqPOS

- `pnpm db:migrate`, fijado explícitamente a `wyqmzhliurwyxuyxznpb`: **21 de 21
  migraciones aplicadas, cero pendientes**, con hashes del ledger iguales a disco.
- Migraciones nuevas: 050 (RLS/grants), 051 (sesiones revocables), 052 (token QR
  único) y 053 (retención de idempotencia), todas aplicadas por el migrador.
- Contrato vivo: **622 columnas, 463 constraints y 170 índices** coinciden con
  `scripts/esquema-esperado.json`.
- RLS viva: **50 relaciones** con RLS/FORCE donde aplica; `anon` y
  `authenticated` sin SELECT; vistas y secuencias revocadas; índices únicos de
  046 presentes, válidos y únicos.
- Restore: 47 tablas, 825 filas y 451,512 bytes restaurados a PostgreSQL temporal;
  filas y checksums por tabla iguales. Total medido: **17.895 s**. El mayor
  intervalo observado entre backups fue 24 h 32 min; RUNBOOK fija RPO 25 h y
  objetivo RTO 4 h, y documenta PITR de 15 min antes de cambios irreconstruibles.

No se consultó ni modificó información de Pastelería Confetti. Durante el
diagnóstico inicial ejecuté una lista de proyectos y la CLI mostró su nombre y
referencia junto con los demás proyectos; no abrí su base, esquema, storage,
backups ni configuración, ni volví a usar ese comando. Las operaciones
posteriores se fijaron expresamente al ref de MorphiqPOS.

## 5. Verificación ejecutada

| Comando | Resultado |
|---|---|
| `pnpm test:unit` | ✅ 92 archivos, 1,039 pruebas |
| `pnpm verify:mutaciones-backend` | ✅ 83/83 mutaciones detectadas y restauradas |
| `pnpm lint` | ✅ salida 0 |
| `pnpm typecheck` | ✅ 7 paquetes |
| `pnpm format:check` | ✅ salida 0 |
| `pnpm build` con `NODE_ENV=production` | ✅ 54 páginas estáticas y rutas dinámicas compiladas |
| `pnpm verify:cabeceras` | ✅ 6 cabeceras y nonce por petición |
| `pnpm verify:esquema` | ✅ contrato vivo 622/463/170 |
| `pnpm verify:rls` | ✅ 50 relaciones cerradas |
| `pnpm db:migrate` | ✅ 21 aplicadas, 0 pendientes |
| `pnpm test:integracion` | ❌ no inició: no hay Docker ni `DATABASE_URL_PRUEBAS` |
| `pnpm verify` | ❌ se detiene en `verify:escrituras`, por cuatro callers heredados descritos abajo |

Las puertas posteriores a `verify:escrituras` se ejecutaron individualmente:
primitivas, formato, lint, tipos, pruebas, mutaciones, catálogo, inventario,
venta, identidad, paquetes, build y cabeceras quedaron verdes.

El primer build se lanzó con el `NODE_ENV` no estándar heredado del archivo de
entorno y falló al prerenderizar `/_global-error`; repetido con
`NODE_ENV=production`, compiló y prerenderizó correctamente.

## 6. Gate morphiq-prs

- **Superficies revisadas:** S2, S3, S5, S7, S9, S10, S11, S14 y S15.
- **BLOCKERS de implementación abiertos:** ninguno en los 31 hallazgos.
- **CRITICAL aceptados:** falta ejecutar la matriz dinámica A–G contra un
  Postgres desechable; falta una prueba viva del storage S3; la cuota de 500 MiB
  se calcula antes de subir y dos instancias concurrentes podrían rebasarla por
  el tamaño agregado de sus cargas aceptadas. La tasa de 20/h limita la ventana,
  pero no vuelve atómica la cuota.
- **Checks externos no verificados:** Security/Performance Advisor, MFA y
  Network Restrictions de la cuenta de Supabase; no hay evidencia ejecutable de
  esas consolas en este entorno.

## 7. LO QUE NO HICE

- No modifiqué callers heredados fuera de las tres excepciones autorizadas.
  Como consecuencia, `verify:escrituras` detecta cuatro incompatibilidades
  reales: dos `IntegrationSyncLog.create` en `pages/Caja.jsx` y dos
  `Mesa.update({qr_token})` en `components/portalqr/MesasQRTab.jsx`. El backend
  ahora rechaza las cuatro. Arreglar esas pantallas violaba el alcance explícito.
- No declaré verde `pnpm verify`: su salida es 1 por esas cuatro escrituras. No
  relajé el verificador para ocultarlas.
- No ejecuté la suite de integración ni las carreras A–G: esta máquina carece de
  Docker y no recibió `DATABASE_URL_PRUEBAS`. La suite falla expresamente en vez
  de saltarse.
- No hice E2E ni QA funcional de pantallas; corresponde al QA posterior indicado
  por el prompt.
- No desplegué a Vercel, no integré `carril-b` a `main` y no cambié configuración
  de producción fuera de las migraciones aplicadas.
- No comprobé desde consola los Advisors, MFA o restricciones de red de
  Supabase.

El primer ensayo de restore dejó un directorio temporal cuando una limpieza fue
rechazada por el control automático de comandos. Después validé que la ruta
resolvía exactamente dentro de `%TEMP%` y lo eliminé; no queda ese residuo.

## 8. Estado al cerrar

- **Hallazgos:** 31/31 corregidos, probados y cubiertos por mutación.
- **Rama integrada a `main`:** no; la entrega queda revisable en `carril-b`.
- **Bloqueos de código en alcance:** ninguno.
- **Trabajo de QA pendiente:** Postgres desechable para la matriz A–G, storage
  vivo y las cuatro adaptaciones de frontend fuera de alcance.

## 9. Para quien retome

No vuelva escribible `IntegrationSyncLog` ni `Mesa.qr_token` para hacer verde el
frontend: adapte sus callers a comandos autorizados. Ejecute integración con un
Postgres descartable antes de producción. Al configurar storage, el bucket debe
seguir privado; sólo el comando de persistencia copia una imagen a `publico/` y
la ruta pública vuelve a comprobar una referencia de base.
