# 个人题库实现计划

**目标：** 站长在服务器上将练习 JSON 投递给一个已存在的完整账号名，该账号登录后可查看和练习。

**设计：** 新增独立的服务器文件存储和鉴权 API，优先完成服务器命令行投递。按用户后续明确要求，在有余力时补充可选管理员网页，权限来自服务器精确账号白名单，默认不授权。首页题库区和账号中心提供入口，保留现有八项导航。练习页复用 QuestionCard、AnswerPanel、ExamProgress、ExplanationPanel 与判分工具，不修改公共题库加载逻辑。

**技术：** Node.js 原生文件与 HTTP API、node:test、Vue 3、TypeScript；不增加依赖。

## 新增契约

- 投递：`node scripts/send-personal-practice.mjs --username "完整账号名" --file "练习.json"`。
- 存储：`data/personal-bank/<账号 SHA-256>/<练习 UUID>.json`。账号精确匹配，练习每次投递生成独立 UUID；不使用账号名拼接目录。
- `GET /api/personal-bank`：Bearer 认证，返回当前账号的 `{ practices, canManage }` 元信息列表与投递权限。
- 可选 `PERSONAL_BANK_ADMIN_USERS` 为已注册完整账号名的 JSON 数组，进程环境变量优先于 `.env.local`。`POST /api/personal-bank/deliver` 只允许白名单账号，JSON 为 `{ username, exam }`，请求上限 2 MiB；网页入口 `/personal-bank/manage`。
- `GET /api/personal-bank/:id`：Bearer 认证，返回当前账号的一份 `{ practice, exam }`；其他账号访问同一 ID 返回 404。
- 元信息字段：`id`、`title`、`receivedAt`、`totalQuestions`、`totalScore`、`sections`。
- 原题采用现有 parser.ts 支持的 `title`、`questions`、`readingPassages` 等字段，选项答案严格使用从 0 起的数字；校验题型、答案、文章引用、分值及重复 ID。`testId` 由服务器改为 `personal:<UUID>`，防止题目 ID 与公共题库碰撞。
- 路由：`/personal-bank`、`/personal-bank/:id/practice` 与可选管理员页 `/personal-bank/manage`。
- 本机进度仅保存题号及作答状态，键为 `quiz-platform:personal-bank:progress:<编码账号名>:<UUID>`，不缓存私人原题，也不参与现有公共进度同步。注销或切换账号后立即清空页面原题；过期认证显示重新登录入口。

## 实施步骤

- [x] 用临时目录和测试账号编写 Node 集成测试，验证未认证拒绝、账号隔离、精确账号名、无效练习拒绝、重复投递不覆盖、命令行可投递；先运行并确认缺少实现时失败。
- [x] 新增 `server-personal-bank.mjs` 与 `scripts/send-personal-practice.mjs`；在 `server.mjs` 的账号兜底处理之前挂载新 API，在 `vite.config.ts` 添加代理。
- [x] 新增前端服务、私人进度与解析工具、三个个人题库视图和路由；在首页及账号中心放置入口。QuestionCard 新增默认开启的工具按钮开关，私人练习关闭收藏/笔记入口。
- [x] 验证已有题卷格式、阅读题及各题型判分，验证刷新恢复、注销/切换账号、空列表、加载错误、404 和手机端布局。
- [x] 更新 README 的投递命令、输入格式、数据位置与进度范围。执行后端测试、TypeScript 与生产构建；在独立测试服务验证浏览器流程，实际用户账号不接收测试投递。

## 验证记录

- `npm test`：15 项测试通过；`npm run build`：TypeScript 与生产构建通过。
- 临时服务中验证命令行投递、管理员网页投递、跨账号拒绝、刷新恢复、退出登录清空原题；接收账号完成练习，汇总 6/6。
- 320、375、414、768、1280 像素宽度下检查首页、列表、管理员权限页、私人练习和原有公共练习，共 25 项布局检查通过，无横向溢出。
- 正式环境未设置新管理员，也未向真实用户投递测试练习。
- 审查发现的私人题干 HTML 和填空答案数量问题已修复并加入回归测试；浏览器确认下划线保留、HTML 按文本显示且不会执行事件处理器。
