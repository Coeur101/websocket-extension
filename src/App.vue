<template>
  <div id="websocket-sidebar-container" :class="{ 'sidebar-visible': isOpen, 'sidebar-hidden': !isOpen }">
    <button @click="toggleSidebar" class="toggle-button" :title="isOpen ? '收起面板' : '展开面板'">
      <svg v-if="isOpen" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor"
        class="bi bi-chevron-right" viewBox="0 0 16 16">
        <path fill-rule="evenodd"
          d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z" />
      </svg>
      <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor"
        class="bi bi-chevron-left" viewBox="0 0 16 16">
        <path fill-rule="evenodd"
          d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z" />
      </svg>
    </button>
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
        <select v-model="activeTabUrl" class="url-select">
          <option value="">所有标签页</option>
          <option v-for="url in tabUrls" :key="url" :value="url">
            {{ getHostFromUrl(url) }}
          </option>
        </select>
        <span class="url-count" v-if="tabUrls.length > 0">{{ tabUrls.length }} 个标签页</span>
      </div>

      <!-- 消息列表 -->
      <div class="message-list-container" ref="messageListContainerRef">
        <div v-if="filteredMessages.length === 0" class="empty-message">
          {{ activeMessageTab === 'all' ? '等待 WebSocket 消息...' : `没有${activeMessageTab === 'send' ? '发送' : '接收'}的消息` }}
        </div>
        <div v-for="(msg, index) in filteredMessages" :key="msg.id || index" class="message-item"
          :class="[msg.data.direction, { 'highlight': msg.isNew }]">
          <div class="message-header">
            <span class="timestamp">{{ formatTimestamp(msg.data.timestamp) }}</span>
            <div class="message-meta">
              <span class="direction-tag" :class="msg.data.direction">{{ getDirectionText(msg.data.direction) }}</span>
              <span class="tab-host" v-if="!activeTabUrl && msg.tabUrl" :title="msg.tabUrl">{{
                getHostFromUrl(msg.tabUrl) }}</span>
            </div>
          </div>
          <div class="message-url" v-if="msg.data.url">
            <small title="WebSocket URL">连接: {{ truncateUrl(msg.data.url, 40) }}</small>
          </div>
          <pre class="message-data" @click="copyToClipboard(msg.data.message)"
            title="点击复制消息内容">{{ formatMessageContent(msg.data.message) }}</pre>
        </div>
      </div>

      <div class="sidebar-footer">
        <span class="message-count">{{ filteredMessages.length }}/{{ messages.length }} 条消息</span>
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
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';

// 响应式数据
const isOpen = ref(true);
const messages = ref({}); // 改为对象，以标签页URL为键
const connectedUrl = ref(null);
const nextMessageId = ref(0);
const messageListContainerRef = ref(null);
const autoScroll = ref(true);
const activeMessageTab = ref('all'); // 'all', 'send', 'receive'
const activeTabUrl = ref(''); // 当前选中的标签页 URL
const initialTabUrl = ref(''); // 初始标签页 URL

// 消息类型标签页
const messageTabs = [
  { label: '所有消息', value: 'all' },
  { label: '发送消息', value: 'send' },
  { label: '接收消息', value: 'receive' }
];

// 计算属性：过滤后的消息列表
const filteredMessages = computed(() => {
  // 如果没有消息或当前标签页没有消息，返回空数组
  if (!messages.value || !activeTabUrl.value || !messages.value[activeTabUrl.value]) {
    return [];
  }
  
  return messages.value[activeTabUrl.value].filter(msg => {
    // 消息类型筛选
    const typeMatch = activeMessageTab.value === 'all' || 
                     (activeMessageTab.value === 'send' && msg.data.direction === 'send') ||
                     (activeMessageTab.value === 'receive' && msg.data.direction === 'receive');
    
    return typeMatch;
  });
});

// 计算属性：所有标签页 URL 列表
const tabUrls = computed(() => {
  if (!messages.value) return [];
  return Object.keys(messages.value);
});

