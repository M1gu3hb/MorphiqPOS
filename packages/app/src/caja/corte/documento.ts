import 'server-only';

import {
  ErrorDominio,
  PAQUETES_MOSTRADOR,
  plantillaDeOrganizacion,
  type Rol,
} from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { diasHastaLaVisita, sugerirPedido } from '@morphiqpos/domain/inventario';
import { sql } from 'kysely';
import { z } from 'zod';

import { definirComando } from '../../definicion.ts';
import * as consultas from './consultas.ts';
import * as mostrador from './extras-mostrador.ts';
import * as salon from './extras-salon.ts';
import * as extras from './extras.ts';

/**
 * LA HOJA DEL CORTE (F-234, C.6 de la 2.4): todo lo que su PDF enseña, en una lectura.
 *
 * Las pantallas nuevas sólo exportaban CSV y el restaurante decía «descargar el PDF del
 * cierre» sin que existiera generador. Cada `02-DINERO-Y-CAJA.md` §9.3 describe su corte
 * sección por sección; éste es el dato de todas, y la pantalla de cada giro arma SU
 * documento con él (`apps/web/src/corte/`).
 *
 * ── Quién ve costos ──────────────────────────────────────────────────────
 * Dirección siempre; el cajero sólo si el negocio encendió `mostrar_costos_a_caja`. El
 * resto recibe los costos en nulo y el documento sale sin utilidad ni insumos, que es el
 * `sinCostos` del corte de Miguel. Cocina no entra: no es un rol de caja.
 *
 * ── Qué no hace ──────────────────────────────────────────────────────────
 * No calcula el esperado: lo lee de la sesión, que lo guardó al cerrar (D-16). Un corte
 * abierto lo trae en nulo y el documento lo dice.
 */

const ROLES_DE_CAJA = ['cajero', 'gerente', 'administrador', 'dueno'] as const;
const VEN_COSTOS: readonly Rol[] = ['dueno', 'administrador', 'gerente'];
const SELLOS_POR_PREMIO_POR_OMISION = 5;

export const entradaHojaDelCorte = z.object({ sesionCajaId: z.uuid() });

export interface NegocioDelCorte {
  readonly nombre: string;
  readonly direccion: string | null;
  readonly telefono: string | null;
  readonly correo: string | null;
  readonly rfc: string | null;
  readonly logoUrl: string | null;
  readonly marca: string;
  readonly pie: string | null;
  readonly descargarAlCerrar: boolean;
}

export type ExtrasDelCorte =
  | {
      readonly plantilla: 'restaurante';
      readonly propinasPorMesero: readonly extras.PropinaDeMesero[];
    }
  | {
      readonly plantilla: 'cafeteria';
      readonly canales: readonly extras.VentaPorCanal[];
      readonly consumoPorCanal: readonly extras.ConsumoDelCanal[];
      readonly modificadores: readonly extras.ModificadorUsado[];
      readonly reparto: readonly extras.ParteDelReparto[];
      readonly mermaDeBarra: readonly extras.MermaDeBarra[];
      readonly consumoDeLaCasa: readonly extras.ConsumoDeLaCasa[];
      readonly sellos: extras.SellosDelTurno & { readonly sellosPorPremio: number };
      readonly noRecogidos: readonly (Omit<extras.NoRecogido, 'costoCentavos'> & {
        readonly costoCentavos: string | null;
      })[];
    }
  | {
      readonly plantilla: 'tienda' | 'ferreteria';
      readonly cartera: mostrador.Cartera;
      readonly saldosMasViejos: readonly mostrador.SaldoViejo[];
      readonly cobrosDeCartera: readonly mostrador.CobroDeCartera[];
      readonly terceros: readonly mostrador.OperacionDeTerceros[];
      readonly salioSinCobrarse: readonly mostrador.SalioSinCobrarse[];
      readonly materialCortado: readonly mostrador.MaterialCortado[];
      readonly turnos: readonly mostrador.TurnoDelDia[];
      readonly compras: readonly mostrador.CompraDelDia[];
      readonly cuentasPorPagar: readonly mostrador.CuentaPorPagar[];
      readonly deudaConProveedoresCentavos: string;
      readonly garantias: readonly mostrador.GarantiaAbierta[];
      readonly autorizaciones: readonly mostrador.Autorizacion[];
      readonly faltantes: readonly (Omit<mostrador.Faltante, 'costoCentavos'> & {
        readonly costoCentavos: string | null;
      })[];
      readonly servicios: readonly mostrador.ServicioDeMostrador[];
    }
  | {
      readonly plantilla: 'estetica';
      readonly profesionales: readonly salon.LiquidacionDeProfesional[];
      readonly agenda: readonly salon.CitasDelDia[];
      readonly manana: readonly salon.CitaDeManana[];
      readonly anticipos: salon.AnticiposDelDia;
      readonly cabina: readonly (Omit<salon.ProductoDeCabina, 'costoCentavos'> & {
        readonly costoCentavos: string | null;
      })[];
      readonly serviciosSinFormula: number;
      readonly cortesias: readonly salon.CortesiaORehecho[];
      readonly contrapartidas: readonly salon.ContrapartidaDeComision[];
      readonly paquetes: salon.PaquetesDelDia;
    };

