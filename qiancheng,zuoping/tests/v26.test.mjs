import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,apply,summary,month} from '../lib/domain.mjs';
import {plan,deterministicPlan as talk} from '../lib/agent.mjs';
import {controller} from './helpers/controller.mjs';
import {restoreScroll} from '../public/engines/navigation.mjs';
import {mkdtempSync,rmSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {serverVersion} from './helpers/version.mjs';
const change=(s,t,a={})=>apply(structuredClone(s),t,a).state;
function ready(){let s=change(initial(),'goal',{target:5000,months:12});s=change(s,'coach',{place:'武汉',city:2,home:3,job:6,studentWork:'none',commute:0,rel:0,risk:0,time:0,kidCount:0,incomeNum:2000,rent:0,leisure:400,opening:2000});s.demo=true;return change(s,'coach_route',{index:1});}

test('转账金额不要求元字；完整指令、金额和姓名逐轮输入均先显示核对，不直接付款',async()=>{
 const s=ready();for(const q of ['转给小王100','给小王转100','转100给小王','转给小王一百','转给小王100.25']){const r=talk(s,q);assert.equal(r.proposal?.type,'transfer',q);assert.equal(r.proposal.args.name,'小王',q);assert.equal(Number(r.proposal.args.amount),q.endsWith('100.25')?100.25:100,q);}
 const h=controller(s),cash=summary(h.state).cashCents;await h.driver.chat('转账');assert.equal(h.driver.dump().agentContext.stage,'name');await h.driver.chat('小黄');assert.equal(h.driver.dump().agentContext.draft.name,'小黄');assert.equal(h.driver.dump().agentContext.stage,'amount');await h.driver.chat('一百');assert.equal(h.driver.dump().pending.args.name,'小黄');assert.equal(h.driver.dump().pending.args.amount,'100');assert.equal(summary(h.state).cashCents,cash);await h.driver.sendChatInput('');assert.equal(summary(h.state).cashCents,cash);await h.driver.commitPending();assert.equal(summary(h.state).cashCents,cash-10000);assert.equal(h.state.transactions.at(-1).merchant,'小黄');
});
test('尚未说金额时完整新指令覆盖旧收款人；旧transfer上下文也能续接姓名和金额',async()=>{
 const h=controller(ready());await h.driver.chat('我要转账');await h.driver.chat('小黄');await h.driver.chat('转给小王100');assert.equal(h.driver.dump().pending.args.name,'小王');assert.equal(h.driver.dump().pending.args.amount,'100');
 let r=talk(ready(),'小黄',{intent:'transfer'});assert.equal(r.context.draft.name,'小黄');r=talk(ready(),'100',r.context);assert.equal(r.proposal.args.name,'小黄');assert.equal(r.proposal.args.amount,'100');
});
test('无元的时间、电话、否定和错误小数不截成付款金额；不确定也不是姓名',()=>{
 const ctx={intent:'payment_interview',stage:'amount',draft:{kind:'普通付款',name:'小王',amount:''}};
 for(const q of ['三天后','2026-11-07','手机号13800138000','尾号100','-100','100.001'])assert.equal(talk(ready(),q,ctx).proposal,null,q);
 for(const q of ['不要转给小王100','如果转给小王100会怎样'])assert.equal(talk(ready(),q).proposal,null);
 const r=talk(ready(),'不知道',{intent:'payment_interview',stage:'name',draft:{kind:'普通付款'}});assert.equal(r.context.stage,'name');
});
test('紧凑目标5000，6个月在首页和追问中均直达确认，用途不必填、存款留待个人信息',async()=>{
 for(const q of ['5000，6个月','5000,6个月','5000 6个月','6个月5000','五千，六个月']){const r=talk(initial(),q,{intent:'goal_details'});assert.equal(r.proposal?.type,'goal',q);assert.equal(r.proposal.args.target,'5000',q);assert.equal(r.proposal.args.months,6,q);assert.doesNotMatch(r.reply,/已有存款|房租|收入|生活费/);}
 const h=controller();await h.driver.chat('我想攒钱');await h.driver.chat('5000，6个月');assert.equal(h.driver.dump().page,'goal');assert.equal(h.driver.dump().goalScreen,'goal-review');assert.equal(h.driver.dump().chatExpanded,false);assert.equal(h.driver.dump().focusTarget,'#goal-workspace');assert.equal(h.state.goal,null);h.driver.render();assert.match(h.mount.innerHTML,/确认你的储蓄目标/);await h.driver.commitInlineGoal();assert.equal(h.state.goal.months,6);assert.equal(h.state.coach,null);
 const k=controller();await k.driver.act('start-goal');assert.equal(k.driver.dump().agentContext.intent,'goal_details');await k.driver.chat('5000');await k.driver.chat('6个月');assert.equal(k.driver.dump().goalScreen,'goal-review');assert.equal(k.driver.dump().goalReview.args.target,'5000');
});
test('进入账单来源后推荐导入虚拟账单，名词短回复和空白发送都实际载入并分析',async()=>{
 for(const q of ['虚拟账单','虚构账单','用示例','']){const h=controller(ready());await h.driver.chat('核对账单');assert.equal(h.driver.dump().page,'bills');assert.equal(h.driver.dump().agentContext.intent,'bill_source');assert.equal(h.driver.currentRecommendation().title,'导入虚拟账单');await h.driver.sendChatInput(q);assert.ok(h.state.transactions.some(t=>t.id==='sample-loan'),q);assert.ok(h.state.billReports[month()],q);assert.notEqual(h.driver.currentRecommendation().title,'导入虚拟账单');assert.equal(h.dialogs.length,0);const cash=summary(h.state).cashCents,count=h.state.transactions.length;await h.driver.chat('虚拟账单');assert.equal(h.state.transactions.length,count);assert.equal(summary(h.state).cashCents,cash);}
});
test('虚拟账单在模型失败时仍调用任务，不把加载的语言回复当执行；真实账户不混入样本',async()=>{
 const h=controller(ready());await h.driver.chat('虚拟账单');assert.equal(h.calls.filter(c=>c.path==='prepare'&&c.args.type==='sample_bill').length,1);assert.equal(h.calls.filter(c=>c.path==='bill-analysis').length,1);assert.match(h.driver.dump().messages.at(-1).text,/账单已载入|账单已保存/);
 const real=ready();real.demo=false;const before=JSON.stringify(real),r=talk(real,'虚拟账单',{intent:'bill_source'});assert.equal(r.task,undefined);assert.equal(r.proposal,null);assert.match(r.reply,/不能混入/);assert.equal(JSON.stringify(real),before);
 for(const q of ['虚拟账单是什么','不要导入虚拟账单','如果导入虚拟账单会怎样'])assert.notEqual(talk(ready(),q).task?.action,'load-sample-bill',q);
});
test('手机杠杆预览重置主页面与窗口到顶部，展示新比例；预览和返回均不保存目标',async()=>{
 const s=ready(),h=controller(s),before=JSON.stringify(s);await h.driver.chat('计算三种储蓄方案');await h.driver.act('lever',{dataset:{kind:'months',label:'延长6个月'}});assert.equal(h.driver.dump().focusTarget,'page-top');assert.equal(h.driver.dump().chatExpanded,false);h.driver.render();assert.match(h.mount.innerHTML,/原始条件.*调整后/);assert.equal(JSON.stringify(h.state),before);
 const calls=[],main={scrollTop:1900},doc={querySelector:x=>x==='.main'?main:null},win={scrollY:700,scrollTo:x=>calls.push(x)};restoreScroll(doc,win,{main:1900,window:700,chat:0},{focus:'page-top'});assert.equal(main.scrollTop,0);assert.deepEqual(calls,[{top:0,behavior:'auto'}]);await h.driver.act('reset-lever');assert.equal(h.driver.dump().focusTarget,'page-top');assert.equal(JSON.stringify(h.state),before);
});
test('模型和降级保留目标简写及付款槽位；模型臆造金额或引用旧操作不授权',async()=>{
 const old={key:process.env.BIGMODEL_API_KEY,model:process.env.BIGMODEL_MODEL,fetch:globalThis.fetch};process.env.BIGMODEL_API_KEY='test';process.env.BIGMODEL_MODEL='test-model';const upstream=raw=>async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(raw)}}]})});
 try{globalThis.fetch=upstream({intent:'goal',answer:'先把你的生活条件和收入告诉我。'});let r=await plan(initial(),'5000，6个月',{intent:'goal_details'});assert.equal(r.proposal.type,'goal');assert.doesNotMatch(r.reply,/收入/);globalThis.fetch=upstream({intent:'transfer',recipient:'小王',amount_field:{value:999,quote:'100'}});r=await plan(ready(),'转给小王100');assert.equal(r.proposal.args.amount,'100');globalThis.fetch=upstream({intent:'transfer',recipient:'小王',amount_field:{value:100,quote:'100.001'}});r=await plan(ready(),'转给小王100.001');assert.equal(r.proposal,null);
 globalThis.fetch=async()=>{throw Error('network');};r=await plan(ready(),'虚拟账单',{intent:'bill_source'});assert.equal(r.mode,'rules-fallback');assert.equal(r.task.action,'load-sample-bill');const quoted=await plan(ready(),'这是什么意思？',{}, {text:'转给小王100',author:'我',role:'user'});assert.equal(quoted.proposal,null);assert.equal(quoted.task,undefined);
 }finally{globalThis.fetch=old.fetch;for(const [k,v] of [['BIGMODEL_API_KEY',old.key],['BIGMODEL_MODEL',old.model]])if(v===undefined)delete process.env[k];else process.env[k]=v;}
});
test('检测到转账后的直接回复与主页面均有AA入口，选择后只问对方份额、不重复付款',async()=>{
 const s=change(ready(),'sample_bill'),h=controller(s),cash=summary(s).cashCents;await h.driver.act('review-sample');assert.match(h.driver.dump().messages.at(-1).text,/垫付、AA、送礼|直接回复.*“AA”/);h.driver.render();assert.match(h.mount.innerHTML,/data-act="purpose-aa"/);await h.driver.act('purpose-aa',{dataset:{id:'sample-loan'}});assert.equal(h.driver.dump().agentContext.stage,'share');assert.equal(h.driver.dump().agentContext.draft.amount,'');assert.equal(h.driver.dump().pending,null);await h.driver.chat('40');await h.driver.chat('暂不设置日期');assert.equal(h.driver.dump().pending.type,'link_loan');assert.equal(h.driver.dump().pending.args.kind,'AA');assert.equal(h.driver.dump().pending.args.amount,'40');await h.driver.commitPending();assert.equal(summary(h.state).cashCents,cash);assert.equal(summary(h.state).receivableCents,4000);
});

