type MapPointerEventLike = {
  screenX: number;
  screenY: number;
  pointerId?: number;
};

export type MapNavigationPointerStart = {
  screenX: number;
  screenY: number;
  pointerId?: number;
};

export function beginMapNavigationPointer(event: MapPointerEventLike): MapNavigationPointerStart {
  return {
    screenX: event.screenX,
    screenY: event.screenY,
    pointerId: event.pointerId,
  };
}

export function shouldCompleteMapNavigationPointer(
  start: MapNavigationPointerStart | null,
  event: MapPointerEventLike,
) {
  if (!start) {
    return false;
  }
  if (
    start.pointerId !== undefined &&
    event.pointerId !== undefined &&
    start.pointerId !== event.pointerId
  ) {
    return false;
  }
  const [dx, dy] = [start.screenX - event.screenX, start.screenY - event.screenY];
  return Math.sqrt(dx * dx + dy * dy) <= 10;
}
