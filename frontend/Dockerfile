FROM node:22.18-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare yarn@4.7.0 --activate
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json yarn.lock ./
COPY .yarnrc.yml ./
RUN YARN_ENABLE_SCRIPTS=0 yarn install --immutable

COPY . .
RUN yarn build

FROM node:22.18-alpine AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/entrypoint.sh ./entrypoint.sh

RUN addgroup -g 1001 app \
    && adduser -D -u 1001 -G app app \
    && chmod +x /app/entrypoint.sh \
    && chown -R app:app /app
USER app

ENV PORT=3000 HOSTNAME=0.0.0.0
EXPOSE 3000
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "server.js"]
