'use client';

import { useEffect, useState } from 'react';

type LocalDateTimeProps = Readonly<{
  endsAt?: string;
  startsAt: string;
}>;

export function LocalDateTime({ endsAt, startsAt }: LocalDateTimeProps) {
  const [label, setLabel] = useState('Loading local time…');

  useEffect(() => {
    const formatter = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const startLabel = formatter.format(new Date(startsAt));
    const endLabel = endsAt ? formatter.format(new Date(endsAt)) : null;
    setLabel(`${startLabel}${endLabel ? ` – ${endLabel}` : ''} (${zone})`);
  }, [endsAt, startsAt]);

  return <time dateTime={startsAt}>{label}</time>;
}
