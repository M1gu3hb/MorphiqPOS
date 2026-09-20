import { validarEntorno } from '@morphiqpos/contracts';
import { repoArchivos } from '@morphiqpos/app/archivos';
import { armarExporte, FORMATOS } from '@morphiqpos/app/reportes';

import { almacenArchivos } from '~/servidor/archivos-almacen';
import { crearClaveDeExporte } from '~/servidor/archivos-claves';
import { conSesion } from '~/servidor/http';

/**
 * F-322 · Sacar los registros a un archivo.
 *
 * La pantalla de registros tiene una sola acción propia —EXPORTAR— y publicaba
 * aquí: **esto no existía**, así que el botón daba el error genérico y cuando el
 * contador pedía «mándame el mes» la respuesta era una captura de pantalla.
 *
 * ── Por qué es una RUTA y no un comando ──────────────────────────────────
 * Porque no escribe nada del negocio: lee por el puente —con los mismos permisos
 * por campo que la pantalla, así que el costo que el cajero no ve tampoco sale en
 * el CSV— y guarda un archivo. Un comando dejaría un renglón de escritura en el
 * rastro sobre algo que no escribió.
 *
 * ── Por qué el archivo va al almacén privado y no en la respuesta ────────
 * Porque la respuesta de la pantalla es JSON y un CSV de cinco mil filas dentro de
 * un JSON es un archivo que el navegador tiene que volver a armar. Va al mismo
 * prefijo privado de la organización que las fotos: así el lector de
 * `/api/archivos/…` le aplica la misma comprobación —lo baja sólo quien está dentro
 * de ESE negocio— y la cuota lo cuenta igual. Un exporte con su propio camino sería
 * un camino más que proteger.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Quien ve los registros del negocio. Un cajero no exporta la contabilidad. */
const ROLES_DE_REPORTE = ['dueno', 'administrador', 'gerente'] as const;

/** La misma cuota que las imágenes: es el mismo prefijo y el mismo bucket. */
const CUOTA_ORGANIZACION_BYTES = 500 * 1024 * 1024;

interface Cuerpo {
  readonly entidad?: unknown;
  readonly formato?: unknown;
  readonly desde?: unknown;
  readonly hasta?: unknown;
}

function error(codigo: string, mensaje: string, estado: number): Response {
  return Response.json(
    { ok: false, error: { codigo, mensaje } },
    { status: estado, headers: { 'cache-control': 'no-store' } },
  );
}

/** Una fecha ISO, o nada. El rango vacío exporta lo más reciente. */
function fecha(valor: unknown): string | undefined {
  if (typeof valor !== 'string' || valor === '') return undefined;
  return Number.isNaN(Date.parse(valor)) ? undefined : valor;
}

export function POST(peticion: Request): Promise<Response> {
  return conSesion(
    peticion,
    async (sesion) => {
      const cuerpo = (await peticion.json()) as Cuerpo;
      const entidad = typeof cuerpo.entidad === 'string' ? cuerpo.entidad : '';
      // Con `find` y no con un `includes` más aserción: así el tipo sale estrechado
      // de la comprobación, que es lo que la comprobación está haciendo.
      const formato = FORMATOS.find((f) => f === cuerpo.formato);
      if (formato === undefined) {
        // La lista es cerrada a propósito: «pdf» en la entrada de hoy sería un
        // archivo vacío con extensión de PDF, que es peor que no ofrecerlo.
        return error(
          'CONFIGURACION_INVALIDA',
          `Ese formato no se exporta todavía. Hoy: ${FORMATOS.join(', ')}.`,
          // 422: la petición se entendió y sus datos no valen.
          422,
        );
      }

      const desde = fecha(cuerpo.desde);
      const hasta = fecha(cuerpo.hasta);
      const armado = await armarExporte(
        { organizacionId: sesion.organizacionId, rol: sesion.rol },
        {
          entidad,
          formato,
          ...(desde === undefined ? {} : { desde }),
          ...(hasta === undefined ? {} : { hasta }),
        },
      );

      const almacen = almacenArchivos();
      const bytesObservados = await almacen.bytesBajo(`privado/${sesion.organizacionId}/`);
      const reservados = await repoArchivos.reservarCuotaArchivo({
        organizacionId: sesion.organizacionId,
        bytesNuevos: armado.bytes.byteLength,
        limiteBytes: CUOTA_ORGANIZACION_BYTES,
        bytesObservados,
      });
      if (reservados === null) {
        return error(
          'CUOTA_DE_ARCHIVOS',
          'La organización agotó su cuota de archivos: borra exportes viejos.',
          413,
        );
      }

      const clave = crearClaveDeExporte(sesion.organizacionId, 'csv');
      try {
        await almacen.guardar(clave, armado.bytes, armado.contentType);
      } catch (causa) {
        // La cuota se libera si el guardado falla: si no, cada intento fallido
        // dejaría al negocio con menos espacio del que de verdad usa.
        await repoArchivos.liberarCuotaArchivo(sesion.organizacionId, armado.bytes.byteLength);
        throw causa;
      }

      const origen = new URL(validarEntorno(process.env).APP_URL).origin;
      return {
        url: `${origen}/api/archivos/${clave}`,
        nombre: armado.nombre,
        filas: armado.filas,
        // Se dice si el reporte salió CORTADO: un CSV al que le faltan filas sin
        // avisar es peor que uno que no se pudo generar.
        cortado: armado.cortado,
        campoDelRango: armado.campoDelRango,
      };
    },
    { roles: [...ROLES_DE_REPORTE] },
  );
}
