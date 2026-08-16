export type GesturePlatform = "desktop" | "mobile";

export type GestureMode = "paged" | "free-rail";

export type GestureAxis = "x" | "y";

export type GesturePhase =
  | "idle"
  | "tracking"
  | "locked-x"
  | "locked-y"
  | "settling";

export type GestureCommitDirection = "next" | "previous";

export interface HorizontalGesturePolicy {
  deadzone: number;
  axisLockRatio: number;
  pagedCommitDistance: number;
  pagedCommitVelocity: number;
  freeRailStartDistance: number;
  edgeResistance: number;
  inertiaFriction: number;
  maxPreviewOffset: number;
  clickSuppressionDistance: number;
  clickSuppressionDuration: number;
}

export interface HorizontalGestureSnapshot {
  mode: GestureMode;
  platform: GesturePlatform;
  phase: GesturePhase;
  pointerId: number | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  deltaX: number;
  deltaY: number;
  absDeltaX: number;
  absDeltaY: number;
  previewOffset: number;
  velocityX: number;
  moved: boolean;
}

export interface HorizontalGestureCommitDecision {
  direction: GestureCommitDirection | null;
  shouldCommit: boolean;
}

export interface CreateHorizontalGestureOptions {
  platform?: GesturePlatform;
  mode?: GestureMode;
  policy?: Partial<HorizontalGesturePolicy>;
  interactiveSelector?: string;
  shouldIgnoreTarget?: (target: EventTarget | null) => boolean;
  onTrackingStart?: (snapshot: HorizontalGestureSnapshot) => void;
  onAxisLock?: (axis: GestureAxis, snapshot: HorizontalGestureSnapshot) => void;
  onDragStart?: (snapshot: HorizontalGestureSnapshot) => void;
  onDragMove?: (snapshot: HorizontalGestureSnapshot) => void;
  onDragEnd?: (
    snapshot: HorizontalGestureSnapshot,
    commit: HorizontalGestureCommitDecision,
  ) => void;
  onCancel?: (snapshot: HorizontalGestureSnapshot) => void;
  onSettleStart?: (snapshot: HorizontalGestureSnapshot) => void;
  onStateChange?: (snapshot: HorizontalGestureSnapshot) => void;
}

export interface HorizontalGestureController {
  destroy: () => void;
  getPolicy: () => HorizontalGesturePolicy;
  getSnapshot: () => HorizontalGestureSnapshot;
  suppressClick: () => void;
  shouldSuppressClick: () => boolean;
}