// 方法：根据消息类型获取消息数量
const getMessageCountByType = (type) => {
  if (!activeTabUrl.value || !messages.value || !messages.value[activeTabUrl.value]) {
    return 0;
  }

  if (type === 'all') return messages.value[activeTabUrl.value].length;
  
  return messages.value[activeTabUrl.value].filter(msg => 
    type === 'send' ? msg.data.direction === 'send' : msg.data.direction === 'receive'
  ).length;
};

// 方法：从 URL 中获取 hostname
const getHostFromUrl = (url) => {
  try {
    if (!url) return '未知标签页';
    const urlObj = new URL(url);
    return urlObj.href;
  } catch (e) {
    return url.split('/')[2] || url;
  }
};

// 切换侧边栏
const toggleSidebar = () => {
  isOpen.value = !isOpen.value;
};

// 切换自动滚动
const toggleAutoScroll = () => {
  autoScroll.value = !autoScroll.value;
  if (autoScroll.value) {
    scrollToBottom();
  }
};

// 处理接收到的消息
const handleMessage = (event) => {
  try {
    // 更详细的调试输出
    console.log('App.vue 接收到消息:', event.source, event.data);
    
    // 判断消息来源，使用origin和source双重检查
    const isSafeOrigin = event.origin === 'null' || event.origin.startsWith('chrome-extension://');
    
    // 处理从content script加载的历史消息 - 完全替换模式
    if (event.data && event.data.source === 'content-script' && event.data.action === 'messages_loaded') {
      // console.log('收到历史消息集合(完全替换):', event.data.messages?.length);
      if (event.data.messages) {
        // 初始化消息对象
        messages.value = event.data.messages;
        
        // 初始化如果没有活跃的tabUrl
        if (!activeTabUrl.value && event.data.activeTabUrl) {
          activeTabUrl.value = event.data.activeTabUrl;
          initialTabUrl.value = event.data.activeTabUrl;
        }
        
        // 确保当前活跃标签页有消息数组
        if (activeTabUrl.value && !messages.value[activeTabUrl.value]) {
          messages.value[activeTabUrl.value] = [];
        }
        
        // console.log('已加载历史消息，当前消息数量:', messages.value[activeTabUrl.value]?.length || 0);
        if (autoScroll.value) {
          scrollToBottom();
        }
      }
      return;
    }
    
    // 处理从content script获取的消息更新 - 只更新模式
    if (event.data && event.data.source === 'content-script' && event.data.action === 'messages_update') {
      // console.log('收到消息更新(保留现有消息):', event.data.messages);
      if (event.data.messages) {
        // 更新消息对象
        messages.value = event.data.messages;
        
        // 确保当前活跃标签页有消息数组
        if (activeTabUrl.value && !messages.value[activeTabUrl.value]) {
          messages.value[activeTabUrl.value] = [];
        }
        
        // console.log('已更新消息列表，当前消息数量:', messages.value[activeTabUrl.value]?.length || 0);
        if (autoScroll.value) {
          scrollToBottom();
        }
      }
      return;
    }
    
    // 处理常规WebSocket消息 - 使用更宽松的条件匹配
    const isWebSocketMessage = event.data && 
                           (event.data.source === 'websocket-hooks-script' || 
                            (event.data.type && 
                             (event.data.type === 'WEBSOCKET_MESSAGE' || 
                              event.data.type === 'WEBSOCKET_CONNECTION')));
                              
    if (isWebSocketMessage) {
      // console.log('接收到WebSocket消息，准备处理:', event.data);
      processMessage(event.data);
    }
  } catch (error) {
    console.error('处理消息时出错:', error);
  }
};

