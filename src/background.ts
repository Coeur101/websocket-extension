// 导入类型定义
import type { WebSocketMessage, MessageMap } from './types/websocket';
let websocketMessagesMap: MessageMap = {};
const MAX_STORED_MESSAGES = 200;
let activeSidebar: chrome.runtime.Port | null = null;

// 添加消息到存储
function addMessageToStorage(message: WebSocketMessage, tabUrl?: string): void {
  // 确保消息有标签页URL
  const msgTabUrl = tabUrl || message.tabUrl || 'unknown';
  // 确保该标签页的消息数组存在
  if (!websocketMessagesMap[msgTabUrl]) {
    websocketMessagesMap[msgTabUrl] = [];
  }

  // 添加消息到对应标签页的数组
  websocketMessagesMap[msgTabUrl].unshift(message);

  // 限制消息数量
  if (websocketMessagesMap[msgTabUrl].length > MAX_STORED_MESSAGES) {
    websocketMessagesMap[msgTabUrl] = websocketMessagesMap[msgTabUrl].slice(0, MAX_STORED_MESSAGES);
  }

  // 同步到chrome.storage
  chrome.storage.local.set({ [msgTabUrl]: websocketMessagesMap[msgTabUrl] }, () => {
    if (chrome.runtime.lastError) {
      console.error('[WebSocket监控器] 存储消息失败:', chrome.runtime.lastError);
    } else {
      console.log(`[WebSocket监控器] 消息已存储到本地存储, 标签页: ${msgTabUrl}, 消息数: ${websocketMessagesMap[msgTabUrl].length}`);

      // 如果侧边栏已连接，向其发送消息更新
      notifySidebarOfUpdate();
    }
  });
}

// 清空存储的消息
function clearStoredMessages(tabUrl?: string): void {
  if (tabUrl) {
    delete websocketMessagesMap[tabUrl];
    chrome.storage.local.remove(tabUrl, () => {
      if (chrome.runtime.lastError) {
        console.error('[WebSocket监控器] 清空消息失败:', chrome.runtime.lastError);
      } else {
        console.log(`[WebSocket监控器] 已清空标签页 ${tabUrl} 的消息`);
        // 通知侧边栏消息已更新
        notifySidebarOfUpdate();
      }
    });
  } else {
    websocketMessagesMap = {};
    chrome.storage.local.clear(() => {
      if (chrome.runtime.lastError) {
        console.error('[WebSocket监控器] 清空所有消息失败:', chrome.runtime.lastError);
      } else {
        // 通知侧边栏消息已更新
        notifySidebarOfUpdate();
      }
    });
  }
}

// 初始化时从存储加载所有消息
function loadAllMessages(): void {
  chrome.storage.local.get(null, (items: MessageMap) => {
    if (chrome.runtime.lastError) {
      console.error('[WebSocket监控器] 加载消息失败:', chrome.runtime.lastError);
    } else {
      websocketMessagesMap = items || {};
      console.log(`[WebSocket监控器] 已加载消息，标签页数: ${Object.keys(websocketMessagesMap).length}`);
    }
  });
}

// 通知侧边栏消息已更新
function notifySidebarOfUpdate(): void {
  // 获取当前活跃标签页
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs: chrome.tabs.Tab[]) => {
    const currentTab = tabs[0];
    const activeTabUrl = currentTab?.url || '';
    // 使用长连接方式通知侧边栏
    if (activeSidebar) {
      try {
        activeSidebar.postMessage({
          action: 'messages_update',
          messages: websocketMessagesMap,
          activeTabUrl: activeTabUrl
        });
      } catch (e) {
        console.error('[WebSocket监控器] 通过长连接通知侧边栏失败:', e);
        activeSidebar = null;
      }
    }

    // 同时尝试使用标准消息方式通知侧边栏
    try {
      chrome.runtime.sendMessage({
        action: 'messages_update',
        messages: websocketMessagesMap,
        activeTabUrl: activeTabUrl
      }, (response) => {
        if (chrome.runtime.lastError) {
          return;
        }
        console.log('[WebSocket监控器] 已通知侧边栏消息更新, 响应:', response);
      });
    } catch (e) {
      console.log('[WebSocket监控器] 尝试通知侧边栏时出错:', e);
    }
  });
}

