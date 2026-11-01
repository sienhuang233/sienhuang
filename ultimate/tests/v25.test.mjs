import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,apply,summary,day} from '../lib/domain.mjs';
import {deterministicPlan,plan} from '../lib/agent.mjs';
import {dateFromMessage} from '../lib/people-agent.mjs';
import {recommend} from '../lib/tasks.mjs';
import {controller} from './helpers/controller.mjs';
import {paymentDraft,linkDraft} from '../public/people-flow-ui.mjs';
import {peopleOverview} from '../public/people-ui.mjs';
import {serverVersion} from './helpers/version.mjs';
const change=(s,t,a={})=>apply(structuredClone(s),t,a).state;
function ready(){let s=change(initial(),'goal',{target:5000,months:12});s=change(s,'coach',{place:'武汉',city:2,home:3,job:6,studentWork:'none',commute:0,rel:0,risk:0,time:0,kidCount:0,incomeNum:2000,rent:0,leisure:400,opening:2000});s.demo=true;return change(s,'coach_route',{index:1});}
const sample=()=>change(ready(),'sample_bill');
const linked=()=>change(sample(),'link_loan',{id:'sample-loan',name:'小王',kind:'垫付',dueDate:day(),dueType:'desired'});
const view=s=>({state:s,summary:summary(s)});
const talk=(s,m,c={})=>deterministicPlan(s,m,c);

