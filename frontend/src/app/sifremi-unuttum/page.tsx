import { Suspense } from 'react';
import type { Metadata } from 'next';
import AuthShell from '@/components/auth/AuthShell';
import ForgotPasswordForm from './ForgotPasswordForm';

export const metadata: Metadata = { title: 'Şifremi Unuttum' };

export default function Page() {
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <ForgotPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
