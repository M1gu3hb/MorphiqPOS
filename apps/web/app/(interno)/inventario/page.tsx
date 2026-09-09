import RestrictedRoute from '@/components/common/RestrictedRoute';
import Inventario from '@/pages/Inventario';

export const dynamic = 'force-dynamic';

export default function Pagina() {
  return (
    <RestrictedRoute>
      <Inventario />
    </RestrictedRoute>
  );
}
