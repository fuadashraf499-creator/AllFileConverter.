# AllFileConverter Backend Dockerfile with Complete PDF Support
FROM node:18-alpine

# Install system dependencies and conversion tools
RUN apk update && apk upgrade && \
    apk add --no-cache \
    curl \
    bash \
    python3 \
    py3-pip \
    ca-certificates \
    tzdata \
    # Document conversion tools
    libreoffice \
    pandoc \
    # LaTeX tools for Pandoc PDF generation - CRITICAL FIX
    texlive-latex-base \
    texlive-latex-recommended \
    texlive-latex-extra \
    texlive-fonts-recommended \
    # Image processing tools
    imagemagick \
    ghostscript \
    # PDF tools
    poppler-utils \
    # Video/Audio tools
    ffmpeg \
    # Additional tools for enhanced conversions
    wkhtmltopdf \
    xvfb \
    ttf-dejavu \
    ttf-droid \
    ttf-freefont \
    ttf-liberation \
    # Development tools
    git \
    && rm -rf /var/cache/apk/*

# Install Python packages for document processing
RUN pip3 install --no-cache-dir --break-system-packages \
    Pillow \
    python-docx \
    PyPDF2 \
    reportlab

# Create user and group
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy application code
COPY . .
COPY verify-tools.js ./

# Create necessary directories and set permissions
RUN mkdir -p uploads output logs temp && \
    chown -R nextjs:nodejs /app && \
    chmod -R 755 /app && \
    chmod +x server.js && \
    chmod +x verify-tools.js

# Configure ImageMagick policy for PDF processing
RUN sed -i 's/<policy domain="coder" rights="none" pattern="PDF" \/>/<policy domain="coder" rights="read|write" pattern="PDF" \/>/g' /etc/ImageMagick-7/policy.xml

# Configure LibreOffice
RUN mkdir -p /home/nextjs/.config/libreoffice && \
    chown -R nextjs:nodejs /home/nextjs && \
    chmod -R 755 /home/nextjs

# Switch to non-root user
USER nextjs

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Labels
LABEL maintainer="AllFileConverter"
LABEL description="Complete file conversion service with PDF support"
LABEL version="2.0.0"

# Start the application with tool verification
CMD ["sh", "-c", "node verify-tools.js && node server.js"]ckend...' && node verify-tools.js && node server.js"]
