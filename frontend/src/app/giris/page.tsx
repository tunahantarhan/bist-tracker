import { Suspense } from 'react';
import type { Metadata } from 'next';
import AuthShell from '@/components/auth/AuthShell';
import AuthForm from './AuthForm';

export const metadata: Metadata = { title: 'Giriş Yap' };

export default function LoginPage() {
  return (
    <AuthShell>
      {/* AuthForm reads ?next= / ?mod= on the client */}
      <Suspense fallback={null}>
        <AuthForm />
      </Suspense>
    </AuthShell>
  );
}
