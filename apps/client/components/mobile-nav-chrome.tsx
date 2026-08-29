import styles from "../styles/design-b.module.css";

/**
 * Reveals the sidebar as an off-canvas drawer below design-b.module.css's
 * existing 760px breakpoint, instead of the sidebar just vanishing.
 *
 * Before this, `.sidebar { display: none }` at 760px (with nothing to bring
 * it back) meant a parent on a phone lost every nav link - Dashboard,
 * Appointments, Log out - with no way to get to any of them. That's the
 * exact "sidebar just disappears" problem @summit/design's shared mobile nav
 * pattern (see CLAUDE.md) already solves for apps/data/apps/employee and
 * apps/scheduler's own duplicate of it. apps/client's sidebar is a CSS
 * Modules class (styles.sidebar), not the shared unscoped .sidebar the
 * components.css version targets, and this app is pages-router, not
 * apps/data's root-layout Server Component - so this reimplements the same
 * zero-JS checkbox-hack technique against this app's own class names
 * (styles.*) rather than pulling in the shared CSS, matching how
 * apps/scheduler already does the same thing for its own class names.
 *
 * Rendered as a sibling immediately before the `.page` grid (design-b.tsx
 * and appointments.tsx both do this) so `.navToggleInput:checked ~ .page
 * .sidebar` can reach it via a sibling combinator.
 */
export function MobileNavChrome({ title }: { title: string }) {
  return (
    <>
      <input type="checkbox" id="nav-toggle" className={styles.navToggleInput} />
      <div className={styles.mobileTopbar}>
        <label htmlFor="nav-toggle" className={styles.navToggleBtn} aria-label="Open menu">
          <span />
          <span />
          <span />
        </label>
        <span className={styles.mobileTopbarTitle}>{title}</span>
      </div>
      <label htmlFor="nav-toggle" className={styles.navToggleBackdrop} aria-hidden="true" />
    </>
  );
}