// 初始化加载
loadAllMessages();

// 监听长连接请求
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'websocket-sidebar') {
    activeSidebar = port;

    // 监听侧边栏断开连接
    port.onDisconnect.addListener(() => {
      activeSidebar = null;
    });

    // 监听侧边栏消息
    port.onMessage.addListener((message) => {
      console.log('[WebSocket监控器] 收到侧边栏消息:', message);
      if (message.action === 'get_messages') {
        // 获取当前活跃标签页
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs: chrome.tabs.Tab[]) => {
          const currentTab = tabs[0];
          const activeTabUrl = currentTab?.url || message.tabUrl || '';

          port.postMessage({
            action: 'messages_update',
            messages: websocketMessagesMap,
            activeTabUrl: activeTabUrl
          });
        });
      }
      else if (message.action === 'clear_messages') {
        clearStoredMessages(message.tabUrl);
        port.postMessage({ action: 'clear_messages_response', success: true });
      }
      else if (message.action === 'toggle_status_ui') {
        // 转发到内容脚本
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            try {
              chrome.tabs.sendMessage(tabs[0].id, {
                action: 'toggle_status_ui',
                show: message.show
              }, (response) => {
                if (chrome.runtime.lastError) {
                  return;
                }
              });
            } catch (e) {
              console.error('[WebSocket监控器] 尝试发送切换状态UI消息时出错:', e);
            }
          }
        });
      }
    });
  }
});

