FROM node:20-alpine AS base
WORKDIR /app

COPY package.json .
RUN npm install

COPY . .

EXPOSE 42069

CMD ["node_modules/.bin/ponder", "start"]