export interface HojaDelCorte {
  readonly verCostos: boolean;
  readonly negocio: NegocioDelCorte;
  readonly sesion: consultas.SesionDelCorte;
  readonly movimientos: readonly consultas.MovimientoAgrupado[];
  readonly conteo: readonly consultas.PiezasContadas[];
  readonly metodos: readonly consultas.VentasPorMetodo[];
  readonly resumen: Omit<consultas.ResumenDeVentas, 'costoCentavos'> & {
    readonly costoCentavos: string | null;
  };
  readonly ventas: readonly consultas.VentaDelDetalle[];
  readonly productos: readonly (Omit<consultas.ProductoVendido, 'costoCentavos'> & {
    readonly costoCentavos: string | null;
  })[];
  readonly porPersona: readonly consultas.VentasDePersona[];
  readonly gastos: readonly consultas.GastoDelCorte[];
  readonly cancelaciones: readonly consultas.Cancelacion[];
  readonly descuentosPorUsuario: readonly consultas.DescuentoDeUsuario[];
  readonly alertas: readonly AlertaDelCorte[];
  /** Consumo teórico de insumo. `null` para quien no ve costos. */
  readonly insumos: readonly consultas.InsumoConsumido[] | null;
  readonly salidasSinVenta: readonly (Omit<consultas.SalidaSinVenta, 'costoCentavos'> & {
    readonly costoCentavos: string | null;
  })[];
  readonly extras: ExtrasDelCorte;
}

