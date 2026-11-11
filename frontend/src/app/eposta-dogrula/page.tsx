import { Suspense } from 'react';
import type { Metadata } from 'next';
import AuthShell from '@/components/auth/AuthShell';
import VerifyEmailView from './VerifyEmailView';

export const metadata: Metadata = { title: 'E-posta Doğrulama' };

export default function Page() {
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <VerifyEmailView />
      </Suspense>
    </AuthShell>
  );
}
