import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initial,apply,summary,day} from '../lib/domain.mjs';
import {recommend} from '../lib/tasks.mjs';
import {deterministicPlan,plan} from '../lib/agent.mjs';
import {composerMessage,nextStepText,isNextStepMessage,transferPurposeText} from '../public/engines/conversation.mjs';
import {planConfirmationDialog,goalExecution} from '../public/plan-ui.mjs';
const change=(s,type,args={})=>apply(structuredClone(s),type,args).state;
function ready(){let s=change(initial(),'goal',{target:'6000',months:12});s=change(s,'coach',{place:'武汉',city:2,home:3,job:6,commute:0,rel:0,risk:0,time:0,kidCount:0,incomeNum:'2000',rent:'0',leisure:'400',extraAmt:'0',opening:'2000'});return change(s,'coach_route',{index:1});}

test('空白发送使用可见推荐文字，用户输入原意优先',()=>{
 const task=recommend(initial()),text=nextStepText(task);
 assert.equal(composerMessage('',task),text);assert.equal(composerMessage(' \n\t ',task),text);assert.equal(composerMessage(' 我想攒1000元 ',task),'我想攒1000元');assert.ok(isNextStepMessage(text));assert.ok(isNextStepMessage('钱程推荐下一步'));assert.equal(isNextStepMessage('我想了解钱程推荐下一步是什么功能'),false);
});
test('推荐按当前状态重算，不按旧占位文案执行，不产生新流水',()=>{
 const s=initial(),oldText=nextStepText(recommend(s)),now=ready(),before=JSON.stringify(now),result=deterministicPlan(now,oldText,{});
 assert.equal(result.task.action,'route-to-bills');assert.equal(result.proposal,null);assert.equal(JSON.stringify(now),before);
 const first=deterministicPlan(s,oldText,{});assert.equal(first.task.action,'start-goal');assert.equal(s.goal,null);
});
test('推荐续接金额期限和生活条件草稿，不清空已说内容',()=>{
 const s=initial(),draft=deterministicPlan(s,'我要攒1000元').context;
 const result=deterministicPlan(s,composerMessage('',recommend(s),draft),draft);assert.equal(result.context.target,'1000');assert.equal(result.next,'goal_followup');assert.match(result.reply,/多久/);
 const g=change(s,'goal',{target:'1000',months:6}),context={intent:'coach_profile',profileDraft:{place:'武汉',incomeNum:2000},profileProof:{}};
 const profile=deterministicPlan(g,nextStepText(recommend(g),context),context);assert.equal(profile.interview.draft.place,'武汉');assert.equal(profile.interview.draft.incomeNum,2000);assert.equal(profile.proposal,null);
});
test('推荐发送遇模型接口失败时明确降级，不伪装成功',async()=>{
 const fetcher=globalThis.fetch,key=process.env.BIGMODEL_API_KEY,model=process.env.BIGMODEL_MODEL;
 try{process.env.BIGMODEL_API_KEY='test-only';process.env.BIGMODEL_MODEL='glm-5.3';let calls=0;globalThis.fetch=async()=>{calls++;throw Error('should not call');};const r=await plan(initial(),nextStepText(recommend(initial())),{});assert.equal(r.mode,'rules-fallback');assert.equal(calls,1);assert.match(r.modelStatus,/规则模式|改用规则/);}
 finally{globalThis.fetch=fetcher;if(key===undefined)delete process.env.BIGMODEL_API_KEY;else process.env.BIGMODEL_API_KEY=key;if(model===undefined)delete process.env.BIGMODEL_MODEL;else process.env.BIGMODEL_MODEL=model;}
});
test('v19计划成功提示留在聊天，用户主动继续才核对转账',()=>{
 const app=readFileSync(new URL('../public/app.mjs',import.meta.url),'utf8'),after=app.slice(app.indexOf("if(type==='bill_plan')"),app.indexOf("if(type==='coach_route')"));
 assert.match(after,/这项调整已加入计划|这条计划已确认/);assert.match(after,/guide\(/);assert.doesNotMatch(after,/showDialog|runRecommendedTask/);assert.doesNotMatch(after,/review-sample/);
});
test('首页愿望在场景前；余量说明默认收起，长期安排仍可打开',()=>{
 const app=readFileSync(new URL('../public/app.mjs',import.meta.url),'utf8'),home=app.slice(app.indexOf('function home()'),app.indexOf('function bills()'));
 assert.ok(home.indexOf('想攒点钱')>=0);assert.match(home,/id="home-agent"/);assert.match(home,/placeholder="帮我设一个攒钱目标"/);assert.match(app,/sendChatInput\(f.message.value/);
 const s=ready(),html=goalExecution({state:s,summary:summary(s)});assert.match(html,/<details class="surplus-explainer"><summary>先看月度余量/);assert.doesNotMatch(html,/<details class="surplus-explainer"[^>]*\bopen\b/);assert.match(html,/data-act="long-term-plan"/);
});
test('转账追问使用浅显语言，月份按真实日期显示',()=>{
 const tx={cents:10000,date:'2026-10-23'};
 assert.equal(transferPurposeText(tx,'2026-10-30'),'你本月有一笔100元转账，这是垫付、AA、送礼，还是其他用途？');
 assert.match(transferPurposeText({...tx,date:'2026-09-20'},'2026-10-30'),/上个月/);assert.match(transferPurposeText({...tx,date:'2025-12-20'},'2026-01-05'),/上个月/);
 assert.match(transferPurposeText({...tx,date:'2026-08-20'},'2026-10-30'),/在2026-08-20/);
});
