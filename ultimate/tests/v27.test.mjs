import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,apply} from '../lib/domain.mjs';
import {deterministicPlan as talk,plan} from '../lib/agent.mjs';
import {controller} from './helpers/controller.mjs';
const change=(s,t,a={})=>apply(structuredClone(s),t,a).state;
function ready(){let s=change(initial(),'goal',{target:5000,months:12});s=change(s,'coach',{place:'武汉',city:2,home:3,job:6,studentWork:'none',commute:0,rel:0,risk:0,time:0,kidCount:0,incomeNum:2000,rent:0,leisure:400,opening:2000});s.demo=true;return change(s,'coach_route',{index:1});}

test('明确想攒钱先建立目标追问，再接受金额期限简写；无目标语境的裸数字不建目标',async()=>{
 let r=talk(initial(),'我想攒钱');assert.equal(r.context.intent,'goal_details');assert.match(r.reply,/想攒多少钱.*多久攒到|想攒多少元.*多久/);assert.equal(r.proposal,null);r=talk(initial(),'5000 6个月',r.context);assert.equal(r.proposal.type,'goal');assert.equal(r.proposal.args.target,'5000');assert.equal(r.proposal.args.months,6);
 for(const ctx of [{},{intent:'reserve'},{intent:'advance_time'},{intent:'coach_profile',profileDraft:{}},{intent:'form_input',form:'weekly-checkin'},{intent:'form_input',form:'offset'},{intent:'bill_source'}]){const next=talk(ready(),'5000，6个月',ctx);assert.notEqual(next.proposal?.type,'goal',JSON.stringify(ctx));assert.notEqual(next.next,'goal_followup',JSON.stringify(ctx));}
 const h=controller();await h.driver.chat('我想攒钱');await h.driver.chat('5000，6个月');assert.equal(h.driver.dump().goalScreen,'goal-review');assert.equal(h.state.goal,null);
});
test('还款金额、AA份额和时间推进保留原任务，完整储蓄意图仍可主动切换',()=>{
 let s=change(ready(),'sample_bill');s=change(s,'link_loan',{id:'sample-loan',name:'小王',kind:'垫付',dueType:'none'});const id=s.cases[0].id;
 const repaid=talk(s,'40',{intent:'due_repayment',caseId:id});assert.equal(repaid.task.action,'repay');assert.equal(repaid.task.amount,'40');
 let aa=talk(s,'40',{intent:'payment_interview',stage:'share',draft:{name:'小李',kind:'AA',amount:'100',dueDate:'',dueType:''}});assert.equal(aa.context.draft.receivableAmount,'40');assert.equal(aa.context.stage,'date');assert.equal(aa.proposal,null);
 const time=talk(s,'7天',{intent:'advance_time'});assert.equal(time.proposal.type,'advance_time');assert.equal(time.proposal.args.days,7);
 const switched=talk(s,'我想6个月攒5000元',{intent:'due_repayment',caseId:id});assert.equal(switched.proposal?.type,'goal');
});
test('离开目标收集与打开资金、本周打卡表清除旧目标追问，不把新数字当作目标',async()=>{
 const h=controller(ready());await h.driver.act('goal');assert.equal(h.driver.dump().agentContext.intent,'goal_details');await h.driver.act('nav',{dataset:{page:'home'}});await h.driver.chat('5000，6个月');assert.notEqual(h.driver.dump().pending?.type,'goal');
 const k=controller(ready());await k.driver.act('goal');await k.driver.act('reserve');assert.equal(k.driver.dump().agentContext.intent,'reserve');await k.driver.chat('5000，6个月');assert.notEqual(k.driver.dump().pending?.type,'goal');
 const j=controller(ready());await j.driver.act('goal');await j.driver.act('weekly-checkin');assert.equal(j.driver.dump().agentContext.form,'weekly-checkin');await j.driver.chat('5000，6个月');assert.notEqual(j.driver.dump().pending?.type,'goal');
});
test('模型不能把其他环节的数字重标为goal；中性语境的语义储蓄请求仍按证据提取',async()=>{
 const old={key:process.env.BIGMODEL_API_KEY,model:process.env.BIGMODEL_MODEL,fetch:globalThis.fetch};process.env.BIGMODEL_API_KEY='test';process.env.BIGMODEL_MODEL='test-model';
 const upstream=raw=>async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(raw)}}]})});
 try{globalThis.fetch=upstream({intent:'goal',answer:'先确认你的储蓄目标。',goal_target:{value:5000,quote:'5000'},goal_months:{value:6,quote:'6个月'}});for(const ctx of [{},{intent:'form_input',form:'weekly-checkin'},{intent:'reserve'},{intent:'coach_profile',profileDraft:{}}]){const r=await plan(ready(),'5000，6个月',ctx);assert.notEqual(r.proposal?.type,'goal',JSON.stringify(ctx));assert.notEqual(r.next,'goal_followup');assert.notEqual(r.context?.intent,'goal_details');}
 let r=await plan(initial(),'5000，6个月',{intent:'goal_details'});assert.equal(r.proposal.type,'goal');assert.doesNotMatch(r.reply,/先确认你的储蓄目标/);
 globalThis.fetch=upstream({intent:'goal',goal_target:{value:5000,quote:'五千元'},goal_months:{value:8,quote:'八个月'}});r=await plan(initial(),'打算八个月后换台五千元的电脑');assert.equal(r.proposal.type,'goal');assert.equal(r.proposal.args.months,8);
 }finally{globalThis.fetch=old.fetch;for(const [k,v] of [['BIGMODEL_API_KEY',old.key],['BIGMODEL_MODEL',old.model]])if(v===undefined)delete process.env[k];else process.env[k]=v;}
});
