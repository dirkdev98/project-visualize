import { defineBuild } from "@maligator/cli";

export default defineBuild({
  entry: "src/index.ts",
  outputName: "visualize",
  surface: { node: true },
  ffi: {
    visualize: { contract: "native/visualize.ffi.ts", link: "shared" },
  },
});
