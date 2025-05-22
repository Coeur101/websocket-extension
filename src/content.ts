interface WebSocketMessage {
  source: string;
  type: string;
  tabUrl?: string;
  data: {
    direction?: string;
    message?: any;
    url?: string;
    timestamp: string;
    [key: string]: any;
  };
}

// 内联formSendData和formReceiveData函数
function formSendData(data: any): any {
  // 清理数据
  const cleaned = (typeof data === 'string') ? data.replace(/^\d+/, '') : data;
  
  try {
    if (typeof cleaned !== 'string') return data;
    
    const parsedData = JSON.parse(cleaned);

    // 拿到requestParameter对象
    const { url, requestHeader, requestBody, com } = parsedData[1] || {};
    return {
      url,
      requestHeader,
      requestBody,
      state: false,
      com
    };
  } catch (e) {
    return data;
  }
}

function formReceiveData(data: any): any {
  // 清理数据
  const cleaned = (typeof data === 'string') ? data.replace(/^\d+/, '') : data;
  
  try {
    if (typeof cleaned !== 'string') return data;
    
    const parsedData = JSON.parse(cleaned);

    // 拿到requestParameter对象
    const { url, requestHeader, requestBody, com } = (parsedData[1] && parsedData[1].requestParameter) || {};

    // 拿到外层data
    const outerData = (parsedData[1] && parsedData[1].data) || {};
    const errorDetail = (parsedData[1] && parsedData[1].detail) || {};
    const state = outerData ? true : false;
    return {
      url,
      requestHeader,
      requestBody,
      state,
      com,
      data: outerData,
      errorDetail
    };
  } catch (e) {
    return data;
  }
}

// 存储WebSocket连接状态
const wsConnections: { [url: string]: boolean } = {};

// 确定当前运行环境
const isSidebarMode = window.location.href.includes('chrome-extension://') && window !== window.top;

// 监听来自background.js的消息
chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
  // 处理状态UI切换
  if (message.action === 'toggle_status_ui') {
    toggleStatusUI(message.show);
    // 返回成功响应
    sendResponse({ success: true });
  }
});

// 切换状态UI显示
function toggleStatusUI(show: boolean): void {
  const statusUIElements = document.querySelectorAll('.websocket-status-ui') as NodeListOf<HTMLElement>;
  statusUIElements.forEach(element => {
    element.style.display = show ? 'flex' : 'none';
  });
}

// 存储消息到后台脚本
function storeMessage(message: WebSocketMessage): void {
  // 确保消息包含标签页URL
  if (!message.tabUrl) {
    message.tabUrl = window.location.href;
  }
  
  // 发送到background.js
  chrome.runtime.sendMessage({
    action: 'store_message',
    wsMessage: message,
    tabUrl: message.tabUrl || window.location.href
  }, (response) => {
    if (response && response.success) {
    } else {
      console.error('[WebSocket监控器] 存储消息失败:', chrome.runtime.lastError);
    }
  });
}

// 监听页面中的WebSocket消息
window.addEventListener('message', (event: Event) => {
  const msgEvent = event as MessageEvent;
  if (msgEvent.data && msgEvent.data.source === 'websocket-hooks-script') {
    // 确保消息包含标签页URL
    if (!msgEvent.data.tabUrl) {
      msgEvent.data.tabUrl = window.location.href;
    }

    // 处理URL搜索消息
    if (msgEvent.data.type === 'WEBSOCKET_URL_SEARCH') {

      // 转发到background.js
      chrome.runtime.sendMessage({
        action: 'search_url',
        searchUrl: msgEvent.data.searchUrl,
        tabUrl: msgEvent.data.tabUrl
      }, (response) => {
        if (response && response.success) {
        } else {
          console.error('[WebSocket监控器] 转发URL搜索消息失败:', chrome.runtime.lastError);
        }
      });
      
      return; // 不需要进一步处理
    }

    // 存储消息到background.js
    storeMessage(msgEvent.data);
  }
});

// 向页面注入WebSocket hook脚本
function injectScript(): void {
  // 如果是侧边栏模式，不需要注入WebSocket钩子脚本
  if (isSidebarMode) {
    return;
  }
  
  
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('inject.js');
  
  // 记录脚本的父节点，以便正确移除
  const parent = document.head || document.documentElement;
  
  script.onload = (event: Event) => {
    const scriptElement = event.target as HTMLScriptElement;
    // 使用记录的父节点移除脚本
    try {
      parent.removeChild(scriptElement);
    } catch (error) {
      console.error('[WebSocket监控器] 移除脚本时出错:', error);
    }
  };
  
  // 将脚本添加到父节点
  parent.appendChild(script);
}

// 首先注入辅助脚本，然后注入主钩子脚本
console.log('[WebSocket监控器] 开始注入脚本');
injectScript();
