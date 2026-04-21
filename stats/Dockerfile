FROM node:20-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY stats/package*.json ./
RUN npm install --production
COPY stats/ .
RUN mkdir -p data
EXPOSE 3000
CMD ["node", "server.js"]
