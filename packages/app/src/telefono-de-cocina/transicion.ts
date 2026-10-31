import 'server-only';

import { ErrorDominio, type Resultado } from '@morphiqpos/contracts';
import { conTransaccion, repoComandos } from '@morphiqpos/data';
import { z } from 'zod';

import { fallo, validar } from '../errores.ts';
import { Rechazo, Reintento } from '../fallos.ts';
import { traducirFallo } from '../portal/comando-publico.ts';
import {
  alcanceIdempotenciaPortal,
  CLAVE_MINIMA,
  reclamarClaveAnonima,
} from '../portal/idempotencia.ts';
import { permitirPortal } from '../portal/limite.ts';
import { comandaDeLaEstacion } from '../restaurante/datos.ts';
import { moverLaComandaEntera } from '../restaurante/preparacion.ts';
import { payloadDeAuditoria } from '../saneado.ts';
import { resolverAmbitoDeEstacion } from './ambito.ts';

const COMANDO = 'cocina.telefono_transicionar';

export const entradaTransicionDelTelefono = z
  .object({
    comandaId: z.uuid(),
    /** El teléfono sólo prepara y deja listo: entregar y cancelar son de la sala. */
    estado: z.enum(['en_preparacion', 'listo']),
  })
  .strict();

export interface ResultadoDelTelefono {
  readonly comandaId: string;
  readonly estado: string;
  readonly sinCambio: boolean;
}

/**
 * «Preparar» o «Listo» desde el teléfono de una estación (DP-9.4).
 *
 * Público (R33): sin sesión, con el token de la estación. Cuenta el intento antes de nada,
 * exige clave de idempotencia, comprueba el token contra la base, sólo toca comandas de SU
 * estación, y mueve la comanda con la MISMA regla que la pantalla de Cocina
 * (`moverLaComandaEntera`): si la pantalla grande ya la movió, el `where estado = leído` hace
 * que el segundo cambie cero filas y diga «sin cambio» o «ya no se puede». Audita sin identidad.
 */
export async function transicionarDesdeElTelefono(peticion: {
  readonly token: string;
  readonly organizacionId: string;
  readonly pimienta: string;
  readonly entrada: unknown;
  readonly idempotencyKey?: string | undefined;
  readonly correlationId: string;
}): Promise<Resultado<ResultadoDelTelefono>> {
  const { correlationId } = peticion;
  const permiso = await permitirPortal('cocina_transicion', peticion.token, peticion.pimienta, {
    correlationId,
    organizacionId: peticion.organizacionId,
  });
  if (!permiso.ok) {
    return {
      ok: false,
      error: {
        codigo: 'REGLA_DE_NEGOCIO',
        mensaje: 'Demasiados toques seguidos. Espera un momento.',
        datos: { regla: 'TELEFONO_DEMASIADAS_PETICIONES', esperaSegundos: permiso.esperaSegundos },
      },
      correlationId,
    };
  }
  const clave = peticion.idempotencyKey;
  if (clave === undefined || clave.length < CLAVE_MINIMA) {
    return { ok: false, error: fallo('IDEMPOTENCIA_REQUERIDA'), correlationId };
  }

  const instante = new Date();
  let idempotencia = { clave, huellaEntrada: '' };
  try {
    const datos = await conTransaccion(async (tx) => {
      const ambito = await resolverAmbitoDeEstacion(tx, { ...peticion, ahora: instante });
      const validada = validar(entradaTransicionDelTelefono, peticion.entrada);
      if (!validada.ok) throw new Rechazo('ENTRADA_INVALIDA', null, validada.error);
      idempotencia = alcanceIdempotenciaPortal(ambito.estacionId, clave, validada.datos);

      const previa = await repoComandos.leerEjecucion(
        tx,
        ambito.organizacionId,
        COMANDO,
        idempotencia.clave,
      );
      if (previa !== null) throw new Reintento(previa);
      const reclamacion = await reclamarClaveAnonima(tx, {
        organizacionId: ambito.organizacionId,
        comando: COMANDO,
        idempotencyKey: idempotencia.clave,
        huellaEntrada: idempotencia.huellaEntrada,
        correlationId,
      });
      if (reclamacion === 'duplicada') {
        const confirmada = await repoComandos.leerEjecucion(
          tx,
          ambito.organizacionId,
          COMANDO,
          idempotencia.clave,
        );
        if (confirmada !== null) throw new Reintento(confirmada);
        throw new Rechazo('COMANDO_EN_CURSO', null);
      }
      if (reclamacion === 'ocupada') throw new Rechazo('COMANDO_EN_CURSO', null);

      const comanda = await comandaDeLaEstacion(
        tx,
        ambito.organizacionId,
        ambito.estacionId,
        validada.datos.comandaId,
      );
      if (comanda === null) {
        throw new ErrorDominio('COMANDA_NO_ENCONTRADA', 'Esa comanda ya no está en tu estación.');
      }
      const movida = await moverLaComandaEntera(tx, {
        organizacionId: ambito.organizacionId,
        comanda,
        destino: validada.datos.estado,
        empleoId: null,
        ahora: instante,
      });

      await repoComandos.escribirAuditoria(tx, {
        organizacionId: ambito.organizacionId,
        identidadId: null,
        terminalId: null,
        accion: COMANDO,
        entidad: 'comanda',
        entidadId: comanda.id,
        correlationId,
        payload: payloadDeAuditoria({
          v: 1,
          comando: COMANDO,
          origen: 'telefono_de_cocina',
          estacionId: ambito.estacionId,
          estacion: ambito.estacionNombre,
          de: comanda.estado,
          a: movida.estado,
          sinCambio: movida.sinCambio,
        }),
      });
      const salida: ResultadoDelTelefono = {
        comandaId: comanda.id,
        estado: movida.estado,
        sinCambio: movida.sinCambio,
      };
      await repoComandos.completarEjecucion(tx, {
        organizacionId: ambito.organizacionId,
        comando: COMANDO,
        idempotencyKey: idempotencia.clave,
        respuesta: salida,
        ahora: instante,
      });
      return salida;
    });
    return { ok: true, datos, correlationId, reintento: false };
  } catch (error) {
    return traducirFallo<ResultadoDelTelefono>(error, {
      comando: COMANDO,
      correlationId,
      huellaEntrada: idempotencia.huellaEntrada,
      organizacionId: peticion.organizacionId,
      idempotencyKey: idempotencia.clave,
    });
  }
}
