FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates poppler-utils tesseract-ocr tesseract-ocr-eng tesseract-ocr-osd && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN npm ci --include=dev --no-audit --no-fund && npm run build
ENV NODE_ENV=production
ENV ERP_WEB_ROOT=/app/public
EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate:deploy && exec node start.mjs"]
