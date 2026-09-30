# 刷题平台 · Quiz Platform

现代化在线日语 JLPT 刷题平台：**考试模式**、**练习模式**、**错题本（艾宾浩斯回顾 + AI 总结）**、**收藏本**、**笔记（自动 Markdown 文档）**、**题目模糊检索**、**账号云端同步**、**JLPT 真题整卷机考**、**AI 辅助学习**。

技术栈：Vue 3 + TypeScript + Vite + Vue Router + Pinia + TailwindCSS v4 + Naive UI。
后端：Node.js 原生 HTTP（零依赖），JSON 文件存储。

---

## 一、功能总览

| 模块 | 说明 |
| --- | --- |
| 考试模式 | 限时作答、交卷前不显示答案、答题卡跳转、结果页逐题解析；**不交卷不写历史记录** |
| 练习模式 | 提交后立即判分、显示答案与解析、累计积分与今日统计；**重做系统**：进入时若检测到上次进度，弹窗选择「继续上次 / 重头开始」 |
| N3 自主练习 | `src/data/jlpt-user/n3-user-1..8.json`，共 8 套综合卷（文字词汇 + 文法 + 读解文章组 + ★ 排序题） |
| JLPT 真题 | 历年真题（2018-2026 N2，16 套）**整卷呈现**，考试/练习双模式，120 分制赋分；无听力（文字词汇 + 语法 + 读解）；N3 内容由「N3 自主练习」卷承载 |
| JLPT 倒计时 | 侧边栏 ACG 风格倒计时，按**北京时间**计算下次考试（7月/12月第一个周日） |
| 错题本 | 自动记录错题（题目快照/题型/JLPT等级）、单题回顾练习、**艾宾浩斯五周期回顾（1/2/4/7/15 天）**、**AI 错题总结**（按日期区间生成《知识点记背手册》） |
| 收藏本 | 题目右上角 ☆ 收藏，勾选任意收藏题目组成一份专属练习 |
| 笔记 | 做题界面 📝 添加笔记（原词 + 译文必填、备注可选），顶栏「笔记」页以**笔记表 + 自动更新的 Markdown 文档**双视图展示，随账号云端同步 |
| 题目搜索 | 顶部导航「搜索」：模糊检索题干/选项/提示/解析/译文中的词、字、句（含中日文子序列模糊匹配），结果一键跳转到对应题目练习/考试 |
| 账号系统 | 注册/登录，错题本 + 收藏 + 笔记 + 历史记录 + 做题进度**多设备云端同步**；首次注册自动上传本地缓存 |
| 历史记录 | 考试/练习完成记录（得分、正确率、耗时） |
| AI 助手 | 侧边栏：解释题目 / 分析错误 / 总结知识点 / 生成类似题 / 自定义提问；AI 逐题解析（后台预生成） |
| 备份 | 账号中心一键**后端备份快照** + **下载全站备份**（含用户表） |
| 网页媒体播放器（隐藏页） | `/fishplayer`：播放服务器媒体库（音乐/视频）。音乐显示**专辑封面**（侧车图片或 MP3 内嵌 APIC 自动提取）与**同步歌词**（LRC / QRC 逐字，点击歌词跳转）；`/fishplayer/upload` 上传与管理（需登录）。未在导航中公开 |

---

## 二、快速开始（开发调试）

```bash
npm install
npm run dev        # 开发服务器 http://localhost:5173（API 自动代理到 8080）
npm run build      # 生产构建（vue-tsc 类型检查 + vite build）
npm run preview    # 预览生产构建
```

> 开发模式下后端 API（注册/登录/同步）通过 Vite 代理转发到 `http://localhost:8080`，
> 因此调试账号功能前需先启动生产服务器（见下节）。

---

## 三、部署教程（一键启动）

生产环境 = **静态网站 + 后端 API**（同一个 Node 进程 `server.mjs`）+ **cloudflared 公网隧道**。

### 3.1 一键启动（推荐）

项目根目录提供两个脚本，启动三件事：生产服务器（8080，含后端 API）+ cloudflared 隧道（公网）：

- **Windows**：双击 `start.bat`
- **Git Bash / Linux**：`bash start.sh`

脚本会自动检测 8080 端口与 cloudflared 进程是否已在运行（避免重复启动）、自动定位
cloudflared 可执行文件，启动后验证并输出访问地址：

