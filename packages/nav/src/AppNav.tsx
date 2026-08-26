import React from 'react';
import { portals } from './portals.config';

interface AppNavProps {
  activeKey: string;
}

/**
 * The cross-portal bar. One rail across Scheduler, Clinician, Employee and
 * Client so staff move between them from any screen. Colours come from the
 * shared tokens, so it follows the theme and accent like everything else.
 */
export function AppNav({ activeKey }: AppNavProps) {
  return (
    <nav
      aria-label="Summit portals"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-1, 4px)',
        padding: '10px var(--space-5, 20px)',
        background: 'var(--brand-800, #1A3F5C)',
        borderBottom: '1px solid var(--brand-600, #28B4A6)',
      }}
    >
      {portals.map((p) => {
        const isActive = p.key === activeKey;
        return (
          <a
            key={p.key}
            href={p.url}
            aria-current={isActive ? 'page' : undefined}
            style={{
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: 'var(--text-sm, 13px)',
              fontWeight: isActive ? 600 : 500,
              color: isActive ? 'var(--brand-200, #28B4A6)' : 'oklch(100% 0 0 / 0.66)',
              textDecoration: 'none',
              padding: '5px 13px',
              borderRadius: 'var(--radius-full, 999px)',
              background: isActive ? 'oklch(100% 0 0 / 0.10)' : 'transparent',
              transition: 'all var(--duration-fast, 110ms) var(--ease-out-quart, ease)',
              whiteSpace: 'nowrap',
            }}
          >
            {p.label}
          </a>
        );
      })}
    </nav>
  );
}
