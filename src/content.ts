// 导入类型定义只在TypeScript编译时有效，不会生成到JavaScript中
// @ts-ignore
// import type { WebSocketMessage } from './types/websocket';
// import { formSendData, formReceiveData } from './utils/formData';

// 定义WebSocketMessage接口，只在TypeScript编译时有效
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
// 更新UI状态函数
function updateUi(nodeId: string, state: boolean, url: string): void {

  const platformComponents = document.querySelectorAll('.platform-wrapper-component') as NodeListOf<HTMLElement>;
  platformComponents.forEach((component) => {
    if (component.dataset.nodeId !== nodeId) {
      return;
    }
    
    // 检查是否已存在状态UI
    const existingUI = component.querySelector('.websocket-status-ui');
    if (existingUI) {
      existingUI.remove();
    }
    
    // 创建一个状态数据，然后更新到组件容器中
    const stateDiv = document.createElement('div');
    stateDiv.setAttribute('style', `
      height: 24px;
      display: flex;
      z-index: 99999;
      align-items: center;
      justify-content: center;
      padding: 0 12px;
      border-radius: 4px;
      font-size: 12px;
      color: white;
      background-color: ${state ? 'rgba(0, 128, 0, 0.5)' : 'rgba(255, 0, 0, 0.5)'};
      position: absolute;
      top: 0;
      left: 0;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    `);
    stateDiv.setAttribute('class', 'websocket-status-ui');
    
    // 添加状态图标
    const icon = document.createElement('span');
    icon.innerHTML = state ? '🟢' : '🔴';
    icon.style.marginRight = '6px';
    icon.style.fontSize = '14px';

    // 添加URL文本
    const urlText = document.createElement('span');
    urlText.textContent = url.split('?')[0] || '未连接';
    urlText.style.overflow = 'hidden';
    urlText.style.textOverflow = 'ellipsis';
    urlText.style.whiteSpace = 'nowrap';

    stateDiv.appendChild(icon);
    stateDiv.appendChild(urlText);
    stateDiv.addEventListener('click', () => {
      // 发送消息到插件
      window.postMessage({
        source: 'websocket-hooks-script',
        type: 'WEBSOCKET_URL_SEARCH',
        searchUrl: url.split('?')[0],
        data: {
          url: url,
          message: url,
          direction: 'system',
          timestamp: new Date().toISOString()
        }
      }, '*');
    });
    
    component.appendChild(stateDiv);
  });
}

