FROM node:alpine AS builder

WORKDIR /app
COPY . .
RUN corepack enable
RUN rm pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --prod

CMD ["npm", "start"]
