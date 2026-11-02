import {goalPrompt} from '../public/engines/conversation.mjs';
import {isContinuationMessage} from '../public/engines/conversation.mjs';
import {recommend} from './tasks.mjs';
const clip=(x,n=600)=>String(x??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,n);
export function recentDialogue(history){
 if(!Array.isArray(history))return [];
 return history.filter(x=>x&&['user','assistant'].includes(x.role)&&typeof x.text==='string').slice(-8).map(x=>({role:x.role,text:clip(x.text),...((typeof x.quote==='string'||x.quote?.text)?{quote:clip(typeof x.quote==='string'?x.quote:x.quote.text,400)}:{})}));
}
export function cleanView(input={}){
 return {billPeriod:/^\d{4}-(?:0[1-9]|1[0-2])$/.test(input.billPeriod||'')?input.billPeriod:null,taskChannel:['mainline','subscription-start','subscription-return'].includes(input.taskChannel)?input.taskChannel:null,mainRecommendation:input.mainRecommendation&&typeof input.mainRecommendation.title==='string'&&typeof input.mainRecommendation.message==='string'?{title:clip(input.mainRecommendation.title,120),message:clip(input.mainRecommendation.message,600)}:null,page:['home','intro','goal','bills','debts'].includes(input.page)?input.page:null,goalScreen:['auto','steps','goal-edit','goal-review','profile-edit','profile-review','routes','route-preview','execution'].includes(input.goalScreen)?input.goalScreen:null,pending:input.pending===true,peopleForm:['transfer','repay','due','remind','link_loan','offset','contact'].includes(input.peopleForm)?input.peopleForm:null};
}
export function continuationPlan(s,q,context={},view={},history=[]){
 if(!isContinuationMessage(q))return null;
 const reply=text=>({mode:'rules',reply:text,steps:[],proposal:null,context,continuation:true,next:'resume_current'});
 if(view.pending)return reply('草案还没执行。请在当前页面核对后确认，或返回修改；回复“继续”只会接着核对，不会代你确认。');
 if(view.page==='goal'){
  if(view.goalScreen==='goal-edit')return reply(context.intent==='goal_details'?goalPrompt(context):'继续修改刚才的目标，核对后再确认保存。');
  if(view.goalScreen==='goal-review')return reply('目标草稿已保留，请在页面核对后确认，或返回修改。接下来再了解你的生活条件和已有存款。');
  if(view.goalScreen==='profile-review')return reply('生活条件和已有存款已整理，请在页面核对。确认后再计算三种储蓄方案。');
  if(view.goalScreen==='profile-edit')return reply('继续填写刚才的个人信息，已输入的内容保留；提交核对后再计算。');
  if(view.goalScreen==='route-preview')return reply('刚才的方案还在预览中，目标和已选路线没有变化。请核对后确认采用，或返回比较。');
  if(view.goalScreen==='routes')return reply('三种方案已保留，请在页面选择一条预览，核对后再确认采用。');
 }
 if(['people_link','people_date','people_options','payment_interview'].includes(context.intent))return null;
 if(context.intent==='bill_source')return null;
 if(view.peopleForm)return reply('刚才填写的内容已保留，接着补齐缺项再核对。尚未记账，也未发送提醒。');
 if(context.completed)return {...reply('这一步已保存。'),context:{},task:recommend(s)};
 if(['goal_details','coach_profile','transfer_purpose','transfer','advance_time','reserve','due_status','due_repayment','people_link','people_date','people_options','payment_interview'].includes(context.intent))return null;
 const resume=context.resumeTask,allowed=['agent-bill-analysis','agent-bill-actions','agent-people-practice','agent-transfer','agent-repayment','due-status','repay','agent-people-options','coach-outcome'];
 if(resume&&allowed.includes(resume.action)){
  if(resume.transactionId&&!s.transactions.some(t=>t.id===resume.transactionId&&!t.excluded&&!t.duplicateOf))return reply('这笔流水已经变化，请重新选择当前要核对的记录。');
  if(resume.caseId&&!s.cases.some(c=>c.id===resume.caseId))return reply('这笔往来已经变化，请重新选择当前要核对的记录。');
  return {...reply('继续刚才这一步，请查看对应页面。'),task:{action:resume.action,...(resume.transactionId?{transactionId:resume.transactionId}:{}),...(resume.caseId?{caseId:resume.caseId}:{}),...(resume.period&&/^\d{4}-\d{2}$/.test(resume.period)?{period:resume.period}:{})}};
 }
 if(history.length)return {...reply('这次没有拿到模型的进一步解释。你想接着核对目标、账单，还是刚才的往来？目前没有执行新操作。'),unrecognized:true,continueExplanation:true};
 return null;
}
export function contextAfter(result,prior={}){
 if(result.context!==undefined)return result.context;
 if(result.proposal)return {};
 if(result.task){const t=result.task;return {resumeTask:{action:t.action,...(t.transactionId?{transactionId:t.transactionId}:{}),...(t.caseId?{caseId:t.caseId}:{}),...(t.period?{period:t.period}:{})}};}
 return prior;
}
