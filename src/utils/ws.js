(function () {
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function () {
    // XHR拦截保留但不做消息发送处理
    return origOpen.apply(this, arguments);
  };

  const origWebSocket = WebSocket;
  WebSocket = function (url) {
    const wsInstanceUrl = url; // 捕获当前实例的 URL
    const currentTabUrl = window.location.href; // 获取当前标签页 URL
    
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

    const ws = new origWebSocket(url);

    ws.addEventListener("message", function (event) {
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
    });

    const origSend = ws.send;
    ws.send = function (data) {
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

  console.log("✅ 已 Hook WebSocket (iframe通信版 v1.0)");
})();
