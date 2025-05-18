// 导入类型定义
import type { WebSocketMessage, SidebarElements } from './types/websocket';

// 创建侧边栏和iframe
function createSidebar(): SidebarElements {
  // 创建容器
  const container = document.createElement('div');
  container.id = 'websocket-inspector-container';
  container.style.cssText = `
    position: fixed;
    top: 0;
    right: 0;
    height: 100vh;
    width: 0;
    z-index: 2147483647;
    transition: width 0.3s ease;
    overflow: hidden;
    box-shadow: -2px 0 10px rgba(0,0,0,0.15);
  `;

  // 创建iframe
  const iframe = document.createElement('iframe');
  iframe.id = 'websocket-inspector-iframe';
  iframe.style.cssText = `
    width: 100%;
    height: 100%;
    border: none;
    background: white;
  `;

  // 设置iframe的源
  iframe.src = chrome.runtime.getURL('index.html');

  // 添加到DOM
  container.appendChild(iframe);
  document.body.appendChild(container);

  return { container, iframe };
}

// 在页面加载完成后创建侧边栏
let sidebarCreated = false;
let container: HTMLDivElement | null = null;
let iframe: HTMLIFrameElement | null = null;

function initSidebar(): void {
  if (!sidebarCreated && document.body) {
    const elements = createSidebar();
    container = elements.container;
    iframe = elements.iframe;
    sidebarCreated = true;
  }
}

