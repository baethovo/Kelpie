FROM node:20-alpine AS builder

WORKDIR /app

# Install build tools for native C++ modules
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY . .

EXPOSE 3000

ENV NODE_ENV=production

CMD ["npm", "start"]
