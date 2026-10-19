# 一体化镜像：第一阶段构建前端，第二阶段由 FastAPI 同时提供接口与页面
FROM node:22-alpine AS web
WORKDIR /srv/frontend
ARG NPM_REGISTRY=https://registry.npmjs.org
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --registry=${NPM_REGISTRY}
COPY frontend/ ./
COPY backend/app/data/ /srv/backend/app/data/
RUN npm run build

FROM python:3.11-slim
WORKDIR /srv/backend
COPY backend/requirements.txt .
ARG PIP_INDEX_URL=https://pypi.org/simple
RUN pip install --no-cache-dir --index-url ${PIP_INDEX_URL} -r requirements.txt
COPY backend/app ./app
COPY --from=web /srv/frontend/dist /srv/frontend/dist
ENV ZZ_DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)" || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
