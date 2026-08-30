import type { ReactNode } from 'react';
import { requireRole } from '@/modules/auth';

export default async function PatientLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  await requireRole('patient');
  return children;
}
