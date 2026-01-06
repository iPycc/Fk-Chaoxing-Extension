// 全局日志系统
// 用于记录插件运行日志并同步到 popup

const GlobalLogger = {
  logs: [],
  maxLogs: 100,

  // 添加日志
  log(type, message) {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const logEntry = {
      type: type, // 'info', 'success', 'error', 'warning'
      message: message,
      time: time,
      timestamp: Date.now()
    };

    this.logs.push(logEntry);

    // 限制日志数量
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // 输出到控制台
    const prefix = `[CX ${time}]`;
    switch (type) {
      case 'error':
        console.error(prefix, message);
        break;
      case 'warning':
        console.warn(prefix, message);
        break;
      case 'success':
      case 'info':
      default:
        console.log(prefix, message);
        break;
    }

    // 尝试通知 popup（如果 popup 正在监听）
    this.notifyPopup(logEntry);
  },

  // 通知 popup
  notifyPopup(logEntry) {
    try {
      // 使用 chrome.runtime.sendMessage 发送到 popup
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
  info(message) {
    this.log('info', message);
  },

  success(message) {
    this.log('success', message);
  },

  error(message) {
    this.log('error', message);
  },

  warning(message) {
    this.log('warning', message);
  }
};

// 初始化日志
GlobalLogger.info('插件已加载');
