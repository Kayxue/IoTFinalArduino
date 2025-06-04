FROM node:20-slim AS builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    make \
    g++ \
    udev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN corepack enable
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --prod
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm rebuild serialport

CMD ["npm", "start"]
