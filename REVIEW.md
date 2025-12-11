# Project Review

## Summary
- Manifest v3 Chrome extension that adds the current page or YouTube items to NotebookLM, including queueing and context-menu shortcuts.

## Strengths
- Covers multiple entry points (popup, context menus, background) with clear separation of concerns.
- Handles YouTube playlists by expanding videos and batches queued URLs for NotebookLM.
- Uses badge notifications and cached notebook lists to give lightweight feedback to users.

## Findings / Risks
1) Host permissions are very broad (`https://*/*`). Narrowing them to the minimum needed domains would reduce exposure.
2) There is no linting or automated test setup, so regressions would be hard to catch.
3) `popup.js` enqueues playlist items with the type `youtube-video`, while the rest of the code uses `youtube_video` naming. Normalizing the type constant would avoid future branching bugs.

## Recommendations
- Introduce basic linting (e.g., ESLint) and a lightweight test harness for critical flows (queue add/process, notebook cache refresh).
- Normalize type strings across popup/background code and document the accepted values.
- Reduce host permissions to the specific domains required by the extension where possible.

## Testing
- No automated tests or lint commands were present in the repository, so none were run.
