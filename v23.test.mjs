import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,apply,summary,day,month} from '../lib/domain.mjs';
import {deterministicPlan,plan} from '../lib/agent.mjs';
import {recommend} from '../lib/tasks.mjs';
import {controller} from './helpers/controller.mjs';
import {installChatKeyboard} from '../public/engines/chat-input.mjs';
import {weeklyFeedback,sampleWeekRows,summarizeWeek,weekWindow} from '../public/engines/weekly.mjs';
import {executionPlan} from '../public/engines/plan.mjs';
import {weeklyCheckinDialog,goalExecution} from '../public/plan-ui.mjs';
import {analyzeBills} from '../public/engines/bill-analysis.mjs';
import {personas} from '../public/coach-flow-ui.mjs';
import {profileReview} from '../public/coach-flow-ui.mjs';
import {recentDialogue} from '../lib/conversation.mjs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
const change=(s,type,args={})=>apply(structuredClone(s),type,args).state;
const view=s=>({state:s,summary:summary(s)});
function ready(){let s=change(initial(),'goal',{target:'5000',months:12});s=change(s,'coach',{place:'武汉',city:2,home:3,job:6,studentWork:'none',commute:0,rel:0,risk:0,time:0,kidCount:0,incomeNum:2000,rent:0,leisure:400,opening:2000});s.demo=true;return change(s,'coach_route',{index:1});}
function reportReady(){const s=change(ready(),'sample_bill');s.billAnalysisCompleted=true;s.billReports={[month()]:{...analyzeBills(s,month()),analyzedAt:'test'}};s.lastBillPeriod=month();return s;}
const modelReply=raw=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({answer:'我先理解你的意思，再核对下一步。',...raw})}}]})});
async function withModel(fn){const key=process.env.BIGMODEL_API_KEY,model=process.env.BIGMODEL_MODEL,fetcher=globalThis.fetch;try{process.env.BIGMODEL_API_KEY='test-only';process.env.BIGMODEL_MODEL='test-model';await fn();}finally{globalThis.fetch=fetcher;for(const [k,v] of [['BIGMODEL_API_KEY',key],['BIGMODEL_MODEL',model]])if(v===undefined)delete process.env[k];else process.env[k]=v;}}

