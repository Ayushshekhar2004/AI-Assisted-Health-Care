import type { ReactNode } from 'react';
import { requireRole } from '@/modules/auth';

export default async function DoctorLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireRole('doctor');
  return children;
}
