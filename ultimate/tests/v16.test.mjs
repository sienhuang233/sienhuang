import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {initial,apply,summary,day,month,demoState} from '../lib/domain.mjs';
import {recommend} from '../lib/tasks.mjs';
import {deterministicPlan,plan} from '../lib/agent.mjs';
import {calculate,derive} from '../public/engines/goal.mjs';
import {coachScenario,routeBasis,selectedRouteScenario} from '../public/engines/coach-scenario.mjs';
import {executionPlan} from '../public/engines/plan.mjs';
import {billPlanPreview,analyzeBills} from '../public/engines/bill-analysis.mjs';
import {normalize,csvRows} from '../public/engines/import.mjs';
import {featureIntro} from '../public/intro-ui.mjs';
import {billSourceDialog} from '../public/plan-ui.mjs';
import {serverVersion} from './helpers/version.mjs';

const student={place:'武汉',city:2,home:3,job:6,commute:0,rel:0,risk:0,time:0,kidCount:0,kidStage:0,school:0,incomeNum:'2000',rent:'0',leisure:'400',extraAmt:'0',opening:'2000'};
const change=(s,type,args={})=>apply(structuredClone(s),type,args).state;
const view=s=>({state:s,summary:summary(s),user:{name:'guest-test'}});
function ready(){let s=initial();s=change(s,'goal',{target:'6000',months:12});s=change(s,'coach',student);return change(s,'coach_route',{index:1});}
const row=(extra={})=>({date:day(),time:'12:00:00',merchant:'食堂',desc:'午餐',amount:'18.50',direction:'out',externalId:'TEST-001',...extra});

