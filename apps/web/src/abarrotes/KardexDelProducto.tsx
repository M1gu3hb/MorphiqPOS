'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Aviso,
  Cifra,
  EsqueletoDeLista,
  Superficie,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { History } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';

import { useMotivosDeMerma } from './conteo/MotivoDeLaDiferencia.tsx';

/**
 * EL KARDEX DEL PRODUCTO · por qué cambió su existencia (F-103, C.10 de la 2.4).
 *
 * El comando `inventario.kardex` existía y ninguna pantalla lo abría: Existencias decía que
 * el kardex «vive en la ficha del producto» y la ficha decía que era «su propia pantalla».
 * Vive aquí, en la ficha, debajo de las presentaciones: cada entrada, venta, ajuste y merma
 * con su motivo en palabras y el saldo corrido. Es lo que contesta «¿de dónde salió el
 * esperado del conteo?» — el conteo lo abre desde cada diferencia (`#kardex`).
 */

interface Renglon {
  readonly movimientoId: string;
  readonly cuando: string;
  readonly tipo: string;
  readonly motivo: string | null;
  readonly cantidad: string;
  readonly saldo: string;
}

interface Kardex {
  readonly renglones: readonly Renglon[];
  readonly hayMas: boolean;
}

/** Lo que cada tipo de movimiento es, dicho como lo diría el tendero. */
const TIPOS: Readonly<Record<string, string>> = {
  entrada_compra: 'Entrada de compra',
  salida_venta: 'Venta',
  ajuste: 'Ajuste de conteo',
  merma: 'Merma',
  devolucion: 'Devolución de cliente',
  cancelacion: 'Venta cancelada',
  traspaso_entrada: 'Llegó de otro almacén',
  traspaso_salida: 'Salió a otro almacén',
  inventario_inicial: 'Inventario inicial',
  produccion: 'Producción',
  salida_consumo_interno: 'Consumo interno',
  devolucion_proveedor: 'Canje o devolución al proveedor',
  consumo_servicio: 'Gastado en un servicio',
  garantia_proveedor: 'A garantía con el proveedor',
  garantia_retorno: 'Volvió de garantía',
  renta_salida: 'Salió en renta',
  renta_retorno: 'Volvió de renta',
};

const CUANDO = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** Cuántos movimientos se ven de una vez: el comando tiene su tope, y ésta es la ficha. */
const LIMITE = 60;

export function KardexDelProducto({ insumoId }: { readonly insumoId: string | null }) {
  const [kardex, setKardex] = useState<Kardex | null>(null);
  const [fallo, setFallo] = useState<{
    readonly sinPermiso: boolean;
    readonly mensaje: string;
  } | null>(null);
  const [intento, setIntento] = useState(0);
  const motivos = useMotivosDeMerma(insumoId !== null);
  const etiquetaDe = useMemo(() => new Map(motivos.map((m) => [m.clave, m.etiqueta])), [motivos]);

  useEffect(() => {
    if (insumoId === null) return;
    let vigente = true;
    // Los ÚLTIMOS de los últimos noventa días, que es lo que se viene a revisar.
    const desde = new Date(Date.now() - 90 * 86_400_000).toISOString();
    invocarComando<Kardex>('/api/inventario/kardex', {
      insumoId,
      desde,
      limite: LIMITE,
      recientes: true,
    })
      .then((leido) => {
        if (vigente) setKardex(leido);
      })
      .catch((error: unknown) => {
        if (!vigente) return;
        const sinPermiso = error instanceof ErrorApi && error.estado === 403;
        setFallo({
          sinPermiso,
          mensaje: error instanceof Error ? error.message : 'No se pudo leer el kardex.',
        });
      });
    return () => {
      vigente = false;
    };
  }, [insumoId, intento]);

  const columnas: readonly ColumnaDeTabla<Renglon>[] = [
    {
      clave: 'cuando',
      titulo: 'Cuándo',
      celda: (r) => (
        <span className="text-texto-sutil tabular-nums">{CUANDO.format(new Date(r.cuando))}</span>
      ),
    },
    {
      clave: 'que',
      titulo: 'Qué pasó',
      celda: (r) => (
        <span className="flex flex-col">
          <span>{TIPOS[r.tipo] ?? r.tipo}</span>
          {r.motivo === null ? null : (
            <span className="text-xs text-texto-sutil">{etiquetaDe.get(r.motivo) ?? r.motivo}</span>
          )}
        </span>
      ),
    },
    {
      clave: 'cantidad',
      titulo: 'Movió',
      numerica: true,
      celda: (r) => <Cifra valor={Number(r.cantidad)} conSigno tamano="sm" />,
    },
    {
      clave: 'saldo',
      titulo: 'Quedó',
      numerica: true,
      celda: (r) => <Cifra valor={Number(r.saldo)} tamano="sm" />,
    },
  ];

  return (
    <Superficie
      id="kardex"
      nivel={1}
      relleno={4}
      como="section"
      aria-labelledby="kardex-titulo"
      className="flex flex-col gap-(--espacio-3) scroll-mt-(--espacio-6) xl:col-span-2"
    >
      <h2 id="kardex-titulo" className="flex items-center gap-(--espacio-2) text-lg font-bold">
        <History aria-hidden="true" className="size-5 text-texto-sutil" />
        Kardex · los últimos 90 días
      </h2>
      {insumoId === null ? (
        <Vacio
          icono={<History />}
          titulo="Este producto no lleva inventario."
          explicacion="Sin insumo no hay existencia que se mueva: se vende y ya."
        />
      ) : fallo !== null ? (
        fallo.sinPermiso ? (
          <Aviso tono="info" titulo="El kardex lo ve quien administra el inventario." />
        ) : (
          <Aviso
            tono="peligro"
            titulo="No se pudo leer el kardex."
            accion={
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setFallo(null);
                  setKardex(null);
                  setIntento((n) => n + 1);
                }}
              >
                Volver a intentar
              </Button>
            }
          >
            {fallo.mensaje}
          </Aviso>
        )
      ) : kardex === null ? (
        <EsqueletoDeLista filas={4} />
      ) : (
        <>
          <Tabla
            etiqueta="Kardex del producto"
            columnas={columnas}
            // El más reciente arriba: es el que se viene a buscar.
            filas={[...kardex.renglones].reverse()}
            claveDe={(r) => r.movimientoId}
            alto="max-h-[50vh]"
            vacio={
              <Vacio
                icono={<History />}
                titulo="Sin movimientos en los últimos 90 días."
                explicacion="Cada entrada, venta, ajuste y merma aparece aquí con su motivo."
              />
            }
          />
          {kardex.hayMas ? (
            <p className="text-xs text-texto-sutil">
              Se ven los {LIMITE} más recientes; hay movimientos más viejos en esos días.
            </p>
          ) : null}
        </>
      )}
    </Superficie>
  );
}