// 使用MutationObserver确保DOM准备好
if (document.body) {
  initSidebar();
} else {
  const observer = new MutationObserver(() => {
    if (document.body && !sidebarCreated) {
      initSidebar();
      observer.disconnect();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

// 切换侧边栏显示状态
function toggleSidebar(): void {
  if (!sidebarCreated) {
    initSidebar();
    return;
  }

  if (!container) {
    return;
  }

  if (container.style.width === '380px') {
    container.style.width = '0';
  } else {
    container.style.width = '380px';
  }
}

// 监听来自background.js的消息
chrome.runtime.onMessage.addListener((message: any) => {
  if (message.action === 'toggle_sidebar') {
    toggleSidebar();
  }
});

// 监听来自页面的消息
window.addEventListener('message', (event) => {
  if (event.data && event.data.source === 'websocket-hooks-script') {
    if (event.data.type === 'WEBSOCKET_URL_SEARCH') {
      // 如果侧边栏是关闭的，则打开它
      if (container?.style.width === '0px') {
        toggleSidebar();
      }
      // 转发消息到侧边栏
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(event.data, '*');
      }
    }
  }
});

// 监听来自iframe的消息
window.addEventListener('message', (event) => {
  const msgEvent = event as MessageEvent;
  if (msgEvent.data && msgEvent.data.source === 'websocket-sidebar') {
    if (msgEvent.data.action === 'toggle_status_ui') {
      // 向页面注入脚本发送消息
      const script = document.createElement('script');
      script.textContent = `
        window.postMessage({
          source: 'content-script',
          action: 'toggle_status_ui',
          show: ${msgEvent.data.show}
        }, '*');
      `;
      document.documentElement.appendChild(script);
      document.documentElement.removeChild(script);
    }
  }
});

// 创建一个全局访问点，供注入脚本调用
window.__websocketInspector = {
  forwardMessage: function (message: WebSocketMessage): void {
    console.log('content.js 接收到消息准备转发', message);
    // 确保iframe已创建
    if (!sidebarCreated) {
      initSidebar();
    }

    // 获取iframe并转发消息
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage(message, '*');
    }
  }
};

// 向页面注入WebSocket hook脚本
function injectScript(): void {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('inject.js');
  script.onload = (event: Event) => {
    const scriptElement = event.target as HTMLScriptElement;
    document.head?.removeChild(scriptElement);
    console.log('WebSocket钩子脚本已加载');
  };
  (document.head || document.documentElement).appendChild(script);
}

// 注入辅助脚本，用于建立页面脚本和content script的通信桥梁
function injectHelperScript(): void {
  const helperCode = `
    window.__websocketInspector = {};
    
    // 转发消息的辅助函数
    window.__websocketInspector.forwardMessage = function(message) {
      // 使用自定义事件在页面脚本和content script之间通信
      const customEvent = new CustomEvent('websocket-message', { detail: message });
      document.dispatchEvent(customEvent);
    };
  `;

  const script = document.createElement('script');
  script.textContent = helperCode;
  (document.head || document.documentElement).appendChild(script);
  document.head?.removeChild(script);

  console.log('WebSocket辅助脚本已注入');
}

// 存储消息到后台脚本并确保实时转发
function storeMessage(message: WebSocketMessage): void {
  // 立即转发到iframe确保实时显示
  if (iframe && iframe.contentWindow) {
    try {
      // 确保消息包含标签页URL
      if (!message.tabUrl) {
        message.tabUrl = window.location.href;
      }

      console.log('立即转发消息到iframe:', message);
      iframe.contentWindow.postMessage(message, '*');
    } catch (error) {
      console.error('转发消息到iframe失败:', error);
    }
  }

  // 然后再存储到background.js
  chrome.runtime.sendMessage({
    action: 'store_message',
    wsMessage: message,
    tabUrl: message.tabUrl || window.location.href
  }, (response: any) => {
    if (response && response.success) {
      console.log('消息已存储到background.js');
    }
  });
}

// 监听页面中的WebSocket消息并转发到iframe
window.addEventListener('message', (event: Event) => {
  const msgEvent = event as MessageEvent;
  if (msgEvent.data && msgEvent.data.source === 'websocket-hooks-script') {
    // 确保消息包含标签页URL
    if (!msgEvent.data.tabUrl) {
      msgEvent.data.tabUrl = window.location.href;
    }

    console.log('content.js 接收到postMessage', msgEvent.data);

    // 首先转发到iframe确保实时性，再存储
    storeMessage(msgEvent.data);
  }
});

// 处理iframe发来的请求
window.addEventListener('message', (event: Event) => {
  const msgEvent = event as MessageEvent;
  // 确保消息来源安全且格式正确
  if (msgEvent.data && msgEvent.data.source === 'websocket-sidebar') {
    console.log('收到来自iframe的消息:', msgEvent.data);

    // 处理获取历史消息请求
    if (msgEvent.data.action === 'get_messages') {
      chrome.runtime.sendMessage({
        action: 'get_messages',
        tabUrl: window.location.href
      }, (response: any) => {
        if (response) {
          console.log('获取到历史消息:', response);
          if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({
              source: 'content-script',
              action: 'messages_loaded',
              messages: response.messages,
              activeTabUrl: response.activeTabUrl
            }, '*');
          }
        }
      });
    }

    // 处理定期轮询请求 - 会返回同样的历史消息，但不会清空现有消息
    else if (msgEvent.data.type === 'POLLING' && msgEvent.data.action === 'get_messages') {
      chrome.runtime.sendMessage({
        action: 'get_messages',
        tabUrl: window.location.href
      }, (response: any) => {
        if (response) {
          console.log('轮询获取到历史消息:', response);
          if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({
              source: 'content-script',
              action: 'messages_update', // 使用不同的action表示这是更新而非完全替换
              messages: response.messages,
              activeTabUrl: response.activeTabUrl
            }, '*');
          }
        }
      });
    }

    // 处理清空消息请求
    else if (msgEvent.data.action === 'clear_messages') {
      chrome.runtime.sendMessage({
        action: 'clear_messages',
        tabUrl: msgEvent.data.tabUrl || window.location.href
      }, (response: any) => {
        if (response && response.success) {
          console.log(`已清空标签页 ${msgEvent.data.tabUrl || window.location.href} 的历史消息`);
        }
      });
    }
  }
});

// 自定义事件处理
document.addEventListener('websocket-message', (e: Event) => {
  const customEvent = e as CustomEvent;
  const message = customEvent.detail;
  console.log('从页面接收到WebSocket消息事件', message);
  // 存储消息
  storeMessage(message);
  // 转发消息
  window.__websocketInspector?.forwardMessage(message);
});

// 首先注入辅助脚本，然后注入主钩子脚本
injectHelperScript();
injectScript();

// 确保文件被识别为模块
export { }; 
