# Use Node.js base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files and install deps
COPY package*.json ./
RUN npm install

# Copy the rest of the app
COPY . .

# Expose the port (matches Express app)
EXPOSE 3000

# Start the app
CMD ["node", "index.js"]