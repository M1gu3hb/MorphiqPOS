'use client';

import { AlertTriangle, Banknote, Clock3, ReceiptText, ShoppingBag } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Card, CardContent, CardHeader, CardTitle } from '@morphiqpos/ui/primitivas/card';

import { obtenerApi } from '../../../src/cliente/api';
import { pesosDesdeCentavos } from '../productos/presentacion';

interface InicioApi {
  readonly ventaDiaCentavos: string;
  readonly operacionesDia: number;
  readonly caja: { readonly abiertaEn: string; readonly fondoInicialCentavos: string } | null;
  readonly ventasRecientes: readonly {
    readonly id: string;
    readonly folio: string;
    readonly totalCentavos: string;
    readonly creadaEn: string;
  }[];
  readonly productosBajoMinimo: readonly {
    readonly id: string;
    readonly nombre: string;
    readonly cantidad: string;
    readonly minimo: string;
    readonly almacen: string;
  }[];
}

const VACIO: InicioApi = {
  ventaDiaCentavos: '0',
  operacionesDia: 0,
  caja: null,
  ventasRecientes: [],
  productosBajoMinimo: [],
};

export function InicioPantalla() {
  const [datos, setDatos] = useState<InicioApi>(VACIO);
  const [cargando, setCargando] = useState(true);
  useEffect(() => {
    void obtenerApi<InicioApi>('/api/catalogo/inicio')
      .then(setDatos)
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : 'No se pudo cargar el inicio');
      })
      .finally(() => {
        setCargando(false);
      });
  }, []);

  return (
    <div className="mx-auto grid w-full max-w-[92rem] gap-8 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <header className="grid gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-primario">
          <Clock3 className="size-4" /> Operación de hoy
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Inicio</h1>
        <p className="text-texto-sutil">
          Datos calculados desde ventas, caja e inventario de la sucursal.
        </p>
      </header>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metrica
          titulo="Venta del día"
          valor={pesosDesdeCentavos(datos.ventaDiaCentavos)}
          icono={<Banknote />}
        />
        <Metrica
          titulo="Operaciones"
          valor={datos.operacionesDia.toString()}
          icono={<ShoppingBag />}
        />
        <Metrica
          titulo="Caja"
          valor={datos.caja === null ? 'Sin abrir' : 'Abierta'}
          icono={<ReceiptText />}
        />
        <Metrica
          titulo="Bajo mínimo"
          valor={datos.productosBajoMinimo.length.toString()}
          icono={<AlertTriangle />}
        />
      </section>
      {cargando ? <p className="text-sm text-texto-sutil">Consultando la operación…</p> : null}
      <section className="grid items-start gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ventas recientes</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {datos.ventasRecientes.length === 0 ? (
              <Vacio texto="Todavía no hay ventas cobradas hoy." />
            ) : (
              datos.ventasRecientes.map((venta) => (
                <div
                  key={venta.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium">Folio {venta.folio}</p>
                    <p className="text-xs text-texto-sutil">
                      {new Date(venta.creadaEn).toLocaleString('es-MX')}
                    </p>
                  </div>
                  <strong>{pesosDesdeCentavos(venta.totalCentavos)}</strong>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Productos bajo mínimo</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {datos.productosBajoMinimo.length === 0 ? (
              <Vacio texto="Todas las existencias están sobre su mínimo." />
            ) : (
              datos.productosBajoMinimo.map((item) => (
                <div
                  key={`${item.id}-${item.almacen}`}
                  className="flex items-center justify-between rounded-lg border border-advertencia/30 bg-advertencia/5 p-3"
                >
                  <div>
                    <p className="font-medium">{item.nombre}</p>
                    <p className="text-xs text-texto-sutil">{item.almacen}</p>
                  </div>
                  <span className="numeros text-sm">
                    {item.cantidad} / mín. {item.minimo}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Metrica({
  titulo,
  valor,
  icono,
}: {
  readonly titulo: string;
  readonly valor: string;
  readonly icono: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-texto-sutil">{titulo}</p>
          <p className="mt-1 font-display text-2xl font-bold">{valor}</p>
        </div>
        <span className="grid size-[var(--altura-control)] place-items-center rounded-xl bg-primario/10 text-primario">
          {icono}
        </span>
      </CardContent>
    </Card>
  );
}

function Vacio({ texto }: { readonly texto: string }) {
  return (
    <p className="rounded-lg border border-dashed p-6 text-center text-sm text-texto-sutil">
      {texto}
    </p>
  );
}
