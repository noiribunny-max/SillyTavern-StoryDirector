# Eule drag verification

Eule's visible HUD belongs to SillyTavern-StoryDirector, not the Inventar integration adapter. The initial drag fix was published as 39243b9 on develop. The free-placement follow-up started from that clean develop, matching origin/develop. Changes are committed and published only on develop; main is not merged or modified.

## Findings before changes

- setupDraggable referenced toggle, which is local to other functions. Pointerdown therefore encounters an unbound variable before pointer capture; movement also references it.
- Each pointermove measured layout and immediately wrote position, creating unnecessary work at high input rates.
- Toggle and panel header inherited touch-action: pan-y, allowing the browser to take over a vertical touch gesture and cancel the pointer stream.
- No active pointer ID filtering, lostpointercapture handling, blur/visibility handling or listener disposal existed.

## Change

Use element ID to identify the toggle, track one primary pointer, capture on pointerdown, and use window event listeners as fallback if capture is unavailable. Cache dimensions at gesture start and write the latest position once per animation frame. Flush final pointerup coordinates before saving. Retain the HUD storage key/schema and tap-to-open/drag-click suppression. Ignore panel header controls. Touch-action is disabled only on the toggle/header; panel content keeps vertical scrolling.

The reported docking came from the existing snapToEdge function called on successful release, retained in 39243b9. That function and its call are removed. Placement now clamps only outside the visible viewport (including visualViewport offsets and dimensions on mobile); positions in the middle and near edges remain unchanged on release. Stable CSS/offset coordinates prevent temporary hover/pressed scaling from altering storage or the next gesture. Reload restores the saved position exactly unless it is outside the current viewport, in which case only the out-of-bounds coordinates are clamped. A viewport smaller than the HUD necessarily cannot contain the entire HUD; the origin remains accessible.

Cancel pending frames and release capture on cancellation, capture loss, missing mouse release, focus/visibility loss and disposal. Clear active state before capture release. Removing either HUD element disconnects the removal observer and drag listeners. Storage failure leaves the drag service usable and logs no stored content.

## Validation

`node --test tests/*.test.mjs`: 20 passed, 0 failed. Includes 17 drag checks and all 3 existing generation/action/settings test files. Tests use simulated DOM, events, animation frames, capture and storage; they verify fast movement, exact center placement with mouse and touch, final fractional release coordinates before a pending frame, reload, visible mobile viewport bounds, hover/pressed scaling, multiple pointers, fallback, taps, click suppression, cancellations, repeated drags, controls and disposal. CSS checks verify drag surfaces and panel scrolling configuration. `git diff --check` passed.

No real SillyTavern, physical touchscreen, Termux or browser performance test was performed. In-app checks remain useful: place Eule at the center, release and reload; fast diagonal drags outside Eule; dragging the panel header; tapping Eule; panel scrolling; close button; switching apps during a drag. No provider calls or RPG state writes were introduced. Changes are confined to StoryDirector.
