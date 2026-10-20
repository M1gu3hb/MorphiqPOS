import POSLogin from '@/pages/POSLogin';

/** D-42: el Master POS siempre tiene una entrada central, también en un navegador nuevo. */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <POSLogin />;
}
