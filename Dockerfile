# Use an official Node.js runtime as a parent image
FROM node:18-slim

# Create app directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (if you use it)
# This assumes all necessary dependencies for the backend are in the root package.json
COPY package.json ./
# COPY package-lock.json ./ 
# If you have a yarn.lock, copy that instead and use yarn commands below
# COPY yarn.lock ./

# Install app dependencies
# Using --only=production to skip devDependencies in the final image
RUN npm install --only=production
# If you were using yarn: 
# RUN yarn install --production

# Bundle app source
COPY . .

# Your backend app likely runs on a port, e.g., 8080 or specified by an environment variable PORT
# Cloud Run injects the PORT environment variable, which your app should listen on.
# Defaulting to 8080 if PORT is not set by the platform.
ENV PORT 8080
EXPOSE 8080

# Define the command to run your backend application
# This should be the command that starts your Express server (or similar)
# Assuming backend/src/index.js is your main entry point for the server
CMD ["node", "backend/src/index.js"] 