test('已有流水用途先追问归还日期与性质，继续不替填或关联；可明确跳过',()=>{
 const s=sample(),before=JSON.stringify(s);let r=talk(s,'替对方垫付',{intent:'transfer_purpose',transactionId:'sample-loan'});assert.equal(r.context.stage,'date');assert.equal(r.context.draft.dueDate,'');assert.equal(r.proposal,null);
 r=talk(s,'继续',r.context);assert.equal(r.context.stage,'date');assert.equal(r.proposal,null);r=talk(s,'三天后',r.context);assert.equal(r.context.stage,'date_type');assert.equal(r.context.draft.dueDate,dateFromMessage('三天后',day()));r=talk(s,'双方已约定',r.context);assert.equal(r.proposal.type,'link_loan');assert.equal(r.proposal.args.dueType,'agreed');assert.equal(r.proposal.args.amount,'100.00');assert.equal(JSON.stringify(s),before);
 const saved=change(s,r.proposal.type,r.proposal.args);assert.equal(summary(saved).cashCents,summary(s).cashCents);assert.equal(saved.cases[0].dueType,'agreed');
 for(const text of ['三天之后','三天']){const d=talk(s,'替对方垫付',{intent:'transfer_purpose',transactionId:'sample-loan'}),x=talk(s,text,d.context);assert.equal(x.context.stage,'date_type',text);assert.equal(x.context.draft.dueDate,dateFromMessage('三天后',day()),text);}
 const draft=talk(s,'是垫付',{intent:'transfer_purpose',transactionId:'sample-loan'});const skipped=talk(s,'暂不设置日期',draft.context);assert.equal(skipped.proposal.args.dueDate,'');assert.equal(skipped.proposal.args.dueType,'none');
});
test('日期按当前模拟时钟解析，自定义日期与双方约定／本人期望共用到期核对',()=>{
 assert.equal(dateFromMessage('三天后','2026-11-28'),'2026-12-01');assert.equal(dateFromMessage('三天之后','2026-11-28'),'2026-12-01');assert.equal(dateFromMessage('三天','2026-11-28'),'2026-12-01');assert.equal(dateFromMessage('明天','2026-12-31'),'2027-01-01');assert.equal(dateFromMessage('2026年11月7日','2026-10-31'),'2026-11-07');assert.equal(dateFromMessage('2026-02-30','2026-10-31'),null);
 for(const dueType of ['agreed','desired']){let s=linked();s=change(s,'due',{id:s.cases[0].id,dueDate:'2026-11-07',dueType,days:7});s=change(s,'transfer',{name:'小李',kind:'普通付款',amount:'1'});s.simulatedDate='2026-11-07';assert.equal(recommend(s).action,'due-status');assert.equal(recommend(s).caseId,s.cases[0].id);}
});
test('已有转账AA先核对对方份额，不默认全额或一半；超额继续追问',()=>{
 const s=sample(),context={intent:'transfer_purpose',transactionId:'sample-loan'};let r=talk(s,'这是AA',context);assert.equal(r.context.stage,'share');assert.equal(r.context.draft.amount,'');r=talk(s,'200元',r.context);assert.equal(r.proposal,null);assert.match(r.reply,/不能超过/);r=talk(s,'40元',r.context);assert.equal(r.context.stage,'date');r=talk(s,'暂不设置日期',r.context);assert.equal(r.proposal.args.amount,'40');const next=change(s,r.proposal.type,r.proposal.args);assert.equal(summary(next).receivableCents,4000);assert.equal(summary(next).cashCents,summary(s).cashCents);assert.equal(next.transactions.find(t=>t.parentId==='sample-loan').cents,6000);
});
test('未还款可直接说提醒；保存后体验完成但债务和现金仍保留，再推荐新支付',async()=>{
 const s=linked(),h=controller(s),cash=summary(s).cashCents,id=s.cases[0].id;await h.driver.act('due-status',{dataset:{id}});await h.driver.chat('未还款');assert.equal(h.driver.dump().agentContext.intent,'people_options');await h.driver.chat('帮我提醒对方');h.driver.render();assert.match(h.mount.innerHTML,/模拟信箱/);assert.equal(h.dialogs.length,0);assert.equal(h.state.mails.length,0);
 await h.driver.prepare('remind',{id,message:'方便时看一下上次的款项，辛苦啦。'});assert.equal(h.state.mails.length,1);assert.equal(h.state.cases[0].paid,0);assert.equal(summary(h.state).cashCents,cash);assert.equal(h.state.peopleJourneyCompleted,true);assert.equal(recommend(h.state).action,'agent-people-practice');assert.match(h.driver.dump().messages.at(-1).text,/提醒已保存到模拟信箱|未结清.*仍保留/);
 await h.driver.sendChatInput('');assert.equal(h.driver.dump().agentContext.intent,'payment_interview');assert.equal(h.driver.dump().agentContext.stage,'kind');assert.equal(h.driver.dump().pending,null);
});
test('未还款聊天改期：日期、性质和确认各一步；返回编辑保留姓名金额日期',async()=>{
 const h=controller(linked()),id=h.state.cases[0].id,cash=summary(h.state).cashCents;await h.driver.act('due-unpaid',{dataset:{id}});await h.driver.chat('修改日期');assert.equal(h.driver.dump().agentContext.stage,'date');await h.driver.chat('五天后');assert.equal(h.driver.dump().agentContext.stage,'date_type');await h.driver.chat('本人期望');assert.equal(h.driver.dump().pending.type,'due');assert.equal(h.state.cases[0].dueDate,day());await h.driver.commitPending();assert.equal(h.state.cases[0].dueDate,dateFromMessage('五天后',day()));assert.equal(h.state.peopleJourneyCompleted,true);assert.equal(summary(h.state).cashCents,cash);
 const k=controller(sample());await k.driver.act('review-sample');await k.driver.chat('是垫付');await k.driver.chat('三天后');await k.driver.chat('本人期望');const args=k.driver.dump().pending.args;await k.driver.act('edit-pending-link',{dataset:{id:'sample-loan'}});assert.equal(k.driver.dump().pending,null);assert.equal(k.driver.dump().agentContext.draft.dueDate,args.dueDate);assert.equal(k.driver.dump().agentContext.draft.name,args.name);await k.driver.chat('继续');assert.equal(k.driver.dump().pending.args.dueDate,args.dueDate);assert.equal(k.state.cases.length,0);
});
test('部分还款和部分抵消后接着问剩余款归还日期，未改期前不宣布体验完成',async()=>{
 const s=linked(),id=s.cases[0].id,h=controller(s),cash=summary(s).cashCents;await h.driver.prepare('repay',{id,amount:'30'});assert.equal(summary(h.state).cashCents,cash);await h.driver.commitPending();assert.equal(h.state.cases[0].paid,30);assert.equal(summary(h.state).cashCents,cash+3000);assert.equal(h.state.peopleJourneyCompleted,undefined);assert.equal(h.driver.dump().agentContext.intent,'people_date');assert.match(h.driver.dump().messages.at(-1).text,/70.00.*什么时候/);await h.driver.chat('后天');await h.driver.chat('双方已约定');await h.driver.commitPending();assert.equal(h.state.peopleJourneyCompleted,true);assert.equal(h.state.cases[0].dueDate,dateFromMessage('后天',day()));
 let o=change(linked(),'transfer',{name:'小王',amount:'20',kind:'借入'});const k=controller(o),before=summary(o).cashCents;await k.driver.prepare('offset',{name:'小王',amount:'20'});await k.driver.commitPending();assert.equal(summary(k.state).cashCents,before);assert.equal(k.driver.dump().agentContext.intent,'people_date');assert.equal(k.state.peopleJourneyCompleted,undefined);assert.match(k.driver.dump().messages.at(-1).text,/80.00/);
});
test('全部还款后可移除已结清待办，保留原流水和凭据；未结清不准移除',async()=>{
 const h=controller(linked()),id=h.state.cases[0].id;assert.throws(()=>change(h.state,'archive_case',{id}),/未结清/);await h.driver.prepare('repay',{id,amount:'100'});await h.driver.commitPending();assert.equal(h.state.peopleJourneyCompleted,true);const cash=summary(h.state).cashCents,tx=JSON.stringify(h.state.transactions);await h.driver.act('archive-case',{dataset:{id}});assert.equal(h.state.cases[0].archived,true);assert.equal(JSON.stringify(h.state.transactions),tx);assert.equal(summary(h.state).cashCents,cash);const html=peopleOverview(view(h.state));assert.match(html,/已移除的结清记录/);assert.doesNotMatch(html,/class="debt /);
});
test('复制含多个示例的支付话术先问选哪个，逐轮保留对象金额；普通转账仍需页面确认',async()=>{
 const h=controller(ready()),cash=summary(h.state).cashCents;await h.driver.chat('试试转给。。。多少钱，帮aaa垫付多少钱，帮谁谁谁aa');assert.equal(h.driver.dump().agentContext.stage,'kind');assert.equal(h.driver.dump().agentContext.draft.kind,'');assert.equal(h.driver.dump().pending,null);await h.driver.sendChatInput('');assert.equal(h.driver.dump().agentContext.stage,'kind');await h.driver.chat('普通转账');assert.equal(h.driver.dump().agentContext.stage,'name');await h.driver.chat('小张');assert.equal(h.driver.dump().agentContext.stage,'amount');await h.driver.chat('80元');assert.equal(h.driver.dump().pending.type,'transfer');assert.equal(h.driver.dump().pending.args.name,'小张');assert.equal(summary(h.state).cashCents,cash);const prepared=h.calls.filter(c=>c.path==='prepare').length;await h.driver.sendChatInput('');assert.equal(h.calls.filter(c=>c.path==='prepare').length,prepared);assert.equal(summary(h.state).cashCents,cash);await h.driver.commitPending();assert.equal(summary(h.state).cashCents,cash-8000);assert.equal(h.state.peoplePracticeCompleted,true);
});
test('新AA付款分总额和对方份额，只扣一次现金；不猜日期、性质或姓名',()=>{
 const s=ready(),cash=summary(s).cashCents;let r=talk(s,'帮小王AA');assert.equal(r.context.draft.name,'小王');assert.equal(r.context.stage,'amount');r=talk(s,'整笔总共100元',r.context);assert.equal(r.context.stage,'share');r=talk(s,'40元',r.context);assert.equal(r.context.stage,'date');r=talk(s,'三天后',r.context);assert.equal(r.context.stage,'date_type');r=talk(s,'本人期望',r.context);assert.equal(r.proposal.args.amount,'100');assert.equal(r.proposal.args.receivableAmount,'40');const next=change(s,r.proposal.type,r.proposal.args);assert.equal(summary(next).cashCents,cash-10000);assert.equal(summary(next).receivableCents,4000);assert.equal(summary(next).expenseCents-summary(s).expenseCents,6000);assert.equal(next.transactions.filter(t=>t.direction==='out').length,1);
 const draft=talk(s,'转给小刘');assert.equal(draft.context.draft.name,'小刘');assert.equal(draft.context.stage,'amount');
});
test('姓名字段禁用自动补全且独立于目标名称；用途选填；界面显示用户日期而非预设',()=>{
 const html=paymentDraft(view(ready()),{});assert.match(html,/name="recipientName"/);assert.match(html,/placeholder="例如：小王" autocomplete="off"/);assert.match(html,/用途（可填，选填）/);assert.match(html,/name="dueDate" type="date" value=""/);assert.doesNotMatch(html,/value="学习设备储备"|name="name"/);assert.match(linkDraft(view(sample()),'sample-loan'),/name="dueDate" type="date" value=""/);
});
test('个人信息核对推荐可直接确认并计算三路线，连续空白提交只保存一次；目标追问告知可在聊天补充',async()=>{
 const h=controller(change(initial(),'goal',{target:5000,months:8}));await h.driver.act('persona',{dataset:{persona:'student'}});assert.equal(h.driver.dump().goalScreen,'profile-review');assert.equal(h.driver.currentRecommendation().title,'我已确认个人信息，帮我预览三种方案');const commits=h.calls.filter(c=>c.path==='commit').length;await Promise.all([h.driver.sendChatInput(''),h.driver.sendChatInput('')]);assert.equal(h.driver.dump().goalScreen,'routes');assert.equal(h.calls.filter(c=>c.path==='prepare'&&c.args.type==='coach').length,1);assert.equal(h.calls.filter(c=>c.path==='commit').length,commits+2);assert.equal(h.state.openingCents,200000);
 const k=controller();await k.driver.act('start-goal');assert.match(k.driver.dump().messages.at(-1).text,/直接对我说|聊天.*直接告诉我/);
});
test('模型可补充陌生姓名与口语垫付证据，仍逐步问日期；引用与失败不虚构执行',async()=>{
 const old={key:process.env.BIGMODEL_API_KEY,model:process.env.BIGMODEL_MODEL,fetch:globalThis.fetch};process.env.BIGMODEL_API_KEY='test';process.env.BIGMODEL_MODEL='test-model';
 try{let body;globalThis.fetch=async(_,args)=>{body=JSON.parse(args.body);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({intent:'people_flow',recipient:'小周',kind:'垫付',kind_quote:'替小周先出',amount_field:{value:80,quote:'八十块'}})}}]})};};const s=ready(),r=await plan(s,'替小周先出八十块');assert.equal(r.mode,'ai');assert.equal(r.proposal,null);assert.equal(r.context.draft.name,'小周');assert.equal(r.context.draft.kind,'垫付');assert.equal(r.context.draft.amount,'80');assert.equal(r.context.stage,'date');assert.equal(JSON.parse(body.messages[1].content).transactions,undefined);
 globalThis.fetch=async()=>{throw Error('network');};const fail=await plan(s,'继续',r.context);assert.equal(fail.mode,'rules-fallback');assert.equal(fail.context.stage,'date');assert.equal(fail.proposal,null);
 const quoted=await plan(s,'这段话是什么意思？',{}, {text:'转给小周80元',author:'我',role:'user'});assert.equal(quoted.proposal,null);assert.equal(s.transactions.length,0);
 }finally{globalThis.fetch=old.fetch;for(const [k,v] of [['BIGMODEL_API_KEY',old.key],['BIGMODEL_MODEL',old.model]])if(v===undefined)delete process.env[k];else process.env[k]=v;}
});