```
本机 8080   : 200
公网 hoshino: 200
```

停止服务：`taskkill /F /IM node.exe /IM cloudflared.exe`

### 3.2 手动部署

```bash
# 1. 构建生产版本
npm run build

# 2. 启动生产服务器（静态托管 dist/ + 后端 API + AI 代理）
node server.mjs            # 监听 :8080

# 3. 启动公网隧道（需已配置 cloudflared 与命名隧道 quiz-tunnel）
cloudflared tunnel run quiz-tunnel
```

### 3.3 cloudflared 隧道配置（一次性）

```bash
# 登录并创建命名隧道（首次）
cloudflared tunnel login
cloudflared tunnel create quiz-tunnel
cloudflared tunnel route dns quiz-tunnel hoshinonyamain.me

# 配置文件 ~/.cloudflared/config.yml（ingress 指向本地 8080）
#   tunnel: <隧道ID>
#   credentials-file: C:\Users\<你>\.cloudflared\<隧道ID>.json
#   ingress:
#     - hostname: hoshinonyamain.me
#       service: http://localhost:8080
#     - hostname: www.hoshinonyamain.me
#       service: http://localhost:8080
#     - service: http_status:404
```

### 3.4 环境变量（可选）

| 变量 | 说明 |
| --- | --- |
| `PORT` | 生产服务器端口（默认 8080） |
| `VITE_API_MODE` | `local`（默认）/ `remote` |
| `VITE_AI_ENDPOINT` / `VITE_AI_API_KEY` / `VITE_AI_MODEL` | AI 配置（见第六节），只存在于 `.env.local`，不进前端 bundle |

---

## 四、目录结构

```
quiz-platform/
├── server.mjs            # 生产服务器：静态托管 + 后端 API + AI 代理（入口）
├── server-account.mjs    # 账号/同步/备份后端（注册、登录、token、数据存取）
├── server-media.mjs      # 媒体库后端（列表 / Range 流式播放 / 上传 / 封面上传 / 歌词 / 删除）
├── start.bat / start.sh  # 一键启动脚本
├── data/                 # ⚠ 用户数据（账号、同步数据、备份）——已被 .gitignore，严禁入库
│   ├── users.json        #   用户表（scrypt 加盐密码哈希）
│   ├── tokens.json       #   会话 token
│   ├── users/<用户名>.json  # 每个用户的云端同步数据包
│   ├── media/            #   媒体库（音乐/视频 + 封面/歌词侧车文件）
│   └── backups/          #   后端备份快照
├── dist/                 # 生产构建产物（gitignore）
├── src/
│   ├── components/       # QuestionCard / AnswerPanel / ExplanationPanel / AIHelper / NoteEditor / JLPTCountdown / SiteSticker 等
│   ├── views/            # Home / Search / Exam / Practice / Result / History / WrongBook / WrongReview / Favorites / Notes / Account / Notice / JLPT* / FishPlayer*
│   ├── stores/           # Pinia：exam / practice / wrongBook / favorites / notes / history / auth / aiExplain
│   ├── services/         # api.ts（数据层）/ search.ts（题目模糊检索索引）/ ai.ts（AI）/ account.ts（云端同步）/ media.ts（媒体库）
│   ├── utils/            # parser.ts（题库解析）/ review.ts（艾宾浩斯算法）/ progress.ts / markdown.ts / lrc.ts（歌词解析）
│   ├── prompts/          # 学科 System Prompt（日语教师 / 编程导师 / 通用）
│   ├── types/            # 通用 Question Schema / Exam 模型
│   ├── layouts/          # AppLayout（导航 + 白屏兜底）
│   ├── data/
│   │   ├── jlpt-user/    # ★ N3 自主练习卷（n3-user-1..8.json + manifest.json 清单）
│   │   ├── jlpt/         # ★ JLPT 真题（N2/ 16 套整卷 JSON + images/ 问题图片）
│   │   └── bank/         # 组卷题库池（N3 综合题库，用于随机组卷）
│   └── main.ts           # 入口（含全局防白屏兜底与错误记录）
└── scripts/              # 数据转换脚本（convert_extra.py 等）
```

---

## 五、数据格式与内容维护

### 5.1 通用题目 Schema

```ts
type QuestionType =
  | 'single_choice' | 'multiple_choice' | 'judge'
  | 'fill_blank' | 'short_answer' | 'sorting' | 'reading_comp'
```

