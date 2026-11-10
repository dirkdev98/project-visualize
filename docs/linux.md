# Linux packaging

Build the application in the supplied Debian container to produce a relocatable
tarball and a Debian package for the container's architecture, x64 or arm64. The container keeps Linux native dependencies and
compiler caches separate from the Mac checkout.

```sh
docker build --platform linux/amd64 --target visual-tests \
  -f packaging/linux/Dockerfile -t project-visualize-linux .
docker run --name visualize-linux-build --platform linux/amd64 \
  project-visualize-linux sh -c \
  'xvfb-run -a npm run check && npm run check:linux-package'
docker cp visualize-linux-build:/app/dist/packages ./linux-packages
docker rm visualize-linux-build
```

Use `--platform linux/arm64` in both commands for arm64 packages.

The build pins native dependencies, includes the skill, guide, examples and license
notices, and writes package checksums. Node.js, Rust and the native compiler belong
to the build environment; installed applications run without them.

## Installation

Install the `.deb` with `apt install /path/to/package.deb` as an administrator. It
installs the application under `/usr/lib/project-visualize`, exposes `visualize` on
PATH and adds a desktop entry. Dependency versions are derived from the packaged
ELF binaries. Debian Bookworm is the build environment and runtime baseline.

For a user installation, extract the tarball into a permanent directory and keep
its `bin`, `lib` and resource directories together. Run `bin/visualize` there to
open the viewer. Settings can link its CLI into a user directory on PATH and link
the bundled skill into an agent skill directory. These actions retain existing
destinations. Replace the bundle at the same location to keep its links valid.

The host supplies the Vulkan loader, GPU driver and desktop libraries. The Debian
package declares its library dependencies and recommends a Vulkan driver. A tarball
needs equivalent system libraries. Driver libraries and glibc stay outside the bundle.

## Library and appearance

Artifacts and preferences live under `$XDG_DATA_HOME/project-visualize`, or
`~/.local/share/project-visualize` when that variable is absent or relative.
`VISUALIZE_HOME` and `--store` select another library.

The viewer follows SDL's desktop appearance. Command-line captures query the
desktop settings portal through `gdbus`; without a reported dark preference they
use light appearance. Set a preference in Settings or pass `--theme light|dark`
for an explicit palette. Settings remains available in the sidebar and through Ctrl+,.

## Verification

`npm run check:linux-package` extracts each package into a temporary directory and
runs its CLI from another working directory. It checks bundled libraries, resource
discovery, desktop and phone captures, presentation markers and skill linking.

GPU exports run without a display server. Mesa's Vulkan software driver provides a
headless verification path. The CLI creates and removes a private graphics runtime
directory when `XDG_RUNTIME_DIR` is absent. To check window presentation on X11, run
`xvfb-run -a npm run check:viewer -- --visible`. A Wayland session can run the same
check with its SDL video driver selected. These checks establish rendering in the
chosen environment; physical GPU and desktop behavior depend on the host drivers.
