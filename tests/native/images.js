import {
  ImDrawList_AddRectFilled,
  ImGuiWindowFlags_NoDecoration,
  igBegin,
  igEnd,
  igGetCursorScreenPos,
  igGetWindowDrawList,
  igRender,
  igSetNextWindowPos,
  igSetNextWindowSize,
  pv_error,
  pv_image_destroy,
  pv_image_draw,
  pv_image_load,
  pv_image_size,
  pv_png_write,
  pv_surface_begin,
  pv_surface_capture,
  pv_surface_close,
  pv_surface_open,
} from "maligator:ffi/visualize";

function expect(value, message) {
  if (!value) throw new Error(message);
}
function checked(status) {
  expect(status === 0, pv_error() ?? "Native operation failed");
}
const width = 481,
  height = 160;
const source = new Uint8Array(12 * 4 * 4);
for (let y = 0; y < 4; y++)
  for (let x = 0; x < 12; x++) {
    const offset = (y * 12 + x) * 4;
    source[offset + Math.floor(x / 4)] = 255;
    source[offset + 3] = 255;
  }
const file = `${process.env.VISUALIZE_NATIVE_CHECK_OUTPUT}.source.png`;
checked(pv_png_write(file, 12, 4, source));
const pixels = new Uint8Array(width * height * 4);
checked(pv_surface_open(0));
let image;
try {
  image = pv_image_load(file);
  expect(image, pv_error() ?? "Image did not load");
  const size = pv_image_size(image);
  expect(size.x === 12 && size.y === 4, "Image dimensions changed");
  for (let frame = 0; frame < 3; frame++) {
    checked(pv_surface_begin(width, height, 1));
    igSetNextWindowPos({ x: 0, y: 0 }, 0, { x: 0, y: 0 });
    igSetNextWindowSize({ x: width, y: height }, 0);
    igBegin("Image sampling", ImGuiWindowFlags_NoDecoration);
    ImDrawList_AddRectFilled(
      igGetWindowDrawList(),
      { x: 10, y: 10 },
      { x: 470, y: 150 },
      0xff339966,
      0,
      0,
    );
    const before = igGetCursorScreenPos();
    pv_image_draw(
      image,
      { x: 200, y: 40 },
      { x: 100, y: 80 },
      { x: 1 / 3, y: 0 },
      { x: 2 / 3, y: 1 },
      10,
    );
    const after = igGetCursorScreenPos();
    expect(
      before.x === after.x && before.y === after.y,
      "The native quad changed JS-owned layout",
    );
    igEnd();
    igRender();
  }
  checked(pv_surface_capture(width, height, pixels));
  for (const [x, y, rgb] of [
    [250, 80, [0, 255, 0]],
    [201, 41, [0x66, 0x99, 0x33]],
  ]) {
    const offset = (y * width + x) * 4;
    expect(
      rgb.every((value, index) => pixels[offset + index] === value),
      `Image crop or rounding failed at ${x},${y}`,
    );
    expect(pixels[offset + 3] === 255, "Image alpha changed");
  }
} finally {
  if (image) pv_image_destroy(image);
  pv_surface_close();
}
checked(
  pv_png_write(
    process.env.VISUALIZE_NATIVE_CHECK_OUTPUT,
    width,
    height,
    pixels,
  ),
);
console.log(
  JSON.stringify({ ok: true, width, height, crop: "center", rounded: true }),
);
