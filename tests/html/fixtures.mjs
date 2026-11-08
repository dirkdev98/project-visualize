import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PNG } from "pngjs";

export function fixtures(directory) {
  const examples = readdirSync(resolve("examples"))
    .filter((file) => file.endsWith(".json"))
    .map((file) => ({
      name: file.slice(0, -5),
      document: JSON.parse(readFileSync(resolve("examples", file), "utf8")),
    }));
  const image = new PNG({ width: 180, height: 90 });
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const at = (y * image.width + x) * 4;
      image.data[at] = Math.round((x / image.width) * 220);
      image.data[at + 1] = Math.round((y / image.height) * 200);
      image.data[at + 2] = 130;
      image.data[at + 3] = 255;
    }
  const file = directory ? join(directory, "image.png") : "";
  if (directory) writeFileSync(file, PNG.sync.write(image));
  const linked = linkedFixture();
  return [
    ...examples,
    {
      name: "images-and-layout",
      document: {
        schemaVersion: 1,
        type: "document",
        title: "Field notes",
        assets: { sample: file },
        body: [
          {
            type: "text",
            id: "intro",
            content:
              "Fictional observations with selectable text and native browser controls.",
          },
          {
            type: "row",
            id: "weighted",
            weights: [1, 2],
            children: [
              {
                type: "card",
                title: "Narrow card",
                children: [{ type: "metric", label: "Accepted", value: 17 }],
              },
              {
                type: "card",
                title: "Wide card",
                children: [
                  {
                    type: "text",
                    content:
                      "Longer notes wrap within their card at each supported width.",
                  },
                ],
              },
            ],
          },
          {
            type: "row",
            children: [
              { type: "image", asset: "sample", caption: "Natural size" },
              {
                type: "image",
                asset: "sample",
                height: 140,
                fit: "contain",
                caption: "Contain",
              },
              {
                type: "image",
                asset: "sample",
                height: 140,
                fit: "cover",
                caption: "Cover",
              },
            ],
          },
          { type: "spacer", height: 20 },
          { type: "divider" },
          {
            type: "details",
            title: "Retained detail",
            children: [
              {
                type: "text",
                content: "Details begin expanded in each export.",
              },
            ],
          },
        ],
      },
    },
    {
      name: "chart-edge-cases",
      document: {
        schemaVersion: 1,
        type: "dashboard",
        title: "Observation distributions",
        body: [
          {
            type: "chart",
            id: "scatter",
            title: "Repeated measurements",
            kind: "scatter",
            xLabel: "Time",
            yLabel: "Value",
            series: [
              { name: "Cedar", values: [3, -1, 5, 3], x: [0, 2, 2, 8] },
              { name: "Birch", values: [2], x: [5] },
            ],
          },
          {
            type: "chart",
            kind: "bar",
            title: "Sparse categories",
            labels: [
              "First station with a long name",
              "Second station with a long name",
              "Third station with a long name",
            ],
            series: [
              { name: "Morning", values: [3, -2], x: [0, 2] },
              { name: "Evening", values: [1, 0], x: [1, 2] },
            ],
          },
          {
            type: "chart",
            kind: "area",
            title: "Signed area",
            series: [{ name: "Change", values: [-2, 3, -1, 4] }],
          },
          {
            type: "chart",
            kind: "line",
            title: "Single observation",
            series: [{ name: "One", values: [7] }],
          },
          {
            type: "chart",
            kind: "bar",
            title: "Observed zeros",
            labels: ["Cedar", "Birch", "Maple"],
            series: [{ name: "Zero", values: [0, 0, 0] }],
          },
        ],
      },
    },
    {
      name: "controls-and-empty-data",
      document: {
        ...linked,
        title: "Linked controls and empty views",
        datasets: { ...linked.datasets, empty: [] },
        body: [
          ...linked.body,
          {
            type: "chart",
            kind: "line",
            title: "No matching observations",
            source: { dataset: "empty", x: "station", y: "amount" },
          },
          {
            type: "histogram",
            title: "No distribution observations",
            source: { dataset: "empty", field: "amount" },
          },
          {
            type: "heatmap",
            title: "Missing observations",
            x: ["Morning", "Evening"],
            y: ["North", "South"],
            values: [
              [null, 0],
              [null, null],
            ],
          },
        ],
      },
    },
  ];
}

export function linkedFixture() {
  return {
    schemaVersion: 1,
    type: "dashboard",
    title: "Fictional station review",
    datasets: {
      observations: [
        { station: "Cedar", amount: 12, segment: 1, active: true },
        { station: "Birch", amount: 2, segment: "1", active: false },
        { station: "Maple", amount: 100, segment: null, active: true },
      ],
    },
    body: [
      {
        type: "row",
        children: [
          {
            type: "control",
            id: "segment",
            kind: "select",
            label: "Segment",
            dataset: "observations",
            field: "segment",
          },
          {
            type: "control",
            id: "search",
            kind: "search",
            label: "Find station",
            dataset: "observations",
            field: "station",
          },
          {
            type: "control",
            id: "active",
            kind: "toggle",
            label: "Active only",
            dataset: "observations",
            field: "active",
          },
          {
            type: "control",
            id: "amount",
            kind: "range",
            label: "Amount range",
            dataset: "observations",
            field: "amount",
          },
        ],
      },
      {
        type: "metric",
        id: "total",
        label: "Total amount",
        source: { dataset: "observations", field: "amount", aggregate: "sum" },
      },
      {
        type: "chart",
        id: "comparison",
        title: "Segment comparison",
        kind: "bar",
        select: "segment",
        source: {
          dataset: "observations",
          x: "segment",
          y: "amount",
          aggregate: "sum",
        },
      },
      {
        type: "table",
        id: "records",
        title: "Station records",
        dataset: "observations",
        columns: [
          { key: "station", label: "Station" },
          { key: "amount", label: "Amount" },
          { key: "segment", label: "Segment" },
        ],
      },
      {
        type: "text",
        content: "Select this complete sentence with a triple click.",
      },
    ],
  };
}
