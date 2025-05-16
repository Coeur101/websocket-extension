// WebSocket消息类型
export interface WebSocketMessage {
  source: string;
  type: string;
  tabUrl?: string;
  data: {
    url?: string;
    direction?: string;
    message?: any;
    timestamp?: string;
    [key: string]: any;
  };
  // 其他附加属性
  [key: string]: any;
}

// WebSocket构造函数接口
export interface WebSocketConstructor {
  new (url: string | URL, protocols?: string | string[]): WebSocket;
  readonly CLOSED: number;
  readonly CLOSING: number;
  readonly CONNECTING: number;
  readonly OPEN: number;
  prototype: WebSocket;
}

// 通信消息类型
export interface CommunicationMessage {
  action: string;
  wsMessage?: WebSocketMessage;
  tabUrl?: string;
  messageIds?: number[];
  // 其他附加属性
  [key: string]: any;
}

// 消息存储映射类型
export interface MessageMap {
  [tabUrl: string]: WebSocketMessage[];
}

// 侧边栏元素接口
export interface SidebarElements {
  container: HTMLDivElement;
  iframe: HTMLIFrameElement;
}

// 创建自定义WebSocket消息事件类型
export interface WebSocketMessageEvent {
  detail: WebSocketMessage;
} 
