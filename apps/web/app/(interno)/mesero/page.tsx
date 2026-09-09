import RestrictedRoute from '@/components/common/RestrictedRoute';
import Mesero from '@/pages/Mesero';

export const dynamic = 'force-dynamic';

export default function Pagina() {
  return (
    <RestrictedRoute>
      <Mesero />
    </RestrictedRoute>
  );
}
