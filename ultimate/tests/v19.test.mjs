import {controller} from './helpers/controller.mjs';
import * as goalPageUI from '../public/goal-page-ui.mjs';
import {recommendationStrip} from '../public/recommendation-ui.mjs';
import {routeBasis} from '../public/engines/coach-scenario.mjs';
import {chatMessages} from '../public/chat-ui.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {initial,apply,summary,day} from '../lib/domain.mjs';
import {deterministicPlan} from '../lib/agent.mjs';
import {recommend} from '../lib/tasks.mjs';
import * as conversation from '../public/engines/conversation.mjs';
import {pendingAdvanceTask,savedBillPeriod} from '../public/engines/weekly.mjs';
import {profileReview,profileArgs,personas} from '../public/coach-flow-ui.mjs';
import {billAnalysisReport} from '../public/bill-ui.mjs';
import {billSourceDialog} from '../public/plan-ui.mjs';
import * as planUI from '../public/plan-ui.mjs';
import * as billUI from '../public/bill-ui.mjs';
import * as agentUI from '../public/agent-ui.mjs';
import * as coachUI from '../public/coach-ui.mjs';
import * as introUI from '../public/intro-ui.mjs';

const change=(s,type,args={})=>apply(structuredClone(s),type,args).state;
const view=s=>({state:s,summary:summary(s),recommendation:recommend(s),user:{id:'test-account',name:'test'},csrf:'test'});
const student={place:'武汉',city:2,home:3,job:6,commute:0,rel:0,risk:0,time:0,kidCount:0,incomeNum:'2000',rent:'0',leisure:'400',extraAmt:'0',opening:'2000'};
function ready(){return change(change(change(initial(),'goal',{target:'6000',months:12}),'coach',student),'coach_route',{index:1});}

// Execute the production event controller with a small document adapter. This checks
// state transitions and dialog calls; it is not a browser/layout acceptance test.

