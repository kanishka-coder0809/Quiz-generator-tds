FROM mcr.microsoft.com/devcontainers/javascript-node:1-20-bullseye

# Install system dependencies for Playwright
RUN apt-get update && \
    apt-get install -y wget gnupg ca-certificates libnss3 libxkbcommon0 libatk-bridge2.0-0 libgtk-3-0 libasound2 libgbm1 && \
    rm -rf /var/lib/apt/lists/*

# Install Playwright browsers
RUN npm install -g playwright && \
    playwright install --with-deps chromium

# Set working directory
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]