解析器（`src/utils/parser.ts`）自动归一化两种原始格式：

1. **题组格式（内置）**：`{ testId, title, questions[], readingPassages[] }`
   - `questions[].type ∈ reading | vocab | grammar | sorting | reading_comp`
   - `reading_comp` 子题用 `passageId` 关联 `readingPassages`（读解文章共享）
   - `sorting` 排序题：`question` 含 `★` 占位，`starIndex` 标 ★ 位置，`answer` 为数组
   - 题干下划线：`prompt` 中写「下線部「XXX」」，渲染层自动给题干中 XXX 加 `<u>` 下划线
2. **通用格式**：`{ id, type, question, options, answer, analysis, score }`

### 5.2 添加 N3 自主练习卷（推荐流程）

1. 把新卷 JSON 放到 `src/data/jlpt-user/n3-user-9.json`（与现有卷同结构：
   `{ testId, title, questions[], readingPassages[] }`）
2. 在 `src/data/jlpt-user/manifest.json` 的 `exams` 数组追加一行：

```json
{ "id": "9", "file": "n3-user-9.json", "title": "N3 自主练习 第9套",
  "timeLimit": 60, "passScore": 72.6, "totalScore": 121,
  "totalQuestions": 58, "sections": [ { "name": "文字・語彙", "count": 35 },
  { "name": "文法", "count": 18 }, { "name": "読解", "count": 5 } ] }
```

3. `npm run build` 后首页自动出现第 9 套（无需改代码，`fetchExamList` 读取 manifest）

> 注意：**id 不能与现有卷重复**；第 1-4 套 id 为 `user-1..4`，第 5 套起为数字 `5..8`，
> 新增请继续用数字（`9`、`10`…）。修改已有卷的题目后，若题库发生 id 变化，
> 错题本/收藏中的快照不受影响（存的是题目内容快照，不依赖试卷 id）。

### 5.3 添加 JLPT 真题卷

1. 把整卷 JSON 放入 `src/data/jlpt/N2/`（或 `N3/`），结构：`{ examTitle, questions[], readingPassages[], ... }`
   - `examTitle` 需含「YYYY年M月」（用于排序，如「2026年7月」）
   - 读解长文放 `readingPassages`，子题用 `passageId` 引用
   - 问题14 图片：图片文件放 `src/data/jlpt/images/`，题目中用文件名引用
2. 无听力：仅文字词汇 + 语法 + 读解，满分 120（按题数加权赋分）
3. 转换参考：`scripts/convert_extra.py`（把爬取的 MOJiTest 数据转成整卷格式）

### 5.4 修改导航 / 首页 / 公告

- **顶部导航**：`src/layouts/AppLayout.vue` 中 `navItems` 数组（`{ path, label }`），
  对应路由在 `src/router/index.ts` 注册
- **首页试卷卡片**：自动读取 manifest（练习卷）+ `fetchJLPTExams`（真题），无需改代码
- **公告栏 / 公告页**：`src/views/Notice.vue`（近期更新列表直接编辑该文件）
- **悬浮反馈贴纸**：`src/components/SiteSticker.vue`（QQ / 邮箱）
- **JLPT 倒计时**：`src/components/JLPTCountdown.vue`（北京时间，7月/12月第一个周日）

### 5.5 修改板块 / 题型

- **新增题型**：在 `src/types/question.ts` 的 `QuestionType` 加类型 → `QuestionCard.vue`
  加渲染分支 → `parser.ts` 加归一化 → 判分逻辑 `src/utils/judge.ts`
- **组卷题库池**：`src/data/bank/*.json`（随机组卷用，权重按板块在
  `src/services/examBuilder.ts` 配置）

---

## 六、AI 配置（DeepSeek / OpenAI 兼容）

默认接入 DeepSeek（OpenAI Compatible）。开发模式由 Vite 代理转发，Key 只在
`.env.local`（已被 gitignore），不进前端 bundle：

```bash
# .env.local
VITE_AI_ENDPOINT=https://api.deepseek.com/v1/chat/completions
VITE_AI_API_KEY=sk-xxxx
VITE_AI_MODEL=deepseek-v4-flash
```

生产环境：`server.mjs` 从 `.env.local` 读取，通过 `/api/ai/chat` 代理（Key 不暴露给浏览器）。

