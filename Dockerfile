FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install
COPY . .
ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787
CMD ["npm", "start"]
