# Third-party software

The native build downloads pinned source archives and headers listed in
[native/dependencies.json](native/dependencies.json). The build script also pins the
platform-specific wgpu-native release and verifies its SHA-256 checksum. Release
artifacts include upstream license notices in `licenses/`.

| Software                                                | Purpose                         | License                              |
| ------------------------------------------------------- | ------------------------------- | ------------------------------------ |
| [Maligator](https://github.com/dirkdev98/maligator)     | Application and CLI runtime     | See the release artifact's `LICENSE` |
| [wgpu-native](https://github.com/gfx-rs/wgpu-native)    | Native WebGPU rendering         | MIT or Apache-2.0                    |
| [Dear ImGui](https://github.com/ocornut/imgui)          | Desktop widgets and layout      | MIT                                  |
| [ImPlot](https://github.com/epezent/implot)             | Interactive charts              | MIT                                  |
| [SDL3](https://github.com/libsdl-org/SDL)               | Native windows and input        | zlib                                 |
| [MD4C](https://github.com/mity/md4c)                    | CommonMark parsing              | MIT                                  |
| [JSON for Modern C++](https://github.com/nlohmann/json) | Native document decoding        | MIT                                  |
| [stb](https://github.com/nothings/stb)                  | Image decoding and PNG encoding | MIT or public domain                 |
| [zlib](https://zlib.net/)                               | PDF image compression           | zlib                                 |

The viewer uses macOS system fonts. Font files are not distributed with the app.
