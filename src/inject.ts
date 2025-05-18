/// <reference types="chrome"/>

import { DEFAULT_CONFIG } from './common/config';

// 从storage获取配置
let wsUrl = DEFAULT_CONFIG.LISTEN_WS_URL;

// 注入WebSocket钩子到页面
(function injectHooks() {
  // 引入ws.js的代码
  const wsHookCode = `
  (function () {
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function () {
      // XHR拦截保留但不做消息发送处理
      return origOpen.apply(this, arguments);
    };
  
    const origWebSocket = WebSocket;
    WebSocket = function (url) {
      const wsInstanceUrl = url;
      const currentTabUrl = window.location.href;
      const ws = new origWebSocket(url);
      // 如果URL不匹配，直接返回原始WebSocket实例
      if (!wsInstanceUrl.includes("${wsUrl}")) {
        return ws;
      }

      // 发送WebSocket连接消息
      window.postMessage({ 
        source: 'websocket-hooks-script', 
        type: 'WEBSOCKET_CONNECTION', 
        tabUrl: currentTabUrl,
        data: { 
          url: wsInstanceUrl, 
          timestamp: new Date().toISOString() 
        } 
      }, '*');

      // 添加消息监听器
      ws.addEventListener("message", function (event) {
        console.log("🔴 拦截接收的消息", event.data);
        // 拦截接收的消息
        const message = {
          source: 'websocket-hooks-script',
          type: 'WEBSOCKET_MESSAGE',
          tabUrl: currentTabUrl,
          data: {
            direction: 'receive',
            message: event.data,
            url: wsInstanceUrl,
            timestamp: new Date().toISOString()
          }
        };
        
        // 发送到页面
        window.postMessage(message, '*');
        
        // 直接尝试调用content.js的通信辅助函数
        if (window.__websocketInspector && typeof window.__websocketInspector.forwardMessage === 'function') {
          window.__websocketInspector.forwardMessage(message);
        }
      });

      // 重写send方法
      const origSend = ws.send;
      ws.send = function (data) {
        console.log("🔴 拦截发送的消息", data);
        // 拦截发送的消息
        const message = {
          source: 'websocket-hooks-script',
          type: 'WEBSOCKET_MESSAGE',
          tabUrl: currentTabUrl,
          data: {
            direction: 'send',
            message: data,
            url: wsInstanceUrl,
            timestamp: new Date().toISOString()
          }
        };
        
        // 发送到页面
        window.postMessage(message, '*');
        
        // 直接尝试调用content.js的通信辅助函数
        if (window.__websocketInspector && typeof window.__websocketInspector.forwardMessage === 'function') {
          window.__websocketInspector.forwardMessage(message);
        }
        
        return origSend.call(ws, data);
      };

      return ws;
    };
  
    // 保留原始WebSocket的属性
    for (let key in origWebSocket) {
      if (origWebSocket.hasOwnProperty(key)) {
        WebSocket[key] = origWebSocket[key];
      }
    }
  
    console.log("✅ 已 Hook WebSocket (iframe通信版 v1.1)");
  })();
  `;

  // 创建script元素并插入代码
  const script = document.createElement('script');
  script.textContent = wsHookCode;
  document.documentElement.appendChild(script);

  // 移除script元素
  document.documentElement.removeChild(script);

  console.log('WebSocket钩子已注入页面');
})();

// 确保文件被识别为模块
export { };