// 监听消息请求
chrome.runtime.onMessage.addListener((message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  // 处理来自页面的WebSocket消息
  if (message.source === 'websocket-hooks-script') {
    // 处理WebSocket消息
    if (message.type === 'WEBSOCKET_MESSAGE' || message.type === 'WEBSOCKET_CONNECTION') {
      // 确保消息符合WebSocketMessage接口
      const wsMessage = message as WebSocketMessage;
      addMessageToStorage(wsMessage, message.tabUrl);
      sendResponse({ success: true });
    }
    // 处理WebSocket钩子就绪消息
    else if (message.type === 'WEBSOCKET_HOOK_READY') {
      sendResponse({ success: true });
    }

    return true;
  }

  // 处理侧边栏就绪消息
  if (message.action === 'sidebar_ready') {
    sendResponse({ success: true });
    return true;
  }

  // 处理切换侧边栏请求
  if (message.action === 'toggle_sidebar') {
    // 使用新的侧边栏API替代内嵌iframe
    if (sender.tab?.windowId) {
      chrome.sidePanel.open({ windowId: sender.tab.windowId });
      console.log(`[WebSocket监控器] 已打开侧边栏，windowId: ${sender.tab.windowId}`);
    } else {
      // 如果没有windowId，尝试获取当前窗口
      chrome.windows.getCurrent(window => {
        if (window.id) {
          chrome.sidePanel.open({ windowId: window.id });
        } else {
          console.error('[WebSocket监控器] 无法获取窗口ID');
        }
      });
    }
    sendResponse({ success: true });
  }

  // 处理获取消息请求
  else if (message.action === 'get_messages') {
    console.log('[WebSocket监控器] 处理获取消息请求');
    // 获取当前活跃标签页
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs: chrome.tabs.Tab[]) => {
      const currentTab = tabs[0];
      const activeTabUrl = currentTab?.url || message.tabUrl || '';

      console.log(`[WebSocket监控器] 当前活跃标签页URL: ${activeTabUrl}`);
      console.log(`[WebSocket监控器] 消息映射中的标签页数: ${Object.keys(websocketMessagesMap).length}`);

      sendResponse({
        activeTabUrl: activeTabUrl,
        messages: websocketMessagesMap
      });
    });

    // 返回true以便异步发送响应
    return true;
  }

  // 处理存储消息请求
  else if (message.action === 'store_message') {
    if (message.wsMessage) {
      addMessageToStorage(message.wsMessage, message.tabUrl);
      sendResponse({ success: true });
    } else {
      console.error('[WebSocket监控器] 存储消息失败: 消息为空');
      sendResponse({ success: false, error: 'Message is empty' });
    }
  }

  // 处理清空消息请求
  else if (message.action === 'clear_messages') {
    clearStoredMessages(message.tabUrl);
    sendResponse({ success: true });
  }

  // 处理切换状态UI请求
  else if (message.action === 'toggle_status_ui') {
    console.log('[WebSocket监控器] 处理切换状态UI请求');
    // 转发到内容脚本
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        try {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'toggle_status_ui',
            show: message.show
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.log('[WebSocket监控器] 内容脚本可能未加载，这是正常的');
              sendResponse({ success: false, error: 'Content script not loaded' });
              return;
            }
            console.log('[WebSocket监控器] 切换状态UI成功, 响应:', response);
            sendResponse({ success: true });
          });
        } catch (e) {
          console.error('[WebSocket监控器] 尝试发送切换状态UI消息时出错:', e);
          sendResponse({ success: false, error: String(e) });
        }
        return true; // 异步发送响应
      }
      sendResponse({ success: false, error: 'No active tab' });
    });
    return true; // 异步发送响应
  }

  // 处理URL搜索请求
  else if (message.action === 'search_url') {
    console.log('[WebSocket监控器] 处理URL搜索请求:', message.searchUrl);
    
    // 通知侧边栏进行URL搜索
    if (activeSidebar) {
      try {
        activeSidebar.postMessage({
          action: 'search_url',
          searchUrl: message.searchUrl,
          tabUrl: message.tabUrl
        });
        console.log('[WebSocket监控器] 已通过长连接转发URL搜索请求');
        sendResponse({ success: true });
      } catch (e) {
        console.error('[WebSocket监控器] 通过长连接转发URL搜索请求失败:', e);
        activeSidebar = null;
        sendResponse({ success: false, error: String(e) });
      }
    } else {
      // 尝试使用标准消息
      chrome.runtime.sendMessage({
        action: 'search_url',
        searchUrl: message.searchUrl,
        tabUrl: message.tabUrl
      }, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: 'Sidebar not available' });
          return;
        }
        console.log('[WebSocket监控器] URL搜索请求已转发');
        sendResponse({ success: true });
      });
    }
    return true; // 异步发送响应
  }

  // 返回true表示将异步发送响应
  return true;
});

// 监听扩展图标点击
chrome.action.onClicked.addListener((tab: chrome.tabs.Tab) => {
  // 打开侧边栏面板
  if (tab.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId });;
  } else {
    // 如果没有windowId，尝试获取当前窗口
    chrome.windows.getCurrent(window => {
      if (window.id) {
        chrome.sidePanel.open({ windowId: window.id });
      } else {
        console.error('[WebSocket监控器] 无法获取窗口ID');
      }
    });
  }
});

// 安装或更新扩展时的处理
chrome.runtime.onInstalled.addListener(({ reason }: { reason: string }) => {
  console.log(`[WebSocket监控器] 扩展${reason === 'install' ? '已安装' : '已更新'}`);

  if (reason === 'install') {
    chrome.storage.local.clear(); // 初始安装时清空所有消息

    // 设置侧边栏
    chrome.sidePanel.setOptions({
      path: 'index.html',
      enabled: true
    });
  } else if (reason === 'update') {

    // 更新侧边栏设置
    chrome.sidePanel.setOptions({
      path: 'index.html',
      enabled: true
    });
  }
});

// 确保文件被识别为模块
export { }; 
