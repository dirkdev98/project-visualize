#include "gpu.hpp"
#include "imgui_impl_sdl3.h"
#include "implot.h"
#include "imgui_internal.h"
#include "visualize.h"
#ifdef __APPLE__
#include "macos.hpp"
#endif
#include <algorithm>
#include <array>
#include <climits>
#include <cstring>
#include <memory>
#include <cmath>
#include <cstdlib>
#include <vector>
#include <zlib.h>
#include <cerrno>
#include <fcntl.h>
#include <sys/file.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <thread>
#include <atomic>
#include <unistd.h>
#ifdef __APPLE__
#include <mach-o/dyld.h>
#endif

struct PVImage { std::unique_ptr<pv::Image> image; };

namespace {
std::unique_ptr<pv::Gpu> context;
std::string last_error;
int viewer_lock = -1;
int notify_socket = -1;
std::atomic<bool> notify_running = false;
std::thread notify_thread;
std::string notify_path;

struct DeflateStream {
  z_stream value{};
  DeflateStream() {
    if (deflateInit(&value, 1) != Z_OK)
      throw std::runtime_error("Cannot initialize pixel compression");
  }
  ~DeflateStream() { deflateEnd(&value); }
};

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

extern "C" int pv_viewer_claim(const char *file) {
  const int fd = open(file, O_CREAT | O_RDWR | O_CLOEXEC | O_NOFOLLOW, 0600);
  if (fd < 0) { last_error = "Cannot open the viewer ownership file"; return -1; }
  if (flock(fd, LOCK_EX | LOCK_NB) != 0) {
    const int cause = errno;
    close(fd);
    if (cause == EWOULDBLOCK || cause == EAGAIN) return 0;
    last_error = "Cannot claim the viewer ownership file"; return -1;
  }
  viewer_lock = fd;
  return 1;
}

extern "C" void pv_viewer_release(void) {
  if (viewer_lock >= 0) close(viewer_lock);
  viewer_lock = -1;
}

extern "C" void pv_viewer_notify(const char *file) {
  if (!file) return;
  sockaddr_un address{};
  address.sun_family = AF_UNIX;
  const size_t length = std::strlen(file);
  if (length >= sizeof(address.sun_path)) return;
  std::memcpy(address.sun_path, file, length + 1);
  const int fd = socket(AF_UNIX, SOCK_DGRAM, 0);
  if (fd < 0) return;
  const char event = 1;
  sendto(fd, &event, 1, MSG_DONTWAIT, reinterpret_cast<sockaddr *>(&address), sizeof(address));
  close(fd);
}

extern "C" int pv_viewer_listen(const char *file) {
  if (!file) { last_error = "A viewer notification path is required"; return -1; }
  sockaddr_un address{};
  address.sun_family = AF_UNIX;
  const size_t length = std::strlen(file);
  if (length >= sizeof(address.sun_path)) { last_error = "Viewer notification path is too long"; return -1; }
  std::memcpy(address.sun_path, file, length + 1);
  const int fd = socket(AF_UNIX, SOCK_DGRAM, 0);
  if (fd < 0) { last_error = "Cannot create the viewer notification socket"; return -1; }
  fcntl(fd, F_SETFD, FD_CLOEXEC);
  unlink(file);
  if (bind(fd, reinterpret_cast<sockaddr *>(&address), sizeof(address)) != 0) {
    close(fd); last_error = "Cannot bind the viewer notification socket"; return -1;
  }
  if (chmod(file, 0600) != 0) {
    close(fd); unlink(file); last_error = "Cannot protect the viewer notification socket"; return -1;
  }
  notify_socket = fd;
  notify_path = file;
  const Uint32 event_type = SDL_RegisterEvents(1);
  notify_running = true;
  try {
    notify_thread = std::thread([fd, event_type] {
    while (notify_running) {
      char byte;
      if (recv(fd, &byte, 1, 0) < 0) {
        if (errno == EINTR) continue;
        break;
      }
      if (!notify_running) break;
      SDL_Event event{};
      event.type = event_type;
      SDL_PushEvent(&event);
    }
    });
  } catch (const std::exception &error) {
    notify_running = false;
    close(fd); unlink(file); notify_socket = -1;
    last_error = error.what(); return -1;
  }
  return 0;
}

extern "C" void pv_viewer_stop(void) {
  notify_running = false;
  if (notify_socket >= 0) {
    pv_viewer_notify(notify_path.c_str());
    if (notify_thread.joinable()) notify_thread.join();
    close(notify_socket);
    unlink(notify_path.c_str());
    notify_socket = -1;
  }
}

extern "C" int pv_surface_raise(void) {
  try {
    if (!SDL_ShowWindow(surface().window) || !SDL_RaiseWindow(surface().window))
      throw std::runtime_error(SDL_GetError());
#ifdef __APPLE__
    pv::activate_app();
#endif
    return 0;
  } catch (const std::exception &error) { last_error = error.what(); return -1; }
}

extern "C" int pv_surface_resize(int width, int height) {
  try {
    if (!SDL_SetWindowSize(surface().window, width, height))
      throw std::runtime_error(SDL_GetError());
    return 0;
  } catch (const std::exception &error) { last_error = error.what(); return -1; }
}

extern "C" int pv_viewer_capture(const char *file, int scale) {
  auto *data = ImGui::GetDrawData();
  if (!data || (scale != 1 && scale != 2)) { last_error = "Capture requires a completed viewer frame"; return -1; }
  const ImVec2 previous = data->FramebufferScale;
  try {
    const int width = static_cast<int>(data->DisplaySize.x) * scale,
      height = static_cast<int>(data->DisplaySize.y) * scale;
    std::vector<unsigned char> pixels(static_cast<size_t>(width) * height * 4);
    data->FramebufferScale = ImVec2(scale, scale);
    surface().capture(width, height, pixels.data());
    data->FramebufferScale = previous;
    pv::write_png(file, width, height, pixels.data());
    return 0;
  } catch (const std::exception &error) {
    data->FramebufferScale = previous;
    last_error = error.what(); return -1;
  }
}

extern "C" const char *pv_executable_path(void) {
  try {
    static const std::string path = [] {
#ifdef __APPLE__
      uint32_t size = 0;
      _NSGetExecutablePath(nullptr, &size);
      std::string buffer(size, '\0');
      if (_NSGetExecutablePath(buffer.data(), &size) != 0)
        throw std::runtime_error("Cannot locate the application executable");
      const char *source = buffer.c_str();
#else
      const char *source = "/proc/self/exe";
#endif
      std::unique_ptr<char, decltype(&std::free)> resolved(realpath(source, nullptr), std::free);
      if (!resolved) throw std::runtime_error("Cannot resolve the application executable");
      return std::string(resolved.get());
    }();
    return path.c_str();
  } catch (const std::exception &error) { last_error = error.what(); return nullptr; }
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
        if (event.type == SDL_EVENT_MOUSE_WHEEL) {
          event.wheel.x *= gpu.wheel_scale;
          event.wheel.y *= gpu.wheel_scale;
        }
        if (event.type == SDL_EVENT_PINCH_UPDATE &&
            (!gpu.window || event.pinch.windowID == SDL_GetWindowID(gpu.window)) &&
            std::isfinite(event.pinch.scale) && event.pinch.scale > 0)
          gpu.pinch_scale = std::clamp(gpu.pinch_scale * event.pinch.scale, 0.1f, 10.0f);
        if (gpu.platform) ImGui_ImplSDL3_ProcessEvent(&event);
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

extern "C" void pv_ui_style(float caret_width) {
  ImGui::GetStyle().InputTextCursorSize = caret_width;
}

namespace {
enum class EditAction { None, Cut, Paste, SelectAll, Clear };
struct EditCommand {
  ImGuiID id = 0;
  EditAction action = EditAction::None;
  int start = 0, end = 0, cursor = 0;
  std::string text;
  bool applied = false;
};
EditCommand edit_command;

int edit_callback(ImGuiInputTextCallbackData *data) {
  auto &command = *static_cast<EditCommand *>(data->UserData);
  if (command.action == EditAction::None) return 0;
  command.applied = true;
  data->SelectionStart = std::clamp(command.start, 0, data->BufTextLen);
  data->SelectionEnd = std::clamp(command.end, 0, data->BufTextLen);
  data->CursorPos = std::clamp(command.cursor, 0, data->BufTextLen);
  if (command.action == EditAction::SelectAll) data->SelectAll();
  if (command.action == EditAction::Clear) {
    data->DeleteChars(0, data->BufTextLen);
    data->CursorPos = data->SelectionStart = data->SelectionEnd = 0;
  }
  if (command.action == EditAction::Cut || command.action == EditAction::Paste) {
    const int start = std::min(data->SelectionStart, data->SelectionEnd);
    const int end = std::max(data->SelectionStart, data->SelectionEnd);
    std::string filtered;
    if (command.action == EditAction::Paste) {
      const int available = data->BufSize - 1 - (data->BufTextLen - (end - start));
      for (const char *cursor = command.text.c_str(); *cursor;) {
        unsigned int codepoint;
        const int length = ImTextCharFromUtf8(&codepoint, cursor, nullptr);
        if (length <= 0) break;
        if (codepoint >= 32 && codepoint != 127) {
          if (static_cast<int>(filtered.size()) + length > available) break;
          filtered.append(cursor, length);
        }
        cursor += length;
      }
    }
    // Callback reconciliation records replacement as one undo step. The toolkit's
    // ordinary paste path records deletion and insertion separately.
    if (command.action == EditAction::Cut || !filtered.empty()) {
      data->DeleteChars(start, end - start);
      if (!filtered.empty()) data->InsertChars(start, filtered.c_str());
      data->CursorPos = data->SelectionStart = data->SelectionEnd = start + static_cast<int>(filtered.size());
    }
  }
  return 0;
}
}

extern "C" int pv_input_text(const char *label, const char *hint, char *buffer, int capacity) {
  const ImGuiID id = ImGui::GetID(label);
  const bool queued = edit_command.id == id && edit_command.action != EditAction::None;
  EditCommand command;
  if (queued) {
    command = std::move(edit_command);
    edit_command = {};
    ImGui::SetKeyboardFocusHere();
  } else if (ImGui::GetActiveID() == id) {
    const bool paste = ImGui::Shortcut(ImGuiMod_Ctrl | ImGuiKey_V, ImGuiInputFlags_Repeat, id);
    const bool insert = ImGui::Shortcut(ImGuiMod_Shift | ImGuiKey_Insert, ImGuiInputFlags_Repeat, id);
    if (paste || insert) {
      if (const auto *state = ImGui::GetInputTextState(id)) {
        const char *clipboard = ImGui::GetClipboardText();
        command = { id, EditAction::Paste, state->GetSelectionStart(), state->GetSelectionEnd(), state->GetCursorPos(), clipboard ? clipboard : "" };
        ImGui::SetKeyOwner(paste ? ImGuiKey_V : ImGuiKey_Insert, ImGui::GetID("##paste-handled"), ImGuiInputFlags_LockThisFrame);
      }
    }
  }
  const bool changed = ImGui::InputTextWithHint(label, hint, buffer, capacity, ImGuiInputTextFlags_CallbackAlways, edit_callback, &command);
  if (queued && !command.applied) edit_command = std::move(command);
  const auto input_item = GImGui->LastItemData;
  if (ImGui::BeginPopupContextItem()) {
    auto *state = ImGui::GetInputTextState(id);
    const bool selected = state && state->HasSelection();
    const auto queue = [&](EditAction action) {
      const int length = static_cast<int>(std::strlen(buffer));
      const char *clipboard = action == EditAction::Paste ? ImGui::GetClipboardText() : nullptr;
      edit_command = { id, action, state ? state->GetSelectionStart() : length, state ? state->GetSelectionEnd() : length, state ? state->GetCursorPos() : length, clipboard ? clipboard : "" };
    };
    const auto copy = [&] {
      if (selected) {
        const int start = std::min(state->GetSelectionStart(), state->GetSelectionEnd());
        const int length = std::abs(state->GetSelectionEnd() - state->GetSelectionStart());
        ImGui::SetClipboardText(std::string(state->TextA.Data + start, length).c_str());
      }
    };
    if (ImGui::MenuItem("Cut", nullptr, false, selected)) { copy(); queue(EditAction::Cut); }
    if (ImGui::MenuItem("Copy", nullptr, false, selected)) copy();
    if (ImGui::MenuItem("Paste")) queue(EditAction::Paste);
    ImGui::Separator();
    if (ImGui::MenuItem("Select all")) queue(EditAction::SelectAll);
    ImGui::EndPopup();
  }
  GImGui->LastItemData = input_item;
  return changed;
}

extern "C" void pv_input_clear(unsigned int id) {
  edit_command = { id, EditAction::Clear };
}

extern "C" int pv_surface_command(void) {
#ifdef __APPLE__
  return pv::take_menu_command();
#else
  return 0;
#endif
}

extern "C" int pv_surface_input_policy(float wheel_scale, int zoom_modifier) {
  try {
    if (!std::isfinite(wheel_scale) || wheel_scale <= 0)
      throw std::runtime_error("Wheel scale must be positive and finite");
    surface().wheel_scale = wheel_scale;
    auto &input = ImPlot::GetInputMap();
    input.ZoomMod = zoom_modifier;
    // ImPlot reserves Ctrl for drag sources by default, which would suppress zoom.
    input.OverrideMod = ImGuiMod_None;
    return 0;
  } catch (const std::exception &error) { last_error = error.what(); return -1; }
}

extern "C" float pv_surface_pinch(void) {
  if (!context) return 1;
  float scale = context->pinch_scale;
  context->pinch_scale = 1;
  return scale;
}

extern "C" PVSize pv_surface_size(void) {
  auto size = ImGui::GetIO().DisplaySize;
  return {size.x, size.y};
}

extern "C" int pv_surface_limit(void) { return surface().max_dimension; }
extern "C" ImFontAtlas *pv_font_atlas(void) { return ImGui::GetIO().Fonts; }
extern "C" int pv_surface_begin(int width, int height, int scale, int omit_hover) {
  try { surface().begin(width, height, scale, omit_hover != 0); return 0; }
  catch (const std::exception &error) { last_error = error.what(); return -1; }
}

extern "C" int pv_surface_present(void) {
  try { return surface().present() ? 0 : 1; }
  catch (const std::exception &error) { last_error = error.what(); return -1; }
}

extern "C" void pv_surface_background(PVColor color) {
  surface().background = {color.x, color.y, color.z, color.w};
}

extern "C" int pv_surface_capture(int width, int height, unsigned char *pixels) {
  try {
    if (!pixels || width < 1 || height < 1)
      throw std::runtime_error("Capture requires positive dimensions and a pixel buffer");
    surface().capture(width, height, pixels);
    return 0;
  } catch (const std::exception &error) { last_error = error.what(); return -1; }
}

extern "C" void pv_surface_close(void) { edit_command = {}; context.reset(); }
extern "C" const char *pv_error(void) { return last_error.empty() ? nullptr : last_error.c_str(); }

extern "C" unsigned char *pv_pixels_deflate_rgb(int width, int height, const unsigned char *rgba, int *length) {
  *length = 0;
  try {
    if (!rgba || width < 1 || height < 1)
      throw std::runtime_error("Pixel compression requires positive dimensions and a pixel buffer");
    DeflateStream compressor;
    auto &stream = compressor.value;
    std::array<unsigned char, 48 * 1024> input;
    std::array<unsigned char, 16 * 1024> output;
    std::vector<unsigned char> compressed;
    size_t remaining = static_cast<size_t>(width) * height;
    while (remaining) {
      const size_t count = std::min(remaining, input.size() / 3);
      for (size_t i = 0; i < count; ++i, rgba += 4) {
        input[i * 3] = rgba[0];
        input[i * 3 + 1] = rgba[1];
        input[i * 3 + 2] = rgba[2];
      }
      remaining -= count;
      stream.next_in = input.data();
      stream.avail_in = static_cast<uInt>(count * 3);
      const int flush = remaining ? Z_NO_FLUSH : Z_FINISH;
      int status;
      do {
        stream.next_out = output.data();
        stream.avail_out = output.size();
        status = deflate(&stream, flush);
        if (status != Z_OK && status != Z_STREAM_END)
          throw std::runtime_error("Pixel compression failed");
        compressed.insert(compressed.end(), output.begin(), output.end() - stream.avail_out);
        if (compressed.size() > INT_MAX)
          throw std::runtime_error("Compressed pixels exceed the supported buffer size");
      } while (stream.avail_in || (flush == Z_FINISH && status != Z_STREAM_END));
    }
    auto result = static_cast<unsigned char *>(std::malloc(compressed.size()));
    if (!result) throw std::bad_alloc();
    std::memcpy(result, compressed.data(), compressed.size());
    *length = static_cast<int>(compressed.size());
    return result;
  } catch (const std::exception &error) {
    last_error = error.what();
    return nullptr;
  }
}

extern "C" void pv_pixels_free(unsigned char *pixels) { std::free(pixels); }

extern "C" int pv_png_write(const char *file, int width, int height,
                             const unsigned char *bytes) {
  try {
    if (!bytes || width < 1 || height < 1)
      throw std::runtime_error("PNG encoding requires positive dimensions and a pixel buffer");
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

extern "C" void pv_image_draw(PVImage *image, PVSize position, PVSize size,
                              PVSize uv0, PVSize uv1, float rounding) {
  ImGui::GetWindowDrawList()->AddImageRounded(
      ImTextureRef(static_cast<ImTextureID>(reinterpret_cast<intptr_t>(image->image->view))),
      {position.x, position.y}, {position.x + size.x, position.y + size.y},
      {uv0.x, uv0.y}, {uv1.x, uv1.y}, IM_COL32_WHITE, rounding);
}

extern "C" void pv_image_destroy(PVImage *image) { delete image; }