test('真实HTTP：目标简写进入确认，转账姓名和无元金额刷新可续接，虚拟账单实际载入且不重复',async()=>{
 const dir=mkdtempSync(resolve(tmpdir(),'qiancheng-v26-')),child=spawn(process.execPath,['server.mjs','--port','0'],{cwd:resolve(import.meta.dirname,'..'),env:{...process.env,DATA_DIR:dir,BIGMODEL_API_KEY:'',BIGMODEL_MODEL:'',COOKIE_SECURE:'0',PUBLIC_ORIGIN:''}});
 try{
  const base=await new Promise((res,rej)=>{let text='';const timer=setTimeout(()=>rej(Error('startup timeout')),5000);child.stdout.on('data',b=>{text+=b;const m=text.match(/localhost:(\d+)/);if(m){clearTimeout(timer);res('http://127.0.0.1:'+m[1]);}});child.once('error',rej);});
  assert.equal((await(await fetch(base+'/api/health')).json()).version,serverVersion());assert.equal((await fetch(base+'/engines/navigation.mjs')).status,200);
  const guest=await fetch(base+'/api/guest',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),cookie=guest.headers.get('set-cookie').split(';')[0],first=await(await fetch(base+'/api/state',{headers:{cookie}})).json();
  async function api(path,args){const r=await fetch(base+'/api/'+path,{method:args===undefined?'GET':'POST',headers:{cookie,'Content-Type':'application/json','X-CSRF-Token':first.csrf},body:args===undefined?undefined:JSON.stringify(args)}),v=await r.json();assert.equal(r.status,200,JSON.stringify(v));return v;}
  async function commit(type,args={}){const p=await api('prepare',{type,args});return api('commit',{id:p.id,confirm:true});}
  await api('chat',{message:'我想攒钱'});let r=await api('chat',{message:'5000，6个月'});assert.equal(r.proposal.type,'goal');assert.equal(r.proposal.args.target,'5000');assert.equal(r.proposal.args.months,6);assert.equal((await api('state')).state.goal,null);await commit(r.proposal.type,r.proposal.args);await commit('guided_demo');await commit('coach',{place:'武汉',city:2,home:3,job:6,studentWork:'none',commute:0,rel:0,risk:0,time:0,kidCount:0,incomeNum:2000,rent:0,leisure:400,opening:2000});
  r=await api('chat',{message:'我要转账',context:{}});assert.equal(r.context.stage,'name');r=await api('chat',{message:'小黄'});assert.equal(r.context.stage,'amount');const saved=await api('state');assert.equal(saved.conversationContext.draft.name,'小黄');r=await api('chat',{message:'100'});assert.equal(r.proposal.args.name,'小黄');assert.equal(r.proposal.args.amount,'100');assert.equal((await api('state')).summary.cashCents,200000);await commit(r.proposal.type,r.proposal.args);assert.equal((await api('state')).summary.cashCents,190000);
  const h=controller();h.driver.setApi(api);h.driver.setView(await api('state'));await h.driver.chat('核对账单');await h.driver.act('bill-sources');assert.equal(h.driver.currentRecommendation().title,'导入虚拟账单');await h.driver.chat('虚拟账单');let current=await api('state');assert.ok(current.state.transactions.some(t=>t.id==='sample-loan'));assert.ok(current.state.billReports[month()]);assert.notEqual(h.driver.currentRecommendation().title,'导入虚拟账单');const cash=current.summary.cashCents,count=current.state.transactions.length;await h.driver.chat('虚拟账单');current=await api('state');assert.equal(current.state.transactions.length,count);assert.equal(current.summary.cashCents,cash);assert.equal(h.dialogs.length,0);
 }finally{if(child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}rmSync(dir,{recursive:true,force:true});}
});
