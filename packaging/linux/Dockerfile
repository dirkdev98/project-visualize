FROM node:24-bookworm AS toolchain
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl gnupg cmake ninja-build pkg-config unzip patchelf dpkg-dev time zlib1g-dev \
    libx11-dev libxext-dev libxrandr-dev libxcursor-dev libxfixes-dev libxi-dev \
    libxss-dev libxtst-dev libwayland-dev libxkbcommon-dev libdecor-0-dev \
    wayland-protocols libegl1-mesa-dev libdrm-dev libgbm-dev \
    libvulkan1 mesa-vulkan-drivers vulkan-tools xvfb xauth weston poppler-utils \
    && curl -fsSL https://apt.llvm.org/llvm-snapshot.gpg.key \
       | gpg --dearmor -o /usr/share/keyrings/llvm.gpg \
    && echo 'deb [signed-by=/usr/share/keyrings/llvm.gpg] https://apt.llvm.org/bookworm/ llvm-toolchain-bookworm-21 main' \
       > /etc/apt/sources.list.d/llvm.list \
    && apt-get update && apt-get install -y --no-install-recommends clang-21 lld-21 \
    && rm -rf /var/lib/apt/lists/*
ENV CC=clang-21 CXX=clang++-21
RUN curl -fsSL https://sh.rustup.rs -o /tmp/rustup-init.sh \
    && sh /tmp/rustup-init.sh -y --profile minimal --default-toolchain 1.96.0 \
    && rm /tmp/rustup-init.sh
ENV PATH="/root/.cargo/bin:${PATH}"
WORKDIR /app

FROM toolchain AS source
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
