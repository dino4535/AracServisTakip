FROM node:20-alpine

WORKDIR /app

COPY frontend/package*.json ./

RUN npm install

COPY frontend ./

ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

ENV NODE_ENV=production

EXPOSE 4010

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "4010"]
