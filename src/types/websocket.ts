// WebSocket消息类型
export type MessageDirection = 'send' | 'receive' | 'system';
export type MessageType = 'WEBSOCKET_MESSAGE' | 'WEBSOCKET_CONNECTION' | 'INFO' | 'WEBSOCKET_URL_SEARCH';

// 基础消息数据结构
export interface BaseMessageData {
  id: number;
  timestamp: string;
  url?: string;
  isNew: boolean;
  tabUrl: string;
  direction: MessageDirection;
  message: string;
}

// WebSocket消息数据
export interface WebSocketMessageData extends BaseMessageData {
  direction: 'send' | 'receive';
}

// 系统消息数据
export interface SystemMessageData extends BaseMessageData {
  direction: 'system';
}

// 消息对象
export interface WebSocketMessage {
  id?: number;
  isNew?: boolean;
  source: string;
  type: MessageType;
  tabUrl: string;
  searchUrl?: string;
  data: WebSocketMessageData | SystemMessageData;
}

// 消息映射类型
export interface MessageMap {
  [tabUrl: string]: WebSocketMessage[];
}

// 通信消息类型
export interface CommunicationMessage {
  source?: string;
  type?: string;
  action: string;
  tabUrl?: string;
  wsMessage?: WebSocketMessage;
  messages?: MessageMap;
  activeTabUrl?: string;
}

// 消息标签页类型
export interface MessageTab {
  label: string;
  value: 'all' | 'send' | 'receive';
}

// WebSocket构造函数接口
export interface WebSocketConstructor {
  new(url: string | URL, protocols?: string | string[]): WebSocket;
  readonly CLOSED: number;
  readonly CLOSING: number;
  readonly CONNECTING: number;
  readonly OPEN: number;
  prototype: WebSocket;
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
