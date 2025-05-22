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
    const displayUrl = url.split('?')[0] || '未连接';
    urlText.textContent = displayUrl;
    urlText.style.overflow = 'hidden';
    urlText.style.textOverflow = 'ellipsis';
    urlText.style.whiteSpace = 'nowrap';

    stateDiv.appendChild(icon);
    stateDiv.appendChild(urlText);
    stateDiv.addEventListener('click', () => {
        window.postMessage({
          source: 'websocket-hooks-script',
          type: 'WEBSOCKET_URL_SEARCH',
          searchUrl: displayUrl,
          tabUrl: window.location.href,
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
    // 保存原始WebSocket构造函数
    const origWebSocket = window.WebSocket;
    // 替换WebSocket构造函数
    window.WebSocket = function(url, protocols) {
      const wsInstanceUrl = url;
      const currentTabUrl = window.location.href;
      
      // 使用formSendData提取nodeId
      let nodeId = '';
      let apiUrl = '';
      let state = false;
      // 发送WebSocket连接消息
      const connectionMessage = { 
        source: 'websocket-hooks-script', 
        type: 'WEBSOCKET_CONNECTION', 
        tabUrl: currentTabUrl,
        data: { 
          url: wsInstanceUrl, 
          timestamp: new Date().toISOString() 
        } 
      };
      
 
      window.postMessage(connectionMessage, '*');
  
      // 创建原始WebSocket实例
      const ws = new origWebSocket(url, protocols);
      
      // 监听连接关闭
      ws.addEventListener('close', function() {
        if (nodeId && window.__websocketInspector && typeof window.__websocketInspector.updateUi === 'function') {
          window.__websocketInspector.updateUi(nodeId, false, apiUrl || wsInstanceUrl);

        }
      });
  
      // 重写onmessage处理函数
      const origAddEventListener = ws.addEventListener;
      ws.addEventListener = function(type, listener, options) {
        if (type === 'message') {
          const wrappedListener = function(event) {
            
            // 尝试解析接收到的消息
            try {
              if (window.__websocketInspector && window.__websocketInspector.formReceiveData) {
                const parsedData = window.__websocketInspector.formReceiveData(event.data);
                if (typeof parsedData === 'object' && parsedData && parsedData.com) {
                  nodeId = parsedData.com;
                  apiUrl = parsedData.url;
                  state = parsedData.state;
                  
                  // 更新UI状态
                  window.__websocketInspector.updateUi(nodeId, state, apiUrl);
                }
              }
            } catch (e) {
              console.error('[WebSocket监控器] 解析接收消息失败:', e);
            }
            
            // 创建消息对象
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
            
            // 调用原始监听器
            listener.call(this, event);
          };
          
          return origAddEventListener.call(this, type, wrappedListener, options);
        }
        return origAddEventListener.call(this, type, listener, options);
      };
      
      // 备份原始的onmessage属性设置器
      const origDescriptor = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
      if (origDescriptor && origDescriptor.set) {
        Object.defineProperty(ws, 'onmessage', {
          set: function(handler) {
            return origDescriptor.set.call(this, function(event) {
              // 尝试解析接收到的消息
              try {
                if (window.__websocketInspector && window.__websocketInspector.formReceiveData) {
                  const parsedData = window.__websocketInspector.formReceiveData(event.data);
                  if (typeof parsedData === 'object' && parsedData && parsedData.com) {
                    nodeId = parsedData.com;
                    apiUrl = parsedData.url;
                    state = parsedData.state;
                    // 更新UI状态
                    window.__websocketInspector.updateUi(nodeId, state, apiUrl);
                    
                  }
                }
              } catch (e) {
                console.error('[WebSocket监控器] 解析onmessage接收消息失败:', e);
              }
              
              // 创建消息对象
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
              
              
              // 调用原始处理函数
              handler.call(this, event);
            });
          },
          get: origDescriptor.get
        });
      }
  
      // 重写send方法
      const origSend = ws.send;
      ws.send = function(data) {
        
        // 尝试解析发送的消息
        try {
          if (window.__websocketInspector && window.__websocketInspector.formSendData) {
            const parsedData = window.__websocketInspector.formSendData(data);
            if (typeof parsedData === 'object' && parsedData && parsedData.com) {
              nodeId = parsedData.com;
              apiUrl = parsedData.url;
              state = parsedData.state;
              window.__websocketInspector.updateUi(nodeId, state, apiUrl);
            }
          }
        } catch (e) {
          console.error('[WebSocket监控器] 解析发送消息失败:', e);
        }
        
        // 创建消息对象
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
        
        
        console.log('[WebSocket监控器] 发送消息已发送');
        
        // 调用原始send方法
        return origSend.call(this, data);
      };
  
      return ws;
    };
  
    // 复制原始WebSocket的静态属性
    window.WebSocket.prototype = origWebSocket.prototype;
    window.WebSocket.CONNECTING = origWebSocket.CONNECTING;
    window.WebSocket.OPEN = origWebSocket.OPEN;
    window.WebSocket.CLOSING = origWebSocket.CLOSING;
    window.WebSocket.CLOSED = origWebSocket.CLOSED;
  
    console.log("✅ [WebSocket监控器] 已成功Hook WebSocket (侧边栏版 v1.2)");
    
    // 添加页面消息监听器
    window.addEventListener('message', function(event) {
      // 处理状态UI切换
      if (event.data && event.data.action === 'toggle_status_ui') {
        const statusUIs = document.querySelectorAll('.websocket-status-ui');
        statusUIs.forEach(function(ui) {
          ui.style.display = event.data.show ? 'flex' : 'none';
        });
      }
    });
  })();
  `;

  // 创建script元素并插入代码
  const script = document.createElement('script');
  script.textContent = wsHookCode;
  
  // 添加到页面
  const parent = document.documentElement || document.head || document.body;
  parent.appendChild(script);
  
  // 移除script元素
  try {
    parent.removeChild(script);
    console.log('[WebSocket监控器] WebSocket钩子代码已注入页面');
  } catch (error) {
    console.error('[WebSocket监控器] 移除钩子脚本时出错:', error);
  }

  console.log('[WebSocket监控器] inject.js 执行完成');
})();

// 确保文件被识别为模块
export { };
