<template>
  <div class="websocket-sidebar-app">
    <div id="websocket-sidebar-container" :class="{ 'sidebar-visible': isOpen, 'sidebar-hidden': !isOpen }">
      <div class="sidebar-content">
        <h3>WebSocket 监控</h3>

        <!-- 标签页切换器 - 消息类型 -->
        <div class="tab-switcher message-type-tabs">
          <button v-for="tab in messageTabs" :key="tab.value"
            :class="['tab-button', { active: activeMessageTab === tab.value }]" @click="activeMessageTab = tab.value">
            {{ tab.label }} <span class="badge" v-if="getMessageCountByType(tab.value)">{{
              getMessageCountByType(tab.value) }}</span>
          </button>
        </div>

        <!-- 标签页 URL 选择器 -->
        <div class="tab-url-filter">
          <select class="url-select" v-model="activeTabUrl">
            <option v-for="tab in tabUrls" :key="tab.value" :value="tab.value">
              {{ tab.label }}
            </option>
          </select>
          <n-space vertical>
            <n-input v-model:value="value" @change="debouncedSearch" type="text" placeholder="搜索nodeId或Api" clearable />
          </n-space>
        </div>
        <div class="empty-message preview-warning" v-if="!activeTabUrl?.includes('preview')">
          <div class="warning-icon">⚠️</div>
          <div class="warning-content">
            <h4>仅支持预览模式</h4>
            <p>请在 DASV 预览页面模式下查看 WebSocket 消息</p>
          </div>
        </div>
        <template v-else>
          <!-- 消息列表 -->
          <div class="message-list-container" ref="messageListContainerRef">
            <n-space item-style="display: flex;" align="center" justify="center">
              <n-checkbox v-model:checked="showStatusUI" @update:checked="toggleStatusUI">
                显示状态UI
              </n-checkbox>
            </n-space>
            <div v-if="filteredMessages.length === 0" class="empty-message">
              {{ activeMessageTab === 'all' ? '等待 WebSocket 消息...' : `没有${activeMessageTab === 'send' ? '发送' : '接收'}的消息`
              }}
            </div>
            <div v-for="(msg, index) in filteredMessages" :key="msg.id || index" class="message-item"
              :class="[msg.data.direction, { 'highlight': msg.isNew }]">
              <div class="message-header">
                <span class="timestamp">{{ formatTimestamp(msg.data.timestamp) }}</span>
                <div class="message-meta">
                  <span class="direction-tag" :class="msg.data.direction">{{ getDirectionText(msg.data.direction)
                  }}</span>
                  <span class="tab-host" v-if="!activeTabUrl && msg.tabUrl" :title="msg.tabUrl">{{
                    getHostFromUrl(msg.tabUrl) }}</span>
                </div>
              </div>
              <div class="message-url" v-if="msg.data.url">
                <small title="WebSocket URL">连接: {{ truncateUrl(msg.data.url, 40) }}</small>
              </div>
              <pre class="message-data">{{ formatMessageContent(msg.data) }}</pre>
            </div>
          </div>
        </template>
        <div class="sidebar-footer">
          <span class="message-count">{{ filteredMessages.length }}/{{ messages[activeTabUrl as string]?.length }}
            条消息</span>
          <div class="action-buttons">
            <button @click="toggleAutoScroll" class="action-btn" :class="{ active: autoScroll }" title="自动滚动到新消息">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                <path
                  d="M8 3a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 3zm4 8a4 4 0 0 1-8 0V7a4 4 0 1 1 8 0v4zm-4 2a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
              </svg>
            </button>
            <button @click="clearMessages" class="action-btn clear-btn" title="清空消息列表">清空</button>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import type {
  WebSocketMessage,
  MessageMap,
  MessageTab,
  MessageDirection,
  WebSocketMessageData,
  SystemMessageData,
  BaseMessageData
} from './types/websocket';
import { NInput, NSpace, NCheckbox } from 'naive-ui';
import { useFormData } from './utils/useFormData';
import { useDebounceFn } from '@vueuse/core';

// 响应式数据
const isOpen = ref<boolean>(true);
const messages = ref<MessageMap>({});
const connectedUrl = ref<string | null>(null);
const nextMessageId = ref<number>(0);
const messageListContainerRef = ref<HTMLElement | null>(null);
const autoScroll = ref<boolean>(true);
const activeMessageTab = ref<'all' | 'send' | 'receive'>('all');
const activeTabUrl = ref<string | null>(null);
const initialTabUrl = ref<string>('');
const tabUrls = ref<{ label: string, value: string }[]>([]);
const value = ref<string>('');
const searchValue = ref<string>('');
const showStatusUI = ref(true);


