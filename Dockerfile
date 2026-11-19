FROM nginx:1.28.0-alpine

RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup && \
    chown -R appuser:appgroup /var/cache/nginx /var/log/nginx /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown appuser:appgroup /var/run/nginx.pid

RUN sed -i 's|application/javascript\s*js;|application/javascript js mjs;|' /etc/nginx/mime.types

RUN grep -q webmanifest /etc/nginx/mime.types || \
    sed -i 's|application/json  *json;|application/json                       json;\n    application/manifest+json             webmanifest;|' /etc/nginx/mime.types

RUN grep -q 'ngx_http_js_module.so' /etc/nginx/nginx.conf || \
    sed -i '1i load_module modules/ngx_http_js_module.so;' /etc/nginx/nginx.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/edge_auth.js /etc/nginx/njs/edge_auth.js
COPY docker/edge_auth.sh /docker-entrypoint.d/15-edge-auth.sh
RUN sed -i 's/\r$//' /docker-entrypoint.d/15-edge-auth.sh && \
    chmod 0755 /docker-entrypoint.d/15-edge-auth.sh
COPY dist /usr/share/nginx/html

RUN find /usr/share/nginx/html -name '*.map' -type f -delete

RUN chown -R appuser:appgroup /usr/share/nginx/html

USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
