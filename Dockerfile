FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/proxy/package.json apps/proxy/package.json
COPY packages/cli/package.json packages/cli/package.json
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 4318
CMD ["npm", "run", "start", "-w", "@aegisflow/proxy"]
