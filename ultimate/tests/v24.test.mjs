import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtempSync,rmSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {captureScroll,restoreScroll,installViewport} from '../public/engines/navigation.mjs';
import {initial,apply,summary,day,month} from '../lib/domain.mjs';
import {plan,deterministicPlan} from '../lib/agent.mjs';
import {recommend} from '../lib/tasks.mjs';
import {controller} from './helpers/controller.mjs';
import {personas,profileReview} from '../public/coach-flow-ui.mjs';
import {analyzeBills} from '../public/engines/bill-analysis.mjs';
const change=(s,type,args={})=>apply(structuredClone(s),type,args).state;
function ready(){let s=change(initial(),'goal',{target:5000,months:12});s=change(s,'coach',{place:'武汉',city:2,home:3,job:6,studentWork:'none',commute:0,rel:0,risk:0,time:0,kidCount:0,incomeNum:2000,rent:0,leisure:400,opening:2000});s.demo=true;return change(s,'coach_route',{index:1});}
function linked(){let s=change(ready(),'sample_bill');return change(s,'link_loan',{id:'sample-loan',name:'小王',kind:'垫付',dueDate:new Date(Date.parse(day())+7*86400000).toISOString().slice(0,10),dueType:'desired'});}

test('场景切换回顶，同页聊天保留阅读位置，任务目标采用一次即时定位',()=>{
 const calls=[],main={scrollTop:700},chat={scrollTop:80,scrollHeight:1000},target={scrollIntoView:args=>calls.push({focus:args})},doc={querySelector:s=>({'.main':main,'.chat-scroll':chat,'#target':target}[s]||null)},win={scrollY:300,scrollTo:x=>calls.push(x)};
 const snapshot=captureScroll(doc,win);main.scrollTop=0;chat.scrollTop=0;restoreScroll(doc,win,snapshot);assert.equal(main.scrollTop,700);assert.equal(chat.scrollTop,80);assert.equal(calls.length,0);
 restoreScroll(doc,win,snapshot,{sceneChanged:true,chatChanged:true});assert.equal(main.scrollTop,0);assert.equal(chat.scrollTop,1000);assert.deepEqual(calls.at(-1),{top:0,behavior:'auto'});
 restoreScroll(doc,win,snapshot,{focus:'#target'});assert.equal(main.scrollTop,700);assert.deepEqual(calls.at(-1),{focus:{block:'start',behavior:'auto'}});
});
test('普通滑动不改视口高度；键盘或视口尺寸变化才调整固定应用区域',()=>{
 const handlers=new Map(),values=new Map(),viewport={height:720,offsetTop:0,addEventListener:(e,h)=>handlers.set('v-'+e,h),removeEventListener:e=>handlers.delete('v-'+e)},win={visualViewport:viewport,innerHeight:720,matchMedia:()=>({matches:true}),addEventListener:(e,h)=>handlers.set(e,h),removeEventListener:e=>handlers.delete(e)},doc={activeElement:null,documentElement:{style:{setProperty:(k,v)=>values.set(k,v)},classList:{toggle(){}}}};let updates=0;
 const cleanup=installViewport(win,doc,()=>updates++);assert.equal(values.get('--app-viewport-height'),'720px');viewport.height=680;handlers.get('v-scroll')();assert.equal(updates,1);assert.equal(values.get('--app-viewport-height'),'720px');
 doc.activeElement={tagName:'TEXTAREA'};viewport.height=300;viewport.offsetTop=12;handlers.get('v-scroll')();assert.equal(values.get('--app-viewport-height'),'300px');assert.equal(values.get('--app-viewport-top'),'12px');cleanup();assert.equal(handlers.size,0);
 const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');assert.match(css,/\.layout>\.main\{[^}]*overflow-y:auto/);assert.match(css,/\.layout>#chat\{position:absolute;top:auto;bottom:0/);assert.match(css,/html:has\(\.layout\),body:has\(\.layout\)\{overflow:hidden/);
});
test('虚构身份可直接试试或试一下；真实自我介绍不自动注入样本',async()=>{
 for(const [message,place,opening] of [['试试武汉在校生','武汉',2000],['试一下深圳职场新人','深圳',12000]]){
  const h=controller(change(initial(),'goal',{target:6000,months:12}));await h.driver.chat(message);assert.equal(h.driver.dump().coachInterview.draft.place,place);assert.equal(h.driver.dump().coachInterview.draft.opening,opening);assert.equal(h.state.coach,null);assert.equal(h.dialogs.length,0);
 }
 const h=controller(change(initial(),'goal',{target:6000,months:12}));await h.driver.chat('我在武汉，是大学生');assert.equal(h.state.demo,false);assert.equal(h.driver.dump().coachInterview.draft.opening,undefined);
 const html=profileReview({...ready(),demo:false},{draft:ready().coach,proof:{},analysis:[{title:'分析',detail:'分析内容'}]});assert.ok(html.indexOf('confirm-coach-profile')<html.indexOf('analysis-notes'));assert.equal((html.match(/data-act="confirm-coach-profile"/g)||[]).length,1);
});
test('模型识别不固定说法的虚构体验后能接续收集，不因请求仍忙而卡住',async()=>{
 const h=controller(change(initial(),'goal',{target:6000,months:12}));let first=true;
 h.driver.setApi((path,args)=>{if(path==='chat'&&first){first=false;return Promise.resolve({mode:'ai',reply:'使用虚构学生条件供你核对。',task:{action:'use-persona',persona:'student'}});}return h.api(path,args);});
 await h.driver.chat('让我体验一下武汉那个学生案例');assert.equal(h.driver.dump().goalScreen,'profile-review');assert.equal(h.driver.dump().coachInterview.draft.opening,2000);assert.equal(h.state.coach,null);assert.equal(h.dialogs.length,0);
});
test('聊天直接导入虚拟账单，学生与职场样本不同，已有报告不重复记现金',async()=>{
 const student=controller(ready());await student.driver.chat('导入虚拟账单');assert.equal(student.state.transactions.find(t=>t.id==='sample-loan').cents,10000);assert.equal(student.driver.dump().page,'bills');assert.equal(student.dialogs.length,0);const cash=summary(student.state).cashCents,count=student.state.transactions.length;await student.driver.chat('导入虚拟账单');assert.equal(student.state.transactions.length,count);assert.equal(summary(student.state).cashCents,cash);
 const w=change(ready(),'coach',{place:'深圳',city:1,home:0,job:0,commute:1,rel:0,risk:0,time:0,kidCount:0,incomeNum:8000,rent:1800,leisure:800,opening:12000}),worker=controller(w);await worker.driver.chat('使用虚拟账单');assert.equal(worker.state.transactions.find(t=>t.id==='sample-loan').cents,60000);assert.notEqual(worker.state.transactions.length,count);
});
test('采纳账单行动后直接定位目标教练的本周行动，不弹成功窗或自动追问转账',async()=>{
 const s=change(ready(),'sample_bill'),h=controller(s),op=analyzeBills(s,month()).opportunities[0],cash=summary(s).cashCents;await h.driver.prepare('bill_plan',{period:month(),opportunity:op.id,reduction:String(op.suggestedCents/100),monthlyConfirmed:true});assert.equal(h.driver.dump().page,'goal');assert.equal(h.driver.dump().goalScreen,'execution');assert.equal(h.driver.dump().focusTarget,'#weekly-actions');assert.equal(h.driver.dump().chatExpanded,false);assert.equal(h.dialogs.length,0);assert.equal(summary(h.state).cashCents,cash);h.driver.render();assert.match(h.mount.innerHTML,/id="weekly-actions"/);assert.match(h.mount.innerHTML,/本周行动打卡表/);
});
test('用途确认直接定位执行核对，推荐不再反复问用途；空白发送不重复准备',async()=>{
 const h=controller(change(ready(),'sample_bill'));await h.driver.act('review-sample');await h.driver.chat('是垫付');await h.driver.chat('三天后');await h.driver.chat('本人期望');assert.equal(h.driver.dump().page,'debts');assert.equal(h.driver.dump().focusTarget,'#people-workspace');assert.match(h.driver.currentRecommendation().title,/帮我核对|确认执行/);const prepares=h.calls.filter(c=>c.path==='prepare').length;await h.driver.sendChatInput('');assert.equal(h.calls.filter(c=>c.path==='prepare').length,prepares);assert.equal(h.state.cases.length,0);assert.equal(h.dialogs.length,0);
});
test('模拟时间确认后自动发到期问题、标记对应往来；未还款进入选项且现金不变',async()=>{
 const s=linked(),h=controller(s),cash=summary(s).cashCents;assert.match(recommend(s).title,/预览把模拟日期推进到|最近一笔借款归还日/);await h.driver.prepare('advance_time',{days:7});assert.equal(h.state.simulatedDate,null);await h.driver.commitPending();assert.equal(h.driver.dump().agentContext.intent,'due_status');assert.equal(h.driver.dump().agentContext.caseId,s.cases[0].id);assert.match(h.driver.dump().messages.at(-1).text,/已全部还款.*已部分还款.*未还款/);h.driver.render();assert.match(h.mount.innerHTML,/due-active/);assert.match(h.mount.innerHTML,/到期待核对/);
 await h.driver.chat('未还款');h.driver.render();assert.match(h.mount.innerHTML,/尚未归还，下一步怎样处理/);assert.equal(summary(h.state).cashCents,cash);assert.equal(h.state.cases[0].paid,0);assert.equal(h.dialogs.length,0);
});
test('已全部归还只打开金额和流水核对；部分还款先问金额，确认才更新',async()=>{
 const s=linked(),h=controller(s),id=s.cases[0].id,cash=summary(s).cashCents;await h.driver.act('due-status',{dataset:{id}});await h.driver.chat('已全部还款');h.driver.render();assert.match(h.mount.innerHTML,/核对还款/);assert.match(h.mount.innerHTML,/name="amount" value="100.00"/);assert.equal(h.state.cases[0].paid,0);assert.equal(summary(h.state).cashCents,cash);
 await h.driver.act('close');await h.driver.act('due-status',{dataset:{id}});await h.driver.chat('已部分还款');h.driver.render();assert.match(h.mount.innerHTML,/name="amount" value=""/);assert.match(h.driver.dump().messages.at(-1).text,/实际归还多少/);await h.driver.chat('还了40元');h.driver.render();assert.match(h.mount.innerHTML,/name="amount" value="40"/);assert.equal(summary(h.state).cashCents,cash);
 await h.driver.prepare('repay',{id,amount:40});await h.driver.commitPending();assert.equal(h.state.cases[0].paid,40);assert.equal(summary(h.state).cashCents,cash+4000);assert.equal(h.dialogs.length,0);
});
test('发现唯一同名同额到账流水时预选关联来源，不默认再生成现金',async()=>{
 let s=ready();s.demo=false;s=change(s,'import',{source:'wechat',rows:[{date:day(),time:'12:00:00',merchant:'小王',desc:'借款',amount:'100',direction:'out',externalId:'L1'}]});s=change(s,'link_loan',{id:s.transactions[0].id,name:'小王',kind:'借款'});s=change(s,'import',{source:'wechat',rows:[{date:day(),time:'13:00:00',merchant:'小王',desc:'归还',amount:'100',direction:'in',externalId:'R1'}]});
 const h=controller(s),id=s.cases[0].id,tid=s.transactions.at(-1).id,cash=summary(s).cashCents;await h.driver.act('due-status',{dataset:{id}});await h.driver.chat('已全部还款');h.driver.render();assert.match(h.mount.innerHTML,new RegExp('<option value="'+tid+'" selected>'));assert.equal(summary(h.state).cashCents,cash);assert.equal(h.state.cases[0].paid,0);
});
test('模型可解释到期回答，但无证据或超过待还额不记到账；报价不授权',async()=>{
 const s=linked(),context={intent:'due_status',caseId:s.cases[0].id};for(const q of ['已部分还款','未还款','已全部还款','还了999元','不确定']){const r=deterministicPlan(s,q,context);assert.equal(r.proposal,null);assert.equal(s.cases[0].paid,0);}assert.equal(deterministicPlan(s,'他说准备明天全部还款',context).task,undefined);
 const key=process.env.BIGMODEL_API_KEY,model=process.env.BIGMODEL_MODEL,fetcher=globalThis.fetch;try{process.env.BIGMODEL_API_KEY='test-only';process.env.BIGMODEL_MODEL='test-model';globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({intent:'due_status',repayment_status:'partial',repayment_quote:'先回给我四十元',amount_field:{value:40,quote:'四十元'},answer:'先核对到账，再更新记录。'})}}]})});const r=await plan(s,'他说已经先回给我四十元',context);assert.equal(r.mode,'ai');assert.equal(r.task.action,'repay');assert.equal(r.task.amount,'40');assert.equal(r.proposal,null);assert.equal(s.cases[0].paid,0);}finally{globalThis.fetch=fetcher;for(const [k,v] of [['BIGMODEL_API_KEY',key],['BIGMODEL_MODEL',model]])if(v===undefined)delete process.env[k];else process.env[k]=v;}
});

