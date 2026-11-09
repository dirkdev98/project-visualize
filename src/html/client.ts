import { ALL, isAll, parameterValue } from "../data.ts";
import type { ParameterValue } from "../model.ts";
import { defaultPlot } from "./charts.ts";
import {
  type HtmlPayload,
  htmlState,
  renderDocument,
  themeStyle,
} from "./render.ts";

const root = document.getElementById("visualize");
const source = document.getElementById("visualize-document");
if (!(root instanceof HTMLElement) || !source?.textContent)
  throw new Error("Missing saved visualization");
const host = root;
const payload: HtmlPayload = JSON.parse(source.textContent);
const state = htmlState(payload);
const canvas = document.createElement("canvas"),
  context = canvas.getContext("2d");
const measure = (text: string, size: number, font = "regular") => {
  if (!context) return text.length * size * 0.51;
  context.font = `${font === "bold" ? 600 : 400} ${size}px ${font === "mono" ? "PVMono" : "PVSans"}`;
  context.fontKerning = "none";
  return context.measureText(text).width;
};
let width = -1,
  frame = 0;
const tooltip = document.createElement("div");
tooltip.className = "pv-tooltip";
tooltip.setAttribute("role", "tooltip");
tooltip.hidden = true;
tooltip.style.cssText = themeStyle(payload.document.theme ?? "light");
document.body.append(tooltip);
function hideTooltip() {
  tooltip.hidden = true;
}
function focusKey(element: Element): string {
  return JSON.stringify([
    element.tagName,
    element.closest("[data-block]")?.getAttribute("data-block"),
    ...[
      "data-control",
      "data-range",
      "data-table-search",
      "data-sort",
      "data-series",
      "data-zoom",
      "data-select",
      "data-value",
      "href",
      "aria-label",
    ].map((name) => element.getAttribute(name)),
  ]);
}
function draw() {
  frame = 0;
  const focus = document.activeElement;
  const owner =
    focus instanceof Element && host.contains(focus)
      ? {
          key: focusKey(focus),
          start:
            focus instanceof HTMLInputElement &&
            ["text", "search"].includes(focus.type)
              ? focus.selectionStart
              : null,
          end:
            focus instanceof HTMLInputElement &&
            ["text", "search"].includes(focus.type)
              ? focus.selectionEnd
              : null,
        }
      : undefined;
  for (const details of host.querySelectorAll<HTMLDetailsElement>(
    "details[data-details]",
  )) {
    const key = details.dataset.details;
    if (key) {
      if (details.open) state.closed.delete(key);
      else state.closed.add(key);
    }
  }
  width = host.clientWidth;
  if (payload.mode === "standalone")
    host.style.padding = `${payload.partial ? 40 : 32}px ${width < 480 ? (payload.partial ? 24 : 16) : payload.partial ? 48 : 36}px`;
  host.innerHTML = renderDocument(payload, state, width, measure);
  if (owner) {
    const replacement = [
      ...host.querySelectorAll<HTMLElement | SVGElement>(
        "input,select,button,summary,a,[tabindex]",
      ),
    ].find((element) => focusKey(element) === owner.key);
    replacement?.focus({ preventScroll: true });
    if (
      replacement instanceof HTMLInputElement &&
      owner.start !== null &&
      owner.end !== null
    )
      replacement.setSelectionRange(owner.start, owner.end);
  }
  hideTooltip();
  host.dataset.ready = "true";
}
function schedule() {
  if (!frame) frame = requestAnimationFrame(draw);
}
function control(element: HTMLInputElement | HTMLSelectElement) {
  const id = element.dataset.control;
  if (!id) return;
  let value: ParameterValue;
  if (element instanceof HTMLSelectElement) value = JSON.parse(element.value);
  else if (element.type === "checkbox") value = element.checked;
  else if (element.dataset.range) {
    const previous = parameterValue(state.parameters, id);
    const range =
      typeof previous === "object" && previous !== null && !isAll(previous)
        ? { ...previous }
        : {};
    const bound = element.dataset.range as "min" | "max";
    if (element.value === "") delete range[bound];
    else range[bound] = element.valueAsNumber;
    if (
      range.min !== undefined &&
      range.max !== undefined &&
      range.min > range.max
    )
      return;
    value = range;
  } else value = element.value;
  state.parameters.set(id, value);
  schedule();
}
host.addEventListener("input", (event) => {
  const element = event.target;
  if (!(element instanceof HTMLInputElement)) return;
  if (element.dataset.tableSearch) {
    const key = element.dataset.tableSearch;
    state.tables[key] = {
      ...state.tables[key],
      query: element.value,
      descending: state.tables[key]?.descending ?? false,
    };
    schedule();
  } else if (element.type !== "checkbox") control(element);
});
host.addEventListener("change", (event) => {
  const element = event.target;
  if (
    element instanceof HTMLSelectElement ||
    (element instanceof HTMLInputElement && element.type === "checkbox")
  )
    control(element);
});
function zoom(figure: HTMLElement, action: string) {
  const key = figure.dataset.plot;
  if (key) {
    const plot = state.plots[key] ?? defaultPlot();
    state.plots[key] =
      action === "fit"
        ? { ...defaultPlot(), hidden: plot.hidden }
        : {
            ...plot,
            zoom: Math.max(
              1,
              Math.min(32, plot.zoom * (action === "in" ? 1.4 : 1 / 1.4)),
            ),
          };
    schedule();
    return;
  }
  const svg = figure.querySelector("svg");
  if (!svg) return;
  const natural = [0, 0, svg.width.baseVal.value, svg.height.baseVal.value];
  const box = svg.viewBox.baseVal;
  const scale = action === "fit" ? 1 : action === "in" ? 0.7 : 1 / 0.7;
  const w =
      action === "fit" ? natural[2] : Math.min(natural[2], box.width * scale),
    h =
      action === "fit" ? natural[3] : Math.min(natural[3], box.height * scale);
  svg.setAttribute(
    "viewBox",
    `${Math.max(0, box.x + (box.width - w) / 2)} ${Math.max(0, box.y + (box.height - h) / 2)} ${w} ${h}`,
  );
}
host.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : undefined;
  if (!target) return;
  const sort = target.closest<HTMLElement>("[data-sort]");
  if (sort?.dataset.table && sort.dataset.sort) {
    const key = sort.dataset.table,
      previous = state.tables[key] ?? { query: "", descending: false };
    state.tables[key] = {
      ...previous,
      sort: sort.dataset.sort,
      descending:
        previous.sort === sort.dataset.sort ? !previous.descending : false,
    };
    schedule();
    return;
  }
  const figure = target.closest<HTMLElement>("figure");
  const zoomButton = target.closest<HTMLElement>("[data-zoom]");
  if (zoomButton && figure) {
    zoom(figure, zoomButton.dataset.zoom ?? "fit");
    return;
  }
  const series = target.closest<HTMLElement>("[data-series]");
  if (series && figure?.dataset.plot) {
    const key = figure.dataset.plot,
      plot = state.plots[key] ?? defaultPlot(),
      name = series.dataset.series ?? "";
    plot.hidden = plot.hidden.includes(name)
      ? plot.hidden.filter((value) => value !== name)
      : [...plot.hidden, name];
    state.plots[key] = plot;
    schedule();
    return;
  }
  const selected = target.closest<SVGElement>("[data-select]");
  if (selected?.dataset.select && event.shiftKey) {
    const next = JSON.parse(selected.dataset.value ?? "null");
    state.parameters.set(
      selected.dataset.select,
      JSON.stringify(
        parameterValue(state.parameters, selected.dataset.select),
      ) === JSON.stringify(next)
        ? ALL
        : next,
    );
    schedule();
  } else if (figure?.dataset.clear && target.closest("svg")) {
    const current = parameterValue(state.parameters, figure.dataset.clear);
    if (!selected || JSON.stringify(current) !== selected.dataset.value) {
      state.parameters.set(figure.dataset.clear, ALL);
      schedule();
    }
  }
});
host.addEventListener("keydown", (event) => {
  if (
    (event.key === "Enter" || event.key === " ") &&
    event.target instanceof SVGElement &&
    event.target.dataset.select
  ) {
    event.preventDefault();
    state.parameters.set(
      event.target.dataset.select,
      JSON.parse(event.target.dataset.value ?? "null"),
    );
    schedule();
  }
});
host.addEventListener("dblclick", (event) => {
  const figure =
    event.target instanceof Element
      ? event.target.closest<HTMLElement>("figure")
      : undefined;
  if (figure) zoom(figure, "fit");
});
host.addEventListener(
  "wheel",
  (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    const figure =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("figure")
        : undefined;
    if (!figure) return;
    event.preventDefault();
    zoom(figure, event.deltaY < 0 ? "in" : "out");
  },
  { passive: false },
);
let drag:
  | {
      figure: HTMLElement;
      width: number;
      height: number;
      x: number;
      y: number;
      key?: string;
      plot: ReturnType<typeof defaultPlot>;
      view?: number[];
    }
  | undefined;
