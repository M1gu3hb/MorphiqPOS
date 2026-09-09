import RestrictedRoute from '@/components/common/RestrictedRoute';
import Compras from '@/pages/Compras';

export const dynamic = 'force-dynamic';

export default function Pagina() {
  return (
    <RestrictedRoute>
      <Compras />
    </RestrictedRoute>
  );
}
