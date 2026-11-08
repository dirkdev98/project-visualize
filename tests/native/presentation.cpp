#define CIMGUI_DEFINE_ENUMS_AND_STRUCTS
#include "cimgui.h"
#include "visualize.h"
#include <SDL3/SDL.h>
#include <dlfcn.h>
#include <chrono>
#include <iostream>
#include <stdexcept>

template<typename T> T symbol(void *library, const char *name) {
  auto result = reinterpret_cast<T>(dlsym(library, name));
  if (!result) throw std::runtime_error(name);
  return result;
}
int main(int argc, char **argv) {
  if (argc != 2 && !(argc == 3 && std::string(argv[2]) == "--visible")) return 2;
  auto library = dlopen(argv[1], RTLD_NOW | RTLD_LOCAL);
  if (!library) {std::cerr << dlerror(); return 2;}
#define LOAD(name) auto call_##name = symbol<decltype(&name)>(library, #name)
  LOAD(pv_surface_open); LOAD(pv_surface_close); LOAD(pv_surface_begin);
  LOAD(pv_surface_present); LOAD(pv_surface_wait); LOAD(pv_error);
  LOAD(pv_surface_raise);
  LOAD(igSetNextWindowPos); LOAD(igSetNextWindowSize); LOAD(igBegin);
  LOAD(igTextUnformatted); LOAD(igEnd); LOAD(igRender); LOAD(igGetFrameCount);
  LOAD(SDL_GetWindows); LOAD(SDL_HideWindow); LOAD(SDL_ShowWindow); LOAD(SDL_RaiseWindow); LOAD(SDL_free);
  if (call_pv_surface_open(1)<0) {std::cerr << call_pv_error(); return 2;}
  int result = 0;
  try {
    int count = 0; auto windows = call_SDL_GetWindows(&count);
    if (!windows || count != 1) throw std::runtime_error("Expected one probe window");
    auto window = windows[0]; call_SDL_free(windows);
    if (call_pv_surface_begin(0,0,1)<0) throw std::runtime_error(call_pv_error());
    call_igSetNextWindowPos({0,0},0,{0,0}); call_igSetNextWindowSize({1440,960},0);
    call_igBegin("Presentation lifecycle",nullptr,ImGuiWindowFlags_NoDecoration);
    call_igTextUnformatted("Retain this frame while the surface is unavailable",nullptr);
    call_igEnd(); call_igRender();
    const int frame = call_igGetFrameCount();
    if (argc == 3) {
      if (call_pv_surface_raise() < 0) throw std::runtime_error(call_pv_error());
      int status = 1;
      const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(5);
      while (status == 1 && std::chrono::steady_clock::now() < deadline) {
        call_pv_surface_wait(100);
        status = call_pv_surface_present();
      }
      if (status != 0) throw std::runtime_error(status < 0 ? call_pv_error() : "Visible surface never presented");
      std::cout << "{\"visible\":true,\"presented\":true,\"ui_frames\":1}\n";
      call_pv_surface_close(); dlclose(library); return 0;
    }
    call_SDL_HideWindow(window);
    const auto hiddenUntil = std::chrono::steady_clock::now()+std::chrono::milliseconds(500);
    while (std::chrono::steady_clock::now()<hiddenUntil) call_pv_surface_wait(50);
    const int deferred = call_pv_surface_present();
    if (deferred < 0) throw std::runtime_error(call_pv_error());
    if (deferred == 0) {
      std::cout << "{\"deferred\":false,\"note\":\"No retryable result was reported while hidden\"}\n";
      result = 3;
    } else {
      call_SDL_ShowWindow(window); call_SDL_RaiseWindow(window);
      if (call_pv_surface_raise() < 0) throw std::runtime_error(call_pv_error());
      int status=1, attempts=0;
      const auto deadline=std::chrono::steady_clock::now()+std::chrono::seconds(5);
      while (status==1 && std::chrono::steady_clock::now()<deadline) {
        call_pv_surface_wait(100); status=call_pv_surface_present(); attempts++;
      }
      if (status != 0) throw std::runtime_error(status < 0 ? call_pv_error() : "Visible surface never presented");
      if (call_igGetFrameCount()!=frame) throw std::runtime_error("Retry advanced the UI frame");
      std::cout << "{\"deferred\":true,\"presented\":true,\"ui_frames\":1,\"retry_attempts\":" << attempts << "}\n";
    }
  } catch (const std::exception &error) {std::cerr << error.what(); result=2;}
  call_pv_surface_close(); dlclose(library); return result;
}