test('电脑Enter发送，Shift换行、中文输入法候选、长按重复及触屏Enter不发送',()=>{
 const handlers=new Map(),sent=[],doc={addEventListener:(t,h)=>handlers.set(t,h),removeEventListener:t=>handlers.delete(t)};let desktop=true;
 const stop=installChatKeyboard(doc,v=>sent.push(v),()=>desktop),handler=handlers.get('keydown'),target={name:'message',form:{id:'chatForm'},value:'我要攒1000元'};let prevented=0;
 const event={key:'Enter',target,preventDefault:()=>prevented++};handler(event);assert.deepEqual(sent,['我要攒1000元']);assert.equal(prevented,1);
 for(const patch of [{shiftKey:true},{isComposing:true},{keyCode:229},{repeat:true},{ctrlKey:true},{target:{name:'name',form:{id:'other'}}}])handler({...event,...patch});assert.equal(sent.length,1);
 desktop=false;handler(event);assert.equal(sent.length,1);desktop=true;target.value='';handler(event);assert.equal(sent.at(-1),'');stop();assert.equal(handlers.size,0);
});
test('初次追问明确已有存款，分轮输入会保留；已有现金起点不重复索要',async()=>{
 const h=controller(change(initial(),'goal',{target:'5000',months:12}));h.driver.begin();assert.match(h.driver.dump().messages.at(-1).text,/已有存款/);
 await h.driver.chat('我在武汉，每月生活费2000元，已有存款1200元');assert.equal(h.driver.dump().coachInterview.draft.opening,1200);assert.ok(h.driver.dump().coachInterview.missing.every(v=>!v.includes('已有存款')));assert.equal(h.state.openingKnown,false);
 const k=controller(ready());k.driver.begin();assert.doesNotMatch(k.driver.dump().messages.at(-1).text,/请.*已有存款/);
});
test('周反馈按预算内、超出30%内、超过30%分档，零预算与大额缺口不强压生活费',()=>{
 for(const [spent,status] of [[0,'within'],[10000,'within'],[10001,'near'],[13000,'near'],[13001,'over']])assert.equal(weeklyFeedback(spent,10000).status,status);
 const f=weeklyFeedback(14500,10000);assert.equal(f.overCents,4500);assert.equal(f.nextWeekCents,8000);assert.equal(f.spreadWeeks,3);assert.equal(f.spreadTargetCents,8500);
 assert.equal(weeklyFeedback(100,0).nextWeekCents,null);assert.equal(weeklyFeedback(1000000,10000).needsReplan,true);assert.throws(()=>weeklyFeedback(-1,100),/无效/);
});
test('虚构本周账单随所选方案预算生成，三种样本合计精确、往来另列',()=>{
 for(const index of [0,1,2]){const s=change(ready(),'coach_route',{index}),budget=executionPlan(view(s)).weeklyCents;
  for(const [variant,factor,status] of [['within',.8,'within'],['mild',1.2,'near'],['high',1.45,'over']]){
   const rows=sampleWeekRows(day(),day(),{budgetCents:budget,variant}),r=summarizeWeek(rows);assert.equal(r.totalCents,Math.round(budget*factor));assert.equal(r.pendingCents,10000);assert.equal(weeklyFeedback(r.totalCents,budget).status,status);assert.ok(rows.every(t=>t.date<=day()));
  }
 }
});
test('虚构超支保存后显示同一预算依据和调整建议，不增加现金或写入流水',()=>{
 let s=ready();const budget=executionPlan(view(s)).weeklyCents,rows=sampleWeekRows(day(),day(),{budgetCents:budget,variant:'high'}),report=summarizeWeek(rows),cash=summary(s).cashCents;
 s=change(s,'weekly_checkin',{source:'sample',sampleVariant:'high',weekStart:day(),amount:String(report.totalCents/100)});assert.equal(s.checkins[0].status,'over');assert.equal(s.checkins[0].report.totalCents,report.totalCents);assert.equal(s.checkins[0].amountAdjusted,false);assert.equal(summary(s).cashCents,cash);assert.equal(s.transactions.length,0);
 const html=goalExecution(view(s));assert.match(html,/weekly-feedback over/);assert.match(html,/超支超过30%/);assert.match(html,/下周先试控制在/);assert.match(html,/未自动修改预算/);
 const dialog=weeklyCheckinDialog(view(s),{weekStart:weekWindow(day()).start,source:'sample',sampleVariant:'high',report});assert.match(dialog,/data-variant="within"/);assert.match(dialog,/data-variant="mild"/);assert.match(dialog,/data-variant="high"/);assert.match(dialog,/id="weekly-live-feedback"/);assert.match(dialog,/weekly-feedback over/);
});
test('账单来源只显示主页面；分析结果跨场景保留，推荐先定位具体改进',async()=>{
 const s=ready(),h=controller(s),before=JSON.stringify(s);await h.driver.chat('核对账单');h.driver.render();assert.match(h.mount.innerHTML,/这次，你想分析哪份账单/);assert.equal(h.dialogs.length,0);assert.equal(JSON.stringify(h.state),before);
 const reported=reportReady(),k=controller(reported);assert.equal(recommend(reported).action,'agent-bill-actions');await k.driver.sendChatInput('');k.driver.render();assert.equal(k.driver.dump().page,'bills');assert.match(k.mount.innerHTML,/id="bill-actions"/);assert.match(k.mount.innerHTML,/暂不改变预算/);assert.equal(k.dialogs.length,0);
 await k.driver.act('nav',{dataset:{page:'goal'}});await k.driver.act('nav',{dataset:{page:'bills'}});k.driver.render();assert.match(k.mount.innerHTML,/在哪些地方节流更有效/);assert.ok(k.state.billReports[month()]);
});
test('选择不改变预算不增加节省金额；确认行动后才推荐核对转账用途',async()=>{
 const s=reportReady(),h=controller(s),cash=summary(s).cashCents,profile=JSON.stringify(s.profile);assert.equal(recommend(s).action,'agent-bill-actions');await h.driver.act('bill-reviewed');assert.equal(JSON.stringify(h.state.profile),profile);assert.equal(summary(h.state).cashCents,cash);assert.equal(h.state.billDecisions[month()].choice,'keep');assert.equal(recommend(h.state).action,'agent-transfer');
 const accepted=reportReady(),op=analyzeBills(accepted,month()).opportunities[0],next=change(accepted,'bill_plan',{period:month(),opportunity:op.id,reduction:String(op.suggestedCents/100),monthlyConfirmed:true});assert.equal(next.billDecisions[month()].choice,'accepted');assert.equal(recommend(next).action,'agent-transfer');assert.equal(summary(next).cashCents,summary(accepted).cashCents);
});
test('人情用途嵌入主页面且保留工具栏；确认后推荐最近期望日，不冒充双方约定',async()=>{
 let s=change(reportReady(),'bill_review',{period:month()}),h=controller(s),cash=summary(s).cashCents;await h.driver.sendChatInput('');h.driver.render();assert.equal(h.driver.dump().page,'debts');assert.match(h.mount.innerHTML,/当前虚构日期/);assert.match(h.mount.innerHTML,/先核对这笔转账的用途/);assert.match(h.mount.innerHTML,/people-toolbar/);assert.doesNotMatch(h.mount.innerHTML,/data-act="contacts"/);
 await h.driver.chat('是垫付');assert.equal(h.driver.dump().agentContext.draft.dueDate,'');await h.driver.chat('七天后');await h.driver.chat('本人期望');h.driver.render();assert.match(h.mount.innerHTML,/本人期望/);assert.equal(h.state.cases.length,0);await h.driver.commitPending();assert.equal(summary(h.state).cashCents,cash);assert.equal(h.state.cases[0].dueType,'desired');const rec=recommend(h.state);assert.equal(rec.action,'agent-advance-due');assert.equal(rec.days,7);
 await h.driver.sendChatInput('');h.driver.render();assert.match(h.mount.innerHTML,/确认推进模拟时间/);assert.equal(h.state.simulatedDate,null);assert.equal(h.dialogs.length,0);await h.driver.commitPending();assert.equal(recommend(h.state).action,'due-status');assert.equal(summary(h.state).cashCents,cash);
 await h.driver.sendChatInput('');h.driver.render();assert.match(h.mount.innerHTML,/是否已经归还/);assert.equal(h.dialogs.length,0);
});
test('模型能识别没有固定关键词的目标，并依证据补槽；未确认不改账户',async()=>withModel(async()=>{
 const s=initial(),before=JSON.stringify(s);globalThis.fetch=async()=>modelReply({intent:'goal',goal_target:{value:5000,quote:'五千元'},goal_months:{value:8,quote:'八个月'}});
 const r=await plan(s,'打算八个月后换台五千元的电脑',{});assert.equal(r.mode,'ai');assert.equal(r.proposal.type,'goal');assert.equal(r.proposal.args.target,'5000');assert.equal(r.proposal.args.months,8);assert.equal(JSON.stringify(s),before);
 globalThis.fetch=async()=>modelReply({intent:'goal',goal_target:{value:99999,quote:'五千元'},goal_months:{value:8,quote:'五千元'}});const bad=await plan(s,'打算换台五千元的电脑',{});assert.equal(bad.proposal,null);
}));
test('模型参与已有转账用途理解；证据不匹配、否定和不确定都不新建付款',async()=>withModel(async()=>{
 const s=reportReady(),context={intent:'transfer_purpose',transactionId:'sample-loan'},q='这顿饭是我先帮他付的';let body;
 globalThis.fetch=async(_,args)=>{body=JSON.parse(args.body);return modelReply({intent:'transfer_purpose',purpose:'advance',purpose_quote:'我先帮他付的'});};const r=await plan(s,q,context);assert.equal(r.mode,'ai');assert.equal(r.proposal,null);assert.equal(r.context.intent,'people_link');assert.equal(r.context.draft.dueDate,'');assert.equal(Number(r.context.draft.amount),100);const input=JSON.parse(body.messages[1].content);assert.equal(input.workflow.checkingExistingTransfer,true);assert.equal(input.transactions,undefined);
 const no=await plan(s,'不是垫付，先别记',context);assert.equal(no.proposal,null);
 globalThis.fetch=async()=>modelReply({intent:'transfer_purpose',purpose:'advance',purpose_quote:'不存在的原话'});assert.equal((await plan(s,'还得核实一下',context)).proposal,null);
}));
test('推荐下一步也实际调用模型；失败降级不假装成功，取消仍即时生效',async()=>withModel(async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;return modelReply({intent:'next_step'});};const r=await plan(reportReady(),'下一步',{});assert.equal(calls,1);assert.equal(r.mode,'ai');assert.equal(r.task.action,'agent-bill-actions');
 const cancelled=await plan(initial(),'取消',{intent:'goal_details',target:'1000'});assert.equal(cancelled.proposal,null);assert.equal(calls,1);
 globalThis.fetch=async()=>{throw Error('network');};const fail=await plan(reportReady(),'下一步',{});assert.equal(fail.mode,'rules-fallback');assert.equal(fail.task.action,'agent-bill-actions');assert.match(fail.modelStatus,/规则模式|改用规则/);
}));
test('模型识别陌生姓名的明确模拟付款，仍只生成待核对草案；假设和引用不授权',async()=>withModel(async()=>{
 const s=ready(),before=JSON.stringify(s);globalThis.fetch=async()=>modelReply({intent:'transfer',recipient:'小李',amount:'88',kind:'垫付'});const r=await plan(s,'替小李付一下，垫付88元',{});assert.equal(r.proposal,null);assert.equal(r.context.stage,'date');assert.equal(r.context.draft.name,'小李');assert.equal(r.context.draft.amount,'88');assert.equal(JSON.stringify(s),before);
 const no=await plan(s,'如果替小李垫付88元会怎样',{});assert.equal(no.proposal,null);
 const quoted=await plan(s,'这句话是什么意思？',{}, {text:'给小李垫付88元',author:'钱程'});assert.equal(quoted.proposal,null);
}));