// 消息类型标签页
const messageTabs: MessageTab[] = [
  { label: '所有消息', value: 'all' },
  { label: '发送消息', value: 'send' },
  { label: '接收消息', value: 'receive' }
];

// 计算属性：过滤后的消息列表
const filteredMessages = computed(() => {
  if (!messages.value || !activeTabUrl.value || !messages.value[activeTabUrl.value]) {
    return [];
  }

  let filterMessages = messages.value[activeTabUrl.value].filter(msg => {
    const typeMatch = activeMessageTab.value === 'all' ||
      (activeMessageTab.value === 'send' && msg.data.direction === 'send') ||
      (activeMessageTab.value === 'receive' && msg.data.direction === 'receive');
    return typeMatch;
  });

  if (searchValue.value) {
    filterMessages = filterMessages.filter(msg => {
      return msg.data.message?.includes(searchValue.value)
    })
  }
  return filterMessages;
});

const debouncedSearch = useDebounceFn((value: string) => {
  searchValue.value = value;
}, 300);

// 方法：根据消息类型获取消息数量
const getMessageCountByType = (type: 'all' | 'send' | 'receive'): number => {
  if (!activeTabUrl.value || !messages.value || !messages.value[activeTabUrl.value]) {
    return 0;
  }

  if (type === 'all') return messages.value[activeTabUrl.value].length;

  return messages.value[activeTabUrl.value].filter(msg =>
    type === 'send' ? msg.data.direction === 'send' : msg.data.direction === 'receive'
  ).length;
};

// 方法：从 URL 中获取 hostname
const getHostFromUrl = (url: string): string => {
  try {
    if (!url) return '未知标签页';
    const urlObj = new URL(url);
    return urlObj.href;
  } catch (e) {
    return url.split('/')[2] || url;
  }
};


// 切换自动滚动
const toggleAutoScroll = (): void => {
  autoScroll.value = !autoScroll.value;
  if (autoScroll.value) {
    scrollToTop();
  }
};

// 处理接收到的消息
const handleMessage = (event: MessageEvent): void => {
  try {
    if (event.data && event.data.source === 'content-script' && event.data.action === 'messages_update') {
      if (event.data.messages) {
        const currentMessages = messages.value[event.data.activeTabUrl] || [];
        const newMessages = event.data.messages[event.data.activeTabUrl] || [];
        let hasNewMessages = false;
        // 判断传送的messages的timestamp是否大于已有的message
        const updateMessages = newMessages.filter((item: WebSocketMessage) => {
          return currentMessages.some(e => e.data.timestamp < item.data.timestamp)
        })
        if (updateMessages.length > 0 || (currentMessages.length === 0 && newMessages.length > 0)) {
          hasNewMessages = true
        }
        if (hasNewMessages) {
          messages.value = { ...messages.value, ...event.data.messages };
          tabUrls.value = [{ label: '清空所有消息页', value: '' }, ...Object.keys(event.data.messages).map(item => {
            return {
              label: item,
              value: item
            }
          })];
          if (!activeTabUrl.value && event.data.activeTabUrl) {
            activeTabUrl.value = event.data.activeTabUrl;
            initialTabUrl.value = event.data.activeTabUrl;
          }

          if (activeTabUrl.value && !messages.value[activeTabUrl.value]) {
            messages.value[activeTabUrl.value] = [];
          }

          if (autoScroll.value) {
            scrollToTop();
          }
        }
      }
      return;
    }
    const isWebSocketMessage = event.data &&
      (event.data.source === 'websocket-hooks-script' ||
        (event.data.type &&
          (event.data.type === 'WEBSOCKET_MESSAGE' ||
            event.data.type === 'WEBSOCKET_CONNECTION')));
    if (event.data.type === 'WEBSOCKET_URL_SEARCH') {
      searchValue.value = event.data.searchUrl || ''
      value.value = event.data.searchUrl || ''
    }
    if (isWebSocketMessage) {
      processMessage(event.data);
    }
  } catch (error) {
    console.error('处理消息时出错:', error);
  }
};

