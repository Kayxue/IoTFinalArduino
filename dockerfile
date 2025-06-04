FROM node:20-alpine AS builder

WORKDIR /app
COPY . .
RUN corepack enable
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --prod
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm rebuild serialport

CMD ["npm", "start"]