test('聊天补金额和期限不弹窗；完整目标才在页面显示确认，取消不保存',async()=>{
 const h=controller();await h.driver.chat('我要攒1000元');assert.equal(h.dialogs.length,0);assert.equal(h.driver.dump().agentContext.target,'1000');
 await h.driver.chat('改成2000元');assert.equal(h.dialogs.length,0);assert.equal(h.driver.dump().agentContext.target,'2000');
 await h.driver.chat('6个月');h.driver.render();assert.equal(h.dialogs.length,0);assert.match(h.mount.innerHTML,/确认你的储蓄目标/);assert.match(h.mount.innerHTML,/2,000/);assert.equal(h.state.goal,null);
 await h.driver.act('cancel-goal-edit');assert.equal(h.dialog.open,false);assert.equal(h.calls.filter(c=>c.path==='commit').length,0);assert.equal(h.state.goal,null);
});
test('确认保存目标后只在聊天问缺少条件，不自动接下一个弹窗',async()=>{
 const h=controller();await h.driver.prepare('goal',{target:'1000',months:6});await h.driver.commitInlineGoal();assert.equal(h.state.goal.targetCents,100000);assert.equal(h.dialogs.length,0);
 assert.equal(h.driver.dump().agentContext.intent,'coach_profile');assert.match(h.driver.dump().messages.at(-1).text,/补充你的城市|评估目标是否可行|聊天里补充/);
 await h.driver.chat('我在武汉，是在校学生');assert.equal(h.dialogs.length,0);assert.equal(h.driver.dump().agentContext.profileDraft.place,'武汉');
 const before=JSON.stringify(h.state);await h.driver.chat('取消');assert.equal(h.driver.dump().agentContext.intent,undefined);assert.equal(JSON.stringify(h.state),before);assert.equal(h.dialogs.length,0);
});
test('生活条件分轮补充和修改留在聊天，主动核对才切换页面，保存后不再弹',async()=>{
 const h=controller(change(initial(),'goal',{target:'1000',months:6}));h.driver.begin();
 await h.driver.chat('我在武汉，是在校学生，单身，住学校宿舍');assert.equal(h.dialogs.length,0);
 await h.driver.chat('每月生活费2000元，房租0元，期初现金2000元');assert.equal(h.dialogs.length,0);assert.equal(h.driver.dump().coachInterview.ready,true);
 await h.driver.chat('生活费改成2200元');assert.equal(h.driver.dump().coachInterview.draft.incomeNum,2200);assert.equal(h.dialogs.length,0);assert.equal(h.state.coach,null);
 await h.driver.act('review-profile');h.driver.render();assert.equal(h.dialogs.length,0);assert.match(h.mount.innerHTML,/2,200/);assert.match(h.mount.innerHTML,/假设/);
 await h.driver.act('confirm-coach-profile');assert.equal(h.state.coach.incomeNum,2200);assert.equal(h.dialog.open,false);assert.equal(h.dialogs.length,0);assert.equal(h.driver.dump().agentContext.intent,undefined);
});
test('空白发送的推荐可主动进入条件核对，不重复索要已知条件',async()=>{
 const h=controller(change(initial(),'goal',{target:'1000',months:6}));h.driver.begin();await h.driver.chat(personas.student);
 const {agentContext}=h.driver.dump();assert.equal(agentContext.profileReady,true);const text=conversation.composerMessage('',recommend(h.state),agentContext);assert.match(text,/核对生活条件/);
 await h.driver.chat(text);h.driver.render();assert.equal(h.dialogs.length,0);assert.match(h.mount.innerHTML,/武汉/);assert.match(h.mount.innerHTML,/计算三种储蓄方案/);
});
test('选路线、保存行动、模拟时间推进都只给聊天提示；转账用途等用户主动问',async()=>{
 let s=change(ready(),'sample_bill');const h=controller(s);
 await h.driver.act('choose-route',{dataset:{index:'1'}});await h.driver.act('confirm-route');assert.equal(h.dialogs.length,0);assert.equal(h.driver.dump().page,'goal');
 await h.driver.afterSaved('bill_plan');assert.equal(h.dialogs.length,0);assert.equal(h.driver.dump().agentContext.intent,undefined);assert.match(h.driver.dump().messages.at(-1).text,/这项调整已加入计划|这条计划已确认/);
 await h.driver.afterSaved('advance_time');assert.equal(h.dialogs.length,0);
 await h.driver.act('review-sample');assert.equal(h.dialogs.length,0);assert.equal(h.driver.dump().page,'debts');assert.equal(h.driver.dump().agentContext.transactionId,'sample-loan');
 const before=summary(h.state).cashCents;await h.driver.chat('是垫付');h.driver.render();assert.equal(h.dialogs.length,0);assert.match(h.mount.innerHTML,/小王/);assert.match(h.mount.innerHTML,/100/);assert.match(h.mount.innerHTML,/不新增付款/);assert.equal(summary(h.state).cashCents,before);assert.equal(h.state.cases.length,0);
 h.driver.close();assert.equal(h.state.cases.length,0);
});
test('用途追问只关联当前账户已有流水；含糊、否定、不确定不生成新付款',()=>{
 const s=change(ready(),'sample_bill'),context={intent:'transfer_purpose',transactionId:'sample-loan'},before=JSON.stringify(s);
 for(const message of ['是垫付','这是垫付的','这笔是替对方垫付','借给对方']){let r=deterministicPlan(s,message,context);assert.equal(r.proposal,null);assert.equal(r.context.stage,'date');assert.equal(r.context.draft.dueDate,'');r=deterministicPlan(s,'三天后',r.context);assert.equal(r.context.stage,'date_type');r=deterministicPlan(s,'本人期望',r.context);assert.equal(r.proposal.type,'link_loan');assert.equal(r.proposal.args.id,'sample-loan');assert.equal(Number(r.proposal.args.amount),100);assert.equal(r.proposal.args.dueType,'desired');}
 for(const message of ['还不确定','取消','不是垫付','这100元是帮小王垫付的','给小王垫付200元'])assert.equal(deterministicPlan(s,message,context).proposal,null);
 const gift=deterministicPlan(s,'是送礼',context);assert.equal(gift.proposal.type,'classify');assert.equal(gift.proposal.args.kind,'expense');
 assert.equal(deterministicPlan(initial(),'是垫付',context).proposal,null);assert.equal(JSON.stringify(s),before);
});
test('关联后现金不重复扣；再次使用旧用途追问不会重复关联',()=>{
 const s=change(ready(),'sample_bill'),context={intent:'transfer_purpose',transactionId:'sample-loan'},draft=deterministicPlan(s,'是垫付',context),r=deterministicPlan(s,'暂不设置日期',draft.context),cash=summary(s).cashCents;
 const next=change(s,r.proposal.type,r.proposal.args);assert.equal(summary(next).cashCents,cash);assert.equal(next.cases.length,1);assert.equal(deterministicPlan(next,'是垫付',context).proposal,null);
});
test('到期检查只在聊天提醒，保留当前场景；确认时间后不自动弹到期窗口',async()=>{
 let s=change(ready(),'sample_bill');s=change(s,'link_loan',{id:'sample-loan',name:'小王',kind:'垫付',dueDate:day(),dueType:'desired'});const h=controller(s);
 await h.driver.checkVisibleDue();assert.equal(h.dialogs.length,0);assert.equal(h.driver.dump().page,'home');assert.equal(h.driver.dump().chatExpanded,false);assert.match(h.driver.dump().messages.at(-1).text,/主动核对/);
 const n=h.driver.dump().messages.length;await h.driver.checkVisibleDue();assert.equal(h.driver.dump().messages.length,n);
 await h.driver.afterSaved('advance_time');assert.equal(h.dialogs.length,0);await h.driver.act('due-status',{dataset:{id:s.cases[0].id}});h.driver.render();assert.equal(h.dialogs.length,0);assert.match(h.mount.innerHTML,/是否已经归还/);
});
test('离开或取消后晚到的理解和草案不再打开窗口，也不执行操作',async()=>{
 const h=controller();let resolve;h.driver.setApi((path,args)=>path==='chat'?new Promise(r=>resolve=r):h.api(path,args));const request=h.driver.chat('我要6个月攒1000元');h.driver.close();resolve(deterministicPlan(h.state,'我要6个月攒1000元'));await request;assert.equal(h.dialogs.length,0);assert.equal(h.calls.filter(c=>c.path==='prepare').length,0);
 const second=controller();let finish;second.driver.setApi(async(path,args)=>{if(path==='prepare'){const result=await second.api(path,args);return new Promise(r=>finish=()=>r(result));}return second.api(path,args);});const draft=second.driver.prepare('goal',{target:'1000',months:6},true);await new Promise(setImmediate);second.driver.close();finish();await draft;assert.equal(second.dialogs.length,0);assert.equal(second.state.goal,null);assert.equal(second.calls.at(-1).path,'cancel');
});
test('接口失败保留对话草稿，可以重试，不弹错误广告式窗口',async()=>{
 const h=controller(change(initial(),'goal',{target:'1000',months:6}));h.driver.begin();await h.driver.chat('我在武汉');const context=h.driver.dump().agentContext;
 h.driver.setApi(async()=>{throw Error('服务暂时不可用');});await h.driver.chat('每月生活费2000元');assert.deepEqual(h.driver.dump().agentContext,context);assert.equal(h.dialogs.length,0);assert.match(h.driver.dump().messages.at(-1).text,/草稿|仍保留/);
 h.driver.setApi(h.api);await h.driver.chat('每月生活费2000元');assert.equal(h.driver.dump().agentContext.profileDraft.incomeNum,2000);assert.equal(h.driver.dump().agentContext.profileDraft.place,'武汉');
});
test('从核对页返回改目标，原条件草稿保留且保存后不再自动跳核对页',async()=>{
 const h=controller(change(initial(),'goal',{target:'1000',months:6}));h.driver.begin();await h.driver.chat(personas.student);await h.driver.act('review-profile');const draft=h.driver.dump().agentContext.profileDraft;
 await h.driver.act('back-goal');assert.equal(h.dialogs.length,0);await h.driver.prepare('goal',{target:'1200',months:8});await h.driver.commitInlineGoal();assert.equal(h.dialogs.length,0);assert.equal(h.dialog.open,false);assert.equal(h.driver.dump().agentContext.profileDraft.incomeNum,draft.incomeNum);assert.equal(h.state.goal.targetCents,120000);
});
test('用户主动说核对账单切到来源主页面，不改变账户；方案比较不弹新窗',async()=>{
 const h=controller(ready());await h.driver.afterSaved('coach');assert.equal(h.dialogs.length,0);await h.driver.chat('计算三种储蓄方案');assert.equal(h.dialogs.length,0);assert.equal(h.driver.dump().routeComparison,true);
 await h.driver.chat('核对账单');assert.equal(h.driver.dump().page,'bills');h.driver.render();assert.equal(h.dialogs.length,0);assert.match(h.mount.innerHTML,/导入|虚构/);assert.equal(h.state.transactions.length,0);
});
test('实际渲染首页、聊天按钮、方案和执行计划，推荐占位仍保留，用户文字转义',async()=>{
 const h=controller(ready());h.driver.render();assert.match(h.mount.innerHTML,/想攒点钱/);assert.match(h.mount.innerHTML,/placeholder="钱程推荐：/);
 await h.driver.chat('计算三种储蓄方案');h.driver.render();assert.match(h.mount.innerHTML,/route-grid/);
 await h.driver.act('choose-route',{dataset:{index:'1'}});await h.driver.act('confirm-route');h.driver.render();assert.match(h.mount.innerHTML,/execution-plan/);
 await h.driver.chat('<script>alert(1)</script>');h.driver.render();assert.doesNotMatch(h.mount.innerHTML,/<script>alert/);assert.match(h.mount.innerHTML,/&lt;script&gt;/);
 await h.driver.afterSaved('bill_plan');h.driver.render();assert.match(h.mount.innerHTML,/这项调整已加入计划|这条计划已确认/);assert.doesNotMatch(h.mount.innerHTML,/class="chat-actions"/);assert.equal((h.mount.innerHTML.match(/钱程推荐下一步：/g)||[]).length,1);
});

test('v20等待期间显示同一条钱程气泡，服务端完成后原地替换，不复制回复',async()=>{
 const h=controller();let resolve;h.driver.setApi((path,args)=>path==='chat'?new Promise(r=>resolve=r):h.api(path,args));
 const request=h.driver.chat('我要攒1000元');h.driver.render();
 const before=h.driver.dump();assert.equal(before.messages.at(-1).pending,true);assert.equal(before.messages.at(-2).who,'user');assert.match(h.mount.innerHTML,/正在理解你的需求/);assert.doesNotMatch(h.mount.innerHTML,/model-understanding/);
 h.input.value='我还想补充生活费';h.input.selectionStart=2;h.input.selectionEnd=4;h.document.activeElement=h.input;resolve({...deterministicPlan(h.state,'我要攒1000元'),modelStatus:'当前规则处理',mode:'rules'});await request;h.driver.render();
 const after=h.driver.dump();assert.equal(after.messages.length,before.messages.length);assert.equal(after.messages.at(-1).pending,false);assert.match(after.messages.at(-1).text,/多久/);assert.doesNotMatch(h.mount.innerHTML,/chat-thinking|class="chat-actions"/);assert.equal(h.input.value,'我还想补充生活费');assert.ok(h.input.focusCount>0);assert.equal(h.input.selectionStart,2);assert.equal(h.input.selectionEnd,4);assert.match(h.mount.innerHTML,/placeholder="钱程推荐：/);assert.equal(h.dialogs.length,0);
});
test('v20失败和离开同样结束等待气泡，不伪装模型成功或再次弹窗',async()=>{
 const h=controller();h.driver.setApi(async()=>{throw Error('网络暂时不可用');});await h.driver.chat('我要攒1000元');h.driver.render();
 assert.equal(h.driver.dump().messages.at(-1).requestFailed,true);assert.match(h.mount.innerHTML,/请求未完成/);assert.doesNotMatch(h.mount.innerHTML,/模型已回应|chat-thinking/);
 const next=controller();let resolve;next.driver.setApi(()=>new Promise(r=>resolve=r));const task=next.driver.chat('我要6个月攒1000元');next.driver.close();resolve(deterministicPlan(next.state,'我要6个月攒1000元'));await task;next.driver.render();
 assert.equal(next.driver.dump().messages.at(-1).pending,false);assert.doesNotMatch(next.mount.innerHTML,/chat-thinking/);assert.equal(next.dialogs.length,0);assert.equal(next.state.goal,null);
});