// 消息处理逻辑
const processMessage = (receivedEvent: WebSocketMessage): void => {
  try {
    if (!receivedEvent || !receivedEvent.data) {
      console.warn('消息格式不正确，跳过处理:', receivedEvent);
      return;
    }

    const msgTabUrl = receivedEvent.tabUrl || activeTabUrl.value || initialTabUrl.value;

    if (!msgTabUrl) {
      console.warn('无法确定消息所属标签页:', receivedEvent);
      return;
    }

    if (!messages.value[msgTabUrl]) {
      messages.value[msgTabUrl] = [];
    }

    let messageToAdd: WebSocketMessage | null;

    const baseData = {
      id: nextMessageId.value++,
      timestamp: receivedEvent.data?.timestamp || new Date().toISOString(),
      url: receivedEvent.data?.url || '',
      isNew: true,
      tabUrl: msgTabUrl,
      direction: receivedEvent.data.direction,
      message: receivedEvent.data.message
    };

    if (receivedEvent.type === 'WEBSOCKET_MESSAGE') {
      messageToAdd = {
        source: receivedEvent.source,
        type: receivedEvent.type,
        tabUrl: msgTabUrl,
        data: {
          ...baseData,
          direction: receivedEvent.data.direction as 'send' | 'receive',
          message: receivedEvent.data.message,
        }
      };
    } else if (receivedEvent.type === 'WEBSOCKET_CONNECTION') {
      messageToAdd = {
        source: receivedEvent.source,
        type: 'INFO',
        tabUrl: msgTabUrl,
        data: {
          ...baseData,
          direction: 'system',
          message: `🔌 新的 WebSocket 连接已建立: ${receivedEvent.data.url}`,
        }
      };
    } else {
      return;
    }

    const isDuplicate = messages.value[msgTabUrl].some(m =>
      m.data.message === messageToAdd?.data.message &&
      m.data.direction === messageToAdd.data.direction &&
      Math.abs(new Date(m.data.timestamp).getTime() - new Date(messageToAdd.data.timestamp).getTime()) < 100
    );

    if (!isDuplicate) {
      messages.value[msgTabUrl].unshift(messageToAdd as WebSocketMessage);
      if (messages.value[msgTabUrl].length > 200) {
        messages.value[msgTabUrl].pop();
      }

      if (autoScroll.value) {
        scrollToTop();
      }

      setTimeout(() => {
        const newMsg = messages.value[msgTabUrl].find(m => m.id === messageToAdd?.id);
        if (newMsg) newMsg.data.isNew = false;
      }, 1500);
    }
  } catch (error) {
    console.error('处理消息内容时出错:', error);
  }
};

