# Third-party software

The native build downloads pinned source archives and headers listed in
[native/dependencies.json](native/dependencies.json). The build script also pins the
platform-specific wgpu-native release and verifies its SHA-256 checksum. Release
artifacts include upstream license notices in `licenses/`. The standalone app also
carries them in `Contents/Resources/`.

| Software                                             | Purpose                         | License                              |
| ---------------------------------------------------- | ------------------------------- | ------------------------------------ |
| [Maligator](https://github.com/dirkdev98/maligator)  | Application and CLI runtime     | See the release artifact's `LICENSE` |
| [wgpu-native](https://github.com/gfx-rs/wgpu-native) | Native WebGPU rendering         | MIT or Apache-2.0                    |
| [Dear ImGui](https://github.com/ocornut/imgui)       | Desktop widgets and layout      | MIT                                  |
| [ImPlot](https://github.com/epezent/implot)          | Interactive charts              | MIT                                  |
| [cimgui](https://github.com/cimgui/cimgui)           | Generated widget C bindings     | MIT                                  |
| [cimplot](https://github.com/cimgui/cimplot)         | Generated chart C bindings      | MIT                                  |
| [SDL3](https://github.com/libsdl-org/SDL)            | Native windows and input        | zlib                                 |
| [stb](https://github.com/nothings/stb)               | Image decoding and PNG encoding | MIT or public domain                 |

JS dependencies provide Markdown parsing, character references and Shiki syntax highlighting.
Their notices are included in the runtime artifact.

- [Marked](https://github.com/markedjs/marked) provides Markdown tokens under the MIT license.
- [Shiki](https://github.com/shikijs/shiki) provides syntax highlighting, grammars and themes
  under the MIT license.
- [entities](https://github.com/fb55/entities) decodes character references under BSD-2-Clause.
- [pdf-lib](https://github.com/Hopding/pdf-lib) and its fontkit package embed a selectable
  text layer and fonts under the MIT license.

The viewer and PDF text layer share bundled [IBM Plex](https://github.com/IBM/plex)
fonts under the SIL Open Font License. Their source revision and checksums are recorded
in [assets/fonts/sources.json](assets/fonts/sources.json); the app includes the license.
