import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {initial,apply,summary,day,month} from '../lib/domain.mjs';
import {plan,modelRequestOptions} from '../lib/agent.mjs';
import {summarizeWeek,sampleWeekRows,weekWindow,savedBillPeriod,pendingAdvanceTask,advancePreview} from '../public/engines/weekly.mjs';
import {weeklyCheckinDialog,goalExecution} from '../public/plan-ui.mjs';
import {setRules} from '../public/engines/classifier.mjs';
const change=(s,type,args={})=>apply(structuredClone(s),type,args).state;
const view=s=>({state:s,summary:summary(s),user:{id:'test',name:'guest-test'}});
function ready(){let s=change(initial(),'goal',{target:'6000',months:12});s=change(s,'coach',{place:'武汉',city:2,home:3,job:6,commute:0,rel:0,risk:0,time:0,kidCount:0,incomeNum:'2000',rent:'0',leisure:'400',extraAmt:'0',opening:'2000'});return change(s,'coach_route',{index:1});}
const date='2026-10-30',week='2026-10-26';
const row=(patch={})=>({date,time:'12:00:00',merchant:'校园食堂',desc:'午餐',amount:'18.50',direction:'out',externalId:'TEST-01',...patch});

test('每周账单合计排除范围外、未来、重复、收入、还款和固定责任',()=>{
 const rows=[row(),row(),row({date:'2026-10-25',externalId:'OLD'}),row({date:'2026-10-31',externalId:'FUTURE'}),row({direction:'in',amount:'2000',externalId:'INCOME'}),row({merchant:'小王',desc:'垫付',amount:'100',rawType:'转账',externalId:'ADVANCE'}),row({merchant:'房东',desc:'房租',amount:'500',externalId:'RENT'}),row({merchant:'小王',desc:'还款',amount:'20',externalId:'REPAY'})];
 const r=summarizeWeek(rows,week,{now:date});assert.equal(r.totalCents,1850);assert.equal(r.duplicateCount,1);assert.equal(r.outsideCount,2);assert.equal(r.pendingCents,12000);assert.equal(r.fixedCents,50000);assert.equal(r.otherCents,200000);
 assert.throws(()=>summarizeWeek([row({date:'2026-02-30'})],week,{now:date}),/日期/);assert.throws(()=>summarizeWeek([], '2026-11-02',{now:date}),/未来/);
});
test('周一、周五与周日均可用虚构本周账单，不制造未来流水',()=>{
 for(const now of ['2026-10-26','2026-10-30','2026-11-01']){const rows=sampleWeekRows(week,now),r=summarizeWeek(rows,week,{now});assert.equal(r.totalCents,22800);assert.equal(r.pendingCents,10000);assert.ok(rows.every(t=>t.date<=now));}
 assert.equal(weekWindow('2026-11-01').start,week);
});
test('周账单文件只更新打卡，自动合计可修改，不增减现金或重复写流水',()=>{
 let s=ready();const rows=sampleWeekRows().filter(t=>t.externalId.endsWith('-0')||t.externalId.endsWith('-1'));
 const report=summarizeWeek(rows),cash=summary(s).cashCents;
 s=change(s,'weekly_checkin',{source:'file',rows,weekStart:day(),amount:String(report.totalCents/100),completedActionIds:[]});assert.equal(s.transactions.length,0);assert.equal(summary(s).cashCents,cash);assert.equal(s.checkins[0].report.totalCents,17800);assert.equal(s.checkins[0].source,'file');assert.equal(s.checkins[0].amountAdjusted,false);assert.equal(s.checkins[0].report.items,undefined);
 s=change(s,'weekly_checkin',{source:'file',rows,weekStart:day(),amount:'180',completedActionIds:[]});assert.equal(s.checkins.length,1);assert.equal(s.checkins[0].spentCents,18000);assert.equal(s.checkins[0].amountAdjusted,true);assert.equal(summary(s).cashCents,cash);
});
test('汇总已导入流水识别AA本人份额，虚构复盘不会保存为真实完成记录',()=>{
 const stored=[{...row(),cents:1850,kind:'expense',cat:'food'}, {...row({externalId:'AA-SELF',direction:'neutral'}),cents:2000,kind:'expense',cat:'social',parentId:'AA-ORIGINAL'}, {...row({externalId:'LOAN'}),cents:10000,kind:'loan_out',cat:'person'}];
 const r=summarizeWeek(stored,week,{ledger:true,now:date});assert.equal(r.totalCents,3850);assert.equal(r.pendingCents,10000);
 let s=ready();assert.throws(()=>change(s,'weekly_checkin',{source:'sample',amount:'228'}),/不能保存/);s.demo=true;s=change(s,'weekly_checkin',{source:'sample',amount:'228'});assert.equal(s.checkins[0].simulated,true);assert.equal(s.transactions.length,0);
 assert.throws(()=>change(s,'weekly_checkin',{source:'file',rows:[row({date:day()})],amount:'18.50'}),/虚构体验/);
});
test('用户间周账单分类规则互不串用',()=>{
 const otherRules=[{merchant:'校园食堂',goods:'午餐',scope:'goods',cat:'person'}];setRules(otherRules);
 const clean=summarizeWeek([row()],week,{now:date,rules:[]});assert.equal(clean.totalCents,1850);
});
test('精简打卡仅一个必填合计，月份分周重复框已删除',()=>{
 const data=view(ready()),html=weeklyCheckinDialog(data);
 assert.match(html,/导入本周账单/);assert.match(html,/用虚构账单体验/);assert.match(html,/name="amount"[^>]*required/);assert.doesNotMatch(html,/name="note"[^>]*required/);
 const execution=goalExecution(data);assert.doesNotMatch(execution,/月预算怎样变成每周行动/);assert.match(execution,/每月.*先这样安排/);assert.match(execution,/每周日常支出额度/);
});
test('结果恢复选定月份；加入节流后找到100元待核对垫付而不先创建借款',()=>{
 const s=ready();s.billReports={'2026-09':{analyzedAt:'2026-09-30'},'2026-10':{analyzedAt:'2026-10-30'}};s.lastBillPeriod='2026-09';assert.equal(savedBillPeriod(s,'2026-10'),'2026-10');assert.equal(savedBillPeriod(s,'2026-11'),'2026-09');
 s.demo=true;const sample=change(s,'sample_bill'),before=summary(sample).cashCents,task=pendingAdvanceTask(sample);assert.equal(task.transactionId,'sample-loan');assert.equal(sample.cases.length,0);
 const linked=change(sample,'link_loan',{id:'sample-loan',name:'小王',kind:'垫付',dueDate:day(),dueType:'desired'});assert.equal(summary(linked).cashCents,before);assert.equal(pendingAdvanceTask(linked),null);
});
test('启动停留开始、示例不再折叠、时间推进不能自动提交',()=>{
 const app=readFileSync(new URL('../public/app.mjs',import.meta.url),'utf8');
 assert.match(app,/api\('state'\)\.then\(d=>\{data=d;restoreConversation\(d\);page='home';render\(\);\}\)/);assert.doesNotMatch(app,/<details class="chat-examples"/);assert.match(app,/<section class="chat-examples"><h4>试着说一句/);
 const list=app.match(/const simple=new Set\(\[([^\]]+)\]/)[1];assert.doesNotMatch(list,/advance_time/);assert.match(app,/确认推进至/);assert.match(readFileSync(new URL('../public/coach-flow-ui.mjs',import.meta.url),'utf8'),/计算三种储蓄方案/);
});
test('推进日期跨月预览，旧预览或取消不推进',()=>{
 const s={...ready(),demo:true,simulatedDate:'2026-10-30'},p=advancePreview(s,3);assert.equal(p.toDate,'2026-11-02');assert.equal(s.simulatedDate,'2026-10-30');
 const next=change(s,'advance_time',p);assert.equal(next.simulatedDate,'2026-11-02');assert.throws(()=>change(next,'advance_time',p),/已变化/);
 assert.throws(()=>advancePreview(s,0),/整数/);assert.throws(()=>advancePreview(ready(),3),/虚构/);
});
test('已配置模型时推荐与查询也调用模型，GLM5.3选项与真实耗时不变',async()=>{
 const key=process.env.BIGMODEL_API_KEY,model=process.env.BIGMODEL_MODEL,fetcher=globalThis.fetch;
 try{
  process.env.BIGMODEL_API_KEY='test-only';process.env.BIGMODEL_MODEL='glm-5.3';let calls=0,lastBody;
  globalThis.fetch=async(_,options)=>{calls++;lastBody=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({intent:'goal',answer:'我先帮你确认目标。'})}}]})};};
  assert.equal((await plan(ready(),'下一步',{})).mode,'ai');assert.equal((await plan(ready(),'查询余额',{})).mode,'ai');assert.equal(calls,2);
  const response=await plan(initial(),'我想攒1000元',{});assert.equal(response.mode,'ai');assert.equal(calls,3);assert.ok(response.elapsedMs>=0);assert.equal(lastBody.model,'glm-5.3');assert.equal(lastBody.thinking.type,'enabled');assert.equal(lastBody.reasoning_effort,'low');
  assert.equal(modelRequestOptions('glm-5.2').thinking.type,'disabled');assert.equal(modelRequestOptions('glm-4.7').thinking.type,'disabled');assert.equal(modelRequestOptions('glm-5.3-flash').thinking.type,'enabled');
  globalThis.fetch=async()=>{throw Object.assign(Error('timeout'),{name:'TimeoutError'});};const fallback=await plan(initial(),'我想攒1000元',{});assert.equal(fallback.mode,'rules-fallback');assert.match(fallback.modelStatus,/18秒/);
 }finally{globalThis.fetch=fetcher;if(key===undefined)delete process.env.BIGMODEL_API_KEY;else process.env.BIGMODEL_API_KEY=key;if(model===undefined)delete process.env.BIGMODEL_MODEL;else process.env.BIGMODEL_MODEL=model;}
});

