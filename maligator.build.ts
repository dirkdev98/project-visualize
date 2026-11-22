import { defineBuild } from "@maligator/cli";

export default defineBuild({
  entry: "src/index.ts",
  outputName: "visualize",
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
