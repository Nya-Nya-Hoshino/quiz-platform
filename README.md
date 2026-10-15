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
| 题目搜索 | 顶部放大镜入口：模糊检索题干/选项/提示/解析/译文中的词、字、句（含中日文子序列模糊匹配），结果一键跳转到对应题目练习/考试 |
| 移动端适配 | 手机端导航每行四项、共两行；答题操作自动换行，AI/笔记抽屉适应屏幕宽度，笔记表可横向滚动 |
| 个人题库 | 首页与账号中心提供入口；服务器命令行向指定账号投递练习，用户登录后作答；可选服务器白名单授权的网页投递（见第十一节） |
| 账号系统 | 注册/登录，错题本 + 收藏 + 笔记 + 历史记录 + 做题进度**多设备云端同步**；首次注册自动上传本地缓存 |
| 历史记录 | 考试/练习完成记录（得分、正确率、耗时） |
| AI 助手 | 侧边栏：解释题目 / 分析错误 / 总结知识点 / 生成类似题 / 自定义提问；AI 逐题解析（后台预生成） |
| 备份 | 账号中心一键**后端备份快照** + **下载全站备份**（含用户表） |
| 网页媒体播放器（隐藏页） | `/fishplayer`：播放服务器媒体库（音乐/视频）。音乐显示**专辑封面**（侧车图片或 MP3 内嵌 APIC 自动提取）与**同步歌词**（LRC / QRC 逐字，点击歌词跳转）；`/fishplayer/upload` 上传与管理（需登录）。未在导航中公开 |

---

## 二、快速开始（开发调试）

准备 Git、npm 和 Node.js。当前 Vite 与 Vue 插件要求 Node.js `^20.19.0 || >=22.12.0`，可使用 22.12 或更新版本。

```bash
git clone https://github.com/Nya-Nya-Hoshino/quiz-platform.git
cd quiz-platform
npm ci
```

在项目根目录打开两个终端：

```bash
# 终端一：启动账号、同步、媒体等后端 API
node server.mjs
```

```bash
# 终端二：启动前端开发服务器
npm run dev
```

浏览器访问终端输出的开发地址，默认是 `http://localhost:5173`。
`vite.config.ts` 将账号、同步和媒体 API 转发到 `http://localhost:8080`；开发时更改后端端口，也要同步修改这些代理目标。
AI 配置见第六节。需要从 8080 端口直接访问完整站点时，先按第三节构建。

---

## 三、自定义部署

完整部署包含 `dist/` 前端构建产物、Node.js 后端和可持久保存的 `data/` 目录。
`server.mjs` 同时托管网页与 API；公网访问可选 Cloudflare Tunnel，或将自己的 HTTPS 反向代理指向该服务。
仅托管 `dist/` 时，账号同步、服务器媒体库和服务端 AI 代理需要另行提供后端。

以下域名 `study.example.com`、隧道名 `quiz-platform` 和带尖括号的配置值均为示例，请替换为你自己的域名、隧道信息和实际文件路径。

### 3.1 构建并启动

在克隆后的项目根目录执行：

```bash
npm ci
npm run build
node server.mjs
```

构建命令包含 TypeScript 检查。启动后访问 `http://localhost:8080`，并保持 Node.js 进程运行。
首次使用 AI 前，先创建第六节说明的 `.env.local`，再构建并启动。

可用以下命令检查 HTTP 状态；Windows PowerShell 中请使用 `curl.exe`：

```bash
curl --fail --silent --output /dev/null --write-out '%{http_code}\n' http://localhost:8080/
```

Windows PowerShell 对应命令：

```powershell
curl.exe --fail --silent --output NUL --write-out "%{http_code}" http://localhost:8080/
```

返回 `200` 表示首页可访问。前台运行时，在对应终端按 `Ctrl+C` 停止该进程。
长期部署请按操作系统配置进程服务，将 Node.js 的工作目录设为项目根目录，并安排日志保存和异常重启。

### 3.2 自定义端口

`server.mjs` 从进程环境变量读取 `PORT`，默认值是 `8080`。以下用 `9000` 演示，可改为自己的可用端口。

Linux / macOS / Git Bash：

```bash
PORT=9000 node server.mjs
```

Windows PowerShell：

