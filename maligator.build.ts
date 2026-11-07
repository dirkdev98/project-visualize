import { defineBuild } from "@maligator/cli";

export default defineBuild({
  entry: "src/index.ts",
  outputName: "visualize",
  surface: { node: true },
  assets: {
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
