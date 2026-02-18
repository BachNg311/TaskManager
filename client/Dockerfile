FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Expose dev server port 
EXPOSE 3000

# Start the frontend dev server
CMD ["npm", "start"]

