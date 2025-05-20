import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

// 等待DOM完全加载
document.addEventListener('DOMContentLoaded', () => {
  // 检查是否已有根元素
  const rootElement = document.getElementById('app') || document.body;
  
  // 清空根元素内容，确保没有重复挂载
  if (rootElement.innerHTML) {
    console.log('[WebsocketHooks Ext] 清空现有内容，准备挂载Vue应用');
    rootElement.innerHTML = '';
  }
  
  // 创建Vue应用并挂载
  const app = createApp(App);
  app.mount(rootElement);
  
  console.log('[WebsocketHooks Ext] Vue侧边栏应用已初始化并挂载');
});
