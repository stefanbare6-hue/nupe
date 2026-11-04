# Imagem única com API e interface compilada.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3333
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/core/package.json ./packages/core/package.json

# /dados é onde o arquivo JSON vive; em hospedagem com volume, monte ali.
ENV NUPE_DATA=/dados/nupe.json
RUN mkdir -p /dados && chown node:node /dados

USER node
EXPOSE 3333
CMD ["node", "apps/api/dist/server.js"]
