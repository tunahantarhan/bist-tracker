import { Suspense } from 'react';
import type { Metadata } from 'next';
import AuthShell from '@/components/auth/AuthShell';
import AdminLoginFlow from './AdminLoginFlow';

export const metadata: Metadata = { title: 'Yönetici Girişi' };

export default function AdminLoginPage() {
  return (
    <AuthShell variant="admin">
      <Suspense fallback={null}>
        <AdminLoginFlow />
      </Suspense>
    </AuthShell>
  );
}
