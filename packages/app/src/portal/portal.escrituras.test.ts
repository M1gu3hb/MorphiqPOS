import { ErrorDominio } from '@morphiqpos/contracts';
import { centavos } from '@morphiqpos/domain/dinero';
import type { TotalesOrden } from '@morphiqpos/domain/venta';
import { describe, expect, it } from 'vitest';

import { violaIndice } from './errores-sql.ts';
import {
  confirmarOrdenDelPortal,
  guardarValoracionDelPortal,
  marcarCuentaSolicitadaDesdeQR,
  moverMesaDelPortal,
} from './escrituras.ts';
import {
  CERO_FILAS,
  filtroDe,
  MESA_FALSA,
  ORG_FALSA,
  transaccionFalsa,
  valoresDe,
  type FiltroFalso,
} from './pruebas.ts';

/**
 * CÓMO ESCRIBE EL PORTAL — las guardas del veredicto, afirmadas una a una.
 *
 * Estas pruebas existen porque las 28 anteriores no habrían cazado nada de
 * esto: medían proyección y validación, y ninguna miraba la consulta que se
 * manda. Una escritura sin guarda y otra con guarda se ven idénticas desde
 * fuera mientras no haya dos teléfonos a la vez.
 *
 * Aquí se afirman las dos mitades por separado, porque quitar cualquiera de las
 * dos deja el defecto vivo:
 *
 *   · que el estado esperado VIAJE en el `where` — si no viaja, el `update`
 *     entra sobre la orden que el cajero acaba de cobrar;
 *   · que cero filas SE NOTE — si no se nota, la guarda no sirve: Postgres
 *     devuelve cero, no lanza, y el comando sigue y responde «listo».
 */

const ORDEN = 'orden-1';
const AHORA = new Date('2026-09-09T20:00:00Z');

const TOTALES: TotalesOrden = {
  subtotalCentavos: centavos(103_000n),
  descuentoCentavos: centavos(0n),
  impuestosCentavos: centavos(14_207n),
  totalCentavos: centavos(103_000n),
  costoTotalCentavos: centavos(40_000n),
  utilidadCentavos: centavos(63_000n),
  margenBp: 6116,
};

const DESTINO = { organizacionId: ORG_FALSA, ordenId: ORDEN, version: 7, ahora: AHORA };

/** Los estados de un filtro `in`/`not in`, ya comprobados como lista de texto. */
function estadosDe(filtro: FiltroFalso): readonly string[] {
  if (!Array.isArray(filtro.valor)) {
    throw new Error(`El filtro por "${filtro.columna}" no lleva una lista de estados.`);
  }
  return filtro.valor.map((valor) => String(valor));
}

async function fallo(promesa: Promise<unknown>): Promise<ErrorDominio> {
  const error = await promesa.then(
    () => null,
    (razon: unknown) => razon,
  );
  expect(error).toBeInstanceOf(ErrorDominio);
  return error as ErrorDominio;
}

describe('hallazgo 1 · el pedido no puede confirmarse sobre una cuenta cerrada', () => {
  it('el estado y la versión leídos viajan en el `where`', async () => {
    const base = transaccionFalsa();
    await confirmarOrdenDelPortal(base.tx, { ...DESTINO, totales: TOTALES });

    const escritura = base.escrituraEn('ordenes');
    const estado = filtroDe(escritura, 'estado');
    expect(estado.operador).toBe('in');
    expect(estadosDe(estado)).toContain('confirmada');
    // Las tres que reabrirían una cuenta que ya no se toca.
    expect(estadosDe(estado)).not.toContain('cuenta_solicitada');
    expect(estadosDe(estado)).not.toContain('pagada');
    expect(estadosDe(estado)).not.toContain('cancelada');

    const version = filtroDe(escritura, 'version');
    expect(version.operador).toBe('=');
    expect(version.valor).toBe(7);
    expect(valoresDe(escritura)['version']).toBe(8);
  });

  it('cero filas es ORDEN_NO_EDITABLE, no un éxito callado', async () => {
    const base = transaccionFalsa({ ordenes: [CERO_FILAS] });

    const error = await fallo(confirmarOrdenDelPortal(base.tx, { ...DESTINO, totales: TOTALES }));
    expect(error.codigo).toBe('ORDEN_NO_EDITABLE');
    expect(error.message).toMatch(/cambió/i);
  });

  it('congela el total SIN propina (regla 1 de F1-01 §3)', async () => {
    const base = transaccionFalsa();
    await confirmarOrdenDelPortal(base.tx, { ...DESTINO, totales: TOTALES });

    const escrito = valoresDe(base.escrituraEn('ordenes'));
    expect(escrito['total_centavos']).toBe(103_000n);
    // Ni una columna de propina en el `set`: la propina vive en `pagos`, y por
    // eso no cabe aquí.
    expect(Object.keys(escrito).filter((clave) => clave.includes('propina'))).toEqual([]);
  });
});

