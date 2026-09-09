# ManTur instructions for Claude Code

`AGENTS.md` is the canonical shared project memory. Read and follow it before
starting work, then read the linked reference documents relevant to the task.

Claude-specific additions:

- Load the applicable path-scoped rules from `.claude/rules/`.
- Use an appropriate repository subagent from `.claude/agents/` when it is
  available and useful.
- The vendored resources in `.claude/skills/` are Claude-specific capabilities;
  they supplement, but never override, `AGENTS.md`.

The complete pre-migration memory is preserved in `docs/project-history.md`.
