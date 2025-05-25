<template>
  <div class="chat-layout">

    <div class="chat">
      <!-- 🌟 消息列表 -->
      <Bubble.List :items="items" :roles="roles" class="messages" />
      <!-- 🌟 输入框 -->
      <Sender :value="content" class="sender" :loading="agentRequestLoading" @submit="onSubmit"
        @change="value => content = value">
        <template #prefix>
          <Badge :dot="attachedFiles.length > 0 && !headerOpen">
            <Button type="text" @click="() => headerOpen = !headerOpen">
              <template #icon>
                <CodeOutlined />
              </template>
            </Button>
          </Badge>
        </template>

        <template #header>
          <Sender.Header title="接口响应" :open="headerOpen" :styles="{ content: { padding: 0 } }"
            @open-change="open => headerOpen = open">
            <pre><code ref="codeRef" class="language-json"></code></pre>
            <!-- <Attachments :before-upload="() => false" :items="attachedFiles" @change="handleFileChange">
              <template #placeholder="type">
                <Flex v-if="type && type.type === 'inline'" align="center" justify="center" vertical gap="2">
                  <Typography.Text style="font-size: 30px; line-height: 1;">
                    <CloudUploadOutlined />
                  </Typography.Text>
                  <Typography.Title :level="5" style="margin: 0; font-size: 14px; line-height: 1.5;">
                    Upload files
                  </Typography.Title>
                  <Typography.Text type="secondary">
                    Click or drag files to this area to upload
                  </Typography.Text>
                </Flex>
                <Typography.Text v-if="type && type.type === 'drop'">
                  Drop file here
                </Typography.Text>
              </template>
</Attachments> -->
          </Sender.Header>
        </template>
      </Sender>
    </div>
  </div>
</template>
<script setup lang="ts">
import type { AttachmentsProps, BubbleListProps } from 'ant-design-x-vue'
import {
  CodeOutlined,
} from '@ant-design/icons-vue'
import { Badge, Button, Space } from 'ant-design-vue'
import {
  Bubble,
  Sender,
  useXAgent,
  useXChat,
} from 'ant-design-x-vue'
import Prism from 'prismjs';
import 'prismjs/themes/prism.css';
import { computed, h, nextTick, onMounted, ref, watch } from 'vue'
const sleep = () => new Promise(resolve => setTimeout(resolve, 500))
const jsonCode = ref({
  name: "Alice",
  age: 25,
  skills: ["Vue", "React", "Node.js"]
})
const codeRef = ref<HTMLElement | null>(null)
const defaultConversationsItems = [
  {
    key: '0',
    label: 'What is Ant Design X?',
  },
]
const roles: BubbleListProps['roles'] = {
  ai: {
    placement: 'start',
    typing: { step: 5, interval: 20 },
    styles: {
      content: {
        borderRadius: '16px',
      },
    },
  },
  local: {
    placement: 'end',
    variant: 'shadow',
  },
}

// ==================== State ====================
const headerOpen = ref(true)
const content = ref('')
const activeKey = ref(defaultConversationsItems[0].key)
const attachedFiles = ref<AttachmentsProps['items']>([])
const agentRequestLoading = ref(false)

// ==================== Runtime ====================
const [agent] = useXAgent({
  request: async ({ message }, { onSuccess }) => {
    agentRequestLoading.value = true
    await sleep()
    agentRequestLoading.value = false
    onSuccess(`Mock success return. You said: ${message}`)
  },
})

const { onRequest, messages, setMessages } = useXChat({
  agent: agent.value,
})

onMounted(() => {
  if (codeRef.value) {

    codeRef.value.textContent = JSON.stringify(jsonCode.value, null, 2);
    Prism.highlightElement(codeRef.value);
  }
})

watch(headerOpen, () => {
  nextTick(() => {
    if (codeRef.value) {
      codeRef.value.textContent = JSON.stringify(jsonCode.value, null, 2);
      Prism.highlightElement(codeRef.value);
    }
  })
})

watch(activeKey, () => {
  if (activeKey.value !== undefined) {
    setMessages([])
  }
}, { immediate: true })

// ==================== Event ====================
function onSubmit(nextContent: string) {
  if (!nextContent)
    return
  onRequest(nextContent)
  content.value = ''
}

// ==================== Nodes ====================
const placeholderNode = computed(() => h(
  Space,
  { direction: "vertical", size: 16, class: "placeholder" },
))

const items = computed<BubbleListProps['items']>(() => {
  if (messages.value.length === 0) {
    return [{ content: placeholderNode, variant: 'borderless' }]
  }
  return messages.value.map(({ id, message, status }) => ({
    key: id,
    loading: status === 'loading',
    role: status === 'local' ? 'local' : 'ai',
    content: message,
  }))
})
</script>

<style lang="scss" scoped>
.chat-layout {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  display: flex;
  background: #ffffff;
  font-family: AlibabaPuHuiTi, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial,
    'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol',
    'Noto Color Emoji';

  .menu {
    background: rgba(0, 0, 0, 0.02);
    width: 280px;
    height: 100%;
    display: flex;
    flex-direction: column;

    .logo {
      display: flex;
      height: 72px;
      align-items: center;
      justify-content: start;
      padding: 0 24px;
      box-sizing: border-box;

      &-img {
        width: 24px;
        height: 24px;
        display: inline-block;
      }

      &-span {
        display: inline-block;
        margin: 0 8px;
        font-weight: bold;
        color: rgba(0, 0, 0, 0.88);
        font-size: 16px;
      }
    }

    .add-btn {
      background: #1677ff0f;
      border: 1px solid #1677ff34;
      width: calc(100% - 24px);
      margin: 12px 12px 24px 12px;
    }

    .conversations {
      padding: 0 12px;
      flex: 1;
      overflow-y: auto;
    }
  }

  .chat {
    height: 100%;
    width: 100%;
    margin: 0 auto;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    padding: 24px;
    gap: 16px;

    :deep(.messages) {
      flex: 1;
      max-height: 80%;
    }

    .placeholder {
      padding-top: 32px;
      text-align: left;
      flex: 1;
    }

    .sender {
      box-shadow: 0 2px 8px 0 rgba(0, 0, 0, 0.15);
    }
  }
}
</style>