test('真实HTTP：到期会话接住部分还款，确认前不加现金，关联已有到账不重复计算',async()=>{
 const dir=mkdtempSync(resolve(tmpdir(),'qiancheng-v24-')),child=spawn(process.execPath,['server.mjs','--port','0'],{cwd:resolve(import.meta.dirname,'..'),env:{...process.env,DATA_DIR:dir,BIGMODEL_API_KEY:'',BIGMODEL_MODEL:'',COOKIE_SECURE:'0',PUBLIC_ORIGIN:''}});
 try{
  const base=await new Promise((res,rej)=>{let text='';const timer=setTimeout(()=>rej(Error('startup timeout')),5000);child.stdout.on('data',b=>{text+=b;const m=text.match(/localhost:(\d+)/);if(m){clearTimeout(timer);res('http://127.0.0.1:'+m[1]);}});child.once('error',rej);});
  const guest=await fetch(base+'/api/guest',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),cookie=guest.headers.get('set-cookie').split(';')[0],first=await(await fetch(base+'/api/state',{headers:{cookie}})).json();
  async function api(path,args){const r=await fetch(base+'/api/'+path,{method:args===undefined?'GET':'POST',headers:{cookie,'Content-Type':'application/json','X-CSRF-Token':first.csrf},body:args===undefined?undefined:JSON.stringify(args)}),v=await r.json();assert.equal(r.status,200,JSON.stringify(v));return v;}
  async function commit(type,args={}){const p=await api('prepare',{type,args});return api('commit',{id:p.id,confirm:true});}
  await commit('goal',{target:5000,months:12});await commit('guided_demo');await commit('coach',{place:'武汉',city:2,home:3,job:6,studentWork:'none',commute:0,rel:0,risk:0,time:0,kidCount:0,incomeNum:2000,rent:0,leisure:400,opening:2000});await commit('sample_bill');
  const due=new Date(Date.parse(day())+7*86400000).toISOString().slice(0,10);await commit('link_loan',{id:'sample-loan',name:'小王',kind:'垫付',dueDate:due,dueType:'desired'});let current=await api('state'),id=current.state.cases[0].id,cash=current.summary.cashCents;
  await commit('advance_time',{days:7});const partial=await api('chat',{message:'已部分还款',context:{intent:'due_status',caseId:id}});assert.equal(partial.task.action,'repay');assert.equal(partial.task.partial,true);assert.equal((await api('state')).summary.cashCents,cash);
  const amount=await api('chat',{message:'40元',context:partial.context});assert.equal(amount.task.amount,'40');assert.equal((await api('state')).state.cases[0].paid,0);await commit('repay',{id,amount:'40'});current=await api('state');assert.equal(current.summary.cashCents,cash+4000);assert.equal(current.state.cases[0].paid,40);
  const replay=await api('chat',{message:'已全部还款',context:{intent:'due_status',caseId:id}});assert.equal(replay.task.action,'repay');assert.equal((await api('state')).summary.cashCents,cash+4000);
  const txId=current.state.transactions.at(-1).id;const prepare=await fetch(base+'/api/prepare',{method:'POST',headers:{cookie,'Content-Type':'application/json','X-CSRF-Token':first.csrf},body:JSON.stringify({type:'repay',args:{id,amount:'40',transactionId:txId}})});assert.equal(prepare.status,400);assert.equal((await api('state')).summary.cashCents,cash+4000);
 }finally{if(child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}rmSync(dir,{recursive:true,force:true});}
});