也可在「设置」页填写任意 OpenAI 兼容端点，密钥仅存浏览器 localStorage。
未配置时 AI 助手/错题总结使用本地模拟输出。

---

## 七、账号系统与数据同步

- 后端：`server-account.mjs`（JSON 文件存储，scrypt 加盐哈希密码，token 持久化）
- 前端：`src/views/Account.vue` + `src/stores/auth.ts`
- 同步策略：
  - 登录成功 → 自动拉取云端数据（覆盖本地）
  - 云端为空 → 自动上传本地缓存（**首次注册自动迁移旧浏览器数据**）
  - 手动：「上传本地到云端」「从云端拉取」「后端备份快照」「下载全站备份」
- 同步数据包 = 错题本 + 收藏 + 历史记录 + 练习/考试进度 + 每日统计

### 备份与恢复

- 账号中心「后端备份快照」→ 生成 `data/backups/backup-<时间戳>.json`
- 账号中心「下载全站备份」→ 浏览器下载完整备份（含用户表）
- 迁移服务器：复制整个 `data/` 目录即可

---

## 八、安全注意事项

- **`data/` 严禁提交到 git**（已 `.gitignore`）：含账号密码哈希与会话 token
- 修改密码/防泄露：删除 `data/users/<用户名>.json` 与 `data/users.json` 中该用户记录，
  并清空 `data/tokens.json`（所有会话失效，需重新登录）
- API Key 只放 `.env.local`，绝不写入前端代码或提交 git

---

## 九、常见问题

| 问题 | 处理 |
| --- | --- |
| 页面偶发空白 | 已内置多层自动静默刷新兜底（入口级）；仍出现可查看 `sessionStorage.quiz-err-log` |
| 练习进入弹「继续上次/重头开始」 | 重做系统正常提示；「重头开始」即清除该卷存档 |
| 公网打不开 | 检查 `cloudflared tunnel run quiz-tunnel` 是否在跑、`curl localhost:8080` 是否 200 |
| 改完数据不生效 | `npm run build` 重新构建；浏览器强刷（Ctrl+F5） |
| 换设备同步 | 新设备打开网站 → 账号中心 → 登录同一账号，自动拉取云端数据 |

---

## 十、网页媒体播放器（隐藏页 `/fishplayer`）

站点内嵌的服务器媒体库播放器，**未在导航中公开**，只能直接访问 URL：

- 播放页：`/fishplayer`
- 上传管理页：`/fishplayer/upload`（上传/改元信息/换封面/编辑歌词/删除，**需登录**）

### 10.1 功能

- 音乐（mp3 / m4a / flac / wav / ogg …）：专辑封面 + 播放控制（上一首/下一首/进度/音量）+ **同步歌词**
- 视频（mp4 / webm / mkv …）：原生播放器
- 歌词自动识别格式并同步：
  - **LRC**：`[mm:ss.xx]歌词`，自动高亮当前行并滚动，点击任意歌词行跳转到该时间
  - **QRC**（QQ 音乐逐字歌词）：`[起始毫秒,持续毫秒]歌词(逐字偏移,逐字时长)…`，支持**逐字跟随高亮**
  - **增强 LRC**：`[mm:ss.xx]<mm:ss.xx>词<mm:ss.xx>词`
  - **纯文本**：无时间轴时静态展示
- ⚠ **QQ 音乐客户端下载的 `.qrc` 是加密格式**，无法直接解析：上传/保存时会被识别并提示；请在 QQ 音乐中复制歌词文本，或使用未加密的 QRC / LRC 文件
- 列表支持音乐/视频筛选与关键词搜索；快捷键：空格播放暂停、`Alt + ←/→` 切歌

### 10.2 媒体文件与元信息

文件存放在服务器 `data/media/`（已被 gitignore，属用户数据），约定同名侧车文件：

```
data/media/
├── 夜に駆ける.mp3
├── 夜に駆ける.meta.json      # 标题/艺术家/专辑（可自动生成）
├── 夜に駆ける.lrc            # 歌词（LRC 或纯文本）
└── 夜に駆ける.cover.jpg      # 专辑封面
```

- 直接把文件丢进 `data/media/` 也能被识别（标题默认取文件名）
- **MP3 会自动读取 ID3v2 标签**：TIT2/TPE1/TALB（标题/艺术家/专辑）、APIC（内嵌封面）、USLT（内嵌歌词）
- 上传页填写的标题/艺术家/专辑与歌词会写入侧车文件，优先级高于 ID3

