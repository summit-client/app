import React from 'react';
import { portals } from './portals.config';

interface AppNavProps {
  activeKey: string;
  /** When set, a settings cogwheel sits at the right of the bar. */
  settingsHref?: string;
}

/**
 * The cross-portal bar. One rail across Scheduler, Clinician, Employee and
 * Client so staff move between them from any screen. Colours come from the
 * shared tokens, so it follows the theme and accent like everything else.
 */
export function AppNav({ activeKey, settingsHref }: AppNavProps) {
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
        // The bar declares its own height from the same token the shell below
        // it subtracts, border included, so the two cannot disagree.
        height: 'var(--portalnav-h, 51px)',
        boxSizing: 'border-box',
        padding: '0 var(--space-5, 20px)',
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
      {settingsHref ? (
        <a
          href={settingsHref}
          aria-label="Settings"
          title="Settings"
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 30,
            height: 30,
            borderRadius: 'var(--radius-full, 999px)',
            color: 'oklch(100% 0 0 / 0.66)',
            fontSize: 15,
            lineHeight: 1,
            textDecoration: 'none',
            transition: 'all var(--duration-fast, 110ms) var(--ease-out-quart, ease)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.2.6.76 1 1.4 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </a>
      ) : null}
    </nav>
  );
}
