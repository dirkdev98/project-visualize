#include "visualize.h"
#include "gpu.hpp"
#include "imgui_impl_sdl3.h"
#include "implot.h"
#include <algorithm>
#include <cstdlib>
#include <cstring>
#include <memory>

struct PVImage { std::unique_ptr<pv::Image> image; };

namespace {
std::unique_ptr<pv::Gpu> context;
std::string last_error;

pv::Gpu &surface() {
  if (!context) throw std::runtime_error("The rendering surface is not open");
  return *context;
}
}

extern "C" int pv_surface_open(int viewer) {
  try {
    last_error.clear();
    context = std::make_unique<pv::Gpu>();
    context->init(viewer != 0);
    return 0;
  } catch (const std::exception &error) {
    last_error = error.what(); context.reset(); return -1;
  }
}

extern "C" int pv_surface_wait(int timeout_ms) {
  try {
    auto &gpu = surface();
    wgpuDevicePoll(gpu.device, false, nullptr);
    gpu.check();
    SDL_Event event;
    bool received = false;
    if (SDL_WaitEventTimeout(&event, timeout_ms)) {
      do {
        if (event.type == SDL_EVENT_POLL_SENTINEL) continue;
        ImGui_ImplSDL3_ProcessEvent(&event);
        if (event.type == SDL_EVENT_QUIT || event.type == SDL_EVENT_WINDOW_CLOSE_REQUESTED) return 0;
        received = true;
      } while (SDL_PollEvent(&event));
    }
    return received ? 2 : 1;
  } catch (const std::exception &error) { last_error = error.what(); return -1; }
}

extern "C" int pv_surface_input(void) {
  int count = 0;
  const bool *keys = SDL_GetKeyboardState(&count);
  bool held = SDL_GetMouseState(nullptr, nullptr) != 0 ||
    std::any_of(keys, keys + count, [](bool down) { return down; });
  return (held ? 1 : 0) | (ImGui::GetIO().WantTextInput ? 2 : 0);
}

extern "C" PVSize pv_surface_size(void) {
  auto size = ImGui::GetIO().DisplaySize;
  return {size.x, size.y};
}

extern "C" int pv_surface_limit(void) { return surface().max_dimension; }
extern "C" ImFontAtlas *pv_font_atlas(void) { return ImGui::GetIO().Fonts; }

extern "C" int pv_surface_begin(int width, int height, int scale) {
  try { surface().begin(width, height, scale); return 0; }
  catch (const std::exception &error) { last_error = error.what(); return -1; }
}

extern "C" int pv_surface_present(void) {
  try { surface().present(); return 0; }
  catch (const std::exception &error) { last_error = error.what(); return -1; }
}

extern "C" void pv_surface_background(PVColor color) {
  surface().background = {color.x, color.y, color.z, color.w};
}

extern "C" unsigned char *pv_surface_pixels(int width, int height, int *byte_count) {
  *byte_count = 0;
  try {
    auto pixels = surface().capture(width, height);
    auto bytes = static_cast<unsigned char *>(std::malloc(pixels.size()));
    if (!bytes) throw std::bad_alloc();
    std::memcpy(bytes, pixels.data(), pixels.size());
    *byte_count = static_cast<int>(pixels.size());
    return bytes;
  } catch (const std::exception &error) { last_error = error.what(); return nullptr; }
}

extern "C" void pv_bytes_free(void *bytes) { std::free(bytes); }
extern "C" void pv_surface_close(void) { context.reset(); }
extern "C" const char *pv_error(void) { return last_error.empty() ? nullptr : last_error.c_str(); }

extern "C" int pv_png_write(const char *file, int width, int height,
                             const unsigned char *bytes, int byte_count) {
  try {
    if (width < 1 || height < 1 || static_cast<uint64_t>(width) * height * 4 != static_cast<uint64_t>(byte_count))
      throw std::runtime_error("PNG dimensions do not match its pixel buffer");
    pv::write_png(file, width, height, bytes);
    return 0;
  } catch (const std::exception &error) { last_error = error.what(); return -1; }
}

extern "C" PVImage *pv_image_load(const char *file) {
  try { return new PVImage{surface().load_image(file)}; }
  catch (const std::exception &error) { last_error = error.what(); return nullptr; }
}

extern "C" PVSize pv_image_size(PVImage *image) {
  return {static_cast<float>(image->image->width), static_cast<float>(image->image->height)};
}

extern "C" void pv_image_draw(PVImage *image, PVSize size) {
  ImGui::Image(static_cast<ImTextureID>(reinterpret_cast<intptr_t>(image->image->view)), {size.x, size.y});
}

extern "C" void pv_image_destroy(PVImage *image) { delete image; }

extern "C" PVSortSpec pv_table_sort(int index) {
  auto specs = ImGui::TableGetSortSpecs();
  if (!specs || index < 0 || index >= specs->SpecsCount) return {0, 0, 0};
  auto &spec = specs->Specs[index];
  return {specs->SpecsCount, spec.ColumnIndex, static_cast<int>(spec.SortDirection)};
}

extern "C" void pv_plot_tick(int axis, double value, const char *label) {
  ImPlot::SetupAxisTicks(axis, &value, 1, &label, false);
}

extern "C" void pv_plot_series(const char *label, const double *x, const double *y,
                               int count, int kind, PVPlotStyle style) {
  ImPlotSpec spec;
  spec.LineColor = spec.FillColor = {style.color.x, style.color.y, style.color.z, style.color.w};
  spec.LineWeight = style.line_weight;
  spec.Marker = style.marker;
  spec.MarkerSize = style.marker_size;
  if (kind == 1) ImPlot::PlotBars(label, x, y, count, style.bar_width, spec);
  else if (kind == 2) ImPlot::PlotScatter(label, x, y, count, spec);
  else ImPlot::PlotLine(label, x, y, count, spec);
}

extern "C" void pv_open_url(const char *url) { SDL_OpenURL(url); }
