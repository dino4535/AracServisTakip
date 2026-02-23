FROM node:20-alpine

WORKDIR /app

COPY backend/package*.json ./

RUN npm install --omit=dev

COPY backend ./

RUN npm install && npm run build

ENV NODE_ENV=production
ENV PORT=3010

EXPOSE 3010

CMD ["npm", "run", "start"]

