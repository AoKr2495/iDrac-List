FROM node:24-bookworm-slim AS frontend
WORKDIR /build
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./frontend/
RUN cd frontend && pnpm install --frozen-lockfile
COPY frontend ./frontend
COPY assets ./assets
RUN cd frontend && pnpm run build

FROM python:3.12-slim-bookworm
ARG APP_UID=1000
ARG APP_GID=1000
RUN groupadd --gid ${APP_GID} app && useradd --uid ${APP_UID} --gid ${APP_GID} --create-home app
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.lock ./requirements.lock
RUN pip install --no-cache-dir -r requirements.lock
COPY backend ./backend
COPY config.yaml ./config.yaml
COPY config ./config
COPY --from=frontend /build/frontend/dist ./frontend/dist
RUN mkdir -p Data Logs && chown -R app:app /app
USER app
EXPOSE 8088
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8088/api/health', timeout=3)"
CMD ["python", "-m", "backend"]
