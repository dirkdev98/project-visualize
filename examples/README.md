# Examples

Start with a complete report such as [Observatory](observatory.json),
[a notebook](notebook.json) or [linked observations](linked-observatory.json).
Adapt the structured source and render it through the CLI:

```sh
bin/visualize render --project examples --artifact observatory \
  --file examples/observatory.json
```

The [widget sources](widgets/) isolate each widget and its useful variations:
chart and diagram kinds, status tones, linked data, empty results, image fitting and
layout compositions. Each document contains fictional data and stable widget IDs.

Browse their [generated exports](exports/linux/index.md). Each example has light and
dark output at desktop and phone widths, in interactive HTML, PNG and PDF. Download
an HTML file to explore it offline. PNG and PDF capture the initial view with details
expanded. CI generates this catalogue in the Linux container so updates use a consistent rendering environment.

See the [artifact guide](../docs/artifacts.md) for the data format and
[development guide](../docs/development.md#example-exports) to regenerate exports
or review a rendering difference.
