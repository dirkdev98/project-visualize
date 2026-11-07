import { defineBuild } from "@maligator/cli";

export default defineBuild({
  entry: "src/index.ts",
  outputName: "visualize",
  surface: { node: true },
  assets: {
    workflow: {
      type: "directory",
      path: ".cache/resources/workflow",
      include: ["**/*"],
    },
    fonts: {
      type: "directory",
      path: "assets/fonts",
      include: ["*.ttf", "LICENSE.txt"],
    },
    syntax: {
      type: "directory",
      path: ".cache/resources/syntax",
      include: ["*.json"],
    },
  },
  ffi: {
    visualize: {
      contract: "native/visualize.ffi.ts",
      link: "shared",
      ...(process.platform === "linux"
        ? {
            find: {
              includeDirs: [
                "native",
                ".cache/deps/cimgui",
                ".cache/deps/cimplot",
                ".cache/sdl/include",
              ],
              defines: { CIMGUI_DEFINE_ENUMS_AND_STRUCTS: "1" },
              libraryDirs: [".cache/native", ".cache/sdl/lib"],
              libraries: ["visualize", "SDL3"],
            },
          }
        : {}),
    },
  },
});
