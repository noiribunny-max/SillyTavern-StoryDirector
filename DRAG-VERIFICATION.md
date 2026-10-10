# Eule drag verification

Eule's visible HUD belongs to SillyTavern-StoryDirector, not the Inventar integration adapter. Work started from clean main dd6ca3b3a6353b690f26c8baae2117b413ce2179. GitHub's main matched this commit; no remote develop existed when checked. Changes are on local develop only.

## Findings before changes

- setupDraggable referenced toggle, which is local to other functions. Pointerdown therefore encounters an unbound variable before pointer capture; movement also references it.
- Each pointermove measured layout and immediately wrote position, creating unnecessary work at high input rates.
- Toggle and panel header inherited touch-action: pan-y, allowing the browser to take over a vertical touch gesture and cancel the pointer stream.
- No active pointer ID filtering, lostpointercapture handling, blur/visibility handling or listener disposal existed.

## Change

Use element ID to identify the toggle, track one primary pointer, capture on pointerdown, and use window event listeners as fallback if capture is unavailable. Cache dimensions at gesture start and write the latest position once per animation frame. Flush final pointerup coordinates before existing snapToEdge/saveHudPosition. Retain the HUD storage key/schema, edge snapping and tap-to-open/drag-click suppression. Ignore panel header controls. Touch-action is disabled only on the toggle/header; panel content keeps vertical scrolling.

Cancel pending frames and release capture on cancellation, capture loss, missing mouse release, focus/visibility loss and disposal. Clear active state before capture release. Removing either HUD element disconnects the removal observer and drag listeners. Storage failure leaves the drag service usable and logs no stored content.

## Validation

`node --test tests/*.test.mjs`: 15 passed, 0 failed. Includes 12 new drag checks and all 3 existing generation/action/settings test files. Tests use simulated DOM, events, animation frames, capture and storage; they verify fast movement, final position/reload, mobile bounds, multiple pointers, fallback, taps, click suppression, cancellations, repeated drags, controls and disposal. CSS checks verify drag surfaces and panel scrolling configuration. `git diff --check` passed.

No real SillyTavern, physical touchscreen, Termux or browser performance test was performed. In-app checks remain useful: fast diagonal drags outside Eule; dragging the panel header; tapping Eule; panel scrolling; close button; reload after saving; switching apps during a drag. No provider calls or RPG state writes were introduced. Inventar develop b03bdacd6fbf63834e0c4afa680da4b35d5798f2 and both main branches were left unchanged.