// 监听来自background.js的消息
chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
  console.log('[WebSocket监控器] 收到background消息:', message);
  
  // 处理状态UI切换
  if (message.action === 'toggle_status_ui') {
    // 实现状态UI切换逻辑
    console.log('[WebSocket监控器] 切换状态UI:', message.show);
    toggleStatusUI(message.show);
    
    // 如果是侧边栏模式，还需要向页面内容脚本转发消息
    if (isSidebarMode) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'toggle_status_ui',
            show: message.show
          });
        }
      });
    }
    
    // 返回成功响应
    sendResponse({ success: true });
    return true;
  }
  
  // 如果是侧边栏模式，处理来自页面的消息
  if (isSidebarMode && message.action === 'store_message') {
    console.log('[WebSocket监控器] 侧边栏接收到存储消息请求:', message.wsMessage);
    // 在侧边栏中处理消息
    sendResponse({ success: true });
    return true;
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
  
  // 处理WebSocket连接状态
  if (message.type === 'WEBSOCKET_CONNECTION') {
    const url = message.data.url || '';
    const nodeId = extractNodeId(url);
    if (nodeId) {
      wsConnections[url] = true;
      // 不立即更新UI，等待消息处理后更新
    }
  } else if (message.type === 'WEBSOCKET_MESSAGE') {
    const url = message.data.url || '';
    const messageData = message.data.message || '';
    
    // 尝试解析消息获取nodeId、apiUrl和state
    let nodeId = '';
    let apiUrl = '';
    let state = false;
    
    try {
      // 根据消息方向使用不同的解析函数
      if (message.data.direction === 'send') {
        const parsedData = formSendData(messageData);
        if (typeof parsedData === 'object' && parsedData && parsedData.com) {
          nodeId = parsedData.com;
          apiUrl = parsedData.url;
          state = parsedData.state;
        }
      } else if (message.data.direction === 'receive') {
        const parsedData = formReceiveData(messageData);
        if (typeof parsedData === 'object' && parsedData && parsedData.com) {
          nodeId = parsedData.com;
          apiUrl = parsedData.url;
          state = parsedData.state;
        }
      }
      
      // 如果成功解析出nodeId，更新UI
      if (nodeId) {
        wsConnections[url] = true;
        updateUi(nodeId, state, apiUrl || url);
      }
    } catch (e) {
      console.error('[WebSocket监控器] 解析消息失败:', e);
      
      // 回退到URL参数提取
      const extractedNodeId = extractNodeId(url);
      if (extractedNodeId && !wsConnections[url]) {
        wsConnections[url] = true;
        updateUi(extractedNodeId, false, url);
      }
    }
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

// 从URL中提取nodeId
function extractNodeId(url: string): string {
  try {
    // 尝试使用formSendData解析URL获取nodeId
    const parsedData = formSendData(url);
    if (typeof parsedData === 'object' && parsedData && parsedData.com) {
     
      return parsedData.com;
    }
    
    // 回退到URL参数提取
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);
    const nodeId = params.get('nodeId') || '';
 
    return nodeId;
  } catch (e) {
    console.error('[WebSocket监控器] 提取nodeId失败:', e);
    return '';
  }
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

// 自定义事件处理
document.addEventListener('websocket-message', (e: Event) => {
  const customEvent = e as CustomEvent;
  const message = customEvent.detail;
  // 存储消息
  storeMessage(message);
});

// 注入辅助脚本，用于建立页面脚本和content script的通信桥梁
function injectHelperScript(): void {
  // 如果是侧边栏模式，不需要注入辅助脚本
  if (isSidebarMode) {
    return;
  }
  
  const helperCode = `
    console.log('[WebSocket监控器] 辅助脚本开始执行');
    
    window.__websocketInspector = {};
    
    // 转发消息的辅助函数
    window.__websocketInspector.forwardMessage = function(message) {
      console.log('[WebSocket监控器] 转发消息:', message);
      // 使用自定义事件在页面脚本和content script之间通信
      const customEvent = new CustomEvent('websocket-message', { detail: message });
      document.dispatchEvent(customEvent);
    };
    
    // 添加更新UI的函数
    window.__websocketInspector.updateUi = function(nodeId, state, url) {
      console.log('[WebSocket监控器] 页面内更新UI:', nodeId, state, url);
      // 使用自定义事件通知content script更新UI
      const customEvent = new CustomEvent('websocket-update-ui', { 
        detail: { nodeId, state, url } 
      });
      document.dispatchEvent(customEvent);
    };
    
    console.log('[WebSocket监控器] 辅助脚本设置完成');
  `;

  const script = document.createElement('script');
  script.textContent = helperCode;
  
  // 记录脚本的父节点，以便正确移除
  const parent = document.head || document.documentElement;
  parent.appendChild(script);
  
  try {
    parent.removeChild(script);
  } catch (error) {
    console.error('[WebSocket监控器] 移除辅助脚本时出错:', error);
  }
}

// 监听UI更新事件
document.addEventListener('websocket-update-ui', (e: Event) => {
  const customEvent = e as CustomEvent;
  const { nodeId, state, url } = customEvent.detail;
  updateUi(nodeId, state, url);
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
injectHelperScript();
injectScript();

// 在侧边栏模式下，向background.js注册
if (isSidebarMode) {
  console.log('[WebSocket监控器] 侧边栏模式，向background.js注册');
  chrome.runtime.sendMessage({
    action: 'sidebar_ready',
    source: 'websocket-sidebar'
  }, (response) => {
    if (response && response.success) {
      console.log('[WebSocket监控器] 侧边栏注册成功');
    } else {
      console.error('[WebSocket监控器] 侧边栏注册失败:', chrome.runtime.lastError);
    }
  });
}

console.log('[WebSocket监控器] 脚本注入完成');

// 确保文件被识别为模块
// export {}; 
