# Pendientes cruzados · Codex / Claude Code

## 2026-09-07 · Carril B, arranque y B-01

| Necesito / entrego                                     | Responsable                     | Motivo                                                                                                                          | STUB |
| ------------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `comando()` y su contrato final                        | A                               | B-04 y B-05 deben consumirlo sin duplicarlo                                                                                     | No   |
| `@morphiqpos/domain/catalogo`                          | B, disponible en `carril-b`     | Cuatro tipos, cantidades exactas y precio base para la cotización A                                                             | No   |
| `consumo.ts` y `stock.ts`                              | B, pendientes B-02/B-03         | Cobro y decremento atómico; todavía no están implementados                                                                      | No   |
| Unificar gates de documentación y código               | Zona neutral, coordinar con A   | `verify:residuos` detecta 14 referencias en documentos históricos de planeación; el formateador rechaza documentación integrada | No   |
| Ruta del estándar completo `morphiq-prs`               | Miguel / quien tenga el archivo | Sólo se encontraron gates resumidos por corte; no se puede afirmar aprobación completa                                          | No   |
| `DATABASE_URL` y credenciales reales de almacenamiento | Infraestructura compartida      | La CLI recuperó claves API, pero no completan una conexión PostgreSQL ni credenciales S3                                        | No   |

Avisos de zona neutral: se agregaron tres códigos a `packages/contracts/src/errores/index.ts`,
la exportación `./catalogo` al manifiesto de domain y el verificador nuevo
`scripts/verificar-catalogo-codex.mjs`. Se preservaron todas las exportaciones existentes.

Integración: se unieron las historias locales y remotas únicamente en `carril-b`.
El único conflicto fue README; se conservó la versión remota y el contenido de
arranque local se conservó completo en `docs/ARRANQUE-CODEX.md`. No se cambió de
rama ni se trabajó dentro de la carpeta de A. No se integra a `main` con gate rojo.

La CLI confirmó 26 tablas operativas y `_migraciones`, todas con RLS. Sólo se
consultó el proyecto de MorphiqPOS. `.env` local contiene claves API recuperadas
y secretos nuevos de sesión/PIN; está ignorado por Git y sigue incompleto.
No reutilizar esos secretos entre entornos sin coordinar la sesión y el enrolamiento.
