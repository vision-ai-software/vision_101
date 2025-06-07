# Use an official Node.js runtime as a parent image
FROM node:18-slim

# Install curl for health checks
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Copy package files for dependency installation
# Using root package.json which contains all dependencies
COPY package.json package-lock.json ./

# Install app dependencies
# Using --only=production to skip devDependencies in the final image
RUN npm install --only=production

# Bundle app source (copy all application files)
COPY . .

# Create a non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser appuser
RUN chown -R appuser:appuser /usr/src/app
USER appuser

# Cloud Run injects the PORT environment variable
# Default to 8080 if PORT is not set by the platform
ENV PORT=8080
ENV NODE_ENV=production

# Expose the port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

# Define the command to run your backend application
CMD ["node", "backend/src/server.js"] 