test('已有存款只在个人信息收集与确认出现；两种虚构设定分别2000与12000',async()=>{
 for(const [persona,opening] of [['student',2000],['worker',12000]]){
  const h=controller();await h.driver.chat('我要12个月攒6000元');h.driver.render();assert.doesNotMatch(h.mount.innerHTML,/已有存款／期初现金/);assert.equal(h.state.openingKnown,false);
  await h.driver.commitInlineGoal();await h.driver.act('persona',{dataset:{persona}});h.driver.render();assert.match(h.mount.innerHTML,/已有存款／期初现金/);assert.equal(h.driver.dump().coachInterview.draft.opening,opening);assert.match(h.mount.innerHTML,new RegExp('¥'+opening.toLocaleString('zh-CN')));assert.equal(h.state.openingKnown,false);
 }
 const s={...ready(),demo:false},interview={draft:{...s.coach,opening:99999},analysis:[],proof:{}};assert.doesNotMatch(profileReview(s,interview),/99,999/);assert.match(profileReview(s,interview),/已有存款／期初现金/);
});
test('继续承接缺期限、条件补充与方案核对；不跳场景也不代替确认',async()=>{
 const h=controller();await h.driver.chat('我想攒5000元');const before=JSON.stringify(h.state);await h.driver.chat('继续');assert.match(h.driver.dump().messages.at(-1).text,/多久攒到|还缺期限/);assert.equal(h.driver.dump().agentContext.target,'5000');assert.equal(JSON.stringify(h.state),before);
 await h.driver.chat('8个月');await h.driver.chat('继续');assert.equal(h.state.goal,null);assert.match(h.driver.dump().messages.at(-1).text,/不会代替确认|请在当前页面核对后确认/);assert.equal(h.driver.dump().goalScreen,'goal-review');await h.driver.commitInlineGoal();
 await h.driver.chat('武汉在校大学生，住学校宿舍，单身');const draft=h.driver.dump().coachInterview.draft;await h.driver.chat('继续');assert.equal(h.driver.dump().coachInterview.draft.place,draft.place);assert.match(h.driver.dump().messages.at(-1).text,/月收入|生活费/);assert.equal(h.state.coach,null);
 await h.driver.chat('生活费2000元，房租0元，已有存款2000元');await h.driver.chat('继续');assert.equal(h.state.coach,null);assert.match(h.driver.dump().messages.at(-1).text,/在页面核对|核对刚才的个人信息和已有存款/);
 await h.driver.act('confirm-coach-profile');await h.driver.act('preview-route',{dataset:{index:'1'}});const cash=summary(h.state).cashCents;await h.driver.chat('继续');assert.equal(h.state.coachRoute??null,null);assert.equal(summary(h.state).cashCents,cash);assert.match(h.driver.dump().messages.at(-1).text,/预览的方案|刚才的方案还在预览中/);
});
test('自由问答的继续携带近期问题，模型不借旧消息授权付款；记录有上限',async()=>withModel(async()=>{
 const history=[{role:'user',text:'为什么周预算不能与日额度相加？'},{role:'assistant',text:'它们是同一笔月生活费的不同看法。'}];let input;
 globalThis.fetch=async(_,args)=>{input=JSON.parse(JSON.parse(args.body).messages[1].content);return modelReply({intent:'transfer',recipient:'小王',amount:100,answer:'接着刚才的预算解释，周与日不能各算一份。'});};
 const r=await plan(ready(),'继续',{},null,history,{});assert.equal(r.mode,'ai');assert.equal(r.proposal,null);assert.equal(r.task,undefined);assert.equal(r.reply,'接着刚才的预算解释，周与日不能各算一份。');assert.deepEqual(input.recent_dialogue,history);
 const bounded=recentDialogue(Array.from({length:30},()=>({role:'user',text:'长'.repeat(2000)})));assert.equal(bounded.length,8);assert.equal(bounded[0].text.length,600);
}));

