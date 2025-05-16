// Chrome API类型声明
declare namespace chrome {
  namespace runtime {
    function getURL(path: string): string;
    function sendMessage<T = any>(message: any, responseCallback?: (response: T) => void): void;
    const onMessage: {
      addListener(callback: (message: any, sender: MessageSender, sendResponse: (response?: any) => void) => boolean | void): void;
    };
    const onInstalled: {
      addListener(callback: (details: { reason: string }) => void): void;
    };
    
    interface MessageSender {
      tab?: chrome.tabs.Tab;
      frameId?: number;
      id?: string;
      url?: string;
      tlsChannelId?: string;
    }
  }

  namespace tabs {
    function sendMessage(tabId: number, message: any): Promise<any>;
    function query(queryInfo: { active: boolean, currentWindow: boolean }, callback: (tabs: chrome.tabs.Tab[]) => void): void;
    
    interface Tab {
      id?: number;
      url?: string;
    }
  }

  namespace storage {
    interface StorageArea {
      get(keys: string | string[] | null, callback: (items: { [key: string]: any }) => void): void;
      set(items: { [key: string]: any }, callback?: () => void): void;
      remove(keys: string | string[], callback?: () => void): void;
      clear(callback?: () => void): void;
    }
    const local: StorageArea;
  }

  namespace action {
    const onClicked: {
      addListener(callback: (tab: chrome.tabs.Tab) => void): void;
    };
  }
}

// 扩展Window接口，添加WebSocket Inspector相关属性
interface Window {
  __websocketInspector?: {
    forwardMessage: (message: any) => void;
  };
}

// 添加自定义事件类型
interface CustomEventInit {
  detail?: any;
}

interface CustomEvent extends Event {
  readonly detail: any;
}

interface CustomEventMap {
  'websocket-message': CustomEvent;
} 
