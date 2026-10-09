'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@morphiqpos/ui/primitivas/select';
import {
  Aviso,
  EsqueletoDeLista,
  Superficie,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { Boxes, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';

/**
 * PROGRAMAR LAS ZONAS DEL ANAQUEL (F-149, D-33 de la 2.4).
 *
 * El conteo cíclico cuenta UNA zona al día, la más atrasada. Sin zonas, la pantalla decía
 * «Hoy no toca ninguna zona» para siempre, y su botón llevaba a Configuración, donde no hay
 * zonas. Aquí se crean —nombre y cada cuántos días toca— y se dice en cuál vive cada
 * producto. Lo que no tiene zona no entra al conteo cíclico.
 */

interface Zona {
  readonly id: string;
  readonly nombre: string;
  readonly orden?: number | null;
  readonly dias_entre_conteos?: number | null;
  readonly activa?: boolean | null;
}

interface ProductoConZona {
  readonly id: string;
  readonly nombre: string;
  readonly zona_anaquel_id?: string | null;
  readonly activo?: boolean | null;
}

const SIN_ZONA = 'sin-zona';
const DIAS_POR_OMISION = '14';

function mensajeDe(fallo: unknown): string {
  return fallo instanceof ErrorApi ? fallo.message : 'No se pudo guardar. Inténtalo otra vez.';
}

export function ZonasDelAnaquel({ onListo }: { readonly onListo: () => void }) {
  const [zonas, setZonas] = useState<readonly Zona[] | null>(null);
  const [productos, setProductos] = useState<readonly ProductoConZona[] | null>(null);
  const [falloDeLectura, setFalloDeLectura] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [dias, setDias] = useState(DIAS_POR_OMISION);
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const control = new AbortController();
    Promise.all([
      consultarPuente<Zona>('ZonaAnaquel', { limite: 100, signal: control.signal }),
      consultarPuente<ProductoConZona>('Ingrediente', { limite: 500, signal: control.signal }),
    ])
      .then(([leidas, insumos]) => {
        if (control.signal.aborted) return;
        setZonas(leidas.filter((z) => z.activa !== false));
        setProductos(insumos.filter((i) => i.activo !== false));
      })
      .catch((error: unknown) => {
        if (!control.signal.aborted) {
          setFalloDeLectura(error instanceof Error ? error.message : 'No se pudo leer.');
        }
      });
    return () => {
      control.abort();
    };
  }, [intento]);

  async function crearZona(): Promise<void> {
    const cada = Number(dias);
    if (nombre.trim().length < 2) {
      setFallo('Ponle un nombre a la zona: el que dice el anaquel.');
      return;
    }
    if (!Number.isInteger(cada) || cada < 1 || cada > 365) {
      setFallo('Cada cuántos días: un número del 1 al 365.');
      return;
    }
    setGuardando(true);
    setFallo(null);
    try {
      await invocarComando('/api/inventario/guardar-zona', {
        nombre: nombre.trim(),
        diasEntreConteos: cada,
        orden: (zonas?.length ?? 0) + 1,
      });
      setNombre('');
      setDias(DIAS_POR_OMISION);
      setIntento((previo) => previo + 1);
    } catch (error: unknown) {
      setFallo(mensajeDe(error));
    } finally {
      setGuardando(false);
    }
  }

  async function mover(producto: ProductoConZona, zonaId: string | null): Promise<void> {
    setFallo(null);
    try {
      await invocarComando('/api/inventario/asignar-zona', { zonaId, insumoIds: [producto.id] });
      setProductos((previos) =>
        (previos ?? []).map((p) => (p.id === producto.id ? { ...p, zona_anaquel_id: zonaId } : p)),
      );
    } catch (error: unknown) {
      setFallo(mensajeDe(error));
    }
  }

  if (falloDeLectura !== null) {
    return <Aviso tono="peligro" titulo="No se pudieron leer las zonas ni los productos." />;
  }
  if (zonas === null || productos === null) {
    return <EsqueletoDeLista filas={4} />;
  }

  const columnas: readonly ColumnaDeTabla<ProductoConZona>[] = [
    { clave: 'producto', titulo: 'Producto', celda: (p) => p.nombre, orden: (p) => p.nombre },
    {
      clave: 'zona',
      titulo: 'Zona',
      celda: (p) => (
        <Select
          value={p.zona_anaquel_id ?? SIN_ZONA}
          onValueChange={(valor) => {
            void mover(p, valor === SIN_ZONA ? null : valor);
          }}
        >
          <SelectTrigger className="w-full min-w-44" aria-label={`Zona de ${p.nombre}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SIN_ZONA}>Sin zona</SelectItem>
            {zonas.map((z) => (
              <SelectItem key={z.id} value={z.id}>
                {z.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
  ];
  const conZona = productos.filter((p) => (p.zona_anaquel_id ?? null) !== null).length;

  return (
    <div className="flex flex-col gap-(--espacio-4)">
      <Superficie
        como="form"
        relleno={4}
        aria-labelledby="zona-nueva-titulo"
        className="flex flex-col gap-(--espacio-3)"
        onSubmit={(evento) => {
          evento.preventDefault();
          void crearZona();
        }}
      >
        <h2 id="zona-nueva-titulo" className="font-semibold">
          Nueva zona
        </h2>
        <div className="grid gap-(--espacio-3) sm:grid-cols-[minmax(0,1fr)_10rem]">
          <div className="flex flex-col gap-(--espacio-1)">
            <Label htmlFor="zona-nombre">Nombre</Label>
            <Input
              id="zona-nombre"
              placeholder="Lácteos · Bebidas · Limpieza"
              value={nombre}
              onChange={(evento) => {
                setNombre(evento.target.value);
              }}
            />
          </div>
          <div className="flex flex-col gap-(--espacio-1)">
            <Label htmlFor="zona-dias">Cada cuántos días</Label>
            <Input
              id="zona-dias"
              inputMode="numeric"
              value={dias}
              onChange={(evento) => {
                setDias(evento.target.value);
              }}
            />
          </div>
        </div>
        <Button type="submit" variant="outline" disabled={guardando} cargando={guardando}>
          <Plus aria-hidden="true" />
          Crear la zona
        </Button>
      </Superficie>

      {fallo === null ? null : <Aviso tono="peligro" titulo={fallo} />}

      {productos.length === 0 ? (
        <Vacio
          icono={<Boxes />}
          tamano="compacto"
          titulo="Todavía no hay productos que repartir."
          explicacion="Dalos de alta y vuelve: aquí se dice en qué zona vive cada uno."
        />
      ) : (
        <Tabla
          etiqueta="Qué producto vive en qué zona"
          columnas={columnas}
          filas={productos}
          claveDe={(p) => p.id}
        />
      )}

      <Button type="button" disabled={conZona === 0} onClick={onListo}>
        Contar la zona de hoy
      </Button>
    </div>
  );
}
