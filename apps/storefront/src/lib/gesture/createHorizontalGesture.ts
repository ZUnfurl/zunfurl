import {
  getDefaultGesturePlatform,
  getHorizontalGesturePolicy,
} from "./gesturePresets";
import type {
  CreateHorizontalGestureOptions,
  GestureAxis,
  GestureCommitDirection,
  GesturePhase,
  HorizontalGestureCommitDecision,
  HorizontalGestureController,
  HorizontalGestureSnapshot,
  HorizontalGesturePolicy,
} from "./types";

const DEFAULT_INTERACTIVE_SELECTOR =
  "a, button, input, textarea, select, [contenteditable='true']";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function createSnapshot(
  mode: HorizontalGestureSnapshot["mode"],
  platform: HorizontalGestureSnapshot["platform"],
): HorizontalGestureSnapshot {
  return {
    mode,
    platform,
    phase: "idle",
    pointerId: null,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    deltaX: 0,
    deltaY: 0,
    absDeltaX: 0,
    absDeltaY: 0,
    previewOffset: 0,
    velocityX: 0,
    moved: false,
  };
}

function resolvePagedCommit(
  snapshot: HorizontalGestureSnapshot,
  policy: HorizontalGesturePolicy,
): HorizontalGestureCommitDecision {
  const distanceCommit = snapshot.absDeltaX >= policy.pagedCommitDistance;
  const velocityCommit = Math.abs(snapshot.velocityX) >= policy.pagedCommitVelocity;

  if (!distanceCommit && !velocityCommit) {
    return {
      direction: null,
      shouldCommit: false,
    };
  }

  let direction: GestureCommitDirection | null = null;

  if (snapshot.deltaX < 0) {
    direction = "next";
  } else if (snapshot.deltaX > 0) {
    direction = "previous";
  }

  return {
    direction,
    shouldCommit: direction !== null,
  };
}

