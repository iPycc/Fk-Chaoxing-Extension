// 全局日志系统
// 用于记录插件运行日志并同步到 popup

const GlobalLogger = {
  logs: [],
  maxLogs: 100,
  PREFIX: '[Fk-Chaoxing]',
  isTopFrame: window.self === window.top,

  init() {
    // 如果是顶层窗口，监听来自 iframe 的日志
    if (this.isTopFrame) {
      window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'CX_LOG_SYNC') {
          this.addLogEntry(event.data.logEntry, false); // false = don't re-broadcast
        }
      });
    }
  },

  // 添加日志
  log(type, message, details = null) {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    
    // 构建完整消息
    let consoleMessage = `${this.PREFIX} ${message}`;
    if (details) {
      consoleMessage += ` | ${details}`;
    }

    const logEntry = {
      type: type, // 'info', 'success', 'error', 'warning'
      message: message + (details ? ` (${details})` : ''),
      time: time,
      timestamp: Date.now()
    };

    this.addLogEntry(logEntry, true);
  },

  // 内部添加日志并处理同步
  addLogEntry(logEntry, shouldBroadcast) {
    // 1. 存入本地数组（顶层窗口存储所有，iframe 仅存储自己的）
    // 其实 iframe 不需要存储，只要发给顶层即可。但为了 content-message-handler 能在 iframe 中工作（虽然我们禁用了），保留一份也无妨。
    // 为了节省内存，iframe 可以不存，或者存少点。这里统一存。
    this.logs.push(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // 2. 输出到控制台 (仅输出关键信息)
    // 注意：iframe 的控制台输出也会显示在 DevTools，这没问题
    const consoleMsg = `${this.PREFIX} ${logEntry.message}`;
    if (logEntry.type === 'error') {
       console.error(consoleMsg);
    } else if (logEntry.message.includes('已') || logEntry.message.includes('共') || logEntry.message.includes('失败') || logEntry.message.includes('AI')) {
       console.log(consoleMsg);
    }
    
    // 3. 同步逻辑
    if (this.isTopFrame) {
      // 如果是顶层窗口，通知 Popup
      this.notifyPopup(logEntry);
    } else if (shouldBroadcast) {
      // 如果是 iframe 且是新产生的日志，发送给顶层窗口
      try {
        window.top.postMessage({
          type: 'CX_LOG_SYNC',
          logEntry: logEntry
        }, '*');
      } catch (e) {
        // 跨域限制可能导致无法发送，忽略
      }
    }
  },

  // 通知 popup
  notifyPopup(logEntry) {
    try {
      chrome.runtime.sendMessage({
        action: 'log',
        log: logEntry
      }).catch(() => {
        // Popup 未打开时会失败，忽略错误
      });
    } catch (err) {
      // 忽略错误
    }
  },

  // 获取所有日志
  getAllLogs() {
    return this.logs;
  },

  // 清空日志
  clear() {
    this.logs = [];
    this.log('info', '日志已清空');
  },

  // 便捷方法
  info(message, details) {
    this.log('info', message, details);
  },

  success(message, details) {
    this.log('success', message, details);
  },

  error(message, details) {
    this.log('error', message, details);
  },

  warning(message, details) {
    this.log('warning', message, details);
  }
};

// 初始化监听器
GlobalLogger.init();

// 挂载到 window 对象，确保全局可访问
window.GlobalLogger = GlobalLogger;
