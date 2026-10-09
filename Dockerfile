FROM node:20-alpine

WORKDIR /app

RUN npm install -g http-server

COPY . .

EXPOSE 6969

CMD ["http-server", "-p", "6969", "-c-1"]
