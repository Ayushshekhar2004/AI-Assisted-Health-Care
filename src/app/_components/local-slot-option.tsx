'use client';

import { useEffect, useState } from 'react';

export function LocalSlotOption({
  endsAt,
  id,
  startsAt,
}: Readonly<{ endsAt: string; id: string; startsAt: string }>) {
  const [label, setLabel] = useState('Loading local time…');

  useEffect(() => {
    const formatter = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setLabel(
      `${formatter.format(new Date(startsAt))} – ${formatter.format(new Date(endsAt))} (${zone})`,
    );
  }, [endsAt, startsAt]);

  return <option value={id}>{label}</option>;
}
