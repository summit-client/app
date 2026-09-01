/**
 * The portal list the bar renders.
 *
 * Keys, labels, URLs and role access now live in @summit/portals, so the bar,
 * the sign-in redirect and each portal's gate read one registry instead of
 * three copies that could disagree. This file is the nav-shaped view of it.
 */

export {
  PORTALS as portals, portalsFor, parseVisiblePortals,
  type Portal, type PortalKey, type AppRole,
} from "@summit/portals";
