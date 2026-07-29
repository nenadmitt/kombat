/**
 * How long a native `Modal` needs to finish dismissing before another Modal
 * may be presented, or a screen pushed, over it.
 *
 * React Native's `Modal` is a real platform modal presentation. iOS wedges its
 * presentation stack if one is presented while another is still presenting or
 * animating out: the app keeps rendering but swallows every touch, and the
 * wedge follows the user across navigation - through a whole match and into
 * the result screen. See `claude/reports/OVERLAY_BLOCKED_ERROR.md`.
 *
 * Prefer a real dismissal signal where one exists (`Modal.onDismiss`,
 * `BottomSheet.onDismissed`, or `useConfirm()` which already resolves only
 * once its sheet is off screen). Use this delay when the trigger is a socket
 * event or an await with no dismissal callback to hang off.
 */
export const MODAL_DISMISS_MS = 350;
