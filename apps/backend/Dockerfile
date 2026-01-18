# Stage 1: Build Agent (Go)
FROM golang:1.21-alpine AS agent-builder
WORKDIR /build
COPY apps/agent/go.mod apps/agent/go.sum ./
RUN go mod download
COPY apps/agent .
# Cross-compile for Linux AMD64 (common server arch)
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o bittrail-agent-linux-amd64 ./cmd/agent
# Also build for ARM64 if needed (optional, good for local M1/M2 testing or ARM servers)
RUN CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -o bittrail-agent-linux-arm64 ./cmd/agent

# Stage 2: Setup Backend (Node)
FROM node:20-alpine

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache openssl python3 make g++

# Copy package files
COPY apps/backend/package*.json ./
COPY apps/backend/prisma ./prisma/

# Install dependencies
RUN npm install

# Generate Prisma Client
RUN npx prisma generate

# Copy source code
COPY apps/backend .

# Copy built agent from Stage 1
# Create public directory
RUN mkdir -p public
COPY --from=agent-builder /build/bittrail-agent-linux-amd64 ./public/bittrail-agent
COPY --from=agent-builder /build/bittrail-agent-linux-arm64 ./public/bittrail-agent-arm64
COPY apps/agent/bittrail-agent.service ./public/bittrail-agent.service

# Create uploads directory
RUN mkdir -p uploads/evidence

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
