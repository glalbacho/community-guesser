// Finger swipes on the three-screenshot image viewer. Kept separate from
// keyboard arrows and timeline dragging; never prevents normal page scrolling.
(() => {
  "use strict";
  window.COMMUNITY_ATTACH_SWIPE = (element, activeRound, onSwipe) => {
    let start = null;
    element.addEventListener("touchstart", event => {
      const round = activeRound();
      if (!round || event.touches.length !== 1) {
        start = null;
        return;
      }
      const touch = event.touches[0];
      start = {identifier:touch.identifier,x:touch.clientX,y:touch.clientY,round};
    },{passive:true});
    element.addEventListener("touchmove", event => {
      // A second finger means pinch/zoom, not screenshot navigation.
      if (start && event.touches.length !== 1) start = null;
    },{passive:true});
    element.addEventListener("touchend", event => {
      const gesture = start;
      start = null;
      if (!gesture || event.touches.length !== 0 || activeRound() !== gesture.round) return;
      const touch = Array.from(event.changedTouches)
        .find(item => item.identifier === gesture.identifier);
      if (!touch) return;
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;
      // Require a deliberate, predominantly horizontal gesture. Vertical
      // swipes still scroll the page, and taps never change screenshots.
      if (Math.abs(dx) < 45 || Math.abs(dx) < 1.3 * Math.abs(dy)) return;
      onSwipe(dx < 0 ? 1 : -1);
    },{passive:true});
    element.addEventListener("touchcancel", () => { start = null; },{passive:true});
  };
})();
