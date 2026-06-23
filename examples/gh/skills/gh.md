# gh — GitHub CLI skill

## When to use
Use the `gh` CLI tools for read-only GitHub operations: viewing pull requests,
listing issues, inspecting repositories. `gh` is already authenticated on this
host, so no extra credentials are needed.

## When NOT to use
- Writing/mutating data (creating PRs, merging) — not exposed in Phase 1.
- Operations on repos you don't have access to.

## Output
All `gh_*` tools request `--json` output. The ResultNormalizer parses stdout
into `parsed_output` so you can read structured fields directly.

## Common failures
- `BINARY_NOT_FOUND`: `gh` is not installed. Install from https://cli.github.com.
- `CLI_NOT_AUTHENTICATED`: run `gh auth login` locally and retry.
- `COMMAND_FAILED` with "could not find branch": check the PR number / branch.