// 消息处理逻辑，抽取为独立函数方便复用
const processMessage = (receivedEvent) => {
  try {
    // console.log('处理消息:', receivedEvent);
    
    // 安全检查 - 确保消息格式正确
    if (!receivedEvent || !receivedEvent.data) {
      console.warn('消息格式不正确，跳过处理:', receivedEvent);
      return;
    }
    
    // 确定消息所属的标签页URL
    const msgTabUrl = receivedEvent.tabUrl || activeTabUrl.value || initialTabUrl.value;
    
    // 如果没有标签页URL，无法处理消息
    if (!msgTabUrl) {
      console.warn('无法确定消息所属标签页:', receivedEvent);
      return;
    }
    
    // 确保该标签页在messages中有对应的数组
    if (!messages.value[msgTabUrl]) {
      messages.value[msgTabUrl] = [];
    }
    
    let messageToAdd;

    const baseData = {
      id: nextMessageId.value++,
      timestamp: receivedEvent.data?.timestamp || new Date().toISOString(),
      url: receivedEvent.data?.url,
      isNew: true,
      tabUrl: msgTabUrl
    };

    if (receivedEvent.type === 'WEBSOCKET_MESSAGE') {
      messageToAdd = {
        source: receivedEvent.source,
        type: receivedEvent.type,
        tabUrl: msgTabUrl,
        data: {
          ...baseData,
          direction: receivedEvent.data.direction,
          message: receivedEvent.data.message,
        }
      };
      // console.log('已创建WebSocket消息对象:', messageToAdd);
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
    }

    if (messageToAdd) {
      // 检查消息是否已存在（通过某些属性比较）
      const isDuplicate = messages.value[msgTabUrl].some(m => 
        m.data.message === messageToAdd.data.message && 
        m.data.direction === messageToAdd.data.direction &&
        Math.abs(new Date(m.data.timestamp) - new Date(messageToAdd.data.timestamp)) < 100 // 允许100ms误差
      );
      
      if (!isDuplicate) {
        messages.value[msgTabUrl].unshift(messageToAdd);
        if (messages.value[msgTabUrl].length > 200) { // 保持与background.js中一致的消息上限
          messages.value[msgTabUrl].pop();
        }
        // console.log('已添加消息到列表，当前消息数量:', messages.value[msgTabUrl].length);
        if (autoScroll.value) {
          scrollToBottom();
        }

        // 移除旧消息的高亮
        setTimeout(() => {
          const newMsg = messages.value[msgTabUrl].find(m => m.id === messageToAdd.id);
          if (newMsg) newMsg.data.isNew = false;
        }, 1500);
      } else {
        // console.log('跳过重复消息');
      }
    }
  } catch (error) {
    console.error('处理消息内容时出错:', error);
  }
};

// 格式化时间戳
const formatTimestamp = (isoString) => {
  if (!isoString) return '';
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 2 });
};

// 获取方向文本
const getDirectionText = (direction) => {
  switch (direction) {
    case 'send': return '📤 发送';
    case 'receive': return '📥 接收';
    case 'system': return '⚙️ 系统';
    default: return '消息';
  }
};

// 截断 URL
const truncateUrl = (url, maxLength = 40) => {
  if (!url) return '';
  if (url.length <= maxLength) return url;
  return url.substring(0, maxLength - 3) + '...';
};

// 格式化消息内容
const formatMessageContent = (content) => {
  if (!content) return '';

  // 尝试解析 JSON 并美化显示
  try {
    if (typeof content === 'string' && (content.startsWith('{') || content.startsWith('['))) {
      const parsedJson = JSON.parse(content);
      return JSON.stringify(parsedJson, null, 2);
    }
  } catch (e) {
    // 如果不是有效 JSON，返回原始内容
  }

  return content;
};

// 滚动到底部
const scrollToBottom = () => {
  nextTick(() => {
    if (messageListContainerRef.value) {
      messageListContainerRef.value.scrollTop = messageListContainerRef.value.scrollHeight;
    }
  });
};

