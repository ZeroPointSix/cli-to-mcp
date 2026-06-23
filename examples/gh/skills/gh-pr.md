# gh pr / issue skills

## gh_pr_view
- Pass `number` for a specific PR, or omit to view the PR for the current branch.
- `json` field controls which fields are returned. Default covers the most
  useful fields; extend if you need labels, reviews, or commits.

## gh_pr_list
- Use `state` to filter: `open` (default), `closed`, `merged`, `all`.
- `limit` defaults to 30; raise it for broader scans but beware slow responses.

## gh_issue_list
- Same shape as `gh_pr_list` but for issues.
- `state` accepts `open`, `closed`, `all`.

## Interpreting results
Results come back as JSON in `parsed_output`. For list tools, `parsed_output`
is an array; for view tools, it's a single object.
