'use client';

import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { useState } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';

import {
  repartirLaNota,
  type NotaRepartida,
  type ResultadoDeImportar,
} from './entrada-del-archivo.ts';
import { leerNotaDelProveedor } from './nota-del-proveedor.ts';

/**
 * EL CAMINO 1 · la nota del proveedor desde su ARCHIVO (F-631; C.10 de la 2.4).
 *
 * La cabecera de Entradas decía que la subida «necesita multipart» y por eso no estaba.
 * No la necesita: `compras.importar_nota` recibe RENGLONES. El archivo —el CSV que
 * exporta el sistema del proveedor o que se guarda desde su hoja de cálculo— se lee
 * aquí, en el navegador, y lo que viaja son los datos, validados aquí y en el servidor.
 * El servidor PROPONE con qué casó cada renglón; guardar sigue siendo el botón de
 * siempre, con todo a la vista.
 */

export interface NotaDelArchivo extends NotaRepartida {
  readonly archivo: string;
  readonly lineas: number;
  /** Las filas del archivo que no se pudieron leer, por número (el encabezado es la 1). */
  readonly filasConProblema: readonly number[];
}

export function ImportarLaNota({
  proveedorId,
  folio,
  alImportar,
  alFallar,
}: {
  readonly proveedorId: string;
  readonly folio: string;
  readonly alImportar: (nota: NotaDelArchivo) => void;
  readonly alFallar: (mensaje: string) => void;
}) {
  const [leyendo, setLeyendo] = useState(false);

  async function leer(archivo: File): Promise<void> {
    setLeyendo(true);
    try {
      const leida = leerNotaDelProveedor(await archivo.text());
      if (leida.faltaColumna !== null) {
        alFallar(
          `El archivo no trae la columna «${leida.faltaColumna}». La primera fila tiene que ` +
            'decir qué es cada columna: descripción, cantidad y costo unitario.',
        );
        return;
      }
      if (leida.renglones.length === 0) {
        alFallar('El archivo no trae ningún renglón que se pueda leer.');
        return;
      }
      // El folio es el de SU hoja; sin teclearlo, el nombre del archivo lo recuerda.
      const folioProveedor =
        folio.trim() === '' ? archivo.name.replace(/\.[^.]+$/, '').slice(0, 40) : folio.trim();
      const resultado = await invocarComando<ResultadoDeImportar>('/api/compras/importar-nota', {
        proveedorId,
        folioProveedor: folioProveedor === '' ? 'archivo' : folioProveedor,
        renglones: leida.renglones,
      });
      const repartida = repartirLaNota(
        resultado,
        leida.renglones.map((r) => r.claveProveedor ?? r.codigoBarras),
      );
      alImportar({
        ...repartida,
        archivo: archivo.name,
        lineas: leida.renglones.length,
        filasConProblema: leida.filasConProblema,
      });
    } catch (fallo: unknown) {
      alFallar(
        fallo instanceof ErrorApi
          ? fallo.message
          : 'No se pudo leer el archivo. ¿Es el CSV de la nota?',
      );
    } finally {
      setLeyendo(false);
    }
  }

  return (
    <section
      aria-label="Importar el archivo de la nota"
      className="flex flex-col gap-(--espacio-2)"
    >
      <Label htmlFor="archivo-de-la-nota">Archivo de la nota (CSV)</Label>
      <Input
        id="archivo-de-la-nota"
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        disabled={leyendo || proveedorId === ''}
        aria-busy={leyendo}
        onChange={(evento) => {
          const archivo = evento.target.files?.[0];
          // Se limpia para que volver a elegir EL MISMO archivo lo vuelva a leer.
          evento.target.value = '';
          if (archivo !== undefined) void leer(archivo);
        }}
      />
      <p className="text-xs text-texto-sutil">
        {proveedorId === ''
          ? 'Elige primero el proveedor: la nota se empareja contra lo que ya se le compró.'
          : 'La primera fila dice qué es cada columna: clave, código de barras, descripción, cantidad y costo unitario. Desde Excel: «Guardar como» CSV.'}
      </p>
    </section>
  );
}
