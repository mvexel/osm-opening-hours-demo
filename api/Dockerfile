FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application code
COPY server.js ./

# Expose API port
EXPOSE 3001

# Run as non-root user
USER node

CMD ["node", "server.js"]
