# Local validation - 18 November 2026

These results cover the working-tree changes after commit 02a097b. They are local checks, not a hosted deployment or GitHub Actions result.

## Automated checks

- `npm test`: all 54 named tests passed, together with the rules/scoring assertions in `tests/rules.test.js`.
- Coverage includes ordered discard approval, first refusal, buying exactly one discard plus one penalty card, unchanged turn order, stale approvals, cancellation/disconnection, touch-pointer selection/reordering, hand privacy, joker replay, automatic set closure, invites, round history and winner announcements.
- `git diff --check`: passed.

## Live server checks

With an owned local server on port 3010, `node tests/multiplayer.integration.js` passed using four actual, independent WebSocket clients (Node 22+).

Observed: 1/2/3/4-player lobby broadcasts; joins during the lobby; seat 1/2/3/4/1 turn progression; draw/discard; seat 2 requesting a discard after seat 3; approvals from seats 4 then 1; exactly two cards delivered after approval; normal pickup by the next player without a penalty; disconnect/rejoin with saved hands; hidden opponent faces.

## Browser checks

Used the in-app Chromium browser and independent loopback origins to isolate each player's localStorage. These were actual game sessions, not injected game-state fixtures.

- One-player lobby and separate two-, three- and four-player games.
- Live joining, turn changes, draw-pile pickup, discard-pile pickup, card selection, discard, playing opening and later melds, and the coming-down restriction.
- Four-player buy request: Jo passed, Dean passed, and Alex received exactly two cards while Jo retained the turn.
- A second request let the current player take the discard normally: hand increased by one and deck count did not change.
- Browser navigation away/rejoin updated connection indicators and retained the saved hand.
- Pointer drag reordered cards without selecting them; keyboard card selection and opening/closing Points also worked.
- Non-host browser had no Settings button.
- Points table showed player columns and all seven round rows. Player nameplates showed no points.

Actual responsive iframe viewports were used because the browser's top-level viewport override did not change the visible panel dimensions:

| Viewport | Observation |
| --- | --- |
| 1280 x 800 | Four seats, hand, piles and actions visible; no page overflow or pile/seat intersections |
| 844 x 390 | Same checks passed |
| 667 x 375 | Same checks passed |
| 568 x 320 | Same checks passed; approval controls stayed inside the action bar |
| 568 x 280 | Same checks passed with compact cards for browser-bar-sized heights |
| 320 x 568 | Rotate prompt shown; resizing the same iframe back preserved the exact 13-card hand |

A separate live three-player round produced three real melds. At 568 x 320 they stayed beside the shared piles; the meld area measured 128px client height and 128px scroll height. Longer/larger boards retain scrolling inside the meld area.

Screenshots are saved in the chat's visualization folder, not committed into this repository.

## Limits

No physical iOS/Android hardware was controlled. Touch pointer handlers have automated coverage, while browser reordering used a pointer drag. Real device notches, browser bars and mobile Safari still need physical-device confirmation. No hosted deployment was tested and no issue was closed. Publication of these changes is tracked in Git history.

## Repeat the responsive check

Start the server with `PORT=3010 npm start` in a POSIX shell, or `$env:PORT = '3010'; npm start` in PowerShell. Open `http://localhost:3010/tests/viewport.html?width=568&height=320`; its rotation button resizes the existing game iframe without reloading it.

## Automatic board scaling follow-up

The board surface now uses a larger virtual canvas scaled back into the existing table slot. The local hand, main action bar, room setup and winner announcement remain outside that transform. Interactive piles and meld controls compensate for the transform with a nominal 45px minimum target; measured pile widths at the smallest scale were approximately 44.99px.

The same live four-player game was checked at 568 x 280, 568 x 320, 667 x 375, 844 x 390, 1024 x 600 and 1280 x 800. Measured board scales were 0.84, 0.84, 0.84, 0.88, 0.94 and 1 respectively. All seats and actions remained in bounds; page dimensions matched each viewport; pile/seat rectangles did not intersect. Hand cards stayed at their independent responsive sizes (44 x 44 on the shortest viewport, 44 x 58 at 320px height).

Clicking a transformed draw pile, selecting a hand card and discarding advanced the live turn to Alex. Rotating the same iframe to portrait displayed the prompt, and rotating back retained the exact hand. The automated suite still passed all 54 named tests, and the live four-client integration check passed before publication.
