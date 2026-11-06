#pragma once
#include "ui.hpp"
#include "webgpu/webgpu.h"
#include "webgpu/wgpu.h"
#include <SDL3/SDL.h>
#include <SDL3/SDL_metal.h>
#include <mutex>

namespace pv {
struct Image {
  WGPUTexture texture = nullptr;
  WGPUTextureView view = nullptr;
  int width = 0, height = 0;
};

class Gpu {
public:
  WGPUInstance instance = nullptr;
  WGPUAdapter adapter = nullptr;
  WGPUDevice device = nullptr;
  WGPUQueue queue = nullptr;
  WGPUSurface surface = nullptr;
  WGPUSurfaceConfiguration configuration{};
  SDL_Window *window = nullptr;
  SDL_MetalView metal_view = nullptr;
  bool imgui = false, sdl = false, renderer = false, platform = false;
  int max_dimension = 8192;
  std::string error;
  std::mutex error_mutex;
  std::unordered_map<std::string, Image> images;
  ~Gpu();
  void init(bool viewer);
  void check();
  void clear_images();
  void begin(float width, float height, int scale = 1);
  void draw(WGPUTextureView view);
  std::vector<unsigned char> capture(int width, int height);
  Image &image(const std::string &file);
  void present();
};
extern Gpu *gpu;
void write_image(const std::string &file, int width, int height,
                 const std::vector<unsigned char> &pixels);
}