export const hojaDelCorte = definirComando<Transaccion, typeof entradaHojaDelCorte, HojaDelCorte>({
  nombre: 'caja.hoja_del_corte',
  entidad: 'sesion_caja',
  escribe: false,
  roles: [...ROLES_DE_CAJA],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaHojaDelCorte,
  async ejecutar(ctx, entrada) {
    const { organizacionId, rol } = ctx.ambito;
    const { tx } = ctx;

    const sesion = await ctx.paso('leer_sesion', () =>
      consultas.leerSesion(tx, organizacionId, entrada.sesionCajaId),
    );
    // Una sesión de otro negocio se ve igual que una que no existe.
    if (sesion === null) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Ese corte no existe en este negocio.');
    }
    const crudo = await ctx.paso('leer_negocio', () => consultas.leerNegocio(tx, organizacionId));
    const valores = objetoDe(crudo.valores);
    const plantilla = plantillaDeOrganizacion(crudo.giro, crudo.paquete);
    const verCostos =
      VEN_COSTOS.includes(rol) || (rol === 'cajero' && valores['mostrar_costos_a_caja'] === true);

    const id = sesion.id;
    const [movimientos, conteo, metodos, resumen, ventas, productos, porPersona, gastos] =
      await ctx.paso('leer_tronco', () =>
        Promise.all([
          consultas.movimientosPorTipo(tx, organizacionId, id),
          consultas.conteoDelCierre(tx, organizacionId, id),
          consultas.ventasPorMetodo(tx, organizacionId, id),
          consultas.resumenDeVentas(tx, organizacionId, id),
          consultas.detalleDeVentas(tx, organizacionId, id),
          consultas.productosVendidos(tx, organizacionId, id),
          consultas.ventasPorPersona(tx, organizacionId, id),
          consultas.gastosDelCorte(tx, organizacionId, id),
        ]),
      );
    const [cancelaciones, descuentosPorUsuario, alertas, insumos, salidas] = await ctx.paso(
      'leer_control',
      () =>
        Promise.all([
          consultas.cancelacionesDelCorte(tx, organizacionId, sesion),
          consultas.descuentosPorUsuario(tx, organizacionId, id),
          consultas.alertasDeInventario(tx, organizacionId, sesion.cerradaEn ?? ctx.ahora),
          consultas.insumosConsumidos(tx, organizacionId, id),
          consultas.salidasSinVenta(tx, organizacionId, sesion),
        ]),
    );
    const delGiro = await ctx.paso('leer_extras', () =>
      extrasDe(
        tx,
        organizacionId,
        plantilla,
        sesion,
        valores,
        verCostos,
        sesion.cerradaEn ?? ctx.ahora,
      ),
    );

    return {
      verCostos,
      negocio: negocioDe(crudo.nombre, valores, sesion),
      sesion,
      movimientos,
      conteo,
      metodos,
      resumen: { ...resumen, costoCentavos: verCostos ? resumen.costoCentavos : null },
      ventas,
      productos: productos.map((p) => ({
        ...p,
        costoCentavos: verCostos ? p.costoCentavos : null,
      })),
      porPersona,
      gastos,
      cancelaciones,
      descuentosPorUsuario,
      alertas: alertas.map((a) =>
        alertaDelCorte(
          verCostos ? a : { ...a, costoUnitarioCentavos: null },
          sesion.cerradaEn ?? ctx.ahora,
        ),
      ),
      insumos: verCostos ? insumos : null,
      salidasSinVenta: salidas.map((s) => ({
        ...s,
        costoCentavos: verCostos ? s.costoCentavos : null,
      })),
      extras: delGiro,
    };
  },
});

/** Días de colchón sobre la visita del proveedor: el mismo del sugerido de compras. */
const DIAS_DE_COLCHON = 1;

export interface AlertaDelCorte extends consultas.Alerta {
  readonly diasHastaLaVisita: number | null;
  /** Presentaciones de compra que sugiere el mismo cálculo de «Entradas». */
  readonly presentacionesSugeridas: number;
  /** Cuántos días alcanza lo que queda al ritmo de un día como hoy. `null` sin consumo. */
  readonly diasQueAlcanza: number | null;
}

/**
 * Qué pedir y cuánto alcanza, con las MISMAS funciones del sugerido de compras
 * (`abarrotes/sugerencia.ts`): dos pantallas que dijeran cifras distintas para el mismo
 * insumo serían dos verdades.
 */
export function alertaDelCorte(alerta: consultas.Alerta, ahora: Date): AlertaDelCorte {
  const visita = diasHastaLaVisita(alerta.diaVisita ?? [], ahora);
  const factor =
    alerta.factorCompra !== null && Number(alerta.factorCompra) > 0 ? alerta.factorCompra : '1';
  const sugerencia = sugerirPedido({
    existenciaBase: alerta.existencia,
    stockMinimo: alerta.minimo,
    ventaDelPeriodoBase: alerta.ventaDeCatorceDias,
    diasDelPeriodo: 14,
    diasDeCobertura: (visita ?? 7) + DIAS_DE_COLCHON,
    factorCompra: factor,
  });
  const diario = Number(alerta.consumoDelMismoDia);
  return {
    ...alerta,
    diasHastaLaVisita: visita,
    presentacionesSugeridas: sugerencia.presentacionesSugeridas,
    diasQueAlcanza: diario > 0 ? Math.floor(Number(alerta.existencia) / diario) : null,
  };
}