```powershell
$env:PORT = '9000'
node server.mjs
```

Windows 命令提示符（CMD）：

```bat
set "PORT=9000"
node server.mjs
```

访问地址随之变为 `http://localhost:9000`。反向代理、隧道配置和健康检查中的端口也需保持一致。
项目从 `.env.local` 读取 AI 配置和个人题库投递白名单；设置后端端口请使用上面的进程环境变量方式。

### 3.3 配置自己的公网域名（Cloudflare Tunnel，可选）

先安装 `cloudflared` 并加入 `PATH`，准备自己的 Cloudflare 账号和已托管在该账号中的域名。
创建流程与配置字段可参考 [Cloudflare 本地管理隧道文档](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/create-local-tunnel/)。

```bash
cloudflared tunnel login
cloudflared tunnel create quiz-platform
cloudflared tunnel route dns quiz-platform study.example.com
```

记录创建命令输出的隧道 UUID 和凭据 JSON 文件路径。在你选择的位置创建 `config.yml`，替换以下占位值：

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: '<凭据 JSON 文件的绝对路径>'

ingress:
  - hostname: study.example.com
    service: http://localhost:8080
  - service: http_status:404
```

保留最后一条兜底规则；增加其他域名时，需同时配置对应的 DNS 路由与 `hostname` 规则。字段说明见 [Cloudflare 配置文件文档](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/configuration-file/)。

另开终端启动隧道，并使用实际配置路径：

```bash
cloudflared tunnel --config "<config.yml 的绝对路径>" run quiz-platform
```

保持 Node.js 服务与隧道同时运行，访问你配置的 HTTPS 域名。
使用其他反向代理时，将同一域名下的页面和 `/api/` 请求一起转发到 Node.js 服务。

### 3.4 使用仓库中的启动脚本前

`start.bat` 和 `start.sh` 保留了维护者部署环境的配置。使用者需先按自己的环境修改：

| 项目 | 需要调整的内容 |
| --- | --- |
| `cloudflared` 路径 | 修改脚本中 `CF` 的路径检测，指向自己的安装位置，或使用 `PATH` 中的可执行文件 |
| 隧道 | 将 `tunnel run` 后的名字改为自己已创建的隧道；使用自定义配置路径时补充 `--config` 参数 |
| 公网域名 | 替换脚本中的域名、访问地址和公网验证 URL |
| 后端端口 | 保持进程的 `PORT`、端口检测、本地验证 URL 与隧道的 `service` 一致 |

`start.bat` 用于 Windows；当前 `start.sh` 含 Windows 的路径与 `tasklist` 检测，适用于 Git Bash。
原生 Linux / macOS 请使用上面的通用命令或配置系统服务。
两个脚本均不执行构建，且会跳过检测到的已有服务；更新代码后先构建，再重启对应的服务进程。

### 3.5 配置项与保存位置

| 变量 | 说明 |
| --- | --- |
| `PORT` | Node.js 进程环境变量，控制生产服务端口，默认 `8080` |
| `PERSONAL_BANK_ADMIN_USERS` | 可选的网页投递白名单，值为已注册完整账号名的 JSON 数组；进程环境变量优先于 `.env.local`，默认不授权任何账号 |
| `VITE_API_MODE` | 前端构建配置，默认 `local` 使用内置题库；`remote` 用于自行实现的远程题库 API |
| `VITE_API_BASE` | 前端题库及 AI 服务使用的 API 基址；默认同源 `/api`，自建远程服务时按实际地址填写 |
| `VITE_AI_ENDPOINT` | `.env.local` 中的 OpenAI 兼容 Chat Completions 完整端点；开发代理、生产后端和前端构建读取 |
| `VITE_AI_API_KEY` | `.env.local` 中的服务端代理密钥；当前前端代码不读取这个环境变量 |
| `VITE_AI_MODEL` | `.env.local` 中的实际模型 ID；生产后端和前端构建读取 |

正常使用内置题库与同源后端时，保留 `VITE_API_MODE`、`VITE_API_BASE` 的默认值即可。
更改前端构建配置后重新构建；更改服务端 AI 配置后重启 Node.js 服务。

### 3.6 更新、备份与迁移

更新前保存 `data/` 和自己的部署配置，然后在项目根目录执行：

```bash
git pull --ff-only
npm ci
npm run build
```

重启这个项目的 Node.js 服务；隧道配置发生变化时，也重启对应隧道进程。
随后检查本地首页、自定义域名，以及登录后的同步功能。

迁移到新机器时，停止写入后复制完整 `data/`，单独迁移 `.env.local` 和隧道配置、凭据，再按本节启动。
`data/` 需要可写且持久保存；Git 仓库不包含这些运行数据。

---

## 四、目录结构

```
quiz-platform/
├── server.mjs            # 生产服务器：静态托管 + 后端 API + AI 代理（入口）
├── server-account.mjs    # 账号/同步/备份后端（注册、登录、token、数据存取）
├── server-media.mjs      # 媒体库后端（列表 / Range 流式播放 / 上传 / 封面上传 / 歌词 / 删除）
├── server-personal-bank.mjs # 私人练习校验、账号隔离存储与 API
├── start.bat / start.sh  # 维护者环境启动脚本，使用前按自己的部署修改
├── data/                 # ⚠ 用户数据（账号、同步数据、备份）——已被 .gitignore，严禁入库
│   ├── users.json        #   用户表（scrypt 加盐密码哈希）
│   ├── tokens.json       #   会话 token
│   ├── users/<用户名>.json  # 每个用户的云端同步数据包
│   ├── media/            #   媒体库（音乐/视频 + 封面/歌词侧车文件）
│   ├── personal-bank/    #   按账号 SHA-256 分目录保存的专属练习
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

