FROM node:14.20.0-alpine3.15

WORKDIR /app

COPY package.json package.json

RUN npm install

COPY . .

CMD ["node", "app.js"]
