# Code Explainer

Code Explainer is a VS Code extension scaffold for branch-aware code comprehension.

## Planned capabilities

- Explain the current repository structure and likely workflows
- Compare the current branch with `main`
- Explain the current selection with surrounding context
- Trace relationships between files, symbols, tests, and configuration
- Generate a reviewable GitHub PR title and description for the current branch

## Generate PR Descriptions

Use `Code Explainer: Generate PR Description` to create a reviewable PR title and description for the current branch.

The extension will:

- ask you to choose a PR description style before generating the first draft
- analyze the current branch relative to your configured base branch
- show the generated title and description in an editable Code Explainer panel
- render a live markdown preview so you can see how the description should look on GitHub
- ask for confirmation before publishing the branch, creating a PR, or updating an existing PR

If the branch has no edits compared with the base branch, the extension will not generate a description and will instead tell you that there is nothing to describe yet.

### How to Customize PR Style

You can customize PR generation in two ways:

- pick a style for the current run:
  - `Business stakeholder`
  - `Code collaborator`
  - `Manager`
  - `Other`
- add one-off custom instructions in the PR description panel before regenerating

You can also set defaults in editor settings:

```json
{
  "codeExplainer.prDescription.defaultStyle": "manager",
  "codeExplainer.prDescription.defaultGuidelines": "Call out user impact, risks, and test coverage.",
  "codeExplainer.prDescription.defaultTemplate": "## Summary\n## User Impact\n## Risks\n## Testing"
}
```

Per-run instructions from the panel override the saved defaults for that generation pass.

## Development

```bash
npm install
npm run build
```

Then press `F5` in VS Code to launch the extension development host.
