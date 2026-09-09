#!/usr/bin/env node
/**
 * El día completo del cajero (F1.1-C-10 y C-11), contra un servidor REAL.
 *
 *   node scripts/humo-turno.mjs <codigo-enrolamiento> [--base URL] [--pin 4821]
 *
 * Abre caja, cobra tres ventas con métodos distintos —una de ellas MIXTA—,
 * registra un gasto y cierra cuadrando. La comprobación que vale es la última:
 * el efectivo esperado tiene que ser `fondo + ventas en efectivo − gastos`, ni
 * un centavo más. Si la tarjeta se contara como billetes, aquí se ve.
 */
import { exigir, llamar as llamarBase, paso } from './lib/cliente-humo.mjs';

function bandera(nombre, porOmision) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? porOmision : process.argv[i + 1];
}

const codigo = process.argv[2];
const BASE = bandera('base', 'http://localhost:3000');
const PIN = bandera('pin', '4821');

if (codigo === undefined || !/^\d{6}$/.test(codigo)) {
  console.error('Uso: node scripts/humo-turno.mjs <codigo-6-digitos> [--base URL] [--pin NNNN]');
  process.exit(1);
}

const llamar = (ruta, cuerpo, opciones) => llamarBase(BASE, ruta, cuerpo, opciones);
const FONDO = 50_000;
const GASTO = 7_500;

paso(1, 'Entrar y dejar la caja cerrada');
exigir('enrolar', await llamar('/api/auth/enrolar', { codigo }));
const { empleados } = exigir('empleados', await llamar('/api/auth/empleados'));
exigir('entrar', await llamar('/api/auth/entrar', { empleoId: empleados[0].empleoId, pin: PIN }));

// Un turno anterior abierto falsearía el arqueo. Se cierra contando lo esperado.
const previo = exigir('estado de caja', await llamar('/api/caja/estado', {}));
if (previo.abierta) {
  const cierreCiego = await llamar('/api/caja/cerrar', { efectivoContadoCentavos: 0 });
  console.log(
    `  turno anterior cerrado (diferencia ${String(cierreCiego.datos?.datos?.diferenciaCentavos ?? '?')})`,
  );
}

paso(2, 'Abrir caja');
exigir('POST /api/caja/abrir', await llamar('/api/caja/abrir', { fondoInicialCentavos: FONDO }));

paso(3, 'Tres ventas: efectivo, tarjeta y MIXTA');
const { productos } = exigir('buscar', await llamar('/api/venta/buscar', { limite: 5 }));

/** Cobra una orden con los pagos que se le den y devuelve su total. */
async function vender(pagosDe, etiqueta) {
  const { ordenId } = exigir(
    `crear orden (${etiqueta})`,
    await llamar('/api/venta/crear-orden', {}),
  );
  exigir(
    `agregar línea (${etiqueta})`,
    await llamar('/api/venta/agregar-linea', {
      ordenId,
      productoId: productos[0].id,
      cantidad: '1',
    }),
  );
  const estado = exigir(`cotizar (${etiqueta})`, await llamar('/api/venta/estado', { ordenId }));
  const total = Number(estado.cotizacion.totalCentavos);
  exigir(
    `cobrar (${etiqueta})`,
    await llamar('/api/venta/cobrar', {
      ordenId,
      pagos: pagosDe(total),
      totalEsperadoCentavos: total,
    }),
  );
  return total;
}

const enEfectivo = await vender(
  (t) => [{ metodo: 'efectivo', montoCentavos: t, recibidoCentavos: t }],
  'efectivo',
);
await vender((t) => [{ metodo: 'tarjeta', montoCentavos: t }], 'tarjeta');

// La mixta: la mitad con tarjeta, el resto en efectivo. Es P1-11.
const mixtaEfectivo = await vender((t) => {
  const conTarjeta = Math.floor(t / 2);
  return [
    { metodo: 'tarjeta', montoCentavos: conTarjeta },
    { metodo: 'efectivo', montoCentavos: t - conTarjeta, recibidoCentavos: t - conTarjeta },
  ];
}, 'mixta').then((t) => t - Math.floor(t / 2));

paso(4, 'Registrar un gasto del cajón');
exigir(
  'POST /api/caja/movimiento',
  await llamar('/api/caja/movimiento', {
    tipo: 'gasto',
    montoCentavos: GASTO,
    motivo: 'Garrafón de agua para el mostrador',
  }),
);

paso(5, 'Cerrar cuadrando');
const esperado = FONDO + enEfectivo + mixtaEfectivo - GASTO;
console.log(
  `  fondo ${String(FONDO)} + efectivo ${String(enEfectivo)} + mixta-efectivo ${String(mixtaEfectivo)} − gasto ${String(GASTO)} = ${String(esperado)}`,
);

const corte = exigir(
  'POST /api/caja/cerrar',
  await llamar('/api/caja/cerrar', {
    efectivoContadoCentavos: esperado,
    notas: 'Humo automático del turno',
  }),
);

console.log(
  `  esperado del servidor ${corte.efectivoEsperadoCentavos} · contado ${corte.efectivoContadoCentavos} · diferencia ${corte.diferenciaCentavos}`,
);

if (corte.diferenciaCentavos !== '0') {
  console.error(
    `✗ la caja NO cuadra. El servidor esperaba ${corte.efectivoEsperadoCentavos} y la cuenta a mano da ${String(esperado)}.\n` +
      '  Si la diferencia es el importe de la venta con tarjeta, el arqueo está contando como billetes lo que se cobró con plástico.',
  );
  process.exit(1);
}
if (corte.numeroVentas !== 3) {
  console.error(
    `✗ el corte cuenta ${String(corte.numeroVentas)} ventas y fueron 3. ` +
      'Un pago mixto son dos filas en `pagos` y no debe contar como dos ventas.',
  );
  process.exit(1);
}

console.log(`✓ cuadra al centavo y cuenta 3 ventas (la mixta cuenta una vez)`);
console.log(`\n✓ TURNO COMPLETO EN VERDE contra ${BASE}\n`);
