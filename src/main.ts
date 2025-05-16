import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

const MOUNT_EL_ID = 'WEBSOCKET_VUE_SIDEBAR_ROOT'

let mountEl = document.getElementById(MOUNT_EL_ID)

if (!mountEl) {
  console.log(`[WebsocketHooks Ext] Creating mount point #${MOUNT_EL_ID} for Vue sidebar.`)
  mountEl = document.createElement('div')
  mountEl.setAttribute('id', MOUNT_EL_ID)
  document.body.appendChild(mountEl)
} else {
  console.log(`[WebsocketHooks Ext] Mount point #${MOUNT_EL_ID} already exists.`)
}

// 创建 Vue 应用实例并挂载到我们准备好的元素上
const app = createApp(App)
app.mount(mountEl) // 注意这里是挂载到 mountEl 变量，而不是字符串选择器

console.log('[WebsocketHooks Ext] Vue Sidebar initialized and mounted.')
