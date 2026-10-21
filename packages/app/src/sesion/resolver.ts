import 'server-only';

import { esRol, plantillaDeOrganizacion, type Ambito, type Paquete } from '@morphiqpos/contracts';
import { obtenerDb, repoSesion } from '@morphiqpos/data';

import { verificarSesion, type Verificacion } from './token.ts';
import { autorizaPresentacion } from './permisos-presentacion.ts';

/**
 * De una cookie a un `Ambito` — el puente que faltaba (F1.1-X-01).
 *
 * Es el único lugar del sistema donde nace un ámbito. R16: «El ámbito viene de
 * la sesión del servidor, jamás de un parámetro del cliente.» Si mañana hay otra
 * forma de entrar —un token de portal QR, por ejemplo— se agrega aquí y todos
 * los comandos la heredan sin tocarse.
 */

/**
 * El ámbito más lo que la interfaz necesita para saludar: paquete y nombres.
 *
 * Viaja junto y no en una consulta aparte porque `resolverAmbito` ya toca
 * `organizaciones` para comprobar que está activa: traerlo cuesta cero
 * consultas más, y pedirlo aparte sería el N+1 que `12A` prohíbe, en el camino
 * caliente de CADA petición autenticada.
 */
export interface SesionDeNegocio extends Ambito {
  readonly paquete: Paquete;
  readonly nombrePersona: string;
  readonly nombreNegocio: string;
  readonly nombreSucursal: string | null;
  /** Esta sesión trabaja en el contexto de presentación del restaurante (21-10). */
  readonly enPresentacion: boolean;
}

export type ResultadoSesion =
  | { readonly ok: true; readonly ambito: Ambito; readonly sesion: SesionDeNegocio }
  | {
      readonly ok: false;
      /**
       * `expirada` la UI la trata distinto: reabre el diálogo de PIN conservando
       * el carrito, en vez de mandar al login y perder la venta a medias.
       */
      readonly motivo: 'ausente' | 'invalida' | 'expirada' | 'revocada' | 'presentacion';
    };

export interface OpcionesResolver {
  readonly secreto: string;
  /** Token de la cookie de sesión. */
  readonly token: string | undefined;
  /** Token de dispositivo de la terminal, si la petición viene de una. */
  readonly terminalId?: string | undefined;
}

