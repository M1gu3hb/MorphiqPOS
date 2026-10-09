import { ROLES } from '@morphiqpos/contracts';
import { terminosDeLaOrganizacion } from '@morphiqpos/app/configuracion';
import { etiquetaDeRol, etiquetaDeRolEnElGiro, rolMH } from '@morphiqpos/app/puente';

import { responderConsulta } from '../../../../src/servidor/http';

export const dynamic = 'force-dynamic';

/**
 * Quién está dentro, según el SERVIDOR.
 *
 * Es la fuente de verdad de la sesión para toda la interfaz portada del
 * restaurante. Ahora la cookie es `HttpOnly`, la firma se comprueba en cada
 * petición y el empleo se relee de la base, así que una baja a media jornada
 * cierra la barra lateral en la siguiente navegación.
 *
 * ── La misma forma que devuelve `/api/auth/entrar` (bloque D de la 2.4) ──
 * Su `POSAuthContext` guardaba el usuario en `sessionStorage` y SÓLO lo creía a él:
 * nunca preguntaba aquí. Una pestaña nueva —o un navegador que restaura la sesión—
 * llegaba con la cookie válida ocho horas y la interfaz lo mandaba al PIN; y al revés,
 * una sesión vencida seguía pintando la barra con el nombre de quien ya no estaba. Ahora
 * el contexto pregunta aquí al montar, y por eso esto contesta lo mismo que el PIN:
 * `id` es el del EMPLEO —el que el navegador ya recibe al entrar y con el que las
 * pantallas de sala reconocen lo suyo—, `rol` en el vocabulario de esas pantallas y
 * `etiqueta` como lo llama su giro. El `identidadId` se queda en el servidor.
 */
export function GET(): Promise<Response> {
  return responderConsulta(
    async (sesion) => {
      // Es un rótulo: si la configuración no se puede leer, el genérico.
      const terminos = await terminosDeLaOrganizacion(sesion.organizacionId).catch(() => null);
      return {
        id: sesion.empleoId,
        nombre: sesion.nombrePersona,
        rol: rolMH(sesion.rol) ?? sesion.rol,
        etiqueta:
          terminos === null
            ? etiquetaDeRol(sesion.rol)
            : etiquetaDeRolEnElGiro(sesion.rol, terminos.giro, terminos.personalizado),
        activo: true,
        organizacionId: sesion.organizacionId,
        paquete: sesion.paquete,
        nombreNegocio: sesion.nombreNegocio,
        nombreSucursal: sesion.nombreSucursal,
        tieneTerminal: sesion.terminalId !== null,
      };
    },
    { roles: ROLES },
  );
}
