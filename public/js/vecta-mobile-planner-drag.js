// The list can be refreshed in place. Bind once and resolve cards at touch time.
window.bindMobilePlannerDrag = function (planner, actions) {
  if (planner.dataset.touchReorder) return;
  planner.dataset.touchReorder = '1';
  const cardSelector = '.mobileJob[data-open-job]';
  planner.style.webkitTouchCallout = 'none';
  planner.querySelectorAll(cardSelector).forEach(card => { card.style.webkitUserSelect = 'none'; });
  let drag, timer, frame, marker, destination;
  function lane(group) {
    return group?.querySelector('.mobileGroupHead span')?.textContent.trim();
  }
  function reset() {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    marker?.remove();
    if (drag) {
      drag.card.style.removeProperty('opacity');
      actions.busy(false);
    }
    drag = marker = destination = null;
  }
  function paint() {
    destination = null;
    marker.hidden = true;
    const group = document.elementFromPoint(drag.x, drag.y)?.closest('.mobileGroup');
    if (!group || !planner.contains(group) || !actions.lanes.includes(lane(group))) return;
    const cards = Array.from(group.querySelectorAll(cardSelector)).filter(card => card !== drag.card);
    const before = cards.find(card => {
      const r = card.getBoundingClientRect();
      return drag.y < r.top + r.height / 2;
    });
    const edge = before || cards.at(-1) || group.querySelector('.mobileGroupHead');
    const rect = edge.getBoundingClientRect();
    Object.assign(marker.style, {left:rect.left+'px', width:rect.width+'px', top:(before ? rect.top : rect.bottom)+'px'});
    marker.hidden = false;
    destination = {tech:lane(group), beforeId:before?.dataset.openJob ?? null};
  }
  function tick() {
    if (!drag?.active) return;
    const step = drag.y < 60 ? -9 : drag.y > innerHeight-60 ? 9 : 0;
    if (step && drag.moved) window.scrollBy(0, step);
    paint();
    frame = requestAnimationFrame(tick);
  }
  planner.addEventListener('touchstart', e => {
    if (drag || e.touches.length !== 1) { reset(); return; }
    const card = e.target.closest(cardSelector);
    if (!card || e.target.closest('button,input,select,textarea,a,[role="button"]')) return;
    const source = card.closest('.mobileGroup');
    if (!actions.lanes.includes(lane(source)) && lane(source) !== 'Unallocated Jobs') return;
    const touch = e.touches[0];
    drag = {card, x:touch.clientX, y:touch.clientY, active:false, moved:false};
    actions.busy(true);
    timer = setTimeout(() => {
      drag.active = true;
      card.style.opacity = '0.55';
      marker = document.createElement('div');
      marker.style.cssText = 'position:fixed;height:4px;background:#ce1628;border-radius:3px;pointer-events:none;z-index:99999';
      document.body.appendChild(marker);
      tick();
    }, 2000);
  }, {passive:true});
  planner.addEventListener('touchmove', e => {
    if (!drag) return;
    const t = e.touches[0], distance = Math.hypot(t.clientX-drag.x,t.clientY-drag.y);
    if (e.touches.length !== 1 || (!drag.active && distance > 8)) { reset(); return; }
    if (!drag.active) return;
    if (!e.cancelable) { reset(); return; }
    e.preventDefault();
    drag.moved ||= distance > 3;
    drag.x = t.clientX; drag.y = t.clientY;
    paint();
  }, {passive:false});
  planner.addEventListener('touchend', e => {
    if (!drag) return;
    let move, id = drag.card.dataset.openJob;
    if (drag.active) {
      e.preventDefault();
      const t = e.changedTouches[0];
      drag.x = t.clientX; drag.y = t.clientY;
      paint();
      move = drag.moved && destination;
      const siblings = Array.from(drag.card.closest('.mobileGroup').querySelectorAll(cardSelector));
      if (move && move.tech === lane(drag.card.closest('.mobileGroup')) &&
          move.beforeId === (siblings[siblings.indexOf(drag.card)+1]?.dataset.openJob ?? null)) move = null;
    }
    reset();
    if (move) actions.move(id, move.tech, move.beforeId);
  }, {passive:false});
  planner.addEventListener('touchcancel', reset);
  planner.addEventListener('contextmenu', e => { if (drag) e.preventDefault(); });
};
