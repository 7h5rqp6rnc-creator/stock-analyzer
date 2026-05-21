# 📈 股票AI分析器 (Stock Analyzer)

全栈应用：输入股票代码，AI分析股票数据，存储至Supabase

## 🌐 Online Demo URL

**访问地址**: https://stock-analyzer-xxxx.onrender.com

> 请替换为您实际部署的Render.com URL

## 🚀 功能特性

1. **数据获取**: 使用 Alpha Vantage 免费API获取实时股票行情
2. **AI分析**: 调用智谱AI (glm-4-flash) 分析股票，返回结构化JSON
3. **数据存储**: 分析结果自动存入Supabase数据库
4. **历史记录**: 查看历史分析记录

## 🛠 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React + Vite |
| 后端 | Express.js |
| AI | 智谱AI glm-4-flash |
| 数据库 | Supabase |
| 部署 | Render.com |

## 📁 项目结构

```
stock-analyzer/
├── client/                 # React前端
│   ├── src/
│   │   ├── App.jsx         # 主组件
│   │   ├── App.css         # 样式
│   │   └── main.jsx        # 入口
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── server/                  # Express后端
│   ├── index.js            # 主服务
│   ├── supabase/
│   │   └── schema.sql      # 数据库Schema
│   ├── render.yaml          # Render部署配置
│   ├── .env.example
│   └── package.json
└── package.json            # Workspace根配置
```

## 🔧 部署指南

### 1. 前置准备

- GitHub账号
- Render.com账号 (免费)
- Supabase账号 (免费)
- 智谱AI API Key (免费注册: https://www.zhipuai.cn/)

### 2. 配置Supabase

1. 登录 [Supabase](https://supabase.com)
2. 创建新项目
3. 在SQL Editor中运行 `server/supabase/schema.sql`
4. 获取 `Project URL` 和 `anon public` key

### 3. 配置环境变量

复制 `.env.example` 为 `.env` 并配置:

```env
PORT=3001
ZHIPU_API_KEY=你的智谱AI密钥
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
STOCK_API_KEY=demo
```

### 4. 部署到Render.com

#### 后端部署
1. 确保代码已推送到GitHub
2. 登录 [Render.com](https://render.com)
3. 点击 "New +" → "Web Service"
4. 连接GitHub仓库
5. 配置:
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
6. 添加环境变量

#### 前端部署
1. 在Render中创建 "Static Site"
2. 连接同一GitHub仓库
3. 配置:
   - **Root Directory**: `client`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
4. 设置环境变量:
   - `VITE_API_URL`: 您的后端URL

## 💡 Prompt工程: 强制LLM输出纯JSON

### Prompt代码展示

这是让LLM只吐JSON不乱说话的核心Prompt技巧:

```javascript
async function analyzeWithLLM(stockData) {
  const prompt = `你是一位专业的股票分析师。请分析以下股票数据，只返回JSON格式，不要任何其他文字。

必须严格遵循以下JSON格式：
{
  "summary": "2-3句话的股票分析总结",
  "sentiment": "Bullish或Neutral或Bearish之一",
  "riskLevel": "Low或Medium或High之一"
}

股票数据：
${JSON.stringify(stockData, null, 2)}

重要：只返回JSON对象，不要markdown代码块，不要解释，直接以{开头以}结尾。`;

  const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ZHIPU_API_KEY}`
    },
    body: JSON.stringify({
      model: 'glm-4-flash',
      messages: [
        {
          role: 'system',
          content: '你是一个只返回JSON的股票分析师。严格遵循用户要求的JSON格式，不要返回任何JSON之外的文字。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 500
    })
  });

  const result = await response.json();
  const responseText = result.choices[0].message.content.trim();

  // 后处理：清理markdown格式
  let jsonStr = responseText;
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    // 容错：正则提取JSON
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Failed to parse LLM response as JSON');
  }
}
```

### Prompt设计要点

| 技巧 | 说明 |
|------|------|
| 明确格式 | 详细说明JSON字段要求和枚举值 |
| 强调约束 | "只返回JSON对象，不要markdown代码块" |
| 系统提示词 | 强化JSON-only约束 |
| 低温度 | temperature=0.3减少随机输出 |
| 后处理 | strip markdown code blocks |
| 容错解析 | 正则提取JSON防止解析失败 |

## 🐛 Debug记录: CORS问题排查

### 问题描述
部署到Render.com后，前端调用API时出现:
```
Access to fetch at 'https://stock-api-xxxx.onrender.com' from origin
'https://stock-analyzer-xxxx.onrender.com' has been blocked by CORS policy
```

### 排查过程
1. 本地测试正常 → 确认是部署环境问题
2. 检查Render后台日志 → 发现请求未到达服务端
3. 检查CORS配置 → 发现生产环境CORS配置缺失

### 解决方案

在 `server/index.js` 中添加CORS中间件:

```javascript
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST'],
  credentials: true
}));
```

并在Render环境变量中设置:
```
ALLOWED_ORIGIN=https://stock-analyzer-xxxx.onrender.com
```

### 验证
CORS错误消除，API调用成功。

## 📝 API接口

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/analyze` | POST | 分析股票 (body: {symbol}) |
| `/api/history` | GET | 获取历史记录 (?symbol=可选) |
| `/api/health` | GET | 健康检查 |

## 🔒 安全注意

生产环境中请:
- 不要在前端暴露API Key
- 使用后端代理调用AI服务
- 配置Supabase Row Level Security
- 使用环境变量存储敏感信息

## 📄 License

MIT
