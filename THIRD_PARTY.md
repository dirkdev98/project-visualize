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
| [FreeType](https://freetype.org/)                    | Native font rasterization       | FreeType License                     |
| [stb](https://github.com/nothings/stb)               | Image decoding and PNG encoding | MIT or public domain                 |
| [zlib](https://zlib.net/)                            | System image compression        | zlib                                 |

JS dependencies provide Markdown parsing, character references and Shiki syntax highlighting.
Their notices are included in the runtime artifact.

Portions of this software are copyright 1996-2026 The FreeType Project
(https://freetype.org/). All rights reserved.

- [Marked](https://github.com/markedjs/marked) provides Markdown tokens under the MIT license.
- [Shiki](https://github.com/shikijs/shiki) provides syntax highlighting, grammars and themes
  under the MIT license.
- [entities](https://github.com/fb55/entities) decodes character references under BSD-2-Clause.
- [pdf-lib](https://github.com/Hopding/pdf-lib) and its fontkit package embed a selectable
  text layer and fonts under the MIT license.

The viewer, PDF text layer and HTML exports share bundled
[IBM Plex](https://github.com/IBM/plex) fonts under the SIL Open Font License. Their
source revision and checksums are recorded in
[assets/fonts/sources.json](assets/fonts/sources.json); the app includes the license.

Viewer icons come from the [Lucide](https://github.com/lucide-icons/lucide) icon font under
the ISC license, with icons derived from Feather under the MIT license. Its package version
and checksums are recorded in [assets/icons/sources.json](assets/icons/sources.json); the
app includes the license.

HTML resources are bundled with esbuild and their fonts are compressed at build time
with [wawoff2](https://github.com/fontello/wawoff2), using Google's WOFF2 encoder.
Standalone and fragment exports carry the font and bundled browser dependency notices.
