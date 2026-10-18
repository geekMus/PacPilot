<script setup lang="ts">
import { computed, ref, useId } from "vue";
import type { WebhookConfig, WebhookProvider } from "../api/client";
import WebhookBodyEditor from "./WebhookBodyEditor.vue";

const props = defineProps<{
  title: string;
  kind: "success" | "failure";
  modelValue: WebhookConfig;
  pending?: boolean;
  resultMessage?: string;
  resultOk?: boolean | null;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: WebhookConfig];
  test: [];
}>();

const config = computed(() => props.modelValue);
const providerId = useId();
const showDingTalkSecret = ref(false);
const providers: { value: WebhookProvider; label: string; description: string }[] = [
  { value: "custom", label: "自定义 Webhook", description: "对接任意支持 HTTP 请求的服务。" },
  { value: "dingtalk", label: "钉钉机器人", description: "支持普通文本、Markdown 与加签。" },
];

const bodySample = computed(() => JSON.stringify({
  event: props.kind === "success" ? "pac.generated" : "pac.generation_failed",
  ok: props.kind === "success",
  message: props.kind === "success" ? "PAC generated successfully" : "PAC generation failed",
  timestamp: "{{timestamp}}",
}, null, 2));

function update<K extends keyof WebhookConfig>(key: K, value: WebhookConfig[K]) {
  emit("update:modelValue", { ...props.modelValue, [key]: value });
}
function inputValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
}
const channelReady = computed(() => Boolean(config.value.url.trim()));
</script>

