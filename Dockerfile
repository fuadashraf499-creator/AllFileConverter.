# Enhanced AllFileConverter Backend Dockerfile
# Production-ready with comprehensive tool installation and verification

FROM node:18-alpine AS base

# Install system dependencies and conversion tools
RUN apk update && apk upgrade && \
    apk add --no-cache \
    # Core system tools
    curl \
    bash \
    python3 \
    py3-pip \
    ca-certificates \
    tzdata \
    # Document conversion tools
    libreoffice \
    pandoc \
    # Image processing tools
    imagemagick \
    ghostscript \
    # PDF tools
    poppler-utils \
    # Video/Audio tools
    ffmpeg \
    # Additional tools for enhanced conversions
    # Note: wkhtmltopdf not available in Alpine, using alternatives
    xvfb \
    ttf-dejavu \
    ttf-droid \
    ttf-freefont \
    ttf-liberation \
    # Development tools
    git \
    && rm -rf /var/cache/apk/*

# Install additional Python packages for enhanced conversions
RUN pip3 install --no-cache-dir --break-system-packages \
    Pillow \
    python-docx \
    PyPDF2 \
    reportlab

# Create non-root user with specific UID/GID
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy application code
COPY . .

# Copy tool verification script
COPY verify-tools.js ./

# Create necessary directories with proper permissions
RUN mkdir -p uploads output logs temp && \
    chown -R nextjs:nodejs /app && \
    chmod -R 755 /app && \
    chmod +x server.js && \
    chmod +x verify-tools.js

# Configure ImageMagick security policy for PDF processing
RUN sed -i 's/<policy domain="coder" rights="none" pattern="PDF" \/>/<policy domain="coder" rights="read|write" pattern="PDF" \/>/g' /etc/ImageMagick-7/policy.xml

# Configure LibreOffice for headless operation
RUN mkdir -p /home/nextjs/.config/libreoffice && \
    chown -R nextjs:nodejs /home/nextjs && \
    chmod -R 755 /home/nextjs

# Switch to non-root user
USER nextjs

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    DISPLAY=:99 \
    LANG=C.UTF-8

# Expose port
EXPOSE 3000

# Add comprehensive health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://127.0.0.1:3000/api/health || exit 1

# Add labels for better container management
LABEL maintainer="AllFileConverter Team" \
      version="2.0" \
      description="AllFileConverter Backend - Enhanced with comprehensive tool support" \
      org.opencontainers.image.source="https://github.com/allfileconverter/backend"

# Start script that verifies tools and starts the server
CMD ["sh", "-c", "echo 'Starting AllFileConverter Backend...' && node verify-tools.js && node server.js"]