test('实际HTTP：周账单打卡、报告持久保存、时间确认取消及幂等',async()=>{
 const dir=mkdtempSync(resolve(tmpdir(),'qiancheng-v17-')),child=spawn(process.execPath,['server.mjs','--port','0'],{cwd:resolve(import.meta.dirname,'..'),env:{...process.env,DATA_DIR:dir,BIGMODEL_API_KEY:'',BIGMODEL_MODEL:'',COOKIE_SECURE:'0'}});
 try{
  const base=await new Promise((res,rej)=>{let logs='';child.stdout.on('data',b=>{logs+=b;const m=logs.match(/localhost:(\d+)/);if(m)res('http://127.0.0.1:'+m[1]);});child.on('error',rej);child.on('exit',c=>rej(Error('server exit '+c)));});
  const guest=await fetch(base+'/api/guest',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),cookie=guest.headers.get('set-cookie').split(';')[0];
  let state=await (await fetch(base+'/api/state',{headers:{cookie}})).json();
  async function api(path,args){const r=await fetch(base+'/api/'+path,{method:args===undefined?'GET':'POST',headers:{cookie,'Content-Type':'application/json','X-CSRF-Token':state.csrf},body:args===undefined?undefined:JSON.stringify(args)});return {status:r.status,...await r.json()};}
  async function commit(type,args){const p=await api('prepare',{type,args});assert.equal(p.status,200,JSON.stringify(p));const c=await api('commit',{id:p.id,confirm:true});assert.equal(c.status,200,JSON.stringify(c));return c;}
  await commit('goal',{target:'6000',months:12});await commit('coach',{place:'武汉',city:2,home:3,job:6,commute:0,rel:0,kidCount:0,risk:0,time:0,incomeNum:'2000',rent:'0',leisure:'400',extraAmt:'0',opening:'2000'});await commit('coach_route',{index:1});
  const rows=[row({date:day()})];await commit('weekly_checkin',{source:'file',rows,amount:'18.50',weekStart:day()});let saved=await api('state');assert.equal(saved.state.transactions.length,0);assert.equal(saved.summary.cashCents,200000);assert.equal(saved.state.checkins[0].report.totalCents,1850);
  await commit('import',{source:'wechat',rows});await api('bill-analysis',{period:month()});saved=await api('state');const report=JSON.stringify(saved.state.billReports[month()]);assert.equal(saved.state.lastBillPeriod,month());
  await commit('contact',{name:'同学'});assert.equal(JSON.stringify((await api('state')).state.billReports[month()]),report);await api('chat',{message:'查询余额'});assert.equal(JSON.stringify((await api('state')).state.billReports[month()]),report);
  // A second independent guest is used for virtual time, without mixing real statements.
  const g=await fetch(base+'/api/guest',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),dcookie=g.headers.get('set-cookie').split(';')[0];let demo=await (await fetch(base+'/api/state',{headers:{cookie:dcookie}})).json();
  async function da(path,args){const r=await fetch(base+'/api/'+path,{method:args===undefined?'GET':'POST',headers:{cookie:dcookie,'Content-Type':'application/json','X-CSRF-Token':demo.csrf},body:args===undefined?undefined:JSON.stringify(args)});return {status:r.status,...await r.json()};}
  let p=await da('prepare',{type:'guided_demo',args:{}});await da('commit',{id:p.id,confirm:true});
  p=await da('prepare',{type:'advance_time',args:{days:7}});assert.equal(p.result.toDate,advancePreview({demo:true},7).toDate);assert.equal((await da('state')).state.simulatedDate,null);
  await da('cancel',{id:p.id});assert.equal((await da('commit',{id:p.id,confirm:true})).status,400);assert.equal((await da('state')).state.simulatedDate,null);
  p=await da('prepare',{type:'advance_time',args:{days:7}});assert.equal((await da('commit',{id:p.id,confirm:false})).status,400);await da('commit',{id:p.id,confirm:true});assert.equal((await da('state')).state.simulatedDate,p.result.toDate);assert.equal((await da('commit',{id:p.id,confirm:true})).replayed,true);assert.equal((await da('state')).state.simulatedDate,p.result.toDate);
 }finally{child.kill();await new Promise(res=>child.once('exit',res));rmSync(dir,{recursive:true,force:true});}
});
