cmake_minimum_required(VERSION 3.24)
project(visualize LANGUAGES C CXX)
if(APPLE)
  enable_language(OBJCXX)
endif()
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
find_package(SDL3 3.4.18 CONFIG REQUIRED)
find_package(ZLIB REQUIRED)
set(DEPS "${CMAKE_CURRENT_SOURCE_DIR}/../.cache/deps")
set(IMGUI "${DEPS}/imgui")
set(IMPLOT "${DEPS}/implot")

add_library(visualize SHARED
  backend.cpp gpu.cpp
  ${DEPS}/cimgui/cimgui.cpp ${DEPS}/cimplot/cimplot.cpp
  ${IMGUI}/imgui.cpp ${IMGUI}/imgui_draw.cpp ${IMGUI}/imgui_demo.cpp
  ${IMGUI}/imgui_tables.cpp ${IMGUI}/imgui_widgets.cpp
  ${IMGUI}/backends/imgui_impl_sdl3.cpp ${IMGUI}/backends/imgui_impl_wgpu.cpp
  ${IMPLOT}/implot.cpp ${IMPLOT}/implot_items.cpp ${IMPLOT}/implot_demo.cpp)
if(APPLE)
  target_sources(visualize PRIVATE macos.mm)
  set_source_files_properties(macos.mm PROPERTIES COMPILE_OPTIONS "-fobjc-arc")
  set_source_files_properties(${IMGUI}/backends/imgui_impl_wgpu.cpp PROPERTIES LANGUAGE OBJCXX)
  set(WGPU_LIBRARY "${DEPS}/wgpu/lib/libwgpu_native.dylib")
else()
  set(WGPU_LIBRARY "${DEPS}/wgpu/lib/libwgpu_native.so")
  set_target_properties(visualize PROPERTIES SOVERSION 0)
endif()
target_include_directories(visualize PRIVATE ${DEPS} ${IMGUI} ${IMGUI}/backends
  ${IMPLOT} ${DEPS}/cimgui ${DEPS}/cimplot ${DEPS}/wgpu/include)
target_compile_definitions(visualize PRIVATE IMGUI_IMPL_WEBGPU_BACKEND_WGPU
  IMGUI_DISABLE_DEMO_WINDOWS IMPLOT_DISABLE_DEMO_WINDOWS)
target_compile_options(visualize PRIVATE -Wall -Wextra -Wno-unused-parameter)
target_link_libraries(visualize PRIVATE SDL3::SDL3 ZLIB::ZLIB "${WGPU_LIBRARY}")
if(APPLE)
  target_link_libraries(visualize PRIVATE
    "-framework Cocoa" "-framework QuartzCore" "-framework Metal"
    "-framework MetalKit" "-framework CoreFoundation")
endif()
set_target_properties(visualize PROPERTIES BUILD_RPATH "${DEPS}/wgpu/lib")
