# GitHub Actions 镜像构建与部署

镜像地址：`ghcr.io/bjwlxyzhuzhu/zhaizi:latest`，目标架构为 `linux/amd64`。

推送 `main`、推送 `v*` 标签或在 Actions 手动运行 **Build and publish images** 时，自动构建一体化镜像。流程先启动临时容器，验证健康接口、前端静态资源、页面路由、登录与角色权限，成功后发布 GHCR。拉取请求只构建和测试，不发布。

流程使用 GitHub 自动提供的 `GITHUB_TOKEN` 和 `packages: write` 权限，无需在仓库保存个人访问令牌或模型密钥。除 `latest` 外，还发布 `sha-<短提交号>`；版本标签推送会生成同名镜像标签。

## 服务器运行已构建镜像

```bash
git clone https://github.com/bjwlxyzhuzhu/zhaizi.git
cd zhaizi
cp .env.example .env
# 编辑 .env：设置随机 ZZ_JWT_SECRET；空数据卷首次启动还需设置至少 12 位 ZZ_BOOTSTRAP_PASSWORD。
docker compose -f compose.ghcr.yml pull
docker compose -f compose.ghcr.yml up -d
```

访问 `http://服务器IP:8080`。修改 `.env` 中的 `ZZ_PORT` 可调整端口。首次启动使用源码中的初始化资料，原机器的数据库和上传文件未打入镜像；需要迁移时另行备份和恢复 `/data`。已有数据库账号密码不会因升级改变。模型密钥仅在运行环境或管理后台“模型与 API 设置”中自行配置。

若 GHCR 包设置为私有，拉取前需用具有 `read:packages` 权限的账号执行 `docker login ghcr.io`；若需匿名拉取，可由仓库所有者将容器包可见性设为 Public。

## 本地构建

仍可沿用 `docker compose up -d --build`。默认从 npm/PyPI 官方源安装依赖；国内构建时可传 Docker 构建参数 `NPM_REGISTRY` 与 `PIP_INDEX_URL` 指向可用镜像源。

前后端由同一 FastAPI 容器提供，数据默认使用持久卷内的 SQLite；可用原 Compose 文件的 `pg` profile 配置 PostgreSQL。Docker 镜像发布不等于已在某台服务器启动服务。

初始化账号见 README。源码不含预设登录密码。向真实用户提供服务前须重置或停用不需要的初始化账号，并设置运行环境密钥与访问策略。
