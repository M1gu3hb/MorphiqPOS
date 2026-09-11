import RestrictedRoute from '@/components/common/RestrictedRoute';
import Recetas from '@/pages/Recetas';

export const dynamic = 'force-dynamic';

export default function Pagina() {
  return (
    <RestrictedRoute>
      <Recetas />
    </RestrictedRoute>
  );
}
