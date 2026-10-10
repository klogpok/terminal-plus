## Project

- Architecture, adding a command or event, running, test harness, Windows gotchas: `docs/architecture.md`.
- `pnpm check` (typecheck, lint, tests) must pass before you hand work back; the pre-commit hook runs its typecheck + lint part.
- Reviewing code: apply `CODING_STANDARDS.md`.

## Agent skills

### Issue tracker

Issues and specs are local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