async function extrasDe(
  tx: Transaccion,
  organizacionId: string,
  plantilla: string,
  sesion: consultas.SesionDelCorte,
  valores: Readonly<Record<string, unknown>>,
  verCostos: boolean,
  ahora: Date,
): Promise<ExtrasDelCorte> {
  const id = sesion.id;
  const costo = (centavos: string): string | null => (verCostos ? centavos : null);
  if (plantilla === 'restaurante') {
    return {
      plantilla,
      propinasPorMesero: await extras.propinasPorMesero(tx, organizacionId, id),
    };
  }
  if (plantilla === 'cafeteria') {
    const [canales, consumoPorCanal, modificadores, reparto, mermaDeBarra, consumoDeLaCasa] =
      await Promise.all([
        extras.ventasPorCanal(tx, organizacionId, id),
        extras.consumoPorCanal(tx, organizacionId, id),
        extras.modificadoresUsados(tx, organizacionId, id),
        extras.repartoDelBote(tx, organizacionId, id),
        extras.mermaDeBarra(tx, organizacionId, id),
        extras.consumoDeLaCasa(tx, organizacionId, sesion),
      ]);
    const [sellos, noRecogidos] = await Promise.all([
      extras.sellosDelTurno(tx, organizacionId, sesion),
      extras.noRecogidos(tx, organizacionId, sesion),
    ]);
    const porPremio = valores['sellos_por_premio'];
    return {
      plantilla,
      canales,
      consumoPorCanal,
      modificadores,
      reparto,
      mermaDeBarra,
      consumoDeLaCasa,
      sellos: {
        ...sellos,
        sellosPorPremio:
          typeof porPremio === 'number' && porPremio > 0
            ? porPremio
            : SELLOS_POR_PREMIO_POR_OMISION,
      },
      noRecogidos: noRecogidos.map((n) => ({ ...n, costoCentavos: costo(n.costoCentavos) })),
    };
  }
  if (plantilla === 'estetica') {
    const dia = await limitesDelDia(tx, organizacionId, sesion.abiertaEn);
    const [profesionales, agenda, manana, anticipos, cabina] = await Promise.all([
      salon.liquidacionPorProfesional(tx, organizacionId, sesion),
      salon.agendaDelDia(tx, organizacionId, sesion.sucursalId, dia.hoy, dia.manana),
      salon.citasDeManana(tx, organizacionId, sesion.sucursalId, dia.manana, dia.pasado),
      salon.anticiposDelDia(tx, organizacionId, id, sesion),
      salon.productoDeCabina(tx, organizacionId, sesion),
    ]);
    const [serviciosSinFormula, cortesias, contrapartidas, paquetes] = await Promise.all([
      salon.serviciosSinFormula(tx, organizacionId, sesion),
      salon.cortesiasYRehechos(tx, organizacionId, sesion),
      salon.contrapartidasDeComision(tx, organizacionId, sesion),
      salon.paquetesDelDia(tx, organizacionId, sesion),
    ]);
    return {
      plantilla,
      profesionales,
      agenda,
      manana,
      anticipos,
      cabina: cabina.map((c) => ({ ...c, costoCentavos: costo(c.costoCentavos) })),
      serviciosSinFormula,
      cortesias,
      contrapartidas,
      paquetes,
    };
  }
  const [cartera, saldosMasViejos, cobrosDeCartera, terceros, salioSinCobrarse, materialCortado] =
    await Promise.all([
      mostrador.carteraDelDia(tx, organizacionId, sesion),
      mostrador.saldosMasViejos(tx, organizacionId, sesion),
      mostrador.cobrosDeCartera(tx, organizacionId, id),
      mostrador.operacionesDeTerceros(tx, organizacionId, id),
      mostrador.salioSinCobrarse(tx, organizacionId, sesion),
      mostrador.materialCortado(tx, organizacionId, sesion),
    ]);
  const [turnos, compras, cuentasPorPagar, deuda, garantias, autorizaciones, faltantes, servicios] =
    await Promise.all([
      mostrador.turnosDelDia(tx, organizacionId, id),
      mostrador.comprasDelDia(tx, organizacionId, sesion),
      mostrador.cuentasPorPagar(tx, organizacionId, ahora),
      mostrador.deudaConProveedores(tx, organizacionId),
      mostrador.garantiasAbiertas(tx, organizacionId, ahora),
      mostrador.autorizacionesDelDia(tx, organizacionId, sesion),
      mostrador.faltantesDelConteo(tx, organizacionId, sesion),
      mostrador.serviciosDeMostrador(tx, organizacionId, id),
    ]);
  return {
    plantilla: plantilla === 'ferreteria' ? 'ferreteria' : 'tienda',
    cartera,
    saldosMasViejos,
    cobrosDeCartera,
    terceros,
    salioSinCobrarse,
    materialCortado,
    turnos,
    compras,
    cuentasPorPagar,
    deudaConProveedoresCentavos: deuda,
    garantias,
    autorizaciones,
    faltantes: faltantes.map((f) => ({ ...f, costoCentavos: costo(f.costoCentavos) })),
    servicios,
  };
}

