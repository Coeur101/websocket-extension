// 导入类型定义
import type { WebSocketMessage, CommunicationMessage, MessageMap } from './types/websocket';

let websocketMessagesMap: MessageMap = {};
const MAX_STORED_MESSAGES = 200;

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
  chrome.storage.local.set({ [msgTabUrl]: websocketMessagesMap[msgTabUrl] });
}

// 清空存储的消息
function clearStoredMessages(tabUrl?: string): void {
  if (tabUrl) {
    // 清空特定标签页的消息
    delete websocketMessagesMap[tabUrl];
    chrome.storage.local.remove(tabUrl, () => {
      console.log(`已清空标签页 ${tabUrl} 的消息`);
    });
  } else {
    // 清空所有消息
    websocketMessagesMap = {};
    chrome.storage.local.clear();
  }
}

// 初始化时从存储加载所有消息
function loadAllMessages(): void {
  chrome.storage.local.get(null, (items: MessageMap) => {
    websocketMessagesMap = items || {};
  });
}

// 初始化加载
loadAllMessages();

// 监听消息请求
chrome.runtime.onMessage.addListener((message: CommunicationMessage, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  // 处理切换侧边栏请求
  if (message.action === 'toggle_sidebar') {
    if (sender.tab?.id) {
      chrome.tabs.sendMessage(sender.tab.id, { action: 'toggle_sidebar' })
        .catch(error => {
          console.log('发送消息出错，可能是content script未加载:', error);
        });
    }
  }
  
  // 处理获取消息请求
  else if (message.action === 'get_messages') {
    // 获取当前活跃标签页
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs: chrome.tabs.Tab[]) => {
      const currentTab = tabs[0];
      const activeTabUrl = currentTab?.url || message.tabUrl || '';
      
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
    }
  }
  
  // 处理清空消息请求
  else if (message.action === 'clear_messages') {
    clearStoredMessages(message.tabUrl);
    sendResponse({ success: true });
  }
  
  // 返回true表示将异步发送响应
  return true;
});

// 监听扩展图标点击
chrome.action.onClicked.addListener((tab: chrome.tabs.Tab) => {
  // 发送消息给当前标签页的content script
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'toggle_sidebar' })
      .catch(error => {
        console.log('发送消息出错，可能是content script未加载:', error);
      });
  }
});

// 安装或更新扩展时的处理
chrome.runtime.onInstalled.addListener(({ reason }: { reason: string }) => {
  if (reason === 'install') {
    console.log('WebSocket监控器扩展已安装');
    chrome.storage.local.clear(); // 初始安装时清空所有消息
  } else if (reason === 'update') {
    console.log('WebSocket监控器扩展已更新');
  }
});

// 确保文件被识别为模块
export {}; 
