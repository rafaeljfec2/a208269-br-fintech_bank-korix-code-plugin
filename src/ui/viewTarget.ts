export interface KorixViewTarget {
  readonly containerId: string;
  readonly viewId: string;
}

export const KORIX_PRIMARY_VIEW: KorixViewTarget = {
  containerId: "korix-sidebar",
  viewId: "korix.chatView",
};

export const KORIX_SECONDARY_VIEW: KorixViewTarget = {
  containerId: "korix-secondary-sidebar",
  viewId: "korix.chatSecondaryView",
};

const SECONDARY_SIDEBAR_MIN_VERSION = {
  major: 1,
  minor: 106,
} as const;

export function supportsSecondarySidebar(version: string): boolean {
  const parsed = parseMajorMinor(version);
  if (!parsed) {
    return false;
  }

  if (parsed.major !== SECONDARY_SIDEBAR_MIN_VERSION.major) {
    return parsed.major > SECONDARY_SIDEBAR_MIN_VERSION.major;
  }

  return parsed.minor >= SECONDARY_SIDEBAR_MIN_VERSION.minor;
}

export function getKorixViewTarget(version: string): KorixViewTarget {
  return supportsSecondarySidebar(version)
    ? KORIX_SECONDARY_VIEW
    : KORIX_PRIMARY_VIEW;
}

function parseMajorMinor(
  version: string,
): { readonly major: number; readonly minor: number } | null {
  const match = /^(\d+)\.(\d+)/.exec(version);
  const major = match?.[1];
  const minor = match?.[2];

  if (!major || !minor) {
    return null;
  }

  return {
    major: Number(major),
    minor: Number(minor),
  };
}
