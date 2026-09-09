import RestrictedRoute from '@/components/common/RestrictedRoute';
import Cocina from '@/pages/Cocina';

export const dynamic = 'force-dynamic';

export default function Pagina() {
  return (
    <RestrictedRoute>
      <Cocina />
    </RestrictedRoute>
  );
}
