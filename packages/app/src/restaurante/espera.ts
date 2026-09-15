import 'server-only';

import { ErrorDominio, PAQUETES_RESTAURANTE } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { esTransicionDeEsperaValida, estimarEspera } from '@morphiqpos/domain/sala';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';
import { mesaOperable } from './datos.ts';
import { atarMesaAOrden, crearOrdenDeMesa } from './mesas-escrituras.ts';

/**
 * `restaurante.registrar_espera`, `mover_espera` y `sentar_espera` — F-306.
 *
 * ── El papelito del atril ──────────────────────────────────────────────────
 * El viernes a las 21:00 hay doce personas esperando y el control es un papel.
 * Nadie sabe a quién le toca, el que llegó primero reclama, y el sistema no
 * puede decir cuánto falta porque no sabe cuánto dura una mesa.
 *
 * ── La espera se CALCULA ───────────────────────────────────────────────────
 * Del promedio real de F-305, en el servidor, al registrar. No se teclea y no
 * se acepta del cliente: el anfitrión que dice «diez minutos» para que la
 * familia no se vaya consigue que se vaya igual a los veinte, y además molesta.
 * Se congela al registrar en vez de recalcularse al consultar, para que la
 * pantalla no enseñe un número que baila en cada refresco.
 *
 * ── Tres comandos y no dos ─────────────────────────────────────────────────
 * El `05-DATOS-Y-BACKEND` lista `registrarEspera` y `sentarEspera`. Faltaba el
 * de en medio: `avisado` y `abandono` son dos de los cuatro estados de la tabla
 * y sin comando no habría forma de llegar a ellos, así que la cola se llenaría
 * de gente que ya se fue y la estimación mentiría para todos los que siguen.
 * `mover_espera` los cubre con la máquina de estados del dominio.
 */

const texto = (max: number) => z.string().trim().min(1).max(max);

export const entradaRegistrarEspera = z.object({
  nombre: texto(120),
  /** Para avisar por mensaje en vez de gritar. Dato personal. */
  telefono: z
    .string()
    .trim()
    .regex(/^[\d+\-()\s]{7,20}$/, 'Ese teléfono no tiene forma de teléfono.')
    .optional(),
  personas: z.number().int().min(1).max(40),
  notas: texto(200).optional(),
});

export const entradaMoverEspera = z.object({
  esperaId: z.uuid(),
  estado: z.enum(['avisado', 'abandono']),
});

export const entradaSentarEspera = z.object({
  esperaId: z.uuid(),
  mesaId: z.uuid(),
});

export interface ResultadoRegistroEspera {
  readonly esperaId: string;
  readonly posicion: number;
  readonly esperaEstimadaMinutos: number | null;
}

export interface ResultadoMoverEspera {
  readonly esperaId: string;
  readonly estado: string;
}

export interface ResultadoSentarEspera {
  readonly esperaId: string;
  readonly mesaId: string;
  readonly ordenId: string;
  readonly minutosEsperados: number;
}

/** La cola la lleva quien está en la puerta, y en un local chico es cualquiera. */
const ROLES = ['mesero', 'cajero', 'gerente', 'administrador', 'dueno'] as const;

/** Estados en los que la espera sigue viva y cuenta para la cola. */
const EN_COLA = ['esperando', 'avisado'] as const;

export const registrarEspera = definirComando<
  Transaccion,
  typeof entradaRegistrarEspera,
  ResultadoRegistroEspera
>({
  nombre: 'restaurante.registrar_espera',
  entidad: 'lista_espera',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_RESTAURANTE,
  entrada: entradaRegistrarEspera,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, empleoId } = ctx.ambito;

    if (sucursalId === null) {
      throw new ErrorDominio(
        'VENTA_SIN_TERMINAL',
        'Esta terminal no tiene sucursal: la cola es de un salón, no del negocio entero.',
      );
    }

    const cola = await ctx.paso('mirar_cola', () =>
      medirCola(ctx.tx, organizacionId, sucursalId, entrada.personas),
    );

    const estimada = estimarEspera(cola.datos);

    const fila = await ctx.paso('anotar', () =>
      ctx.tx
        .insertInto('lista_espera')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sucursalId,
          nombre: entrada.nombre,
          telefono: entrada.telefono ?? null,
          personas: entrada.personas,
          estado: 'esperando',
          espera_estimada_minutos: estimada,
          notas: entrada.notas ?? null,
          empleado_id: empleoId,
          creada_en: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    ctx.auditar({
      entidadId: fila.id,
      payload: {
        personas: entrada.personas,
        posicion: cola.datos.gruposDelante + 1,
        esperaEstimadaMinutos: estimada,
      },
    });

    return {
      esperaId: fila.id,
      posicion: cola.datos.gruposDelante + 1,
      esperaEstimadaMinutos: estimada,
    };
  },
});

