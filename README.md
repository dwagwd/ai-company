# Local AI Operator

A local-first, bilingual operator console for long-running AI work. The app is designed to sit on the user's machine, keep a queue moving, separate worker and reviewer roles, and gate risky actions behind explicit approval.

## What ships in this repo

- Electron desktop shell
- React renderer with English default and Traditional Chinese secondary language
- Persistent orchestration state stored in the user's local data directory
- Scripted provider and simulated runner for out-of-the-box behavior
- Generic command provider and shell runner for integrating external CLIs
- Multi-workspace picker with per-workspace provider / runner defaults
- Editable task templates per workspace from the UI
- Unit tests for localization, policy gates, and the orchestration loop
- Open-source docs for contribution and security guidance
- GitHub Actions CI and issue / pull-request templates

## Run it

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start development mode:

   ```bash
   npm run dev
   ```

3. Build the renderer for production:

   ```bash
   npm run build
   ```

4. Launch the packaged desktop app after building:

   ```bash
   npm start
   ```

## Integration model

The default behavior is intentionally safe and self-contained:

- `providerMode = scripted` generates a built-in worker/reviewer plan
- `runnerMode = simulated` gives the system a working local loop without external tools
- `providerMode = command` requires an explicit workspace path and lets you plug in a JSON wrapper such as `node scripts/codex-provider.mjs`; the app treats fallback envelopes as failures, so you can tell when Codex did not actually run
- `runnerMode = shell` requires an explicit workspace path and runs a real shell command for each step
- The starter workspace is neutral and starts without a path, and the Settings panel lets you switch workspaces, import another folder, and edit the task template without touching code
- Set `AI_OPERATOR_CODEX_BINARY` if you want the provider wrapper to target a specific Codex binary; otherwise it uses `codex` from `PATH`

That means the app works immediately, but can later be pointed at Codex CLI, Claude Code, Gemini CLI, or a custom wrapper.

## Safety model

- Self-editing is disabled by default
- High-risk actions can be forced through a manual approval gate
- Permissions are configurable per workspace
- The app keeps a persistent log of tasks, approvals, and memory summaries

## Bilingual policy

- English is the primary UI language
- Traditional Chinese is the secondary locale
- The UI opens in English by default and can switch to 繁體中文 from the top bar
- Static labels are routed through an i18n dictionary

## Notes in Chinese

這是一個本機優先的 AI 編排器雛形。

- 預設用模擬 provider / runner，開箱即可看到完整流程
- 之後可以把 `providerMode` 切到 `command`，接任何 CLI；`command` 與 `shell` 模式都需要先選 workspace path
- 預設工作區是中性的，沒有預設路徑；你可以從 Intake 面板匯入任何資料夾，再把範本改成 Codex-backed 任務
- 高風險動作和核心自修改都會先經過權限與審批

## Repository Docs

- [LICENSE](LICENSE)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [SECURITY.md](SECURITY.md)
