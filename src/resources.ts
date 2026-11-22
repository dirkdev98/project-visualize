import { embedDirectory, embedFile } from "maligator:assets";

export const htmlResources = embedDirectory("../.cache/resources/html", {
  include: ["*.js", "*.css", "*.woff2", "*.txt", "*.json"],
});
export const workflowResources = embedDirectory(
  "../.cache/resources/workflow",
  {
    include: ["**/*"],
  },
);
export const fontResources = embedDirectory("../assets/fonts", {
  include: ["*.ttf", "LICENSE.txt"],
});
export const iconResources = embedDirectory("../assets/icons", {
  include: ["*.ttf", "LICENSE.txt"],
});
export const versionResource = embedFile("../.cache/resources/version.txt");
export const syntaxResources = embedDirectory("../.cache/resources/syntax", {
  include: ["*.json"],
});