export const moverEspera = definirComando<
  Transaccion,
  typeof entradaMoverEspera,
  ResultadoMoverEspera
>({
  nombre: 'restaurante.mover_espera',
  entidad: 'lista_espera',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_RESTAURANTE,
  entrada: entradaMoverEspera,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    const espera = await ctx.paso('cargar_espera', () =>
      cargarEspera(ctx.tx, organizacionId, entrada.esperaId),
    );

    if (!esTransicionDeEsperaValida(espera.estado, entrada.estado)) {
      throw new ErrorDominio(
        'TRANSICION_INVALIDA',
        `Esa espera está en «${espera.estado}» y no puede pasar a «${entrada.estado}».`,
        { desde: espera.estado, hasta: entrada.estado },
      );
    }

    await ctx.paso('mover', () =>
      ctx.tx
        .updateTable('lista_espera')
        .set({
          estado: entrada.estado,
          ...(entrada.estado === 'avisado' ? { avisada_en: ctx.ahora } : {}),
        })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.esperaId)
        // La guarda contra dos anfitriones con la misma lista en pantalla.
        .where('estado', '=', espera.estado)
        .execute(),
    );

    ctx.auditar({ entidadId: entrada.esperaId, payload: { de: espera.estado, a: entrada.estado } });
    return { esperaId: entrada.esperaId, estado: entrada.estado };
  },
});

export const sentarEspera = definirComando<
  Transaccion,
  typeof entradaSentarEspera,
  ResultadoSentarEspera
>({
  nombre: 'restaurante.sentar_espera',
  entidad: 'lista_espera',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_RESTAURANTE,
  entrada: entradaSentarEspera,
  async ejecutar(ctx, entrada) {
    const { organizacionId, terminalId, empleoId } = ctx.ambito;

    const espera = await ctx.paso('cargar_espera', () =>
      cargarEspera(ctx.tx, organizacionId, entrada.esperaId),
    );

    if (!esTransicionDeEsperaValida(espera.estado, 'sentado')) {
      throw new ErrorDominio(
        'TRANSICION_INVALIDA',
        espera.estado === 'sentado'
          ? 'A esa familia ya la sentaron.'
          : 'Esa espera ya no está en la cola.',
        { desde: espera.estado },
      );
    }

    const mesa = await ctx.paso('cargar_mesa', () =>
      mesaOperable(ctx.tx, organizacionId, entrada.mesaId),
    );

    if (mesa.estado !== 'libre' || mesa.ordenActivaId !== null) {
      throw new ErrorDominio(
        'MESA_YA_ABIERTA',
        `La mesa ${mesa.numero} ya está abierta. Elige otra o libérala antes.`,
        { estado: mesa.estado },
      );
    }

    // ABRIR LA MESA Y CERRAR LA ESPERA VAN EN LA MISMA TRANSACCIÓN. Hacerlo en
    // dos pasos deja el caso que el papelito ya resuelve mal: la familia
    // tachada de la lista y sin mesa asignada, o la mesa abierta con la gente
    // todavía en la cola y el de atrás reclamando.
    const ordenId = await ctx.paso('abrir_mesa', () =>
      crearOrdenDeMesa(ctx.tx, {
        organizacionId,
        sucursalId: mesa.sucursalId,
        terminalId,
        empleoId,
        mesaId: mesa.id,
        entrada: {
          mesaId: mesa.id,
          personas: espera.personas,
          // El nombre con el que se anotaron es el que el mesero ya usó para
          // llamarlos: reutilizarlo evita teclearlo dos veces y evita que la
          // mesa diga «mesa 5» mientras la lista dice «familia Pérez».
          clienteNombre: espera.nombre,
          celebracionEspecial: false,
        },
      }),
    );

    await ctx.paso('atar_mesa', () =>
      atarMesaAOrden(ctx.tx, {
        organizacionId,
        sucursalId: mesa.sucursalId,
        mesaId: mesa.id,
        ordenId,
        empleoId,
        estadoAnterior: mesa.estado,
        ahora: ctx.ahora,
        tomarLaAtencion: mesa.empleadoAtiendeId === null,
        entrada: {
          mesaId: mesa.id,
          personas: espera.personas,
          clienteNombre: espera.nombre,
          celebracionEspecial: false,
        },
      }),
    );

    const cerrada = await ctx.paso('cerrar_espera', () =>
      ctx.tx
        .updateTable('lista_espera')
        .set({
          estado: 'sentado',
          mesa_id: mesa.id,
          orden_id: ordenId,
          sentada_en: ctx.ahora,
        })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.esperaId)
        // SEGUNDO CERROJO, y de otra clase que el de arriba: aquél da el
        // mensaje correcto cuando la familia ya está sentada, éste gana la
        // carrera cuando dos anfitriones la sientan en el mismo segundo desde
        // dos tabletas. Ninguna prueba con base falsa puede provocar esa
        // carrera; la guarda se conserva por la misma razón que la de
        // `atarMesaAOrden`, que es el precedente del proyecto.
        .where('estado', 'in', [...EN_COLA])
        .executeTakeFirst(),
    );

    if (Number(cerrada.numUpdatedRows) !== 1) {
      throw new ErrorDominio(
        'TRANSICION_INVALIDA',
        'Otro anfitrión sentó a esa familia mientras la sentabas.',
      );
    }

    const minutos = Math.max(
      0,
      Math.round((ctx.ahora.getTime() - espera.creadaEn.getTime()) / 60_000),
    );

    ctx.auditar({
      entidadId: entrada.esperaId,
      payload: {
        mesaNumero: mesa.numero,
        ordenId,
        personas: espera.personas,
        // Lo que esperó DE VERDAD, frente a lo que se le prometió. Es el dato
        // que dice si la estimación sirve, y sin él F-306 no se puede afinar.
        minutosEsperados: minutos,
        minutosEstimados: espera.estimadaMinutos,
      },
    });

    return { esperaId: entrada.esperaId, mesaId: mesa.id, ordenId, minutosEsperados: minutos };
  },
});

