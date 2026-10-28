# Build the existing React/Vite frontend with the project-pinned pnpm version.
FROM node:22-slim AS frontend-build
WORKDIR /build
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY index.html vite.config.ts ./
COPY tsconfig*.json ./
COPY src ./src
COPY public ./public
RUN pnpm build

# Run the supplied Random Forest and serve the compiled frontend from one origin.
FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=3000
WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN python -m pip install --disable-pip-version-check -r requirements.txt \
    && useradd --system --uid 10001 --create-home cloudshield
COPY main.py rf_model.pkl ./
COPY --from=frontend-build /build/dist ./dist
RUN chown -R cloudshield:cloudshield /app
USER cloudshield
EXPOSE 3000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-3000} --workers 1"]
