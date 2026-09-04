FROM node:20-alpine AS build
WORKDIR /app
# git is needed at build time so vite.config.ts can stamp __APP_VERSION__
RUN apk add --no-cache git
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server

EXPOSE 8080
CMD ["npm", "start"]
