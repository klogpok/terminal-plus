# Coding standards

Judgement calls for review. Mechanical rules (core's forbidden imports, Russian text only in the two strings modules) are enforced by `eslint.config.js`; that file is their source of truth, and `pnpm check` runs it.

## User-facing errors

The user is not a programmer. Every error they see says in plain language (English by default, Russian) what happened and what to press. Technical detail (codes, paths, stack traces, English messages) sits behind the "Details" fold-out in the web UI (`dp-error-message`) or the "Подробности" button in desktop dialogs. Flag an error whose main text carries jargon, an exit code without explanation, or text hard-coded outside the strings modules, and an error that leaves the user without a next step.

## One reason to change

A module changes for one reason. When a feature adds a block to `core` with its own state and rules (as Sessions and port conflicts did), it gets its own module behind a narrow host interface, and `DevPanelCore` delegates to it. Flag a change that grows `core.ts` with a self-contained block, or a module that now changes for two unrelated reasons.

## Timing-based tests

Tests run real processes, so timings race. Keep a margin of at least 2–3× between fixture timings and the core timings they race against (a fixture that must outlive `livenessMs` lives well beyond it; one that must be caught before a timeout reacts well inside it). Wait on observable state (`waitForStatus`, a matching event, a polled file) instead of fixed sleeps. Flag a fixed `sleep` used as synchronisation, and timings closer than 2×.

## Names

Names use the vocabulary of `GLOSSARY.md` (Repo, Service, Session, Orphan, Readiness, Repo Config, Local Config, Exit…). Flag a synonym for a glossary term (`project` for Repo, `zombie` in new code for Orphan, `task` for Service), and a new domain concept that is missing from the glossary.