### 10.3 后端接口（`server-media.mjs`）

| 方法 | 路径 | 说明 | 鉴权 |
| --- | --- | --- | --- |
| GET | `/api/media/list` | 媒体列表（含元信息、有无封面/歌词） | 公开 |
| GET | `/api/media/file/<id>` | 媒体流（支持 Range，可拖动进度） | 公开 |
| GET | `/api/media/cover/<id>` | 专辑封面（无则 404） | 公开 |
| GET | `/api/media/lyrics/<id>` | 歌词文本（无则 404） | 公开 |
| POST | `/api/media/upload?name=…` | 原始字节流上传（2GB 上限，流式落盘） | 需登录 |
| POST | `/api/media/cover/<id>` | 上传封面 | 需登录 |
| PUT | `/api/media/lyrics/<id>` | 保存歌词（传空则删除） | 需登录 |
| PATCH | `/api/media/meta/<id>` | 修改标题/艺术家/专辑 | 需登录 |
| DELETE | `/api/media/item/<id>` | 删除媒体（含侧车文件） | 需登录 |

> 写接口使用站点账号的 `Authorization: Bearer <token>`（登录后自动携带）。上传体积上限：媒体 2GB、封面 10MB、歌词 512KB。

### 10.4 分段缓存与防中断设计

播放中途「音频仍在补全」或网络抖动会导致卡顿/中断，采用**服务端冻结长度 + 客户端分段缓存**两层保障：

**服务端（`server-media.mjs`）**
- **播放期长度冻结**：同一媒体在一次播放会话内保持 `Content-Length` / `Content-Range` 不变。文件被持续写入（复制/下载中）时体积会变大，若长度随之跳变，浏览器会中途中断播放。
  - 无 `Range` 的完整请求 = 新一次播放 → 按当前长度重新冻结
  - 带 `Range` 的请求 = 同一次会话 → 沿用冻结长度（文件继续变大也不跳变）
  - 客户端越过冻结末尾请求（说明文件已补全、要接着播）→ 自动扩展窗口
  - `?fresh=1`（或请求头 `X-Media-Refresh: 1`）→ 显式按最新长度重新冻结，供「补全后续播」使用
  - 冻结有效期 15 分钟；文件被重写变短则自动解冻并更换 ETag（避免客户端拿到错位数据）
- **就绪探测**：最后写入超过 3 秒（或观测到连续 3 秒无变化）视为已就绪。未就绪的媒体在列表里标记 `partial`，响应头 `X-Media-Ready: 0` 且 `Cache-Control: no-cache`
- **响应头**：`ETag` / `Last-Modified` / `Accept-Ranges` / `X-Media-Size` / `X-Media-Ready`，并支持 `If-Range`

**客户端（`src/services/mediaCache.ts`）**
- 把媒体按 **1 MiB 分段**用 `Range` 请求下载，每段以 `url?__seg=start-end` 为键写入浏览器 **Cache Storage**（可跨刷新复用）
- **不与播放抢带宽**（关键）：播放期间默认**不缓存**；只有 ① 暂停 ② 播放结束 ③ 手动点「缓存本曲」时才下载
  - 单段串行（并发恒为 1）+ 每段间隔 250ms；`shouldPause` 让任务在播放时让路
  - 切换曲目立即 `abort()` 旧任务，避免多个后台下载堆积
  - （早期版本并发 3 段全速下载会与播放流抢带宽，公网隧道下明显卡顿，已修正）
- 完整缓存后，**再次播放该曲即完全本地**（`blob:` 播放），零网络依赖
- 播放源只在**切歌时**决定（已缓存→本地 Blob，否则直连），不会在播放中途替换 `src`（那会导致重新加载、正好造成卡顿）
- 源文件仍在补全时：到达当前可用末尾会按最新长度重新取源并**保留进度自动续播**（由 `ended` 触发，不使用 `stalled`，避免缓冲抖动时误重载）
- 缓存上限：单文件 300MB、总量 500MB（超出按 LRU 淘汰）；不支持 Cache Storage 或超大文件自动回退为直连播放
- 页头显示缓存占用并提供「清缓存」；列表逐条显示 `缓存 / x% / 补全中` 状态
