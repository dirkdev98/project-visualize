#define CIMGUI_DEFINE_ENUMS_AND_STRUCTS
#include "cimgui.h"
#include "visualize.h"
#include <cstring>
#include <dlfcn.h>
#include <iostream>
#include <stdexcept>

template<typename T> T symbol(void *library, const char *name) {
  auto result = reinterpret_cast<T>(dlsym(library, name));
  if (!result) throw std::runtime_error(name);
  return result;
}

int main(int argc, char **argv) {
  if (argc != 2) return 2;
  auto library = dlopen(argv[1], RTLD_NOW | RTLD_LOCAL);
  if (!library) { std::cerr << dlerror(); return 2; }
#define LOAD(name) auto call_##name = symbol<decltype(&name)>(library, #name)
  LOAD(pv_surface_open); LOAD(pv_surface_close); LOAD(pv_surface_begin); LOAD(pv_error);
  LOAD(pv_input_text); LOAD(pv_input_clear); LOAD(igGetItemID); LOAD(igGetIO_Nil); LOAD(igGetPlatformIO_Nil);
  LOAD(igSetNextWindowPos); LOAD(igSetNextWindowSize); LOAD(igSetWindowFocus_Str);
  LOAD(igSetKeyboardFocusHere); LOAD(igBegin); LOAD(igEnd); LOAD(igRender);
  LOAD(ImGuiIO_AddKeyEvent);
  if (call_pv_surface_open(0) < 0) { std::cerr << call_pv_error(); return 2; }
  int result = 0;
  try {
    char buffer[32] = "fictional query";
    int capacity = sizeof(buffer);
    bool focus = true;
    ImGuiID input_id = 0;
    const auto frame = [&] {
      if (call_pv_surface_begin(481, 160, 1) < 0) throw std::runtime_error(call_pv_error());
      call_igSetNextWindowPos({0, 0}, 0, {0, 0});
      call_igSetNextWindowSize({481, 160}, 0);
      call_igBegin("Editing", nullptr, ImGuiWindowFlags_NoDecoration | ImGuiWindowFlags_NoMove);
      call_igSetWindowFocus_Str("Editing");
      if (focus) { call_igSetKeyboardFocusHere(0); focus = false; }
      call_pv_input_text("##query", "Query", buffer, capacity);
      input_id = call_igGetItemID();
      call_igEnd(); call_igRender();
    };
    auto *io = call_igGetIO_Nil();
#ifdef __APPLE__
    const auto modifier = ImGuiMod_Super;
#else
    const auto modifier = ImGuiMod_Ctrl;
#endif
    const auto chord = [&](ImGuiKey key, bool shift = false) {
      call_ImGuiIO_AddKeyEvent(io, modifier, true);
      if (shift) call_ImGuiIO_AddKeyEvent(io, ImGuiMod_Shift, true);
      call_ImGuiIO_AddKeyEvent(io, key, true); frame(); frame();
      call_ImGuiIO_AddKeyEvent(io, key, false);
      if (shift) call_ImGuiIO_AddKeyEvent(io, ImGuiMod_Shift, false);
      call_ImGuiIO_AddKeyEvent(io, modifier, false); frame(); frame();
    };
    frame(); frame();
    auto *platform = call_igGetPlatformIO_Nil();
    platform->Platform_GetClipboardTextFn = [](ImGuiContext *) -> const char * { return nullptr; };
    chord(ImGuiKey_A); chord(ImGuiKey_V);
    if (std::strcmp(buffer, "fictional query")) throw std::runtime_error("Non-text clipboard changed the input");
    platform->Platform_GetClipboardTextFn = [](ImGuiContext *) { return "café Ω"; };
    chord(ImGuiKey_V);
    if (std::strcmp(buffer, "café Ω")) throw std::runtime_error("Unicode paste did not replace the selected text");
    chord(ImGuiKey_Z);
    if (std::strcmp(buffer, "fictional query")) throw std::runtime_error("Replacement paste was not one undo action");
    chord(ImGuiKey_Z, true);
    if (std::strcmp(buffer, "café Ω")) throw std::runtime_error("Redo did not restore the replacement");
    capacity = 12;
    platform->Platform_GetClipboardTextFn = [](ImGuiContext *) { return "éééééééé"; };
    chord(ImGuiKey_A); chord(ImGuiKey_V);
    if (std::strcmp(buffer, "ééééé")) throw std::runtime_error("Paste capacity split or dropped a complete UTF-8 character");
    call_pv_input_clear(input_id); frame(); frame(); frame();
    if (*buffer) throw std::runtime_error("Clear did not empty the input");
    chord(ImGuiKey_Z);
    if (std::strcmp(buffer, "ééééé")) throw std::runtime_error("Clear did not preserve undo history");
    std::cout << "{\"ok\":true,\"editing\":\"non-text clipboard, Unicode paste, atomic undo, redo, UTF-8 capacity, undoable clear\"}\n";
  } catch (const std::exception &error) { std::cerr << error.what(); result = 1; }
  call_pv_surface_close(); dlclose(library); return result;
}