// 格式化时间戳
const formatTimestamp = (isoString: string): string => {
  if (!isoString) return '';
  return new Date(isoString).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

// 获取方向文本
const getDirectionText = (direction: MessageDirection): string => {
  switch (direction) {
    case 'send': return '📤 发送';
    case 'receive': return '📥 接收';
    case 'system': return '⚙️ 系统';
    default: return '消息';
  }
};

// 截断 URL
const truncateUrl = (url: string, maxLength: number = 40): string => {
  if (!url) return '';
  if (url.length <= maxLength) return url;
  return url.substring(0, maxLength - 3) + '...';
};

// 格式化消息内容
const formatMessageContent = (data: WebSocketMessageData | SystemMessageData): string => {
  const { direction } = data
  const { formSendData, formReceiveData } = useFormData()
  if (direction === 'send') {
    return formSendData(data.message) as string
  }
  if (direction === 'receive') {
    return formReceiveData(data.message) as string
  }
  return data.message
};

// 滚动到顶部
const scrollToTop = (): void => {
  nextTick(() => {
    if (messageListContainerRef.value) {
      messageListContainerRef.value.scrollTop = 0;
    }
  });
};

// 清空消息
const clearMessages = (): void => {
  if (activeTabUrl.value) {
    messages.value[activeTabUrl.value] = [];
    connectedUrl.value = null;
  } else {
    tabUrls.value = [{
      label: '清空所有消息页',
      value: ''
    }]
    messages.value = {};
  }

  // 使用chrome.runtime.sendMessage替代window.parent.postMessage
  chrome.runtime.sendMessage({
    action: 'clear_messages',
    tabUrl: activeTabUrl.value
  });
};

// 监听 tab 切换，自动滚动到底部
watch(activeMessageTab, () => {
  if (autoScroll.value) {
    nextTick(() => scrollToTop());
  }
});

// 监听 activeTabUrl 变化，切换显示的标签页消息
watch(activeTabUrl, (newUrl: string | null) => {
  if (newUrl && !messages.value[newUrl]) {
    messages.value[newUrl] = [];
  }

  if (autoScroll.value) {
    nextTick(() => scrollToTop());
  }
});

// 生命周期钩子
onMounted(() => {
  // 建立与background.js的长连接
  let port = chrome.runtime.connect({ name: 'websocket-sidebar' });
  // 监听长连接消息
  port.onMessage.addListener((message) => {
    if (message.action === 'search_url') {
      searchValue.value = message.searchUrl || ''
      value.value = message.searchUrl || ''
    } else {
      handleMessage({
        data: {
          source: 'content-script',
          action: message.action,
          messages: message.messages,
          activeTabUrl: message.activeTabUrl,
        }
      } as any);
    }

  });

  // 添加断开连接处理
  port.onDisconnect.addListener(() => {
    // 尝试重新连接
    setTimeout(() => {
      try {
        const newPort = chrome.runtime.connect({ name: 'websocket-sidebar' });
        port = newPort;
      } catch (e) {
        console.error('[WebSocket监控器] 重新连接background.js失败:', e);
      }
    }, 2000);
  });

  window.addEventListener('message', handleMessage, false);

  const messagePollingInterval = setInterval(() => {
    // 优先使用长连接发送请求
    try {
      port.postMessage({
        source: 'websocket-sidebar',
        type: 'POLLING',
        action: 'get_messages'
      });
    } catch (e) {
      console.error('[WebSocket监控器] 通过长连接发送轮询请求失败:', e);
      // 回退到标准消息
      chrome.runtime.sendMessage({
        source: 'websocket-sidebar',
        type: 'POLLING',
        action: 'get_messages'
      }, (response) => {
        if (chrome.runtime.lastError) {

          return;
        }

        if (response) {

          handleMessage({
            data: {
              source: 'content-script',
              action: 'messages_update',
              messages: response.messages,
              activeTabUrl: response.activeTabUrl
            }
          } as any);
        }
      });
    }
  }, 2000);
  // 优先使用长连接发送请求
  try {
    port.postMessage({
      source: 'websocket-sidebar',
      type: 'IFRAME_READY',
      action: 'get_messages'
    });
  } catch (e) {
    console.error('[WebSocket监控器] 通过长连接发送初始化请求失败:', e);
    // 回退到标准消息
    chrome.runtime.sendMessage({
      source: 'websocket-sidebar',
      type: 'IFRAME_READY',
      action: 'get_messages'
    }, (response) => {
      if (chrome.runtime.lastError) {
        return;
      }

      if (response) {
        handleMessage({
          data: {
            source: 'content-script',
            action: 'messages_loaded',
            messages: response.messages,
            activeTabUrl: response.activeTabUrl
          }
        } as any);
      }
    });
  }

  onBeforeUnmount(() => {
    clearInterval(messagePollingInterval);
    window.removeEventListener('message', handleMessage);

    // 断开与background.js的长连接
    try {
      port.disconnect();
    } catch (e) {
      console.error('[WebSocket监控器] 断开长连接时出错:', e);
    }
  });
});

// 添加切换状态UI的方法
function toggleStatusUI(checked: boolean) {
  // 向content script发送消息
  try {
    chrome.runtime.sendMessage({
      source: 'websocket-sidebar',
      action: 'toggle_status_ui',
      show: checked
    }, (response) => {
      if (chrome.runtime.lastError) {
        // 回退到使用tabs API
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, {
              source: 'websocket-sidebar',
              action: 'toggle_status_ui',
              show: checked
            }, (response) => {
              if (chrome.runtime.lastError) {
                console.log('[WebSocket监控器] 内容脚本可能未加载，这是正常的');
                return;
              }
              console.log('[WebSocket监控器] 切换状态UI成功');
            });
          }
        });
        return;
      }

      if (response && response.success) {
        console.log('[WebSocket监控器] 切换状态UI成功');
      }
    });
  } catch (e) {
    console.error('[WebSocket监控器] 发送切换状态UI消息时出错:', e);
  }
}
</script>

<style scoped lang="scss">
.websocket-sidebar-app {
  width: 100%;
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

#websocket-sidebar-container {
  width: 100%;
  height: 100vh;
  background-color: #f8f9fa;
  display: flex;
  flex-direction: row;
  font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 14px;
  color: #212529;
  flex: 1;
}

#websocket-sidebar-container.sidebar-visible {
  transform: translateX(0%);
}