host.addEventListener("pointerdown", (event) => {
  if (
    event.button !== 0 ||
    event.shiftKey ||
    !(event.target instanceof SVGElement) ||
    event.target.dataset.select
  )
    return;
  const figure = event.target.closest<HTMLElement>("figure");
  if (!figure) return;
  const key = figure.dataset.plot,
    plot = key ? (state.plots[key] ?? defaultPlot()) : defaultPlot(),
    svg = figure.querySelector("svg"),
    box = svg?.viewBox.baseVal;
  if (plot.zoom <= 1 && (!box || !svg || box.width >= svg.width.baseVal.value))
    return;
  drag = {
    figure,
    width: figure.clientWidth,
    height: figure.clientHeight,
    x: event.clientX,
    y: event.clientY,
    key,
    plot: { ...plot },
    view: box ? [box.x, box.y, box.width, box.height] : undefined,
  };
  host.setPointerCapture(event.pointerId);
});
host.addEventListener("pointermove", (event) => {
  if (drag) {
    const dx = event.clientX - drag.x,
      dy = event.clientY - drag.y;
    if (drag.key) {
      state.plots[drag.key] = {
        ...drag.plot,
        x: drag.plot.x - dx / Math.max(1, drag.width) / drag.plot.zoom,
        y: drag.plot.y + dy / Math.max(1, drag.height) / drag.plot.zoom,
      };
      schedule();
    } else if (drag.view) {
      const svg = drag.figure.querySelector("svg"),
        v = drag.view;
      if (svg)
        svg.setAttribute(
          "viewBox",
          `${v[0] - (dx * v[2]) / svg.clientWidth} ${v[1] - (dy * v[3]) / svg.clientHeight} ${v[2]} ${v[3]}`,
        );
    }
    hideTooltip();
    return;
  }
  const target =
    event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-tooltip]")
      : undefined;
  if (!target) {
    hideTooltip();
    return;
  }
  showTooltip(target, event.clientX + 12, event.clientY + 16);
});
function showTooltip(target: Element, x: number, y: number) {
  tooltip.textContent = target.getAttribute("data-tooltip") ?? "";
  tooltip.hidden = false;
  tooltip.style.left = `${Math.max(8, Math.min(window.innerWidth - tooltip.offsetWidth - 8, x))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(window.innerHeight - tooltip.offsetHeight - 8, y))}px`;
}
host.addEventListener("focusin", (event) => {
  const target =
    event.target instanceof Element
      ? event.target.closest("[data-tooltip]")
      : undefined;
  if (!target) return;
  const bounds = target.getBoundingClientRect();
  showTooltip(target, bounds.left, bounds.bottom + 8);
});
host.addEventListener("focusout", hideTooltip);
host.addEventListener("pointerup", () => {
  drag = undefined;
});
host.addEventListener("pointercancel", () => {
  drag = undefined;
});
host.addEventListener("pointerleave", hideTooltip);
document.fonts.ready.then(() => {
  draw();
  new ResizeObserver(() => {
    if (host.clientWidth !== width) schedule();
  }).observe(host);
});
