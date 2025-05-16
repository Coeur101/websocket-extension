// 全局类型声明
declare global {
  interface Window {
    __websocketInspector?: {
      forwardMessage: (message: any) => void;
    };
  }
}

export {}; 