/** El día del negocio en su zona horaria: hoy, mañana y pasado, a medianoche local. */
async function limitesDelDia(
  tx: Transaccion,
  organizacionId: string,
  instante: Date,
): Promise<{ readonly hoy: Date; readonly manana: Date; readonly pasado: Date }> {
  const { rows } = await sql<{ hoy: Date; manana: Date; pasado: Date }>`
    select (date_trunc('day', ${instante}::timestamptz at time zone o.zona_horaria)
              at time zone o.zona_horaria)                                    as "hoy",
           ((date_trunc('day', ${instante}::timestamptz at time zone o.zona_horaria) + interval '1 day')
              at time zone o.zona_horaria)                                    as "manana",
           ((date_trunc('day', ${instante}::timestamptz at time zone o.zona_horaria) + interval '2 day')
              at time zone o.zona_horaria)                                    as "pasado"
      from organizaciones o
     where o.id = ${organizacionId}
  `.execute(tx);
  const fila = rows[0];
  if (fila === undefined) throw new Error('La organización del corte no existe.');
  return fila;
}

function objetoDe(valor: unknown): Readonly<Record<string, unknown>> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function textoDe(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null;
}

/**
 * Los datos del encabezado. El nombre es el de `organizaciones`, como en toda la
 * facturación; dirección y teléfono caen a los de la sucursal si la configuración no los
 * trae, porque un corte sin de quién es no se puede mandar al contador.
 */
export function negocioDe(
  nombre: string,
  valores: Readonly<Record<string, unknown>>,
  sesion: Pick<consultas.SesionDelCorte, 'sucursalDireccion' | 'sucursalTelefono'>,
): NegocioDelCorte {
  return {
    nombre,
    direccion: textoDe(valores['direccion']) ?? sesion.sucursalDireccion,
    telefono: textoDe(valores['telefono']) ?? sesion.sucursalTelefono,
    correo: textoDe(valores['correo']),
    rfc: textoDe(valores['rfc']),
    logoUrl: textoDe(valores['logo_pdf_url']) ?? textoDe(valores['logo_url']),
    marca: textoDe(valores['platform_brand']) ?? 'MorphiqPOS',
    pie: textoDe(valores['pdf_footer']),
    descargarAlCerrar: valores['descargar_pdf_corte_auto'] !== false,
  };
}
