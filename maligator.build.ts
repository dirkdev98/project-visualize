import { defineBuild } from "@maligator/cli";

export default defineBuild({
  entry: "src/index.ts",
  outputName: "visualize",
  surface: { node: true },
  assets: {
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
    visualize: { contract: "native/visualize.ffi.ts", link: "shared" },
  },
});
