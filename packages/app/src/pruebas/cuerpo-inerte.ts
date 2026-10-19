/**
 * EL CUERPO QUE NINGÚN COMANDO ACEPTA, para preguntar por un permiso sin ejecutar nada.
 *
 * La matriz de permisos (`pruebas/e2e/matriz-de-permisos.spec.ts`) le manda a cada ruta de
 * comando, con cada rol, un cuerpo que no importa: `comando()` comprueba el rol ANTES que la
 * entrada (rol → paquete → módulo → zod), así que donde el rol no está contesta 403, y donde
 * sí está contesta zod. Mandaba `{}`, y CINCO comandos que escriben lo aceptan —todos sus
 * campos tienen valor por omisión—: `venta.crear_orden`, `catalogo.fiscal_masivo`,
 * `inventario.valuar`, `restaurante.limpiar_solicitudes` y `restaurante.vaciar_solicitudes`.
 * Con el rol que sí puede, la matriz los EJECUTABA: abría órdenes y vaciaba las solicitudes
 * del comensal. En la base desechable de CI no se nota; contra el preview, que escribe en la
 * base compartida, eran órdenes vacías y solicitudes borradas en las cinco demos.
 *
 * Un texto no es la entrada de ningún comando —todas son objetos—, y
 * `validacion/cuerpo-inerte.contrato.test.ts` lo comprueba contra el registro entero: el día
 * que un comando acepte esto, la matriz deja de ser segura contra cualquier base y esa prueba
 * lo dice antes de que alguien la corra.
 */
export const CUERPO_INERTE = 'matriz de permisos: este cuerpo no es la entrada de ningún comando';
