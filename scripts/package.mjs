if (process.platform === "darwin") await import("./package-macos.mjs");
else if (process.platform === "linux") await import("./package-linux.mjs");
else throw new Error("Package on macOS or Linux.");