test('真实HTTP：近期对话按会话隔离且刷新可恢复，账单决策与本周反馈可持久保存',async()=>{
 const dir=mkdtempSync(resolve(tmpdir(),'qiancheng-v23-')),seen=[];
 const upstream=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;const input=JSON.parse(JSON.parse(body).messages[1].content);seen.push(input);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({intent:'other',answer:input.message==='继续'?'接着刚才的预算解释，周与日不能各算一份。':'周与日来自同一笔月生活预算。'})}}]}));});
 await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
 const child=spawn(process.execPath,['server.mjs','--port','0'],{cwd:resolve(import.meta.dirname,'..'),env:{...process.env,DATA_DIR:dir,BIGMODEL_API_KEY:'test-only',BIGMODEL_MODEL:'test-model',AI_BASE_URL:'http://127.0.0.1:'+upstream.address().port,COOKIE_SECURE:'0',PUBLIC_ORIGIN:''}});
 try{
  const base=await new Promise((res,rej)=>{let logs='';const timer=setTimeout(()=>rej(Error('startup timeout')),5000);child.stdout.on('data',b=>{logs+=b;const m=logs.match(/localhost:(\d+)/);if(m){clearTimeout(timer);res('http://127.0.0.1:'+m[1]);}});child.once('error',rej);});
  async function session(){const g=await fetch(base+'/api/guest',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),cookie=g.headers.get('set-cookie').split(';')[0],state=await(await fetch(base+'/api/state',{headers:{cookie}})).json();return {cookie,csrf:state.csrf};}
  async function api(u,path,args){const r=await fetch(base+'/api/'+path,{method:args===undefined?'GET':'POST',headers:{cookie:u.cookie,'Content-Type':'application/json','X-CSRF-Token':u.csrf},body:args===undefined?undefined:JSON.stringify(args)}),v=await r.json();assert.equal(r.status,200,JSON.stringify(v));return v;}
  async function commit(u,type,args={}){const p=await api(u,'prepare',{type,args});return api(u,'commit',{id:p.id,confirm:true});}
  const a=await session(),b=await session();await api(a,'chat',{message:'为什么周预算不能和日预算相加？',context:{}});await api(a,'chat',{message:'继续',context:{}});assert.equal(seen.at(-1).recent_dialogue[0].text,'为什么周预算不能和日预算相加？');assert.equal((await api(a,'state')).conversation.length,4);
  await api(b,'chat',{message:'解释一下计划',context:{}});assert.equal(seen.at(-1).recent_dialogue.length,0);assert.equal((await api(b,'state')).conversation.length,2);assert.equal((await api(a,'state')).conversation.length,4);
  await commit(a,'goal',{target:5000,months:12});assert.equal((await api(a,'state')).conversationContext.completed,'goal');await commit(a,'guided_demo');await commit(a,'coach',{place:'武汉',city:2,home:3,job:6,studentWork:'none',commute:0,rel:0,risk:0,time:0,kidCount:0,incomeNum:2000,rent:0,leisure:400,opening:2000});await commit(a,'coach_route',{index:1});await commit(a,'sample_bill');
  await api(a,'bill-analysis',{period:month()});assert.equal((await api(a,'state')).recommendation.action,'agent-bill-actions');await commit(a,'bill_review',{period:month()});let current=await api(a,'state');assert.equal(current.recommendation.action,'agent-transfer');const cash=current.summary.cashCents,budget=executionPlan(current).weeklyCents;
  const rows=sampleWeekRows(day(),day(),{budgetCents:budget,variant:'mild'}),report=summarizeWeek(rows);await commit(a,'weekly_checkin',{source:'sample',sampleVariant:'mild',weekStart:day(),amount:report.totalCents/100});current=await api(a,'state');assert.equal(current.state.checkins[0].status,'near');assert.equal(current.state.checkins[0].amountAdjusted,false);assert.equal(current.summary.cashCents,cash);
  await api(a,'bill-analysis',{period:month()});assert.equal((await api(a,'state')).recommendation.action,'agent-bill-actions');await api(a,'logout',{});assert.equal((await api(b,'state')).conversation.length,2);
 }finally{if(child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}await new Promise(r=>upstream.close(r));rmSync(dir,{recursive:true,force:true});}
});