test('真实HTTP：新日期分轮收集、部分还款后刷新续问余款日期、完成后推荐新支付；AA仅扣一次',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs'),{spawn}=await import('node:child_process'),{tmpdir}=await import('node:os'),{resolve}=await import('node:path');
 const dir=mkdtempSync(resolve(tmpdir(),'qiancheng-v25-')),child=spawn(process.execPath,['server.mjs','--port','0'],{cwd:resolve(import.meta.dirname,'..'),env:{...process.env,DATA_DIR:dir,BIGMODEL_API_KEY:'',BIGMODEL_MODEL:'',COOKIE_SECURE:'0',PUBLIC_ORIGIN:''}});
 try{
  const base=await new Promise((res,rej)=>{let text='';const timer=setTimeout(()=>rej(Error('startup timeout')),5000);child.stdout.on('data',b=>{text+=b;const m=text.match(/localhost:(\d+)/);if(m){clearTimeout(timer);res('http://127.0.0.1:'+m[1]);}});child.once('error',rej);});
  assert.equal((await(await fetch(base+'/api/health')).json()).version,serverVersion());assert.equal((await fetch(base+'/people-flow-ui.mjs')).status,200);
  const guest=await fetch(base+'/api/guest',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),cookie=guest.headers.get('set-cookie').split(';')[0],first=await(await fetch(base+'/api/state',{headers:{cookie}})).json();
  async function api(path,args){const r=await fetch(base+'/api/'+path,{method:args===undefined?'GET':'POST',headers:{cookie,'Content-Type':'application/json','X-CSRF-Token':first.csrf},body:args===undefined?undefined:JSON.stringify(args)}),v=await r.json();assert.equal(r.status,200,JSON.stringify(v));return v;}
  async function commit(type,args={}){const p=await api('prepare',{type,args});return api('commit',{id:p.id,confirm:true});}
  await commit('goal',{target:5000,months:12});await commit('guided_demo');await commit('coach',{place:'武汉',city:2,home:3,job:6,studentWork:'none',commute:0,rel:0,risk:0,time:0,kidCount:0,incomeNum:2000,rent:0,leisure:400,opening:2000});await commit('sample_bill');
  let current=await api('state'),cash=current.summary.cashCents;let r=await api('chat',{message:'是垫付',context:{intent:'transfer_purpose',transactionId:'sample-loan'}});assert.equal(r.context.stage,'date');assert.equal(r.proposal,null);r=await api('chat',{message:'三天后'});assert.equal(r.context.stage,'date_type');r=await api('chat',{message:'本人期望'});assert.equal(r.proposal.type,'link_loan');await commit(r.proposal.type,r.proposal.args);current=await api('state');const id=current.state.cases[0].id;assert.equal(current.summary.cashCents,cash);
  await commit('repay',{id,amount:'40'});current=await api('state');assert.equal(current.conversationContext.intent,'people_date');assert.equal(current.summary.cashCents,cash+4000);r=await api('chat',{message:'继续'});assert.equal(r.context.stage,'date');assert.equal(r.proposal,null);r=await api('chat',{message:'五天后'});assert.equal(r.context.stage,'date_type');r=await api('chat',{message:'双方已约定'});const dueProposal=r.proposal;assert.equal(dueProposal.type,'due');await commit(dueProposal.type,dueProposal.args);current=await api('state');assert.equal(current.state.cases[0].paid,40);assert.equal(current.state.cases[0].dueDate,dateFromMessage('五天后',day()));assert.equal(current.recommendation.action,'agent-people-practice');assert.equal(current.summary.cashCents,cash+4000);
  r=await api('chat',{message:'帮小李AA',context:{}});r=await api('chat',{message:'整笔80元'});r=await api('chat',{message:'30元'});r=await api('chat',{message:'暂不设置日期'});assert.equal(r.proposal.type,'transfer');assert.equal((await api('state')).summary.cashCents,cash+4000);await commit(r.proposal.type,r.proposal.args);current=await api('state');assert.equal(current.summary.cashCents,cash+4000-8000);assert.equal(current.summary.receivableCents,9000);assert.equal(current.state.cases.find(c=>c.recipient==='小李').amount,30);assert.equal(current.state.transactions.filter(t=>t.merchant==='小李'&&t.direction==='out').length,1);
 }finally{if(child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}rmSync(dir,{recursive:true,force:true});}
});

