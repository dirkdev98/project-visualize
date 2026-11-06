# Project Visualize

Project Visualize lets agents create visualizations and artifacts for people to inspect
in a native desktop app.

## Product

- Organize work into projects with versioned artifacts.
- Provide a desktop viewer, a CLI for agents to drive artifact creation, and an agent
  skill that teaches the workflow.
- Support a broad range of widgets and layout compositions.
- Export artifacts as PNG and PDF.

## Stack

- Use Maligator for the application and CLI.
- Build a native desktop app with [wgpu](https://wgpu.rs/) through
  [wgpu-native](https://github.com/gfx-rs/wgpu-native).

## Development

- Keep artifact creation and export accessible through the CLI so agents can complete
  the workflow without manual interaction with the viewer.
- Preserve saved artifact versions when creating revisions.
- Keep the viewer and exports consistent in content and layout.
