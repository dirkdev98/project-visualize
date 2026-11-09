# Project Visualize

Project Visualize lets agents create visualizations and artifacts for people to inspect
in a native desktop app.

## Product

- Organize work into projects with versioned artifacts.
- Provide a desktop viewer, a CLI for agents to drive artifact creation, and an agent
  skill that teaches the workflow.
- Support a broad range of widgets and layout compositions.
- Export artifacts and whole widgets as PNG, PDF and interactive HTML.

## Stack

- Use Maligator for the application and CLI.
- File a focused issue in `dirkdev98/maligator` for every Maligator limitation that
  needs a workaround, without naming this project, and track it in the gitignored
  `mal_workarounds.md` as `maligator-bump` describes. The decision log alone is never
  rechecked.
- Build a native desktop app with [wgpu](https://wgpu.rs/) through
  [wgpu-native](https://github.com/gfx-rs/wgpu-native).

## Development

- Keep artifact creation and export accessible through the CLI so agents can complete
  the workflow without manual interaction with the viewer.
- Preserve saved artifact versions when creating revisions.
- Keep the viewer and exports consistent in content and layout.
