FROM node:24-alpine
WORKDIR /app
COPY package.json server.mjs ./
COPY lib ./lib
COPY public ./public
RUN mkdir -p /app/data && chown -R node:node /app
USER node
ENV PORT=3000 DATA_DIR=/app/data NODE_ENV=production
EXPOSE 3000
CMD ["node","server.mjs"]
