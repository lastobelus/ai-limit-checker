# Security Hardening + Isolated Runtime Root Plan

## Objective
Make `ai-limit-checker` safer to run with real provider credentials by removing risky behavior, minimizing inherited environment, and running provider interactions from an isolated configurable directory.

This plan is written for a clean-context implementation agent.

## Required Outcomes
- Remove unexpected data persistence and over-permissive provider invocation.
- Add config loading from `~/.config/ai-limit-checker/`.
- Refactor runtime so provider clients execute from a configurable runtime root instead of implicit project CWD.
- Set up restrictive `direnv` env management at:
- `/Users/lasto/clients/lastobelus-2025/.ai-limit-checker-root`
- Preserve core UX: `ai-limit-checker --tools=...` still works.

## Key Security Recommendations To Implement
- Remove Claude debug writes to `/tmp`.
- Remove Gemini `--yolo` usage for stats collection.
- Do not pass full `process.env` into provider subprocesses.
- Use a filtered env allowlist for subprocesses.
- Stop fail-open behavior that reports `available` on provider failures.
- Introduce explicit failure/unknown status in output model.
- Make runtime working directory explicit and configurable.

## Scope
- In scope:
- `src/index.ts`
- `src/cli.ts`
- `src/config/env.ts` (or split into richer config module)
- `src/claude/client.ts`
- `src/gemini/client.ts`
- `src/zai/client.ts`
- `README.md`
- Out of scope:
- New providers
- Rewriting provider CLIs/Playwright internals

## Configuration Design
Use a config file at:
- `~/.config/ai-limit-checker/config.json`

Suggested schema:

```json
{
  "runtimeRoot": "/Users/lasto/clients/lastobelus-2025/.ai-limit-checker-root",
  "inheritEnvAllowlist": [
    "HOME",
    "PATH",
    "SHELL",
    "TERM",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TMPDIR",
    "SSH_AUTH_SOCK",
    "CLAUDE_API_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY"
  ],
  "zai": {
    "userDataDir": "/Users/lasto/clients/lastobelus-2025/.ai-limit-checker-root/chrome-data",
    "outputDir": "/Users/lasto/clients/lastobelus-2025/.ai-limit-checker-root/chrome-output"
  },
  "timeoutsMs": {
    "claude": 30000,
    "gemini": 30000,
    "zai": 45000
  }
}
```

Notes:
- Keep format strict JSON (no comments) unless project already supports JSONC parsing.
- Validate absolute paths and ensure required dirs exist or create safe defaults under `runtimeRoot`.

## Runtime Refactor Plan
1. Add config loader + validator.
2. Build a `RunContext` object containing:
- `cwd`
- filtered `env`
- per-provider timeouts
3. Pass `RunContext` into Claude/Gemini/Zai clients.
4. Update subprocess launches to use `RunContext.cwd` and `RunContext.env`.
5. For z.ai, wire config-driven Chrome dirs and validate directory boundaries.

## Provider-Specific Changes

### Claude (`src/claude/client.ts`)
- Remove:
- writes to `/tmp/claude-debug-output.txt`
- writes to `/tmp/claude-debug-cleaned.txt`
- Keep parsing logic, but add stricter timeout/error paths.

### Gemini (`src/gemini/client.ts`)
- Change spawn args from `['--yolo']` to minimal safe args required for interactive stats retrieval.
- Keep `/stats` flow, but hard-fail on parse/interaction failures with explicit surfaced error state.

### Z.ai (`src/zai/client.ts`)
- Ensure persistent context uses configured dirs only.
- Validate and normalize configured paths.
- Preserve existing endpoint capture behavior unless broken by page changes.

## Status/Error Model
Current behavior fail-opens to `available` on errors. Replace with explicit failure state.

Proposed type:

```ts
type LimitStatus = 'available' | 'rate_limit_exceed' | 'error';
```

And include:
- `errorMessage?: string`
- `checkedAt: number`

If backward compatibility is mandatory, keep existing fields and add `errorMessage` while still returning a non-available status on failures.

## Restrictive direnv Setup (Required)
Create this file:
- `/Users/lasto/clients/lastobelus-2025/.ai-limit-checker-root/.envrc`

Behavior:
- Keep minimal safe env only.
- Unset everything else.
- Load provider secrets from a private file.
- Enforce required vars with `env_vars_required`.

Reference content:

```bash
strict_env

KEEP_VARS=(
  HOME PATH SHELL TERM LANG LC_ALL LC_CTYPE USER LOGNAME TMPDIR SSH_AUTH_SOCK
)

while IFS= read -r v; do
  case "$v" in
    DIRENV_*) ;;
    *)
      keep=false
      for k in "${KEEP_VARS[@]}"; do
        [[ "$v" == "$k" ]] && keep=true && break
      done
      $keep || unset "$v"
      ;;
  esac
done < <(compgen -e)

dotenv_if_exists .envrc.private
env_vars_required ANTHROPIC_API_KEY GEMINI_API_KEY
```

Also add:
- `/Users/lasto/clients/lastobelus-2025/.ai-limit-checker-root/.gitignore`
- entries for `.envrc.private`, `chrome-data/`, `chrome-output/`, logs/artifacts.

## Implementation Steps (Execution Order)
1. Create config module and tests for parsing/validation.
2. Introduce `RunContext` and thread through all providers.
3. Remove Claude `/tmp` writes.
4. Remove Gemini `--yolo` and update interaction handling.
5. Implement explicit provider error status in `src/index.ts` aggregation.
6. Update z.ai client to consume validated config dirs.
7. Write/setup restrictive `.envrc` in the dedicated runtime root.
8. Update docs (security model + runtime root setup + config path).
9. Run build/tests and perform manual smoke checks using `direnv exec`.

## Validation Checklist
- `npm run build` passes.
- Any added tests pass.
- No writes to `/tmp/claude-debug-*`.
- Gemini invocation no longer includes `--yolo`.
- Subprocesses run under configured runtime root, not repo CWD.
- Filtered env behavior verified in tests.
- Provider failures surface explicit error status.
- Manual command works from isolated env:
- `direnv exec /Users/lasto/clients/lastobelus-2025/.ai-limit-checker-root ai-limit-checker --tools=claude,gemini,zai`

## Risks
- Overly strict env filtering may break provider CLIs until allowlist is tuned.
- Status model change may require downstream consumers to adapt.
- z.ai UI/API changes can break selector/response assumptions.

## Deliverables
- Hardened runtime behavior across all three providers.
- Configurable runtime root via `~/.config/ai-limit-checker/config.json`.
- Restrictive direnv setup in dedicated root.
- Updated docs and tests proving hardening behavior.
