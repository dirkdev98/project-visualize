#include "gpu.hpp"
#include "imgui_impl_sdl3.h"
#include "imgui_impl_wgpu.h"
#include "implot.h"
#define STB_IMAGE_IMPLEMENTATION
#include "stb_image.h"
#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb_image_write.h"
#include <algorithm>
#include <cctype>
#include <cstring>
#include <fstream>
#include <sstream>
#include <stdexcept>
#include <zlib.h>

namespace pv {
Gpu *gpu = nullptr;

static std::string message(WGPUStringView view) {
  if (!view.data) return "Unknown GPU error";
  return std::string(view.data, view.length == WGPU_STRLEN ? strlen(view.data) : view.length);
}

Gpu::~Gpu() {
  if (device) wgpuDevicePoll(device, true, nullptr);
  for (auto &[file, image] : images) {
    wgpuTextureViewRelease(image.view);
    wgpuTextureRelease(image.texture);
  }
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
  gpu = nullptr;
}

void Gpu::check() {
  std::lock_guard<std::mutex> lock(error_mutex);
  if (!error.empty()) throw std::runtime_error(error);
}

void Gpu::init(bool viewer) {
  gpu = this;
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
  setup_style();
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
  attachment.clearValue = {paper.x, paper.y, paper.z, 1};
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

Image &Gpu::image(const std::string &file) {
  auto found = images.find(file);
  if (found != images.end()) return found->second;
  int width, height, components;
  if (!stbi_info(file.c_str(), &width, &height, &components) || width > max_dimension || height > max_dimension)
    throw std::runtime_error("Image cannot be decoded or exceeds GPU limits: " + file);
  auto bytes = stbi_load(file.c_str(), &width, &height, &components, 4);
  if (!bytes) throw std::runtime_error("Cannot read image: " + file);
  Image image{};
  image.width = width;
  image.height = height;
  WGPUTextureDescriptor desc{};
  desc.size = {static_cast<uint32_t>(width), static_cast<uint32_t>(height), 1};
  desc.mipLevelCount = desc.sampleCount = 1;
  desc.dimension = WGPUTextureDimension_2D;
  desc.format = WGPUTextureFormat_RGBA8Unorm;
  desc.usage = WGPUTextureUsage_TextureBinding | WGPUTextureUsage_CopyDst;
  image.texture = wgpuDeviceCreateTexture(device, &desc);
  image.view = wgpuTextureCreateView(image.texture, nullptr);
  WGPUTexelCopyTextureInfo dest{};
  dest.texture = image.texture;
  dest.aspect = WGPUTextureAspect_All;
  WGPUTexelCopyBufferLayout layout{};
  layout.bytesPerRow = width * 4;
  layout.rowsPerImage = height;
  wgpuQueueWriteTexture(queue, &dest, bytes, static_cast<size_t>(width) * height * 4, &layout, &desc.size);
  stbi_image_free(bytes);
  return images.emplace(file, image).first->second;
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

void write_image(const std::string &file, int width, int height,
                 const std::vector<unsigned char> &pixels) {
  auto extension = file.size() < 4 ? "" : file.substr(file.size() - 4);
  std::transform(extension.begin(), extension.end(), extension.begin(),
                 [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
  if (extension != ".pdf") {
    if (!stbi_write_png(file.c_str(), width, height, 4, pixels.data(), width * 4))
      throw std::runtime_error("Cannot write PNG: " + file);
    return;
  }
  std::vector<unsigned char> rgb(static_cast<size_t>(width) * height * 3);
  for (size_t i = 0; i < rgb.size() / 3; ++i)
    memcpy(rgb.data() + i * 3, pixels.data() + i * 4, 3);
  uLongf compressed_size = compressBound(rgb.size());
  std::vector<unsigned char> compressed(compressed_size);
  if (compress2(compressed.data(), &compressed_size, rgb.data(), rgb.size(), Z_BEST_SPEED) != Z_OK)
    throw std::runtime_error("Cannot compress PDF image");
  std::ofstream out(file, std::ios::binary);
  out << "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  std::vector<std::streamoff> offsets{0};
  auto object = [&](int id, const std::string &value) {
    offsets.push_back(out.tellp());
    out << id << " 0 obj\n" << value << "\nendobj\n";
  };
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Count 1 /Kids [3 0 R] >>");
  const double page_width = 720, page_height = page_width * height / width;
  std::ostringstream page, paint;
  page << "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " << page_width << ' ' << page_height
       << "] /Resources << /XObject << /Image 4 0 R >> >> /Contents 5 0 R >>";
  object(3, page.str());
  offsets.push_back(out.tellp());
  out << "4 0 obj\n<< /Type /XObject /Subtype /Image /Width " << width << " /Height " << height
      << " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length "
      << compressed_size << " >>\nstream\n";
  out.write(reinterpret_cast<const char *>(compressed.data()), compressed_size);
  out << "\nendstream\nendobj\n";
  paint << "q\n" << page_width << " 0 0 " << page_height << " 0 0 cm\n/Image Do\nQ\n";
  auto commands = paint.str();
  object(5, "<< /Length " + std::to_string(commands.size()) + " >>\nstream\n" + commands + "endstream");
  auto xref = out.tellp();
  out << "xref\n0 6\n0000000000 65535 f \n";
  for (size_t i = 1; i < offsets.size(); ++i) {
    char entry[32];
    snprintf(entry, sizeof(entry), "%010lld 00000 n \n", static_cast<long long>(offsets[i]));
    out << entry;
  }
  out << "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" << xref << "\n%%EOF\n";
  if (!out.good()) throw std::runtime_error("Cannot write PDF: " + file);
}
}
