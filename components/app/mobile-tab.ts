/**
 * Geometrija jedne ćelije donje trake na telefonu — dele je stavke navigacije
 * (`MobileNav`) i zvono u obliku ćelije (`NotificationsBell`), pa pet ćelija
 * ne može da se raziđe u visini. 56 px je iznad najmanje dodirne mete (44 px).
 */
export const MOBILE_TAB =
  "relative flex min-h-14 w-full cursor-pointer flex-col items-center justify-center gap-1 text-meta font-medium transition-colors";

/** Pilula oko ikonice: aktivna ćelija je puni tintom, ne samo bojom natpisa. */
export const MOBILE_TAB_ICON =
  "relative flex h-7 w-12 items-center justify-center rounded-full transition-colors";

/** Bedž preko ugla pilule. */
export const MOBILE_TAB_BADGE = "absolute right-0 -top-1 h-4 min-w-4 px-1 text-[10px]";
