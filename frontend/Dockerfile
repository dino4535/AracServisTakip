FROM node:20-alpine

WORKDIR /app

COPY frontend/package*.json ./

RUN npm install

COPY frontend ./

RUN npm run build

ENV NODE_ENV=production

EXPOSE 4010

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "4010"]