个人练习投递工具为 `scripts/send-personal-practice.mjs`；执行 `npm test` 可运行个人题库的账号隔离、投递校验和本机进度测试。

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
  对应路由在 `src/router/index.ts` 注册；搜索入口为独立的顶部放大镜链接
- **站点名 / 页脚链接**：`src/layouts/AppLayout.vue`；网页标题与描述见 `index.html`，路由标题见 `src/router/index.ts`
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

## 六、AI 配置（自选 OpenAI 兼容服务）

在项目根目录自行创建 `.env.local`，填写服务商提供的完整 Chat Completions 端点、密钥和模型 ID。
以下值仅为占位示例，需全部替换：

```bash
# .env.local
VITE_AI_ENDPOINT=https://api.example.com/v1/chat/completions
VITE_AI_API_KEY=YOUR_API_KEY
VITE_AI_MODEL=YOUR_MODEL_ID
```

开发模式由 `vite.config.ts` 读取该文件并代理请求；生产模式由 `server.mjs` 从当前工作目录读取，提供 `/api/ai/chat` 代理。
服务端密钥仅由代理使用；端点和模型会供前端构建读取。`.env.local` 已被 `.gitignore` 排除。
配置后重新构建前端，并重启开发服务器或生产 Node.js 服务。

「设置」页可保存浏览器直连所用的端点、模型和密钥（仅存该浏览器的 localStorage），不会修改服务器的配置文件。
生产端 AI 代理经过账号接口的认证检查，未认证请求返回 `401`；通过认证后，缺少服务端密钥会返回配置错误。
当前 `src/services/ai.ts` 的同源 AI 请求尚未附带账号的 `Authorization` 请求头，启用生产 AI 前需完成这项认证对接。
题库、考试和已有解析可继续使用。

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
| 公网打不开 | 先检查自己配置端口的本地服务是否返回 200，再检查隧道进程、配置中的域名与 DNS 路由；反向代理部署检查对应的转发目标 |
| 改完数据不生效 | `npm run build` 重新构建，重启该项目的 Node.js 服务，再刷新浏览器 |
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

---

## 十一、个人题库与定向练习投递

入口位于首页的「个人题库」卡片和登录后的账号中心。接收者登录对应账号后，可查看站长投递的练习；其他账号即使知道练习链接，也不能读取。

### 11.1 服务器命令行投递

先让接收者在网站注册账号，再在服务器项目根目录执行：

```bash
node scripts/send-personal-practice.mjs --username "接收账号的完整名称" --file "练习.json"
```

账号名精确匹配、区分大小写；程序不会自动创建账号、补全名称或替换字符。文件采用 UTF-8 JSON，字段沿用现有练习格式，例如：