// 清空消息
const clearMessages = () => {
  // 确保当前标签页存在
  if (!activeTabUrl.value || !messages.value[activeTabUrl.value]) {
    return;
  }
  
  // 清空当前标签页的消息
  messages.value[activeTabUrl.value] = [];
  connectedUrl.value = null;

  // 通知父页面清空存储的消息
  if (window.parent !== window) {
    window.parent.postMessage({
      source: 'websocket-sidebar',
      action: 'clear_messages',
      tabUrl: activeTabUrl.value
    }, '*');
  }
};

// 复制内容到剪贴板
const copyToClipboard = (text) => {
  navigator.clipboard.writeText(text).then(() => {
    console.log('Message copied to clipboard');
    // 可以添加一个临时提示
  }).catch(err => {
    console.error('Failed to copy message: ', err);
  });
};

// 监听 tab 切换，自动滚动到底部
watch(activeMessageTab, () => {
  if (autoScroll.value) {
    nextTick(() => scrollToBottom());
  }
});

// 监听 activeTabUrl 变化，切换显示的标签页消息
watch(activeTabUrl, (newUrl, oldUrl) => {
  // 当标签页URL变化时，初始化该标签页的消息数组（如果不存在）
  if (newUrl && !messages.value[newUrl]) {
    messages.value[newUrl] = [];
  }
  
  if (autoScroll.value) {
    nextTick(() => scrollToBottom());
  }
});

// 生命周期钩子
onMounted(() => {
  // 添加消息监听器，确保能接收各种来源的消息
  window.addEventListener('message', handleMessage, false);
  console.log('WebSocket Sidebar App.vue mounted and listening for messages.');
  // 每隔2秒主动请求一次新消息，确保不会漏掉
  const messagePollingInterval = setInterval(() => {
    if (window.parent !== window) {
      window.parent.postMessage({
        source: 'websocket-sidebar',
        type: 'POLLING',
        action: 'get_messages'
      }, '*');
    }
  }, 2000);

  // 监听来自 content.js 的切换侧边栏可见性事件
  window.addEventListener('toggle-ws-sidebar-visibility', () => {
    toggleSidebar();
    console.log('侧边栏可见性已切换:', isOpen.value ? '显示' : '隐藏');
  });

  // 通知父页面iframe已准备就绪并请求历史消息
  if (window.parent !== window) {
    window.parent.postMessage({
      source: 'websocket-sidebar',
      type: 'IFRAME_READY',
      action: 'get_messages'
    }, '*');
  }

  // 清理轮询定时器
  onBeforeUnmount(() => {
    clearInterval(messagePollingInterval);
    window.removeEventListener('message', handleMessage);
    window.removeEventListener('toggle-ws-sidebar-visibility', toggleSidebar);
  });
});
</script>

<style scoped>
#websocket-sidebar-container {
  position: fixed;
  top: 0;
  right: 0;
  width: 380px;
  height: 100vh;
  background-color: #f8f9fa;
  border-left: 1px solid #dee2e6;
  box-shadow: -2px 0 10px rgba(0, 0, 0, 0.07);
  transform: translateX(100%);
  transition: transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1);
  z-index: 2147483647;
  display: flex;
  flex-direction: row;
  font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 14px;
  color: #212529;
}

#websocket-sidebar-container.sidebar-visible {
  transform: translateX(0%);
}

.toggle-button {
  position: absolute;
  left: -0px;
  top: 50%;
  transform: translateY(-50%) translateX(-100%);
  writing-mode: vertical-rl;
  text-orientation: mixed;
  padding: 12px 8px;
  background-color: #007bff;
  color: white;
  border: none;
  cursor: pointer;
  border-radius: 8px 0 0 8px;
  font-size: 13px;
  line-height: 1;
  box-shadow: -3px 0px 6px rgba(0, 0, 0, 0.1);
  transition: background-color 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.toggle-button:hover {
  background-color: #0056b3;
}

.toggle-button svg {
  width: 18px;
  height: 18px;
  transform: rotate(90deg);
}

#websocket-sidebar-container.sidebar-visible .toggle-button svg {
  transform: rotate(-90deg);
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
</style>
