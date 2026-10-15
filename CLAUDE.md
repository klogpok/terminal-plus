## Project

- Architecture, adding a command or event, running, test harness, Windows gotchas: `docs/architecture.md`.
- `pnpm check` (typecheck, lint, tests) must pass before you hand work back; the pre-commit hook runs its typecheck + lint part.
- Reviewing code: apply `CODING_STANDARDS.md`.

## Effort scales with risk

- **Behaviour gets tests**: `packages/core`, `server`, `shared`, desktop, and `web` services/state (process lifecycle, config, events, transport). Tests may come first or alongside; they land in the same change.
- **Presentation gets a look, not a test**: layout, styling, copy, menu arrangement in `packages/web`. Verify by running the app.
- **Prototypes are throwaway**: no tests, no spec.
- **Planning matches size**: a fix or a UI tweak goes straight to code. A feature that spans packages or introduces a domain term starts with a spec in `.scratch/<feature>/` and grilling; the step ends when the user approves the spec, and only then does code begin.

## Agent skills

### Issue tracker

Issues and specs are local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
