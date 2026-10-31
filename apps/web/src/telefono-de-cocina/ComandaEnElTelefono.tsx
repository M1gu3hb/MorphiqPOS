import { Aviso, Superficie } from '@morphiqpos/ui/sistema';
import { PartyPopper } from 'lucide-react';

import type { ComandaDelTelefono } from './pantalla-del-telefono';

/**
 * La comanda en vista rápida (DP-9.4): de quién es, qué lleva y lo que no se puede pasar por
 * alto. La alergia va primero y en rojo, como la dice la voz.
 */
export function ComandaEnElTelefono({
  comanda,
  pendientes,
  haceCuanto,
}: {
  readonly comanda: ComandaDelTelefono;
  readonly pendientes: number;
  readonly haceCuanto: string;
}) {
  const quien =
    comanda.mesaNumero === null
      ? `Para llevar${comanda.nombrePedido === null ? '' : ` · ${comanda.nombrePedido}`}`
      : `Mesa ${String(comanda.mesaNumero)}`;
  return (
    <Superficie
      como="article"
      aria-label={`Comanda de ${quien}`}
      relleno={4}
      className="flex flex-col gap-(--espacio-3)"
    >
      <header className="flex items-baseline justify-between gap-(--espacio-2)">
        <h2 className="text-display leading-none font-bold">{quien}</h2>
        <p className="text-texto-sutil">
          {comanda.estado === 'en_preparacion' ? 'Preparando' : 'Nueva'} · {haceCuanto}
        </p>
      </header>
      {comanda.alergias === null ? null : (
        <Aviso tono="peligro" titulo={`Alergia: ${comanda.alergias}`} />
      )}
      {comanda.celebracion ? (
        <p className="flex items-center gap-(--espacio-2) font-semibold">
          <PartyPopper aria-hidden className="size-5" />
          {comanda.tipoCelebracion ?? 'Celebración'}
        </p>
      ) : null}
      <ul className="flex flex-col gap-(--espacio-2)">
        {comanda.platillos.map((p, i) => (
          <li key={`${p.nombre}-${String(i)}`} className="text-2xl leading-tight">
            <span className="font-bold">{Number(p.cantidad)}×</span> {p.nombre}
            {p.notas === null || p.notas.trim() === '' ? null : (
              <span className="block text-lg text-texto-sutil">{p.notas}</span>
            )}
          </li>
        ))}
      </ul>
      {comanda.notas === null || comanda.notas.trim() === '' ? null : (
        <p className="text-lg">Nota: {comanda.notas}</p>
      )}
      {pendientes > 1 ? (
        <p className="text-texto-sutil">
          {pendientes - 1 === 1
            ? 'Queda 1 comanda más'
            : `Quedan ${String(pendientes - 1)} comandas más`}
        </p>
      ) : null}
    </Superficie>
  );
}