interface EsperaViva {
  readonly id: string;
  readonly estado: string;
  readonly nombre: string;
  readonly personas: number;
  readonly creadaEn: Date;
  readonly estimadaMinutos: number | null;
}

async function cargarEspera(
  tx: Transaccion,
  organizacionId: string,
  esperaId: string,
): Promise<EsperaViva> {
  const fila = await tx
    .selectFrom('lista_espera')
    .select([
      'id',
      'estado',
      'nombre',
      'personas',
      'creada_en as creadaEn',
      'espera_estimada_minutos as estimadaMinutos',
    ])
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', esperaId)
    .executeTakeFirst();

  if (fila === undefined) {
    throw new ErrorDominio('SOLICITUD_NO_ENCONTRADA', 'Esa espera no existe en este negocio.');
  }

  return {
    id: fila.id,
    estado: fila.estado,
    nombre: fila.nombre,
    personas: fila.personas,
    creadaEn: fila.creadaEn,
    estimadaMinutos: fila.estimadaMinutos,
  };
}

/**
 * Cuánta gente va delante y cuántas mesas les sirven.
 *
 * «Delante» y «compatible» van juntos a propósito: una pareja no espera a que
 * se libere la mesa de diez, así que sólo cuentan los grupos que necesitan una
 * mesa del mismo tamaño o mayor. Contarlos todos le diría a la pareja que hay
 * doce delante cuando en realidad hay tres.
 */
async function medirCola(
  tx: Transaccion,
  organizacionId: string,
  sucursalId: string,
  personas: number,
): Promise<{ readonly datos: Parameters<typeof estimarEspera>[0] }> {
  const [delante, mesas, rotacion] = await Promise.all([
    tx
      .selectFrom('lista_espera')
      .select(['id'])
      .where('organizacion_id', '=', organizacionId)
      .where('sucursal_id', '=', sucursalId)
      .where('estado', 'in', [...EN_COLA])
      .where('personas', '>=', personas)
      .execute(),
    tx
      .selectFrom('mesas')
      .select(['id', 'estado'])
      .where('organizacion_id', '=', organizacionId)
      .where('sucursal_id', '=', sucursalId)
      .where('activa', '=', true)
      .where('capacidad', '>=', personas)
      .execute(),
    tx
      .selectFrom('ocupacion_mesas')
      .select(['minutos_ocupada as minutos'])
      .where('organizacion_id', '=', organizacionId)
      .where('sucursal_id', '=', sucursalId)
      .where('fin', 'is not', null)
      .execute(),
  ]);

  const minutos = rotacion
    .map((r) => r.minutos)
    .filter((m): m is number => m !== null)
    .sort((a, b) => a - b);

  return {
    datos: {
      medianaMinutos: minutos.length === 0 ? 0 : (minutos[Math.floor(minutos.length / 2)] ?? 0),
      gruposDelante: delante.length,
      mesasCompatibles: mesas.length,
      mesasLibres: mesas.filter((m) => m.estado === 'libre').length,
    },
  };
}
