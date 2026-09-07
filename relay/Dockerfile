FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY server.cjs replay.cjs ./
USER node
ENV HOST=0.0.0.0 PORT=8787 CAPTION_RELAY_CONFIG=/run/rooms.json
EXPOSE 8787
CMD ["node", "server.cjs"]
