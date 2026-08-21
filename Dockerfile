FROM node:20-alpine

# Install build tools for native dependencies (like your cpp-matcher and bcrypt)
RUN apk add --no-cache python3 make g++ gcc

WORKDIR /app

# Copy root configuration files
COPY package*.json ./
COPY turbo.json ./

# Copy the backend app and database package
COPY packages ./packages
COPY apps/backend ./apps/backend

# Install all dependencies (this handles monorepo workspaces)
RUN npm install

# Generate Prisma Client
RUN cd packages/database && npx prisma generate

# Build the backend using Turbo
RUN npx turbo run build --filter=@kephale/backend

# Set production environment
ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

# Start the NestJS backend
CMD ["npm", "run", "start:prod", "-w", "@kephale/backend"]
