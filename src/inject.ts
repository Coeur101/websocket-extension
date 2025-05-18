/// <reference types="chrome"/>

import { DEFAULT_CONFIG } from '@/common/config';
import { formSendData, formReceiveData } from '@/utils/formData';
// 从storage获取配置
let wsUrl = DEFAULT_CONFIG.LISTEN_WS_URL;

// 定义UI更新函数
const updateUi = (nodeId: string, state: boolean, url: string) => {
  const platformComponents = document.querySelectorAll('.platform-wrapper-component') as NodeListOf<HTMLElement>;
  platformComponents.forEach((component) => {
    if (component.dataset.nodeId !== nodeId) {
      return;
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
    stateDiv.setAttribute('class', 'websocket-status-ui')
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
};

// 注入WebSocket钩子到页面
(function injectHooks() {
  // 首先注入辅助函数
  const helperFunctions = `
    window.__websocketInspector = {
      updateUi: ${updateUi.toString()},
      formSendData: ${formSendData.toString()},
      formReceiveData: ${formReceiveData.toString()},
      // 注入配置
      config: {
        wsUrl: "${wsUrl}"
      }
    };
  `;

  // 创建并注入辅助函数
  const helperScript = document.createElement('script');
  helperScript.textContent = helperFunctions;
  document.documentElement.appendChild(helperScript);
  document.documentElement.removeChild(helperScript);

  // 引入ws.js的代码
  const wsHookCode = `
  (function () {
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function () {
      return origOpen.apply(this, arguments);
    };
    
    const origWebSocket = WebSocket;
    WebSocket = function (url) {
      const wsInstanceUrl = url;
      const currentTabUrl = window.location.href;
      const ws = new origWebSocket(url);
      
      if (!wsInstanceUrl.includes(window.__websocketInspector.config.wsUrl)) {
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
        console.log("🔴 拦截接收的消息", event.data)

        // 使用注入的辅助函数更新UI
        if (window.__websocketInspector && window.__websocketInspector.updateUi) {
          try {
            const data = window.__websocketInspector.formReceiveData(event.data);
            window.__websocketInspector.updateUi(data.com, data.state, data.url);
          } catch (error) {
           
          }
        }

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
        
        window.postMessage(message, '*');
      });

      // 重写send方法
      const origSend = ws.send;
      ws.send = function (data) {
        console.log("🔴 拦截发送的消息", data);

        // 使用注入的辅助函数更新UI
        if (window.__websocketInspector && window.__websocketInspector.updateUi) {
          try {
            const data = window.__websocketInspector.formSendData(data);
            window.__websocketInspector.updateUi(data.com, data.state, data.url);
          } catch (error) {
          
          }
        }

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
        
        window.postMessage(message, '*');
        return origSend.call(ws, data);
      };

      // 监听连接关闭
      ws.addEventListener('close', () => {
        if (window.__websocketInspector && window.__websocketInspector.updateUi) {
          window.__websocketInspector.updateUi(currentTabUrl, false, wsInstanceUrl);
        }
      });

      return ws;
    };
  
    // 保留原始WebSocket的属性
    for (let key in origWebSocket) {
      if (origWebSocket.hasOwnProperty(key)) {
        WebSocket[key] = origWebSocket[key];
      }
    }
    // 添加消息监听器
  window.addEventListener('message', (event) => {
    const statusUis = document.querySelectorAll('.websocket-status-ui')
    if (event.data.action === 'toggle_status_ui') {
      statusUis.forEach(ui => {
        ui.style.display = event.data.show ? 'flex' : 'none';
      });
    }
  });
    console.log("✅ 已 Hook WebSocket (iframe通信版 v1.1)");
  })();
  `;

  // 创建script元素并插入代码
  const script = document.createElement('script');
  script.textContent = wsHookCode;
  document.documentElement.appendChild(script);
  document.documentElement.removeChild(script);

  console.log('WebSocket钩子已注入页面');
})();

// 确保文件被识别为模块
export { };