test('介绍只保留三个功能与直接体验入口；免注册文件按钮可用',()=>{
 const html=featureIntro();assert.equal((html.match(/class="intro-item"/g)||[]).length,3);
 for(const page of ['goal','bills','debts'])assert.match(html,new RegExp('data-page="'+page+'"'));assert.match(html,/data-act="to-home"/);
 const source=billSourceDialog(view(initial()),month());assert.match(source,/data-act="import"/);assert.doesNotMatch(source,/data-act="import" disabled/);assert.doesNotMatch(source,/请注册/);
});
test('只说金额时追问期限；修改与取消不改账户',()=>{
 const s=initial(),r=deterministicPlan(s,'我要攒1000元');assert.equal(r.context.target,'1000');assert.equal(r.next,'goal_followup');
 const amended=deterministicPlan(s,'改成2000元',r.context);assert.equal(amended.context.target,'2000');
 const done=deterministicPlan(s,'6个月',amended.context);assert.equal(done.proposal.args.target,'2000');assert.equal(done.proposal.args.months,6);
 assert.equal(deterministicPlan(s,'取消',amended.context).proposal,null);assert.equal(s.goal,null);
});
test('空会话选虚构账单使用学生2000元起点，无模拟理财持有',()=>{
 const s=change(initial(),'sample_bill');assert.equal(s.openingCents,200000);assert.equal(s.coach.incomeNum,2000);assert.equal(s.coach.job,6);assert.equal(s.reservations.length,0);
 assert.equal(s.transactions.filter(t=>t.direction==='in').reduce((n,t)=>n+t.cents,0),200000);
 assert.equal(summary(s).cashCents,400000-s.transactions.filter(t=>t.direction==='out').reduce((n,t)=>n+t.cents,0));
 assert.throws(()=>change(s,'sample_bill'),/不会重复/);assert.equal(demoState().openingCents,200000);
});
test('虚构样本保留用户已确认起点；真实与虚构资料双向禁止混入',()=>{
 let s=change(initial(),'guided_demo');s=change(s,'goal',{target:'1000',months:6});s=change(s,'coach',{...student,opening:'1234'});s=change(s,'sample_bill');assert.equal(s.openingCents,123400);
 assert.throws(()=>change(s,'import',{rows:[row()]}),/不能混用/);
 const real=change(initial(),'import',{rows:[row()],source:'wechat'});assert.throws(()=>change(real,'sample_bill'),/不能混入/);
 assert.throws(()=>change(change(initial(),'guided_demo'),'import',{rows:[row()]}),/不能混用/);
});
test('总支出覆盖房租家庭责任，只用余下部分参与弹性波动',()=>{
 const profile={...student,home:0,job:0,rel:0,rent:800,extraAmt:200,incomeNum:5000,kids:[],extra:[{amt:200}],expenseOverride:2000};
 const d=derive(profile);assert.equal(d.rigid,1000);assert.equal(d.flex,1000);assert.equal(d.mid,2000);assert.equal(d.rent+d.family+d.daily,2000);assert.equal(d.lo,1850);
 const over=calculate({...profile,saved:0,goal:10000,months:6,expenseReduction:9999});assert.ok(over.plans.every(x=>x.save<=4000));
 let s=change(ready(),'coach',{...student,home:0,job:0,rent:'800',extraAmt:'200',incomeNum:'5000'});
 s=change(s,'calibrate',{expense:'2000'});s=change(s,'coach_route',{index:1});const p=executionPlan(view(s));assert.equal(p.rigidCents,100000);assert.equal(p.livingCents,200000);
 assert.equal(p.livingCents+p.monthlySaveCents+p.emergencyFillCents+p.longTermReserveCents+p.remainingBufferCents,p.incomeCents);
 assert.equal(p.weeklyCents,Math.floor(p.monthlyFlexibleCents/(52/12)));assert.equal(p.dailyCents,Math.floor(p.monthlyFlexibleCents/30.4));
 assert.throws(()=>change(s,'calibrate',{expense:'999'}),/不能低于/);assert.throws(()=>change(s,'profile',{income:'5000',expense:'999',emergency:'0'}),/不能低于/);
});
test('不同档位默认房租的直接计算不读取另一个人的全局参数',()=>{
 calculate({...student,city:0,home:1,incomeNum:20000,rent:9999,goal:1000,saved:2000,months:1});
 const d=derive({...student,city:3,home:0,rent:null,kids:[],extra:[]});assert.equal(d.rent,1000);
});
test('完整体验后仍先核对新还款，随后提示更新路线，且不重复推荐账单',()=>{
 let s=ready();s=change(s,'import',{source:'wechat',rows:[row({merchant:'小王',amount:'100',desc:'聚餐垫付',externalId:'OUT-1'})]});s=change(s,'link_loan',{id:s.transactions[0].id,name:'小王',kind:'垫付'});s.billAnalysisCompleted=true;s.billReports={...s.billReports,[month()]:{period:month()}};s.billDecisions={...s.billDecisions,[month()]:{}};s.lastBillPeriod=month();
 s=change(s,'import',{source:'wechat',rows:[row({merchant:'小王',amount:'60',direction:'in',externalId:'REPAY-1'})]});
 assert.equal(recommend(s).action,'agent-repayment');const cash=summary(s).cashCents;
 s=change(s,'repay',{id:s.cases[0].id,amount:'60',transactionId:s.transactions.at(-1).id});assert.equal(summary(s).cashCents,cash);assert.equal(s.cases[0].paid,60);
 assert.equal(recommend(s).id,'recalculate');s=change(s,'coach_route',{index:1});assert.equal(recommend(s).passive,true);assert.notEqual(recommend(s).action,'agent-bill-analysis');
});
test('待收款不加入现金；同笔还款不能再次关联',()=>{
 let s=ready();s=change(s,'import',{source:'wechat',rows:[row({merchant:'小王',amount:'100',desc:'聚餐垫付',externalId:'OUT-1'})]});s=change(s,'link_loan',{id:s.transactions[0].id,name:'小王',kind:'垫付'});
 assert.equal(summary(s).cashCents,190000);assert.equal(summary(s).receivableCents,10000);
 s=change(s,'import',{source:'wechat',rows:[row({merchant:'小王',amount:'40',direction:'in'})]});const tid=s.transactions.at(-1).id;
 s=change(s,'repay',{id:s.cases[0].id,amount:'40',transactionId:tid});assert.equal(summary(s).cashCents,194000);assert.equal(summary(s).receivableCents,6000);
 assert.throws(()=>change(s,'repay',{id:s.cases[0].id,amount:'40',transactionId:tid}),/已关联/);
});
test('到期先核对、保存提醒不发消息；互欠抵消不改变现金',()=>{
 let s=ready();s.demo=true;s=change(s,'contact',{name:'小王'});const contactId=s.contacts[0].id;
 s=change(s,'transfer',{contactId,amount:'100',kind:'垫付',dueDate:day(),dueType:'desired'});assert.equal(recommend(s).action,'due-status');
 s=change(s,'due_check',{id:s.cases[0].id,status:'unpaid'});const cash=summary(s).cashCents;
 s=change(s,'remind',{id:s.cases[0].id,style:'gentle',message:'请方便时核对一下'});assert.equal(summary(s).cashCents,cash);assert.equal(s.mails[0].simulated,true);
 s=change(s,'transfer',{contactId,amount:'30',kind:'借入'});const before=summary(s);s=change(s,'offset',{name:'小王',amount:'30'});assert.equal(summary(s).cashCents,before.cashCents);assert.equal(summary(s).payableCents,0);assert.equal(summary(s).receivableCents,7000);
 s=change(s,'advance_time',{days:17});assert.equal(Math.round((Date.parse(s.simulatedDate)-Date.parse(day()))/86400000),17);
});
test('采纳节流与每周打卡只改未来预算，不增加现金',()=>{
 let s=ready();s.demo=true;s=change(s,'sample_bill');const report=analyzeBills(s,month()),op=report.opportunities[0];assert.ok(op);
 const cash=summary(s).cashCents,preview=billPlanPreview(view(s),month(),op.id,op.suggestedCents);
 assert.ok(preview.afterProb>=preview.beforeProb);s=change(s,'bill_plan',{period:month(),opportunity:op.id,reduction:String(op.suggestedCents/100),monthlyConfirmed:true});assert.equal(summary(s).cashCents,cash);
 const action=s.planActions[0];s=change(s,'weekly_checkin',{amount:'120',completedActionIds:[action.id]});assert.equal(summary(s).cashCents,cash);assert.equal(s.checkins.length,1);
 s=change(s,'weekly_checkin',{amount:'130',completedActionIds:[]});assert.equal(s.checkins.length,1);assert.equal(summary(s).cashCents,cash);
 assert.throws(()=>change(s,'bill_plan',{period:month(),opportunity:op.id,reduction:'1',monthlyConfirmed:true}),/重复叠加/);
});
test('三路线、延长期限和缓存后的参数一致性',()=>{
 const p={...student,incomeNum:2000,kids:[],extra:[],saved:2000,goal:5000,months:12};const a=calculate(p),b=calculate({...p,months:18});
 assert.ok(a.plans[0].save>a.plans[1].save&&a.plans[1].save>a.plans[2].save);
 for(let i=0;i<3;i++)assert.ok(b.plans[i].prob>=a.plans[i].prob);
 assert.deepEqual(calculate(p),a);let s=ready();const first=selectedRouteScenario(view(s));calculate({...p,incomeNum:8000,months:36});assert.equal(selectedRouteScenario(view(s)).route.prob,first.route.prob);
 s=change(s,'coach_adjust',{kind:'months',index:1,basis:routeBasis(s,summary(s).availableCents)});assert.equal(s.goal.months,18);assert.equal(s.coach.incomeNum,2000);
});
test('长期安排与目标独立，预算不足或缺少条件不制造投资金额',()=>{
 let s=ready();s=change(s,'coach_route',{index:2});let p=executionPlan(view(s));assert.equal(p.extraGrowthCents,0);assert.ok(p.investmentReasons.length);
 s=change(s,'long_term_plan',{monthly:'10',horizonMonths:60,acknowledged:true});assert.equal(summary(s).cashCents,200000);
 assert.throws(()=>change(s,'long_term_plan',{monthly:'9999',horizonMonths:60}),/不能超过/);
});
test('无模型凭据明确规则处理；接口失败明确降级',async()=>{
 const key=process.env.BIGMODEL_API_KEY,model=process.env.BIGMODEL_MODEL,fetcher=globalThis.fetch;
 try{delete process.env.BIGMODEL_API_KEY;delete process.env.BIGMODEL_MODEL;assert.equal((await plan(initial(),'我要攒1000元',{})).mode,'rules');
 process.env.BIGMODEL_API_KEY='test-only';process.env.BIGMODEL_MODEL='test-model';globalThis.fetch=async()=>({ok:false,status:401,json:async()=>({})});
 const r=await plan(initial(),'我要攒1000元',{});assert.equal(r.mode,'rules-fallback');assert.match(r.modelStatus,/401/);
 }finally{globalThis.fetch=fetcher;if(key===undefined)delete process.env.BIGMODEL_API_KEY;else process.env.BIGMODEL_API_KEY=key;if(model===undefined)delete process.env.BIGMODEL_MODEL;else process.env.BIGMODEL_MODEL=model;}
});
test('CSV解析：真实导入列、失败交易和格式错误',()=>{
 const csv='交易时间,交易对方,商品,金额(元),收/支,当前状态,交易单号\n'+day()+' 12:00:00,食堂,午餐,18.50,支出,支付成功,TX1\n'+day()+' 13:00:00,店铺,订单,20,支出,交易关闭,TX2';
 const parsed=normalize(csvRows(csv));assert.equal(parsed.rows.length,1);assert.equal(parsed.skipped,1);assert.equal(parsed.rows[0].amount,'18.50');
 assert.throws(()=>normalize(csvRows('交易时间,金额\n2026-10-01,12')),/收\/支/);
});

