#include "gpu.hpp"
#include "imgui_impl_sdl3.h"
#include "imgui_impl_wgpu.h"
#include "implot.h"
#define STB_IMAGE_IMPLEMENTATION
#include "stb_image.h"
#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb_image_write.h"
#include <algorithm>
#include <cstring>
#include <stdexcept>

namespace pv {

static std::string message(WGPUStringView view) {
  if (!view.data) return "Unknown GPU error";
  return std::string(view.data, view.length == WGPU_STRLEN ? strlen(view.data) : view.length);
}

Gpu::~Gpu() {
  if (device) wgpuDevicePoll(device, true, nullptr);
  if (renderer) ImGui_ImplWGPU_Shutdown();
  if (platform) ImGui_ImplSDL3_Shutdown();
  if (imgui) { ImPlot::DestroyContext(); ImGui::DestroyContext(); }
  if (surface) { wgpuSurfaceUnconfigure(surface); wgpuSurfaceRelease(surface); }
  if (queue) wgpuQueueRelease(queue);
  if (device) wgpuDeviceRelease(device);
  if (adapter) wgpuAdapterRelease(adapter);
  if (instance) wgpuInstanceRelease(instance);
  if (metal_view) SDL_Metal_DestroyView(metal_view);
  if (window) SDL_DestroyWindow(window);
  if (sdl) SDL_Quit();
}

Image::~Image() {
  if (view) wgpuTextureViewRelease(view);
  if (texture) wgpuTextureRelease(texture);
}

void Gpu::check() {
  std::lock_guard<std::mutex> lock(error_mutex);
  if (!error.empty()) throw std::runtime_error(error);
}

void Gpu::init(bool viewer) {
  wgpuSetLogLevel(WGPULogLevel_Error);
  if (viewer) {
    if (!SDL_Init(SDL_INIT_VIDEO)) throw std::runtime_error(SDL_GetError());
    sdl = true;
    SDL_EnableScreenSaver();
    window = SDL_CreateWindow("Project Visualize", 1440, 960,
                              SDL_WINDOW_RESIZABLE | SDL_WINDOW_HIGH_PIXEL_DENSITY | SDL_WINDOW_METAL);
    if (!window) throw std::runtime_error(SDL_GetError());
  }
  instance = wgpuCreateInstance(nullptr);
  if (!instance) throw std::runtime_error("Cannot create a WebGPU instance");
  if (viewer) {
    metal_view = SDL_Metal_CreateView(window);
    if (!metal_view) throw std::runtime_error(SDL_GetError());
    WGPUSurfaceSourceMetalLayer layer{};
    layer.chain.sType = WGPUSType_SurfaceSourceMetalLayer;
    layer.layer = SDL_Metal_GetLayer(metal_view);
    WGPUSurfaceDescriptor descriptor{};
    descriptor.nextInChain = &layer.chain;
    surface = wgpuInstanceCreateSurface(instance, &descriptor);
    if (!surface) throw std::runtime_error("Cannot create a native window surface");
  }
  WGPURequestAdapterOptions options{};
  options.compatibleSurface = surface;
  options.powerPreference = WGPUPowerPreference_LowPower;
  WGPURequestAdapterCallbackInfo adapter_info{};
  adapter_info.mode = WGPUCallbackMode_AllowSpontaneous;
  adapter_info.userdata1 = this;
  adapter_info.callback = [](WGPURequestAdapterStatus status, WGPUAdapter value,
                            WGPUStringView msg, void *user, void *) {
    auto self = static_cast<Gpu *>(user);
    if (status == WGPURequestAdapterStatus_Success) self->adapter = value;
    else self->error = message(msg);
  };
  wgpuInstanceRequestAdapter(instance, &options, adapter_info);
  check();
  if (!adapter) throw std::runtime_error("No compatible GPU adapter");
  WGPULimits supported = WGPU_LIMITS_INIT;
  wgpuAdapterGetLimits(adapter, &supported);
  max_dimension = std::min(16384u, supported.maxTextureDimension2D);
  WGPULimits required = WGPU_LIMITS_INIT;
  required.maxTextureDimension2D = max_dimension;
  WGPUDeviceDescriptor descriptor = WGPU_DEVICE_DESCRIPTOR_INIT;
  descriptor.requiredLimits = &required;
  descriptor.uncapturedErrorCallbackInfo.userdata1 = this;
  descriptor.uncapturedErrorCallbackInfo.callback = [](WGPUDevice const *, WGPUErrorType,
                                      WGPUStringView msg, void *user, void *) {
    auto self = static_cast<Gpu *>(user);
    std::lock_guard<std::mutex> lock(self->error_mutex);
    self->error = message(msg);
  };
  descriptor.deviceLostCallbackInfo.mode = WGPUCallbackMode_AllowSpontaneous;
  descriptor.deviceLostCallbackInfo.userdata1 = this;
  descriptor.deviceLostCallbackInfo.callback = [](WGPUDevice const *, WGPUDeviceLostReason reason,
                                      WGPUStringView msg, void *user, void *) {
    if (reason == WGPUDeviceLostReason_Destroyed) return;
    auto self = static_cast<Gpu *>(user);
    std::lock_guard<std::mutex> lock(self->error_mutex);
    self->error = message(msg);
  };
  WGPURequestDeviceCallbackInfo device_info{};
  device_info.mode = WGPUCallbackMode_AllowSpontaneous;
  device_info.userdata1 = this;
  device_info.callback = [](WGPURequestDeviceStatus status, WGPUDevice value,
                           WGPUStringView msg, void *user, void *) {
    auto self = static_cast<Gpu *>(user);
    if (status == WGPURequestDeviceStatus_Success) self->device = value;
    else self->error = message(msg);
  };
  wgpuAdapterRequestDevice(adapter, &descriptor, device_info);
  check();
  if (!device) throw std::runtime_error("Cannot create a GPU device");
  queue = wgpuDeviceGetQueue(device);
  configuration.format = WGPUTextureFormat_RGBA8Unorm;
  if (viewer) {
    WGPUSurfaceCapabilities caps{};
    wgpuSurfaceGetCapabilities(surface, adapter, &caps);
    if (!caps.formatCount) throw std::runtime_error("The window has no supported pixel format");
    configuration.format = caps.formats[0];
    for (size_t i = 0; i < caps.formatCount; ++i)
      if (caps.formats[i] == WGPUTextureFormat_BGRA8Unorm) configuration.format = caps.formats[i];
    configuration.alphaMode = caps.alphaModes[0];
    wgpuSurfaceCapabilitiesFreeMembers(caps);
    configuration.device = device;
    configuration.usage = WGPUTextureUsage_RenderAttachment;
    configuration.presentMode = WGPUPresentMode_Fifo;
  }
  ImGui::CreateContext();
  ImPlot::CreateContext();
  imgui = true;
  auto &io = ImGui::GetIO();
  io.IniFilename = nullptr;
  io.LogFilename = nullptr;
  io.ConfigFlags |= ImGuiConfigFlags_NavEnableKeyboard;
  if (viewer) {
    if (!ImGui_ImplSDL3_InitForOther(window)) throw std::runtime_error("Cannot initialize window input");
    platform = true;
  }
  ImGui_ImplWGPU_InitInfo init{};
  init.Device = device;
  init.NumFramesInFlight = 2;
  init.RenderTargetFormat = configuration.format;
  if (!ImGui_ImplWGPU_Init(&init)) throw std::runtime_error("Cannot initialize UI rendering");
  renderer = true;
  if (viewer) SDL_RaiseWindow(window);
}

void Gpu::begin(float width, float height, int scale) {
  ImGui_ImplWGPU_NewFrame();
  if (platform) ImGui_ImplSDL3_NewFrame();
  else {
    ImGuiIO &io = ImGui::GetIO();
    io.DisplaySize = ImVec2(width, height);
    io.DisplayFramebufferScale = ImVec2(scale, scale);
    io.DeltaTime = 1.0f / 60;
  }
  ImGui::NewFrame();
}

void Gpu::draw(WGPUTextureView view) {
  WGPUCommandEncoder encoder = wgpuDeviceCreateCommandEncoder(device, nullptr);
  WGPURenderPassColorAttachment attachment{};
  attachment.view = view;
  attachment.depthSlice = WGPU_DEPTH_SLICE_UNDEFINED;
  attachment.loadOp = WGPULoadOp_Clear;
  attachment.storeOp = WGPUStoreOp_Store;
  attachment.clearValue = background;
  WGPURenderPassDescriptor descriptor{};
  descriptor.colorAttachmentCount = 1;
  descriptor.colorAttachments = &attachment;
  auto pass = wgpuCommandEncoderBeginRenderPass(encoder, &descriptor);
  ImGui_ImplWGPU_RenderDrawData(ImGui::GetDrawData(), pass);
  wgpuRenderPassEncoderEnd(pass);
  auto command = wgpuCommandEncoderFinish(encoder, nullptr);
  wgpuQueueSubmit(queue, 1, &command);
  wgpuCommandBufferRelease(command);
  wgpuRenderPassEncoderRelease(pass);
  wgpuCommandEncoderRelease(encoder);
  check();
}

std::vector<unsigned char> Gpu::capture(int width, int height) {
  if (width > max_dimension || height > max_dimension || width < 1 || height < 1)
    throw std::runtime_error("Artifact exceeds the GPU image limit; reduce width/scale or split it into artifacts");
  WGPUTextureDescriptor desc{};
  desc.size = {static_cast<uint32_t>(width), static_cast<uint32_t>(height), 1};
  desc.mipLevelCount = desc.sampleCount = 1;
  desc.dimension = WGPUTextureDimension_2D;
  desc.format = WGPUTextureFormat_RGBA8Unorm;
  desc.usage = WGPUTextureUsage_RenderAttachment | WGPUTextureUsage_CopySrc;
  auto texture = wgpuDeviceCreateTexture(device, &desc);
  auto view = wgpuTextureCreateView(texture, nullptr);
  draw(view);
  const uint32_t stride = (width * 4 + 255) & ~255;
  const uint64_t size = static_cast<uint64_t>(stride) * height;
  WGPUBufferDescriptor buffer_desc{};
  buffer_desc.size = size;
  buffer_desc.usage = WGPUBufferUsage_MapRead | WGPUBufferUsage_CopyDst;
  auto buffer = wgpuDeviceCreateBuffer(device, &buffer_desc);
  auto encoder = wgpuDeviceCreateCommandEncoder(device, nullptr);
  WGPUTexelCopyTextureInfo source{};
  source.texture = texture;
  source.aspect = WGPUTextureAspect_All;
  WGPUTexelCopyBufferInfo dest{};
  dest.buffer = buffer;
  dest.layout.bytesPerRow = stride;
  dest.layout.rowsPerImage = height;
  wgpuCommandEncoderCopyTextureToBuffer(encoder, &source, &dest, &desc.size);
  auto command = wgpuCommandEncoderFinish(encoder, nullptr);
  wgpuQueueSubmit(queue, 1, &command);
  WGPUMapAsyncStatus status = WGPUMapAsyncStatus_Error;
  WGPUBufferMapCallbackInfo map{};
  map.mode = WGPUCallbackMode_AllowSpontaneous;
  map.userdata1 = &status;
  map.callback = [](WGPUMapAsyncStatus value, WGPUStringView, void *user, void *) {
    *static_cast<WGPUMapAsyncStatus *>(user) = value;
  };
  wgpuBufferMapAsync(buffer, WGPUMapMode_Read, 0, size, map);
  wgpuDevicePoll(device, true, nullptr);
  std::vector<unsigned char> pixels;
  if (status == WGPUMapAsyncStatus_Success) {
    auto bytes = static_cast<const unsigned char *>(wgpuBufferGetConstMappedRange(buffer, 0, size));
    pixels.resize(static_cast<size_t>(width) * height * 4);
    for (int y = 0; y < height; ++y)
      memcpy(pixels.data() + static_cast<size_t>(y) * width * 4, bytes + static_cast<size_t>(y) * stride, width * 4);
    wgpuBufferUnmap(buffer);
  }
  wgpuCommandBufferRelease(command);
  wgpuCommandEncoderRelease(encoder);
  wgpuBufferRelease(buffer);
  wgpuTextureViewRelease(view);
  wgpuTextureRelease(texture);
  check();
  if (pixels.empty()) throw std::runtime_error("GPU screenshot readback failed");
  return pixels;
}

std::unique_ptr<Image> Gpu::load_image(const std::string &file) {
  int width, height, components;
  if (!stbi_info(file.c_str(), &width, &height, &components) || width > max_dimension || height > max_dimension)
    throw std::runtime_error("Image cannot be decoded or exceeds GPU limits: " + file);
  auto bytes = stbi_load(file.c_str(), &width, &height, &components, 4);
  if (!bytes) throw std::runtime_error("Cannot read image: " + file);
  auto image = std::make_unique<Image>();
  image->width = width;
  image->height = height;
  WGPUTextureDescriptor desc{};
  desc.size = {static_cast<uint32_t>(width), static_cast<uint32_t>(height), 1};
  desc.mipLevelCount = desc.sampleCount = 1;
  desc.dimension = WGPUTextureDimension_2D;
  desc.format = WGPUTextureFormat_RGBA8Unorm;
  desc.usage = WGPUTextureUsage_TextureBinding | WGPUTextureUsage_CopyDst;
  image->texture = wgpuDeviceCreateTexture(device, &desc);
  image->view = wgpuTextureCreateView(image->texture, nullptr);
  WGPUTexelCopyTextureInfo dest{};
  dest.texture = image->texture;
  dest.aspect = WGPUTextureAspect_All;
  WGPUTexelCopyBufferLayout layout{};
  layout.bytesPerRow = width * 4;
  layout.rowsPerImage = height;
  wgpuQueueWriteTexture(queue, &dest, bytes, static_cast<size_t>(width) * height * 4, &layout, &desc.size);
  stbi_image_free(bytes);
  return image;
}

void Gpu::present() {
  int width, height;
  SDL_GetWindowSizeInPixels(window, &width, &height);
  if (width <= 0 || height <= 0) return;
  if (configuration.width != static_cast<uint32_t>(width) || configuration.height != static_cast<uint32_t>(height)) {
    configuration.width = width;
    configuration.height = height;
    wgpuSurfaceConfigure(surface, &configuration);
  }
  WGPUSurfaceTexture texture{};
  wgpuSurfaceGetCurrentTexture(surface, &texture);
  check();
  if (static_cast<uint32_t>(texture.status) == WGPUSurfaceGetCurrentTextureStatus_Occluded) return;
  if (ImGui_ImplWGPU_IsSurfaceStatusError(texture.status)) {
    if (texture.texture) wgpuTextureRelease(texture.texture);
    throw std::runtime_error("Cannot acquire the window surface texture");
  }
  if (texture.status == WGPUSurfaceGetCurrentTextureStatus_Timeout) {
    if (texture.texture) wgpuTextureRelease(texture.texture);
    return;
  }
  if (texture.status == WGPUSurfaceGetCurrentTextureStatus_Outdated ||
      texture.status == WGPUSurfaceGetCurrentTextureStatus_Lost || !texture.texture) {
    if (texture.texture) wgpuTextureRelease(texture.texture);
    wgpuSurfaceConfigure(surface, &configuration);
    return;
  }
  // SuccessSuboptimal still carries a drawable frame, including on scaled macOS surfaces.
  auto view = wgpuTextureCreateView(texture.texture, nullptr);
  draw(view);
  wgpuSurfacePresent(surface);
  wgpuTextureViewRelease(view);
  wgpuTextureRelease(texture.texture);
}

void write_png(const std::string &file, int width, int height, const unsigned char *pixels) {
  if (!stbi_write_png(file.c_str(), width, height, 4, pixels, width * 4))
    throw std::runtime_error("Cannot write PNG: " + file);
}
}
