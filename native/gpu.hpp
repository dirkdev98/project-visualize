#pragma once
#include "imgui.h"
#include "webgpu/webgpu.h"
#include "webgpu/wgpu.h"
#include <SDL3/SDL.h>
#ifdef __APPLE__
#include <SDL3/SDL_metal.h>
#endif
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>

namespace pv {
struct Image {
  WGPUTexture texture = nullptr;
  WGPUTextureView view = nullptr;
  int width = 0, height = 0;
  ~Image();
};

class Gpu {
public:
  WGPUInstance instance = nullptr;
  WGPUAdapter adapter = nullptr;
  WGPUDevice device = nullptr;
  WGPUQueue queue = nullptr;
  WGPUSurface surface = nullptr;
  WGPUSurfaceConfiguration configuration{};
  WGPUColor background{1, 1, 1, 1};
  SDL_Window *window = nullptr;
#ifdef __APPLE__
  SDL_MetalView metal_view = nullptr;
#endif
  bool imgui = false, sdl = false, renderer = false, platform = false;
  int max_dimension = 8192;
  float wheel_scale = 1, pinch_scale = 1;
  std::string error;
  std::mutex error_mutex;
  ~Gpu();
  void init(bool viewer);
  void check();
  void begin(float width, float height, int scale, bool omit_hover);
  void draw(WGPUTextureView view);
  void capture(int width, int height, unsigned char *pixels);
  std::unique_ptr<Image> load_image(const std::string &file);
  bool present();
};
void write_png(const std::string &file, int width, int height, const unsigned char *pixels);
}
