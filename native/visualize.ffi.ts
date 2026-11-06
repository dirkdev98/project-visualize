import { defineLibrary } from "@maligator/cli";

export default defineLibrary({
  headers: ["visualize.h"],
  find: [
    {
      includeDirs: ["."],
      libraryDirs: ["../.cache/native"],
      libraries: ["visualize"],
    },
  ],
});
