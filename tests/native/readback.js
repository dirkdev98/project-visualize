import {
  ImDrawList_AddRectFilled,
  ImGuiWindowFlags_NoDecoration,
  igBegin,
  igEnd,
  igGetWindowDrawList,
  igRender,
  igSetNextWindowPos,
  igSetNextWindowSize,
  pv_error,
  pv_png_write,
  pv_surface_begin,
  pv_surface_capture,
  pv_surface_close,
  pv_surface_limit,
  pv_surface_open,
} from "maligator:ffi/visualize";

function expect(value, message) {
  if (!value) throw new Error(message);
}
function checked(status) {
  expect(status === 0, pv_error() ?? "Native operation failed");
}
const width = 481;
const height = 160;
const bytes = width * height * 4;
const guard = 16;
const storage = new Uint8Array(bytes + 2 * guard).fill(0xa5);
const pixels = storage.subarray(guard, guard + bytes);
checked(pv_surface_open(0));
try {
  const short = new Uint8Array(bytes - 1).fill(0xa5);
  expect(
    pv_surface_capture(width, height, short) < 0,
    "Short capture succeeded",
  );
  expect(
    short.every((byte) => byte === 0xa5),
    "Short capture wrote outside its contract",
  );
  const tooWide = pv_surface_limit() + 1;
  const oversized = new Uint8Array(tooWide * 4).fill(0xa5);
  expect(
    pv_surface_capture(tooWide, 1, oversized) < 0,
    "Oversized capture succeeded",
  );
  expect(
    oversized.every((byte) => byte === 0xa5),
    "Oversized capture wrote pixels",
  );
  for (let frame = 0; frame < 3; frame++) {
    checked(pv_surface_begin(width, height, 1));
    igSetNextWindowPos({ x: 0, y: 0 }, 0, { x: 0, y: 0 });
    igSetNextWindowSize({ x: width, y: height }, 0);
    igBegin("Borrowed pixel capture", ImGuiWindowFlags_NoDecoration);
    const draw = igGetWindowDrawList();
    expect(draw, "Missing draw list");
    ImDrawList_AddRectFilled(
      draw,
      { x: 20, y: 20 },
      { x: width - 20, y: height - 20 },
      0xff339966,
      0,
      0,
    );
    igEnd();
    igRender();
  }
  checked(pv_surface_capture(width, height, pixels));
  expect(
    storage.subarray(0, guard).every((byte) => byte === 0xa5),
    "Capture changed the prefix guard",
  );
  expect(
    storage.subarray(guard + bytes).every((byte) => byte === 0xa5),
    "Capture changed the suffix guard",
  );
  for (const y of [30, 80, 130]) {
    const offset = (y * width + 50) * 4;
    expect(
      pixels[offset] === 0x66 &&
        pixels[offset + 1] === 0x99 &&
        pixels[offset + 2] === 0x33 &&
        pixels[offset + 3] === 0xff,
      `Capture did not remove row padding at row ${y}`,
    );
  }
} finally {
  pv_surface_close();
}
checked(
  pv_png_write(process.env.VISUALIZE_READBACK_OUTPUT, width, height, pixels),
);
console.log(JSON.stringify({ ok: true, width, height, offset: guard }));
