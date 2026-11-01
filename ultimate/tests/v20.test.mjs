import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chatMessages} from '../public/chat-ui.mjs';

test('微信式消息：钱程在左、用户在右，各有文字头像和名字',()=>{
 const html=chatMessages([{who:'user',text:'我要攒1000元'},{who:'ai',text:'你打算多久攒到？'}],{name:'Sien'});
 assert.match(html,/class="chat-message outgoing"/);assert.match(html,/class="chat-message incoming"/);
 assert.match(html,/class="chat-avatar avatar-user"[^>]*>我/);assert.match(html,/class="chat-avatar avatar-agent"[^>]*>钱/);
 assert.match(html,/class="message-name">Sien/);assert.match(html,/class="message-name">钱程/);
 const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');assert.match(css,/#chat \.chat-message\.outgoing\{flex-direction:row-reverse\}/);
 assert.match(css,/max-width:calc\(100% - 34px\)/);assert.match(css,/prefers-reduced-motion:reduce/);
});
test('等待只显示真实请求进度，不预报模型成功；无空白气泡',()=>{
 const html=chatMessages([{who:'user',text:'请帮我理解目标'},{who:'ai',text:'',pending:true}]);
 assert.match(html,/role="status"/);assert.match(html,/正在理解你的需求/);assert.equal((html.match(/<i><\/i>/g)||[]).length,3);assert.doesNotMatch(html,/模型已回应|成功|剩余.*秒/);
 assert.equal(chatMessages([{who:'ai',text:''}]),'');
});
test('处理说明默认收起，区分模型回应、规则、降级与请求失败',()=>{
 for(const [mode,failed,requestFailed,label] of [['ai',false,false,'模型已回应'],['rules',false,false,'规则处理'],['rules-fallback',true,false,'本次使用规则兜底'],[undefined,true,true,'请求未完成']]){
  const html=chatMessages([{who:'ai',text:'答复',mode,failed,requestFailed,status:'服务端返回的处理说明'}]);
  assert.match(html,new RegExp('<summary>'+label+'</summary>'));assert.doesNotMatch(html,/<details[^>]*\bopen\b/);assert.match(html,/服务端返回的处理说明/);
  if(mode!=='ai')assert.doesNotMatch(html,/模型已回应/);
 }
});
test('名字、对话、回执转义；长名字与换行保持在气泡边界内',()=>{
 const html=chatMessages([{who:'user',text:'第一行\n<img src=x onerror=alert(1)>'},{who:'ai',text:'<script>bad()</script>',status:'<img src=x>'}],{name:'<b>Sien</b>'});
 assert.doesNotMatch(html,/<script>|<img |<b>Sien/);assert.match(html,/第一行\n&amp;|第一行\n&lt;/);assert.match(html,/&lt;b&gt;Sien/);assert.match(html,/&lt;script&gt;/);
 assert.match(chatMessages([{who:'user',text:'hi'}]),/class="message-name">我/);
});