test('模型可将口语处理意图定位提醒页，解释日期含义；无原话证据不改状态',async()=>{
 const old={key:process.env.BIGMODEL_API_KEY,model:process.env.BIGMODEL_MODEL,fetch:globalThis.fetch};process.env.BIGMODEL_API_KEY='test';process.env.BIGMODEL_MODEL='test-model';const s=linked(),before=JSON.stringify(s),context={intent:'people_options',caseId:s.cases[0].id};
 const upstream=raw=>async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(raw)}}]})});
 try{globalThis.fetch=upstream({intent:'people_flow',people_action:'remind',action_quote:'帮我委婉问问他'});let r=await plan(s,'帮我委婉问问他',context);assert.equal(r.task.action,'remind');assert.equal(r.proposal,null);
 globalThis.fetch=upstream({intent:'people_flow',people_action:'remind',action_quote:'不存在的原话'});r=await plan(s,'我再考虑一下',context);assert.equal(r.task.action,'agent-people-options');
 globalThis.fetch=upstream({intent:'other',answer:'双方约定需要对方也已同意；本人期望是你自己的打算。'});r=await plan(s,'日期性质有什么区别？',{intent:'people_date',caseId:s.cases[0].id,stage:'date_type',draft:{dueDate:day(),dueType:''}});assert.match(r.reply,/对方也已同意/);assert.equal(r.proposal,null);assert.equal(JSON.stringify(s),before);
 }finally{globalThis.fetch=old.fetch;for(const [k,v] of [['BIGMODEL_API_KEY',old.key],['BIGMODEL_MODEL',old.model]])if(v===undefined)delete process.env[k];else process.env[k]=v;}
});
test('付款金额不把负数或多位小数截成另一个正数',()=>{
 const s=ready();for(const message of ['转给小王-5元','转给小王100.001元','转给小王0元']){const r=talk(s,message);assert.equal(r.proposal,null);assert.match(r.reply,/金额.*最多两位小数/);}
});