export function createHorizontalGesture(
  element: HTMLElement,
  options: CreateHorizontalGestureOptions = {},
): HorizontalGestureController {
  const platform = options.platform ?? getDefaultGesturePlatform();
  const mode = options.mode ?? "paged";
  const policy = getHorizontalGesturePolicy(platform, mode, options.policy);
  const interactiveSelector =
    options.interactiveSelector ?? DEFAULT_INTERACTIVE_SELECTOR;
  const snapshot = createSnapshot(mode, platform);

  let suppressClickUntil = 0;
  let lastPointerTime = 0;
  let lastPointerX = 0;

  const emitState = () => {
    options.onStateChange?.({ ...snapshot });
  };

  const setPhase = (phase: GesturePhase) => {
    snapshot.phase = phase;
    emitState();
  };

  const setPointerMetrics = (clientX: number, clientY: number) => {
    snapshot.currentX = clientX;
    snapshot.currentY = clientY;
    snapshot.deltaX = clientX - snapshot.startX;
    snapshot.deltaY = clientY - snapshot.startY;
    snapshot.absDeltaX = Math.abs(snapshot.deltaX);
    snapshot.absDeltaY = Math.abs(snapshot.deltaY);
    snapshot.previewOffset = clamp(
      snapshot.deltaX,
      -policy.maxPreviewOffset,
      policy.maxPreviewOffset,
    );
    snapshot.moved =
      snapshot.absDeltaX > policy.deadzone || snapshot.absDeltaY > policy.deadzone;
  };

  const resetTracking = () => {
    snapshot.pointerId = null;
    snapshot.startX = 0;
    snapshot.startY = 0;
    snapshot.currentX = 0;
    snapshot.currentY = 0;
    snapshot.deltaX = 0;
    snapshot.deltaY = 0;
    snapshot.absDeltaX = 0;
    snapshot.absDeltaY = 0;
    snapshot.previewOffset = 0;
    snapshot.velocityX = 0;
    snapshot.moved = false;
    lastPointerTime = 0;
    lastPointerX = 0;
    setPhase("idle");
  };

  const suppressClick = () => {
    suppressClickUntil = window.performance.now() + policy.clickSuppressionDuration;
  };

  const shouldSuppressClick = () => window.performance.now() < suppressClickUntil;

  const resolveAxisLock = (): GestureAxis | null => {
    if (snapshot.absDeltaX < policy.deadzone && snapshot.absDeltaY < policy.deadzone) {
      return null;
    }

    if (snapshot.absDeltaX > snapshot.absDeltaY * policy.axisLockRatio) {
      return "x";
    }

    if (snapshot.absDeltaY > snapshot.absDeltaX * policy.axisLockRatio) {
      return "y";
    }

    return null;
  };

  const onPointerDown = (event: PointerEvent) => {
    if (snapshot.pointerId !== null) {
      return;
    }

    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    const shouldIgnoreBySelector =
      event.target instanceof Element && event.target.closest(interactiveSelector);

    if (shouldIgnoreBySelector || options.shouldIgnoreTarget?.(event.target)) {
      return;
    }

    snapshot.pointerId = event.pointerId;
    snapshot.startX = event.clientX;
    snapshot.startY = event.clientY;
    snapshot.currentX = event.clientX;
    snapshot.currentY = event.clientY;
    snapshot.velocityX = 0;
    snapshot.moved = false;
    lastPointerTime = window.performance.now();
    lastPointerX = event.clientX;
    setPhase("tracking");
    options.onTrackingStart?.({ ...snapshot });
  };

  const onPointerMove = (event: PointerEvent) => {
    if (snapshot.pointerId !== event.pointerId) {
      return;
    }

    setPointerMetrics(event.clientX, event.clientY);

    if (snapshot.phase === "tracking") {
      const axis = resolveAxisLock();

      if (axis === null) {
        return;
      }

      options.onAxisLock?.(axis, { ...snapshot });

      if (axis === "y") {
        setPhase("locked-y");
        return;
      }

      element.setPointerCapture(event.pointerId);
      setPhase("locked-x");
      options.onDragStart?.({ ...snapshot });
    }

    if (snapshot.phase !== "locked-x") {
      return;
    }

    event.preventDefault();

    const now = window.performance.now();
    const elapsed = Math.max(now - lastPointerTime, 1);
    const stepDelta = event.clientX - lastPointerX;

    snapshot.velocityX = (stepDelta / elapsed) * 16;
    lastPointerTime = now;
    lastPointerX = event.clientX;

    options.onDragMove?.({ ...snapshot });
  };

  const completeDrag = (cancelled: boolean) => {
    if (snapshot.phase === "locked-x") {
      const commit = resolvePagedCommit(snapshot, policy);

      if (snapshot.absDeltaX >= policy.clickSuppressionDistance) {
        suppressClick();
      }

      setPhase("settling");

      if (cancelled) {
        options.onCancel?.({ ...snapshot });
      } else {
        options.onSettleStart?.({ ...snapshot });
        options.onDragEnd?.({ ...snapshot }, commit);
      }
    } else if (cancelled) {
      options.onCancel?.({ ...snapshot });
    }

    resetTracking();
  };

  const releasePointerCapture = (pointerId: number) => {
    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  };

  const onPointerUp = (event: PointerEvent) => {
    if (snapshot.pointerId !== event.pointerId) {
      return;
    }

    releasePointerCapture(event.pointerId);
    completeDrag(false);
  };

  const onPointerCancel = (event: PointerEvent) => {
    if (snapshot.pointerId !== event.pointerId) {
      return;
    }

    releasePointerCapture(event.pointerId);
    completeDrag(true);
  };

  const onLostPointerCapture = () => {
    if (snapshot.pointerId === null) {
      return;
    }

    completeDrag(false);
  };

  const onClickCapture = (event: MouseEvent) => {
    if (!shouldSuppressClick()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  };

  element.addEventListener("pointerdown", onPointerDown);
  element.addEventListener("pointermove", onPointerMove);
  element.addEventListener("pointerup", onPointerUp);
  element.addEventListener("pointercancel", onPointerCancel);
  element.addEventListener("lostpointercapture", onLostPointerCapture);
  element.addEventListener("click", onClickCapture, true);

  return {
    destroy() {
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", onPointerUp);
      element.removeEventListener("pointercancel", onPointerCancel);
      element.removeEventListener("lostpointercapture", onLostPointerCapture);
      element.removeEventListener("click", onClickCapture, true);
    },
    getPolicy() {
      return { ...policy };
    },
    getSnapshot() {
      return { ...snapshot };
    },
    suppressClick,
    shouldSuppressClick,
  };
}