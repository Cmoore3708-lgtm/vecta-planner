FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /app/workers/haynes
COPY workers/haynes/package*.json ./
RUN npm ci --omit=dev
COPY workers/haynes/*.mjs ./
COPY package.json /app/package.json
COPY lib/haynes-vehicle.js /app/lib/haynes-vehicle.js
RUN mkdir /data && chown pwuser:pwuser /data
USER pwuser
ENV HAYNES_PROFILE_DIR=/data/profile HOST=0.0.0.0 PORT=8080
EXPOSE 8080
CMD ["node", "server.mjs"]