test('实际HTTP服务：免注册导入、预览取消、幂等、隔离、冲突与CSRF',async()=>{
 const dir=mkdtempSync(resolve(tmpdir(),'qiancheng-v16-'));
 const child=spawn(process.execPath,['server.mjs','--port','0'],{cwd:resolve(import.meta.dirname,'..'),env:{...process.env,DATA_DIR:dir,BIGMODEL_API_KEY:'',BIGMODEL_MODEL:'',COOKIE_SECURE:'0'}});
 let base;
 try{
  base=await new Promise((res,rej)=>{let logs='';child.stdout.on('data',b=>{logs+=b;const m=logs.match(/localhost:(\d+)/);if(m)res('http://127.0.0.1:'+m[1]);});child.on('error',rej);child.on('exit',c=>rej(Error('server exited '+c)));});
  async function session(){const r=await fetch(base+'/api/guest',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];const state=await (await fetch(base+'/api/state',{headers:{cookie}})).json();return {cookie,csrf:state.csrf};}
  async function api(u,path,body){const r=await fetch(base+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{cookie:u.cookie,'Content-Type':'application/json','X-CSRF-Token':u.csrf},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,...await r.json()};}
  const a=await session(),b=await session();const health=await (await fetch(base+'/api/health')).json();assert.equal(health.version,serverVersion());
  const prepare=await api(a,'prepare',{type:'import',args:{source:'wechat',rows:[row()]}});assert.equal(prepare.status,200);assert.equal((await api(a,'state')).state.transactions.length,0);
  await api(a,'cancel',{id:prepare.id});assert.equal((await api(a,'commit',{id:prepare.id,confirm:true})).status,400);assert.equal((await api(a,'state')).state.transactions.length,0);
  const draft=await api(a,'prepare',{type:'import',args:{source:'wechat',rows:[row()]}});assert.equal((await api(a,'commit',{id:draft.id,confirm:true})).status,200);assert.equal((await api(a,'state')).state.transactions.length,1);
  assert.equal((await api(a,'commit',{id:draft.id,confirm:true})).replayed,true);assert.equal((await api(a,'state')).state.transactions.length,1);assert.equal((await api(b,'state')).state.transactions.length,0);
  const duplicate=await api(a,'prepare',{type:'import',args:{source:'wechat',rows:[row()]}});assert.equal(duplicate.result.skipped,1);await api(a,'commit',{id:duplicate.id,confirm:true});assert.equal((await api(a,'state')).state.transactions.length,1);
  assert.equal((await api(b,'commit',{id:draft.id,confirm:true})).status,400);assert.equal((await api({...a,csrf:'bad'},'prepare',{type:'goal',args:{target:'1000',months:6}})).status,403);
  const stale=await api(a,'prepare',{type:'goal',args:{target:'1000',months:6}}),next=await api(a,'prepare',{type:'contact',args:{name:'同学'}});await api(a,'commit',{id:next.id,confirm:true});assert.equal((await api(a,'commit',{id:stale.id,confirm:true})).status,409);
  assert.equal((await api(a,'prepare',{type:'import',args:{source:'wechat',rows:[row({date:'bad'})]}})).status,400);assert.equal((await api(a,'state')).state.transactions.length,1);
  const res=await fetch(base+'/style.css');assert.equal(res.status,200);assert.match(res.headers.get('content-type'),/text\/css/);
 }finally{child.kill();await new Promise(res=>child.once('exit',res));rmSync(dir,{recursive:true,force:true});}
});