.sidebar-content {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

h3 {
  margin: 0;
  padding: 12px 18px;
  font-size: 1.1em;
  font-weight: 600;
  color: #fff;
  background-color: #343a40;
  text-align: center;
  flex-shrink: 0;
}

/* 标签页切换器样式 */
.tab-switcher {
  display: flex;
  background-color: #e9ecef;
  border-bottom: 1px solid #ced4da;
  flex-shrink: 0;
  overflow-x: auto;
}

.tab-button {
  padding: 10px 15px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-size: 0.9em;
  color: #495057;
  white-space: nowrap;
  flex: 1;
  transition: all 0.2s ease;
}

.tab-button:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.tab-button.active {
  border-bottom-color: #007bff;
  color: #007bff;
  font-weight: 500;
}

.badge {
  display: inline-block;
  min-width: 18px;
  height: 18px;
  line-height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background-color: #6c757d;
  color: white;
  font-size: 0.75em;
  text-align: center;
  margin-left: 5px;
}

.tab-button.active .badge {
  background-color: #007bff;
}

/* 标签页 URL 筛选器样式 */
.tab-url-filter {
  padding: 8px 12px;
  background-color: #f1f3f5;
  border-bottom: 1px solid #e9ecef;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.url-select {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 0.9em;
  background-color: white;
  color: #495057;
  height: 34px;

  &:focus {
    outline: none;
  }
}

.url-count {
  margin-left: 8px;
  font-size: 0.8em;
  color: #6c757d;
}

.message-list-container {
  flex-grow: 1;
  overflow-y: auto;
  padding: 10px 15px;
  background-color: #fff;
}

.message-list-container::-webkit-scrollbar {
  width: 8px;
}

.message-list-container::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.message-list-container::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 4px;
}

.message-list-container::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

.empty-message {
  text-align: center;
  color: #6c757d;
  padding: 40px 0;
  font-style: italic;
  font-size: 0.95em;
}

.message-item {
  padding: 10px 12px;
  margin-bottom: 10px;
  border-radius: 6px;
  font-size: 0.9em;
  border: 1px solid #e9ecef;
  background-color: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  transition: background-color 0.3s ease;
}

.message-item.highlight {
  background-color: #fff9c4;
}

.message-item.send {
  border-left: 4px solid #007bff;
}

.message-item.receive {
  border-left: 4px solid #28a745;
}

.message-item.system {
  border-left: 4px solid #ffc107;
  background-color: #fffbeb;
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  color: #495057;
}

.message-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.timestamp {
  font-size: 0.8em;
  color: #6c757d;
}

.tab-host {
  font-size: 0.8em;
  color: #6c757d;
  background-color: #e9ecef;
  padding: 2px 6px;
  border-radius: 4px;
}

.direction-tag {
  font-weight: 600;
  font-size: 0.85em;
  padding: 2px 6px;
  border-radius: 4px;
  color: #fff;
}

.direction-tag.send {
  background-color: #007bff;
}

.direction-tag.receive {
  background-color: #28a745;
}

.direction-tag.system {
  background-color: #ffc107;
  color: #212529;
}

.message-url {
  font-size: 0.8em;
  color: #60676e;
  margin-bottom: 5px;
  word-break: break-all;
}

.message-url small {
  font-style: italic;
}

pre.message-data {
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
  padding: 8px;
  background-color: #f1f3f5;
  border-radius: 4px;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
  font-size: 13px;
  line-height: 1.45;
  color: #343a40;
  cursor: pointer;
  max-height: 300px;
  overflow-y: auto;
}

pre.message-data:hover {
  background-color: #e9ecef;
}

.sidebar-footer {
  padding: 8px 15px;
  background-color: #f8f9fa;
  border-top: 1px solid #dee2e6;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85em;
  color: #495057;
  flex-shrink: 0;
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.action-btn {
  padding: 4px 8px;
  font-size: 0.9em;
  background-color: #6c757d;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-btn.active {
  background-color: #28a745;
}

.action-btn:hover {
  background-color: #5a6268;
}

.action-btn.active:hover {
  background-color: #218838;
}

.clear-btn {
  background-color: #dc3545;
}

.clear-btn:hover {
  background-color: #c82333;
}

.preview-warning {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background-color: #fff3cd;
  border: 1px solid #ffeeba;
  border-radius: 8px;
  margin: 16px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  }

  .warning-icon {
    font-size: 32px;
    margin-bottom: 16px;
    animation: bounce 2s infinite;
  }

  .warning-content {
    text-align: center;

    h4 {
      color: #856404;
      margin: 0 0 8px 0;
      font-size: 16px;
      font-weight: 600;
    }

    p {
      color: #666;
      margin: 0;
      font-size: 14px;
      line-height: 1.5;
    }
  }
}

@keyframes bounce {

  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-5px);
  }
}
</style>
