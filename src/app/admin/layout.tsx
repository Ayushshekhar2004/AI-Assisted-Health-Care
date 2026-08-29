import type { ReactNode } from 'react';
import { requireRole } from '@/modules/auth';

export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireRole('operations');
  return children;
}
