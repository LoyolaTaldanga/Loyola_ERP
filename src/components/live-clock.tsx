"use client";

import { useEffect, useState } from "react";

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
};
const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
};

export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) {
    // Avoids a server/client render mismatch on first paint.
    return <div className="h-[2.75rem]" />;
  }

  return (
    <div className="text-right">
      <p className="text-sm text-slate-500">{now.toLocaleDateString(undefined, DATE_FORMAT)}</p>
      <p className="font-mono text-xl font-semibold text-brand-primary">
        {now.toLocaleTimeString(undefined, TIME_FORMAT)}
      </p>
    </div>
  );
}
