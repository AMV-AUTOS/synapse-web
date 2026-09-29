import React from 'react';

interface PanelProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className = '',
  padded = true,
}: PanelProps) {
  return (
    <section
      className={`rounded-lg border border-[var(--panel-border)] bg-[var(--panel-bg)] text-[var(--panel-fg)] shadow-sm ${className}`}
    >
      {(title || subtitle || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-[var(--panel-border)] px-4 py-3">
          <div className="min-w-0">
            {title && (
              <h2 className="truncate text-sm font-semibold tracking-wide text-[var(--panel-title)]">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-0.5 truncate text-xs text-[var(--panel-muted)]">
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

export default Panel;
