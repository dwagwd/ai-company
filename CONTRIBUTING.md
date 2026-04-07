# Contributing

Thanks for helping improve Local AI Operator.

## Before you send a change

1. Install dependencies with `npm install`.
2. Run the test suite with `npm test`.
3. Run the production build with `npm run build`.
4. Keep user-facing strings in English first, then add Traditional Chinese translations.
5. Avoid hardcoded machine paths or silent current-directory fallbacks.
6. Add regression tests for any behavior change in the orchestration loop, provider layer, or UI state.

## Project conventions

- Keep the default workspace neutral and path-free.
- Command and shell execution require an explicit workspace path.
- Scripted and simulated modes should stay safe and self-contained by default.
- If you add a new UI label, update `src/core/locales.js` for both locales.
- If you add a new workspace or task field, update the normalizers in `src/core/defaultState.js` and the relevant tests.

## Pull requests

- Keep changes focused.
- Include a short summary of the behavior change and how it was verified.
- Prefer small follow-up patches over broad refactors unless the refactor is the actual goal.

## 繁體中文

感謝你協助維護這個專案。

- 送出前請先跑 `npm test` 和 `npm run build`
- 新增 UI 字串時，請同時更新英文與繁體中文
- 不要把本機路徑或 current directory fallback 寫進預設值