<template>
  <section class="channel-card" :class="'channel-' + kind">
    <div class="channel-head">
      <div class="channel-heading">
        <span class="channel-mark" aria-hidden="true">
          <svg v-if="kind === 'success'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 4 4L19 6"/></svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v5m0 4h.01"/><path d="M10.3 3.9 1.8 18.2A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>
        </span>
        <div>
          <h3>{{ title }}</h3>
          <p>{{ kind === "success" ? "PAC 生成成功后发送" : "PAC 生成失败时发送" }}</p>
        </div>
      </div>
      <button type="button" class="test-button" :disabled="pending" @click="emit('test')">
        {{ pending ? "发送中…" : "发送测试" }}
      </button>
    </div>

    <div class="provider-picker">
      <label :for="providerId">通知平台</label>
      <select :id="providerId" :value="config.provider" @change="update('provider', inputValue($event) as WebhookProvider)">
        <option v-for="item in providers" :key="item.value" :value="item.value">{{ item.label }}</option>
      </select>
      <p class="field-hint">{{ providers.find((item) => item.value === config.provider)?.description }}</p>
    </div>

    <template v-if="config.provider === 'custom'">
      <div class="field">
        <label>Webhook URL</label>
        <input :value="config.url" type="url" inputmode="url" autocomplete="off" spellcheck="false"
          placeholder="https://example.com/hooks/pac"
          @input="update('url', inputValue($event))" />
      </div>
      <div class="two-fields">
        <div class="field">
          <label>HTTP 方法</label>
          <select :value="config.method" @change="update('method', inputValue($event) as WebhookConfig['method'])">
            <option value="POST">POST</option><option value="PUT">PUT</option><option value="PATCH">PATCH</option>
          </select>
        </div>
        <div class="field">
          <label>请求 Content-Type</label>
          <div class="field-static">application/json</div>
        </div>
      </div>
      <div class="field">
        <label>额外请求头 <span class="label-hint">可选 JSON 对象</span></label>
        <textarea class="headers-input mono" :value="config.headers" rows="3" spellcheck="false"
          placeholder='{"Authorization":"Bearer …"}'
          @input="update('headers', inputValue($event))"></textarea>
        <p class="field-hint">用于 Authorization、X-API-Key 等请求头。不要覆盖 Host、Content-Length 等传输层字段。</p>
      </div>
      <div class="field">
        <label>请求 Body <span class="label-hint">JSON，可留空</span></label>
        <WebhookBodyEditor :model-value="config.body" :height="190" :sample="bodySample"
          placeholder="输入 JSON 对象或数组…"
          @update:model-value="update('body', $event)" />
        <p class="field-hint">留空时发送包含 ok、event、message 和 timestamp 的默认 JSON 事件。</p>
      </div>
    </template>

    <template v-else-if="config.provider === 'dingtalk'">
      <div class="field">
        <label>机器人 Webhook 地址</label>
        <input :value="config.url" type="url" inputmode="url" autocomplete="off" spellcheck="false"
          placeholder="https://oapi.dingtalk.com/robot/send?access_token=…"
          @input="update('url', inputValue($event))" />
        <p class="field-hint">在钉钉群机器人设置中复制完整的 Webhook 地址，URL 包含 access_token。</p>
      </div>
      <div class="field">
        <label>加签密钥 <span class="label-hint">可选；开启加签时填写</span></label>
        <div class="secret-field">
          <input :value="config.dingTalkSecret" :type="showDingTalkSecret ? 'text' : 'password'"
            autocomplete="new-password" placeholder="SEC 开头的密钥"
            @input="update('dingTalkSecret', inputValue($event))" />
          <button type="button" class="reveal-button" @click="showDingTalkSecret = !showDingTalkSecret">
            {{ showDingTalkSecret ? "隐藏" : "显示" }}
          </button>
        </div>
        <p class="field-hint">启用后服务端会按钉钉规范使用 HMAC-SHA256 生成 timestamp 和 sign 参数；自定义关键词、IP 白名单仍需在钉钉后台设置。<a href="https://open.dingtalk.com/document/robots/customize-robot-security-settings" target="_blank" rel="noopener noreferrer">查看官方安全设置文档 ↗</a></p>
      </div>
      <div class="field">
        <label>消息类型</label>
        <div class="segmented">
          <button type="button" :class="{ active: config.dingTalkMessageType === 'text' }" @click="update('dingTalkMessageType', 'text')">普通文本</button>
          <button type="button" :class="{ active: config.dingTalkMessageType === 'markdown' }" @click="update('dingTalkMessageType', 'markdown')">Markdown</button>
        </div>
      </div>
      <div class="field">
        <label>消息模板 <span class="label-hint">可选</span></label>
        <textarea class="mono message-template" :value="config.messageTemplate" rows="5"
          placeholder="留空使用内置消息模板。可用变量：{{event}}、{{status}}、{{message}}、{{timestamp}}、{{ok}}"
          @input="update('messageTemplate', inputValue($event))"></textarea>
        <p class="field-hint">Markdown 消息可使用钉钉支持的 Markdown 语法。模板变量会在发送时替换。</p>
      </div>
    </template>



    <div class="channel-footer">
      <span class="configured-dot" :class="{ ready: channelReady }"></span>
      <span>{{ channelReady ? "已填写发送目标" : "尚未填写发送目标" }}</span>
      <span class="footer-spacer"></span>
      <span class="timeout-note">请求超时：10 秒</span>
    </div>
    <p v-if="resultMessage" class="test-result" :class="resultOk ? 'success' : 'failure'" role="status" aria-live="polite">
      <span aria-hidden="true">{{ resultOk ? "✓" : "!" }}</span>{{ resultMessage }}
    </p>
  </section>
</template>

