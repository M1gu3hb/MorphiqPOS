import RestrictedRoute from '@/components/common/RestrictedRoute';
import PortalQR from '@/pages/PortalQR';

export const dynamic = 'force-dynamic';

export default function Pagina() {
  return (
    <RestrictedRoute>
      <PortalQR />
    </RestrictedRoute>
  );
}
