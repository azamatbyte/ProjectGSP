FROM node:20.11.0 AS builder
RUN mkdir app
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm install
RUN npx prisma generate

ENV NODE_ENV production

COPY . ./

FROM node:16.3.0-alpine
COPY --from=builder /app /app
WORKDIR /app 
ENV HOST=0.0.0.0

EXPOSE 8081
ENV NODE_ENV production
CMD ["npm","run","start"]