import type { Dict } from "./types"

export const dict: Dict = {
  // Tips
  "tips.label": "提示",
  "tips.noModels": "运行 {highlight}/connect{/highlight} 添加 AI 供应商并开始编码",
  "tips.show": "显示提示",
  "tips.hide": "隐藏提示",

  // Home
  "home.footer.mcp": "{count} 个 MCP",

  // Dialog
  "dialog.confirm": "确认",
  "dialog.cancel": "取消",
  "dialog.confirm.desc": "确认对话框选择",
  "dialog.prev.desc": "上一个选项",
  "dialog.next.desc": "下一个选项",

  // Permission
  "permission.required": "需要权限",
  "permission.always": "始终允许",
  "permission.always.until": "将允许 {permission}，直到 OpenCode 重启。",
  "permission.always.patterns": "将允许以下模式，直到 OpenCode 重启",
  "permission.once": "允许一次",
  "permission.reject": "拒绝",
  "permission.reject.title": "拒绝权限",
  "permission.reject.message": "告诉 OpenCode 应该怎样做",
  "permission.reject.confirm.desc": "确认拒绝权限",
  "permission.reject.cancel.desc": "取消拒绝权限",
  "permission.noDiff": "未提供差异",
  "permission.edit": "编辑 {path}",
  "permission.read": "读取 {path}",
  "permission.path": "路径：{path}",
  "permission.glob": '通配符 "{pattern}"',
  "permission.grep": '搜索 "{pattern}"',
  "permission.pattern": "模式：{pattern}",
  "permission.list": "列出 {path}",
  "permission.shell": "Shell 命令",
  "permission.task": "{type} 任务",
  "permission.webfetch": "WebFetch {url}",
  "permission.url": "URL：{url}",
  "permission.websearch": '{provider} "{query}"',
  "permission.query": "查询：{query}",
  "permission.externalDirectory": "访问外部目录 {dir}",
  "permission.patterns": "模式",
  "permission.doomLoop": "在反复失败后继续",
  "permission.doomLoop.body": "这将让会话在反复失败的情况下继续运行。",
  "permission.callTool": "调用工具 {permission}",
  "permission.tool": "工具：{permission}",
  "permission.select": "选择",
  "permission.confirm": "确认",
  "permission.cancel": "取消",
  "permission.minimize": "最小化",
  "permission.fullscreen": "全屏",
  "permission.toggleFullscreen.desc": "切换权限全屏",
  "permission.prev.desc": "上一个权限选项",
  "permission.next.desc": "下一个权限选项",
  "permission.selectOption.desc": "选择权限选项",

  // Session epilogue
  "epilogue.session": "会话",
  "epilogue.continue": "继续",

  // Session commands
  "session.copyShareLink": "复制分享链接",
  "session.share": "分享会话",
  "session.shareConfirm": "确定要分享该会话吗？",
  "session.shareCopied": "分享链接已复制到剪贴板！",
  "session.shareCopyFailed": "复制链接到剪贴板失败",
  "session.shareFailed": "分享会话失败",
  "session.rename": "重命名会话",
  "session.jumpToMessage": "跳转到消息",
  "session.retryError": "重试错误",

  // Prompt
  "prompt.connectProvider": "连接供应商后才能发送提示词",
  "prompt.clear": "清空提示词",
  "prompt.submit": "提交提示词",
  "prompt.removeEditorContext": "移除编辑器上下文",
  "prompt.paste": "粘贴",
  "prompt.interrupt": "中断会话",
  "prompt.openEditor": "打开编辑器",
  "prompt.skills": "技能",
  "prompt.warp": "切换工作区",
  "prompt.warp.desc": "更改会话的工作区",
  "prompt.moveSession": "移动会话",
  "prompt.moveSession.desc": "移动到其他项目目录",
  "prompt.stash": "暂存提示词",
  "prompt.stashPop": "恢复暂存",
  "prompt.stashList": "暂存列表",
  "prompt.shellMode.desc": "Shell 模式",
  "prompt.exitShell.desc": "退出 Shell 模式",
  "prompt.historyPrev": "上一条提示词历史",
  "prompt.historyNext": "下一条提示词历史",
  "prompt.createFailed": "创建会话失败，请打开控制台查看详情。",
  "prompt.sendFailed": "发送提示词失败",
  "prompt.shell": "Shell",
}

export type Placeholders = { normal: string[]; shell: string[] }

export const placeholders: Placeholders = {
  normal: ["修复代码库中的一个 TODO", "这个项目的技术栈是什么？", "修复失败的测试"],
  shell: ["ls -la", "git status", "pwd"],
}