```json
{
  "title": "专属词汇练习",
  "questions": [
    {
      "id": 1,
      "type": "single_choice",
      "section": "文字・語彙",
      "question": "请选择「並んで」的读音。",
      "options": ["ならんで", "あそんで"],
      "answer": 0,
      "explanation": "「並ぶ」读作「ならぶ」，其て形为「ならんで」。",
      "score": 2
    }
  ]
}
```

- 必填：练习 `title`、非空 `questions`；每题需提供唯一 `id`、`type`、`question` 和对应题型的 `answer`。
- 题型支持 `single_choice`、`multiple_choice`、`judge`、`fill_blank`、`short_answer`、`sorting`，以及现有练习卷的 `reading`、`vocab`、`grammar`、`reading_comp`。
- 单选答案使用从 **0** 起的数字索引，多选使用不重复的索引数组；判断使用布尔值；填空使用字符串数组；简答使用字符串；排序使用完整且不重复的索引排列（`sortedAnswer` 优先于 `answer`）。
- 填空题用全角空白括号 `（　）` 标出每一空，答案数组长度须与空数一致；题干没有占位时显示一个输入框。私人题干保留无属性的 `<u>` 下划线标记，其他 HTML 按文本显示。
- 阅读题的 `passageId` 必须与 `readingPassages` 中文章的 `id` 精确对应，包括字符串/数字类型。文章正文使用 `passage` 字段。
- 每份练习最多 2000 题；`score` 默认每题 2 分，标题、题型、答案、分值及文章引用会在写入前校验。总题数、总分和板块统计由服务器计算。

每次投递都会创建新的 UUID，不会覆盖已有练习。原始 `testId` 会被替换为独立的 `personal:<UUID>`，避免与公共题库题号碰撞。
收到投递成功提示后，接收者刷新个人题库即可看到，无需重新构建网站或重启服务。

离线操作另一份部署的数据时，可附加 `--data-dir "目标部署的 data 目录"`；该路径必须与目标服务器实际使用的数据目录一致。

### 11.2 可选管理员网页

先注册准备授权的账号，再在服务器 `.env.local` 添加以下配置。示例名 `your-admin-account` 需替换为已注册的完整账号名：

```dotenv
PERSONAL_BANK_ADMIN_USERS=["your-admin-account"]
```

多个账号放在同一个 JSON 数组中。重启 Node.js 服务后，授权账号的个人题库页会显示「投递练习」入口（`/personal-bank/manage`）。
上传 JSON、核对练习标题与题数、填写接收账号，然后点击「发送练习」。网页投递请求上限为 2 MiB。

未配置或配置 `[]` 时，服务器不开放网页投递权限，命令行投递仍可使用。
配置不是合法 JSON 数组或包含不存在的账号时，服务器会拒绝启动并提示错误；普通账号无法通过直接调用投递 API 绕过白名单。

### 11.3 数据、进度与接口

- 服务器原题保存在 `data/personal-bank/<账号 SHA-256>/<练习 UUID>.json`，属于运行数据，不提交 Git。迁移或备份时复制完整 `data/`；现有账号备份接口仅收集账号和同步数据，不包含个人题库原题。
- 作答状态按账号和练习保存在当前浏览器，刷新可继续，切换设备需重新作答。个人题目不会写入公共错题本、收藏、笔记或历史记录；个人进度也不参与公共数据同步。
- 个人练习页支持逐题判分、解析、阅读文章、答题卡及结束后的得分汇总。退出登录或切换账号时会清空当前页面的私人原题。

| 方法 | 路径 | 权限与作用 |
| --- | --- | --- |
| GET | `/api/personal-bank` | Bearer 认证；返回当前账号的 `practices` 元信息与 `canManage` 投递权限 |
| GET | `/api/personal-bank/<UUID>` | Bearer 认证；只读取已投递给当前账号的 `practice` 和 `exam` |
| POST | `/api/personal-bank/deliver` | 仅服务器白名单账号；JSON 请求体为 `{ "username": "完整账号名", "exam": { ...练习原始 JSON... } }` |

个人题库 API 响应使用 `Cache-Control: no-store`，未经认证返回 401，无权投递返回 403，其他账号的练习返回 404。