<style scoped>
.channel-card { min-width:0; padding:16px; border:1px solid var(--line); border-radius:var(--radius-sm); background:var(--surface-2); }
.channel-success { border-top:2px solid color-mix(in srgb,var(--green) 65%,var(--line)); }
.channel-failure { border-top:2px solid color-mix(in srgb,var(--red) 60%,var(--line)); }
.channel-head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:17px; }
.channel-heading { display:flex; align-items:center; gap:10px; min-width:0; }
.channel-mark { display:grid; place-items:center; width:34px; height:34px; flex:0 0 auto; border:1px solid var(--line); border-radius:10px; background:var(--surface); color:var(--muted); }
.channel-mark svg { width:17px; height:17px; }
.channel-heading h3 { margin:0; font-size:13px; font-weight:750; }
.channel-heading p { margin:3px 0 0; color:var(--muted); font-size:11px; }
.test-button { flex:0 0 auto; appearance:none; border:1px solid var(--line); border-radius:8px; padding:0 10px; min-height:32px; background:var(--surface); color:var(--text); font-size:11px; font-weight:700; cursor:pointer; }
.test-button:hover:not(:disabled) { border-color:var(--accent); color:var(--accent); }
.test-button:disabled { opacity:.55; cursor:wait; }
.provider-picker { margin-bottom:15px; padding:12px; border:1px solid var(--line); border-radius:9px; background:var(--surface); }
.provider-picker label,.field label { display:block; margin-bottom:6px; font-size:12px; font-weight:700; }
.provider-picker select,.field input,.field select,.field textarea {
  box-sizing:border-box; width:100%; min-width:0; border:1px solid var(--line); border-radius:8px;
  padding:9px 10px; color:var(--text); background:var(--bg); font:inherit; font-size:12px;
}
.provider-picker select,.field select { min-height:38px; }
.field textarea { resize:vertical; line-height:1.5; }
.field input:focus,.field select:focus,.field textarea:focus,.provider-picker select:focus {
  outline:none; border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-soft);
}
.field { margin-bottom:14px; min-width:0; }
.field:last-child { margin-bottom:0; }
.field-hint { margin:6px 0 0; color:var(--muted); font-size:11px; line-height:1.5; }
.field-hint a { display:inline-block; margin-top:4px; color:var(--accent); font-weight:650; text-decoration:none; }
.field-hint a:hover { text-decoration:underline; }
.label-hint { color:var(--muted); font-weight:500; }
.two-fields { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); align-items:end; gap:10px; }
.field-static { min-height:38px; box-sizing:border-box; display:flex; align-items:center; padding:0 10px; border:1px solid var(--line); border-radius:8px; color:var(--muted); background:var(--bg); font:11px var(--font-mono); }
.headers-input,.message-template { font-family:var(--font-mono)!important; font-size:11px!important; }
.secret-field { display:flex; gap:6px; }
.secret-field input { flex:1; min-width:0; }
.reveal-button { flex:0 0 auto; border:1px solid var(--line); border-radius:8px; padding:0 9px; background:var(--surface); color:var(--muted); font-size:11px; cursor:pointer; }
.segmented { display:inline-flex; gap:3px; padding:3px; border:1px solid var(--line); border-radius:9px; background:var(--bg); }
.segmented button { min-height:31px; border:0; border-radius:6px; background:transparent; color:var(--muted); padding:0 12px; font-size:11px; cursor:pointer; }
.segmented button.active { background:var(--accent-soft); color:var(--accent); font-weight:700; }
.inline-check { display:flex; gap:9px; align-items:center; min-height:38px; cursor:pointer; }
.inline-check input { width:16px; height:16px; accent-color:var(--accent); flex:0 0 auto; }
.inline-check span { display:flex; flex-direction:column; gap:2px; }
.inline-check strong { font-size:11px; }
.inline-check small { color:var(--muted); font-size:10px; }
.channel-footer { display:flex; align-items:center; gap:7px; padding-top:12px; border-top:1px solid var(--line); color:var(--muted); font-size:10px; }
.configured-dot { width:7px; height:7px; border-radius:50%; background:var(--muted); }
.configured-dot.ready { background:var(--green); }
.footer-spacer { flex:1; }
.timeout-note { white-space:nowrap; }
.test-result { display:flex; align-items:flex-start; gap:8px; margin:12px 0 0; padding:9px 11px; border-radius:8px; font-size:11px; line-height:1.5; overflow-wrap:anywhere; }
.test-result.success { background:var(--green-soft); color:var(--green); }
.test-result.failure { background:var(--red-soft); color:var(--red); }
@media(max-width:900px) { .two-fields { grid-template-columns:1fr; align-items:stretch; } }
@media(max-width:600px) { .channel-head { align-items:flex-start; flex-direction:column; } .test-button { width:100%; } }
</style>
