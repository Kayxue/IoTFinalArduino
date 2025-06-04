FROM node:alpine AS builder

WORKDIR /app
COPY . .

RUN npm install -g pnpm
RUN pnpm setup
RUN pnpm install -g node-gyp
RUN pnpm install

CMD ["npm", "start"]
