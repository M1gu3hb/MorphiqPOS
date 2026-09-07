import type { Metadata } from 'next';

import { Galeria } from './Galeria';

export const metadata: Metadata = {
  title: 'Sistema de diseño · MorphiqPOS',
  description:
    'Los tokens, las cuatro perillas y los estilos intercambiables, en vivo y con contraste medido.',
};

export default function PaginaEstilos() {
  return <Galeria />;
}