export async function resolverSesion(opciones: OpcionesResolver): Promise<ResultadoSesion> {
  const verificado = verificarSesion(opciones.token, opciones.secreto);
  if (!verificado.ok) return { ok: false, motivo: traducir(verificado) };

  const db = obtenerDb();
  const registrada = await repoSesion.sesionActiva(
    db,
    verificado.carga.sid,
    verificado.carga.empleoId,
  );
  if (!registrada) return { ok: false, motivo: 'revocada' };

  const fila = await repoSesion.resolverAmbito(
    db,
    verificado.carga.identidadId,
    verificado.carga.empleoId,
  );

  // La sesión estaba bien firmada pero el empleo ya no vale: baja, cambio de
  // sucursal, organización desactivada. La firma no puede saberlo; la base sí.
  if (fila === null) return { ok: false, motivo: 'revocada' };

  // El rol es `text` con `check` en la base, así que el tipo generado dice
  // `string`. Se estrecha en vez de aseverar: un rol desconocido no autoriza.
  if (!esRol(fila.rol)) return { ok: false, motivo: 'revocada' };

  // EL MODO PRESENTACIÓN (21-10), sin una consulta más: viene en la fila.
  //
  // Un espejo APAGADO no tiene sesiones válidas: al terminar la presentación cada puesto
  // vuelve a entrar y cae en el restaurante real, con sus datos como estaban.
  const esEspejo =
    typeof fila.presentacionEspejoDe === 'string' && fila.presentacionEspejoDe !== '';
  if (esEspejo && fila.presentacionEspejoActivo !== 'true')
    return { ok: false, motivo: 'presentacion' };
  // Y el real EN presentación no atiende las sesiones de sus puestos: vuelven a entrar y
  // `/api/auth/entrar` los abre en su gemelo. Se salvan la sesión del dueño general —es la
  // raíz de su presentación y la que apaga el modo— y las delegadas, que ya pasaron por su
  // concesión.
  if (
    fila.presentacionActivo === 'true' &&
    verificado.carga.presentador === undefined &&
    fila.duenoGeneralEmpleo !== fila.empleoId
  )
    return { ok: false, motivo: 'presentacion' };
  // Un contexto de demo depende de la sesión Y del permiso del dueño original.
  // Revocar cualquiera de los dos cierra también los contextos que abrió.
  const origen = verificado.carga.presentador;
  let duenoGeneral = null;
  if (origen !== undefined) {
    if (!(await repoSesion.sesionActiva(db, origen.sid, origen.empleoId)))
      return { ok: false, motivo: 'revocada' };
    duenoGeneral = await repoSesion.resolverAmbito(db, origen.identidadId, origen.empleoId);
    if (duenoGeneral === null || !(await autorizaPresentacion(duenoGeneral, fila)))
      return { ok: false, motivo: 'revocada' };
    if (
      origen.terminalId !== null &&
      (await repoSesion.terminalActiva(db, origen.terminalId, duenoGeneral.organizacionId)) === null
    )
      return { ok: false, motivo: 'revocada' };
  }

  // El paquete NO se estrecha: se NORMALIZA.
  //
  // Esto decía `if (!esPaquete(fila.paquete)) return revocada`, y con el
  // renombre de D-01 eso apaga el sistema entero de la peor forma posible:
  // mientras la 058 no esté aplicada la columna guarda `restaurante_pro`, que
  // ya no es un paquete válido, así que TODAS las sesiones de los cuatro
  // negocios vivos se revocarían y nadie podría entrar. No es un permiso de
  // más: es no poder abrir la caja por la mañana.
  //
  // `plantillaDe` entiende los seis valores y cae en `tienda` —la más
  // restrictiva— ante cualquier cosa que no reconozca, así que sigue sin
  // adivinar el más permisivo. Es la misma normalización que hace
  // `leerPaquete` en `produccion.ts`: una sola regla, en los dos sitios que
  // leen esa columna.
  const paquete = plantillaDeOrganizacion(fila.giro, fila.paquete);

  const terminalId = verificado.carga.terminalId;
  let sucursalId = fila.sucursalId;

  if (terminalId !== null) {
    const terminal = await repoSesion.terminalActiva(db, terminalId, fila.organizacionId);
    // Una terminal desenrolada o de otra organización no degrada a «sin
    // terminal»: invalida la sesión. Degradar dejaría operar con una cookie
    // vieja después de dar de baja el dispositivo.
    if (terminal === null) return { ok: false, motivo: 'revocada' };
    sucursalId = terminal.sucursalId;
  }

  const ambito: Ambito = {
    organizacionId: fila.organizacionId,
    sucursalId,
    terminalId,
    identidadId: fila.identidadId,
    empleoId: fila.empleoId,
    rol: fila.rol,
    ...(origen === undefined
      ? {}
      : { presentador: { empleoId: origen.empleoId, identidadId: origen.identidadId } }),
  };

  return {
    ok: true,
    ambito,
    sesion: {
      ...ambito,
      paquete,
      nombrePersona: duenoGeneral?.nombrePersona ?? fila.nombrePersona,
      nombreNegocio: fila.nombreNegocio,
      nombreSucursal: fila.nombreSucursal,
      enPresentacion: esEspejo,
    },
  };
}

function traducir(
  fallo: Extract<Verificacion, { ok: false }>,
): 'ausente' | 'invalida' | 'expirada' {
  if (fallo.motivo === 'ausente') return 'ausente';
  if (fallo.motivo === 'expirado') return 'expirada';
  return 'invalida';
}
