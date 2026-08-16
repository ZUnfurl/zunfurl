import type {
  GestureMode,
  GesturePlatform,
  HorizontalGesturePolicy,
} from "./types";

const commonPolicy: Pick<
  HorizontalGesturePolicy,
  "maxPreviewOffset" | "clickSuppressionDistance" | "clickSuppressionDuration"
> = {
  maxPreviewOffset: 72,
  clickSuppressionDistance: 6,
  clickSuppressionDuration: 220,
};

const mobilePolicy: HorizontalGesturePolicy = {
  ...commonPolicy,
  deadzone: 6,
  axisLockRatio: 1.35,
  pagedCommitDistance: 44,
  pagedCommitVelocity: 0.35,
  freeRailStartDistance: 6,
  edgeResistance: 0.24,
  inertiaFriction: 0.92,
};

const desktopPolicy: HorizontalGesturePolicy = {
  ...commonPolicy,
  deadzone: 4,
  axisLockRatio: 1.2,
  pagedCommitDistance: 56,
  pagedCommitVelocity: 0.25,
  freeRailStartDistance: 4,
  edgeResistance: 0.2,
  inertiaFriction: 0.94,
};

const modePolicyOverrides: Record<GestureMode, Partial<HorizontalGesturePolicy>> = {
  paged: {
    edgeResistance: 0,
    inertiaFriction: 1,
  },
  "free-rail": {},
};

const platformPolicies: Record<GesturePlatform, HorizontalGesturePolicy> = {
  desktop: desktopPolicy,
  mobile: mobilePolicy,
};

export function getHorizontalGesturePolicy(
  platform: GesturePlatform,
  mode: GestureMode,
  overrides: Partial<HorizontalGesturePolicy> = {},
): HorizontalGesturePolicy {
  return {
    ...platformPolicies[platform],
    ...modePolicyOverrides[mode],
    ...overrides,
  };
}

export function getDefaultGesturePlatform(): GesturePlatform {
  if (typeof window === "undefined") {
    return "desktop";
  }

  return window.matchMedia("(pointer: coarse)").matches ? "mobile" : "desktop";
}

export { desktopPolicy, mobilePolicy };