describe('hallazgo 2 · pedir la cuenta no puede reabrir una venta cobrada', () => {
  const datos = {
    ...DESTINO,
    mesaNumero: 5,
    codigoPrevio: null,
    totales: TOTALES,
    propinaPuntosBase: 1500,
    propinaTipo: 'porcentaje',
  };

  it('excluye las cerradas en el `where` y exige la versión', async () => {
    const base = transaccionFalsa();
    await marcarCuentaSolicitadaDesdeQR(base.tx, datos);

    const escritura = base.escrituraEn('ordenes');
    const estado = filtroDe(escritura, 'estado');
    expect(estado.operador).toBe('not in');
    expect(estadosDe(estado)).toEqual(['pagada', 'cancelada']);
    expect(filtroDe(escritura, 'version').valor).toBe(7);
  });

  it('cero filas es ORDEN_NO_EDITABLE', async () => {
    const base = transaccionFalsa({ ordenes: [CERO_FILAS] });

    const error = await fallo(marcarCuentaSolicitadaDesdeQR(base.tx, datos));
    expect(error.codigo).toBe('ORDEN_NO_EDITABLE');
  });

  it('la mesa sólo se mueve si sigue habiendo alguien sentado', async () => {
    const base = transaccionFalsa();
    await moverMesaDelPortal(base.tx, {
      organizacionId: ORG_FALSA,
      mesaId: MESA_FALSA,
      estado: 'cuenta_solicitada',
      ahora: AHORA,
    });

    const estado = filtroDe(base.escrituraEn('mesas'), 'estado');
    expect(estado.operador).toBe('not in');
    expect(estadosDe(estado)).toEqual(['libre', 'limpieza', 'pagada', 'cancelada']);
  });

  it('una mesa que se liberó a media petición no queda ocupada sin nadie', async () => {
    const base = transaccionFalsa({ mesas: [CERO_FILAS] });

    const error = await fallo(
      moverMesaDelPortal(base.tx, {
        organizacionId: ORG_FALSA,
        mesaId: MESA_FALSA,
        estado: 'pedido_enviado',
        ahora: AHORA,
      }),
    );
    expect(error.codigo).toBe('TRANSICION_INVALIDA');
  });
});

describe('hallazgo 4 · la cuenta pedida por QR también lleva su código de caja', () => {
  const datos = {
    ...DESTINO,
    mesaNumero: 5,
    codigoPrevio: null,
    totales: TOTALES,
    propinaPuntosBase: 1500,
    propinaTipo: 'porcentaje',
  };

  it('genera `M05-XXXX` cuando la cuenta se pide por primera vez', async () => {
    const base = transaccionFalsa();
    const codigo = await marcarCuentaSolicitadaDesdeQR(base.tx, datos);

    expect(codigo).toMatch(/^M05-\d{4}$/);
    expect(valoresDe(base.escrituraEn('ordenes'))['codigo_caja']).toBe(codigo);
  });

  it('conserva el que ya se imprimió: el comensal lo tiene en la mano', async () => {
    const base = transaccionFalsa();
    const codigo = await marcarCuentaSolicitadaDesdeQR(base.tx, {
      ...datos,
      codigoPrevio: 'M05-4821',
    });

    expect(codigo).toBe('M05-4821');
  });
});

describe('hallazgo 5 · dos teléfonos valorando a la vez no se pisan', () => {
  const datos = {
    organizacionId: ORG_FALSA,
    ordenId: ORDEN,
    score: 5,
    emoji: '🤩',
    comentario: null,
    ahora: AHORA,
  };

  it('reexige `satisfaccion_score is null` en la base, no en un `if`', async () => {
    const base = transaccionFalsa();
    expect(await guardarValoracionDelPortal(base.tx, datos)).toBe(true);

    const guarda = filtroDe(base.escrituraEn('ordenes'), 'satisfaccion_score');
    expect(guarda.operador).toBe('is');
    expect(guarda.valor).toBeNull();
  });

  it('cero filas no es un error, pero SÍ se entera quien llama', async () => {
    const base = transaccionFalsa({ ordenes: [CERO_FILAS] });
    expect(await guardarValoracionDelPortal(base.tx, datos)).toBe(false);
  });
});

describe('hallazgo 8 · un 23505 sin nombre de índice no se traduce a ciegas', () => {
  it('sólo el índice esperado da el mensaje del índice esperado', () => {
    expect(
      violaIndice(
        { code: '23505', constraint: 'solicitudes_qr_una_pendiente' },
        'solicitudes_qr_una_pendiente',
      ),
    ).toBe(true);
    expect(
      violaIndice(
        { code: '23505', constraint: 'ordenes_una_activa_por_mesa' },
        'solicitudes_qr_una_pendiente',
      ),
    ).toBe(false);
  });

  it('sin `constraint` NO se da por bueno: sería tapar un fallo real', () => {
    // Antes devolvía `true` y el comensal leía «Ya avisamos al mesero» sobre un
    // duplicado que nadie sabe cuál era, con la transacción ya abortada.
    expect(violaIndice({ code: '23505' }, 'solicitudes_qr_una_pendiente')).toBe(false);
    expect(violaIndice({ code: '23505', constraint: null }, 'ordenes_una_activa_por_mesa')).toBe(
      false,
    );
  });

  it('un error que no es de unicidad nunca lo es', () => {
    expect(
      violaIndice(
        { code: '23503', constraint: 'solicitudes_qr_una_pendiente' },
        'solicitudes_qr_una_pendiente',
      ),
    ).toBe(false);
    expect(violaIndice(new Error('boom'), 'solicitudes_qr_una_pendiente')).toBe(false);
  });
});
