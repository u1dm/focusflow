FROM node:lts-alpine3.22

RUN mkdir -p /opt/app

WORKDIR /opt/app

COPY package.json  .

RUN npm install

COPY . .

EXPOSE 3000

CMD [ "npm", "start"]