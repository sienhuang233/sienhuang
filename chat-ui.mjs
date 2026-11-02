import {quotedMessage} from './quote-ui.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Display request status and the returned processing receipt, never invented reasoning.
export function chatMessages(messages,user={},flow=null,disabled=false){
 const userName=String(user.name||'我').slice(0,24);
 return messages.map((m,index)=>{if(!m.pending&&!m.text)return '';
  const outgoing=m.who==='user',name=outgoing?userName:'钱程';
  const receipt=m.status&&!outgoing&&!m.pending?`<details class="chat-receipt ${m.failed?'model-error':''}"><summary>${m.requestFailed?'请求未完成':m.failed?'本次使用规则兜底':m.mode==='ai'?'模型已回应':m.mode==='rules'?'规则处理':'处理说明'}</summary><p>${esc(m.status)}</p></details>`:'';
  const progress=flow?.byPeriod?.[flow.period],showControls=!outgoing&&!m.pending&&index===messages.length-1&&flow&&!flow.paused;
  const control=(label,choice,name='')=>`<button type="button" data-act="subscription-reply" data-choice="${choice}" data-period="${esc(flow.period)}" data-name="${esc(name)}" ${disabled?'disabled':''}>${esc(label)}</button>`;
  const controls=showControls?`<div class="subscription-controls">${progress?.stage==='usage'?control('仍在用','keep')+control('不再需要','stop')+control('稍后核对','later'):progress?.stage==='decision'?control('预览模拟取消','cancel-preview')+control('先保留','keep')+control('稍后核对','later'):progress?.stage==='done'?control('返回账单建议','back')+(progress.hasMore===false?'':control('再核对一项','more')):progress?.stage==='choose'?control('稍后核对','later'):''}</div>`:'';
  return `<article class="chat-message ${outgoing?'outgoing':'incoming'}" data-message-index="${index}"><div class="chat-avatar ${outgoing?'avatar-user':'avatar-agent'}" aria-hidden="true">${outgoing?'我':'钱'}</div><div class="message-body"><div class="message-heading"><span class="message-name">${esc(name)}</span>${!m.pending?`<button class="message-reply" data-act="quote-message" data-id="${index}" aria-label="引用${esc(name)}这条消息">↩</button>`:''}</div><div class="bubble ${outgoing?'user':''}">${quotedMessage(m.quote)}${esc(m.text)}${m.pending?'<div class="chat-thinking" role="status"><span class="thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>正在理解你的需求…</span></div>':''}</div>${receipt}${controls}</div></article>`;
 }).join('');
}
