FROM node:alpine AS builder

WORKDIR /app
COPY . .
RUN corepack enable
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install -g node-gyp
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --prod

CMD ["npm", "start"]
