FROM node:alpine AS builder

WORKDIR /app
COPY . .

ENV SHELL=/bin/sh
RUN npm install -g pnpm
RUN pnpm setup
RUN pnpm install -g node-gyp
RUN pnpm install

CMD ["npm", "start"]
