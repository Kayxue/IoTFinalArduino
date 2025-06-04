FROM node:alpine AS builder

WORKDIR /app
COPY . .

RUN npm install -g node-gyp
RUN npm install

CMD ["npm", "start"]
