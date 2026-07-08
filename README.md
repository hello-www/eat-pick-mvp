# Eat Pick MVP

一个先用网页承载的“今天吃什么”原型：定位附近美食、按口味筛选、随机口味、AI 推荐、打开高德导航。

## 本地运行

```powershell
pnpm run build
pnpm exec vite --host 127.0.0.1 --port 8091
```

打开：

```text
http://127.0.0.1:8091/
```

普通 Vite 本地服务不会运行 Vercel 的 `/api` 函数，因此 AI 会自动走本地规则兜底。要在本地测试真实 `/api/recommend`，建议使用 Vercel CLI 的 `vercel dev`。

## 本地 AI 配置文件

复制示例文件：

```powershell
Copy-Item api/ai-config.example.json api/ai-config.local.json
```

`api/ai-config.local.json` 已经被 `.gitignore` 忽略，不会上传到 GitHub。

### 使用 OpenAI Key

```json
{
  "provider": "openai",
  "openai": {
    "apiKey": "sk-your-openai-key",
    "model": "gpt-4o-mini",
    "baseUrl": "https://api.openai.com/v1"
  }
}
```

### 使用其他 OpenAI 兼容模型

```json
{
  "provider": "compatible",
  "compatible": {
    "apiKey": "your-compatible-model-key",
    "model": "your-model-name",
    "baseUrl": "https://your-compatible-endpoint/v1"
  }
}
```

后端读取优先级：

1. Vercel/系统环境变量
2. `api/ai-config.local.json`
3. 本地规则兜底推荐

## Vercel 环境变量

前端定位和周边店铺：

```text
VITE_AMAP_KEY=你的高德 Web 服务 Key
```

真实 AI 推荐接口，也就是 `POST /api/recommend`：

```text
OPENAI_API_KEY=你的模型 API Key
OPENAI_MODEL=gpt-4o-mini
```

如果使用 OpenAI 兼容接口：

```text
AI_API_KEY=你的模型 API Key
AI_MODEL=模型名称
AI_BASE_URL=https://你的兼容接口/v1
```

没有配置 AI Key 时，页面会自动使用规则推荐，不会崩溃。

## Vercel 项目设置

- Framework Preset: `Vite`
- Build Command: `pnpm run build`
- Output Directory: `dist`
- Environment Variables: 至少配置 `VITE_AMAP_KEY`，要真实 AI 则再配置 `OPENAI_API_KEY` 或 `AI_API_KEY`
