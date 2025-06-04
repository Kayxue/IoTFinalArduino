FROM node:alpine AS builder

WORKDIR /app
COPY . .

ENV SHELL=/bin/sh
RUN npm install -g node-gyp
RUN npm install

CMD ["npm", "start"]
