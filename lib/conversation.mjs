import {isContinuationMessage} from '../public/engines/conversation.mjs';
import {recommend} from './tasks.mjs';
const clip=(x,n=600)=>String(x??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,n);
export function recentDialogue(history){
 if(!Array.isArray(history))return [];
 return history.filter(x=>x&&['user','assistant'].includes(x.role)&&typeof x.text==='string').slice(-8).map(x=>({role:x.role,text:clip(x.text),...((typeof x.quote==='string'||x.quote?.text)?{quote:clip(typeof x.quote==='string'?x.quote:x.quote.text,400)}:{})}));
}
export function cleanView(input={}){
 return {page:['home','intro','goal','bills','debts'].includes(input.page)?input.page:null,goalScreen:['auto','steps','goal-edit','goal-review','profile-edit','profile-review','routes','route-preview','execution'].includes(input.goalScreen)?input.goalScreen:null,pending:input.pending===true,peopleForm:['transfer','repay','due','remind','link_loan','offset','contact'].includes(input.peopleForm)?input.peopleForm:null};
}
export function continuationPlan(s,q,context={},view={},history=[]){
 if(!isContinuationMessage(q))return null;
 const reply=text=>({mode:'rules',reply:text,steps:[],proposal:null,context,continuation:true,next:'resume_current'});
 if(view.pending)return reply('继续刚才这条任务：草案还没执行。请在当前页面核对后亲自确认，也可以返回修改；“继续”不会代替确认。');
 if(view.page==='goal'){
  if(view.goalScreen==='goal-edit')return reply(context.intent==='goal_details'&&!context.months?'继续刚才的攒钱目标，还缺期限：你打算用多久？金额已保留，用途可选。':context.intent==='goal_details'&&!context.target?'继续刚才的目标，还缺想攒的金额；期限已保留，用途可选。':'继续填写刚才的目标金额和期限，用途可选。核对并确认目标后，再收集个人信息。');
  if(view.goalScreen==='goal-review')return reply('继续核对刚才的储蓄目标，请在页面确认或返回修改；已有存款会在之后的个人信息环节核对。');
  if(view.goalScreen==='profile-review')return reply('继续核对刚才的个人信息和已有存款。确认后才计算三种储蓄方案。');
  if(view.goalScreen==='profile-edit')return reply('继续填写刚才的个人信息，已输入的内容保留；提交核对后再计算。');
  if(view.goalScreen==='route-preview')return reply('继续查看刚才预览的方案，确认采用或返回比较。还没有替你改变目标或方案。');
  if(view.goalScreen==='routes')return reply('继续比较刚才的三种方案，可以先预览一种，再确认采用。');
 }
 if(['people_link','people_date','people_options','payment_interview'].includes(context.intent))return null;
 if(context.intent==='bill_source')return null;
 if(view.peopleForm)return reply('继续刚才的人情往来核对。页面里已填写的内容保留，请补齐缺项后再核对确认；尚未替你记账或发送提醒。');
 if(context.completed)return {...reply('刚才这一步已保存，接着看下一项需要核对的事。'),context:{},task:recommend(s)};
 if(['goal_details','coach_profile','transfer_purpose','transfer','advance_time','reserve','due_status','due_repayment','people_link','people_date','people_options','payment_interview'].includes(context.intent))return null;
 const resume=context.resumeTask,allowed=['agent-bill-analysis','agent-bill-actions','agent-people-practice','agent-transfer','agent-repayment','due-status','repay','agent-people-options','coach-outcome'];
 if(resume&&allowed.includes(resume.action)){
  if(resume.transactionId&&!s.transactions.some(t=>t.id===resume.transactionId&&!t.excluded&&!t.duplicateOf))return reply('刚才的流水已变化，请重新选择要核对的记录。');
  if(resume.caseId&&!s.cases.some(c=>c.id===resume.caseId))return reply('刚才的往来已变化，请重新选择要核对的记录。');
  return {...reply('继续刚才这一步，请查看对应页面。'),task:{action:resume.action,...(resume.transactionId?{transactionId:resume.transactionId}:{}),...(resume.caseId?{caseId:resume.caseId}:{}),...(resume.period&&/^\d{4}-\d{2}$/.test(resume.period)?{period:resume.period}:{})}};
 }
 if(history.length)return {...reply('我会接着上一轮问题。当前未得到模型的进一步解释，请说一下要接着哪一点；没有执行新的任务。'),unrecognized:true,continueExplanation:true};
 return null;
}
export function contextAfter(result,prior={}){
 if(result.context!==undefined)return result.context;
 if(result.proposal)return {};
 if(result.task){const t=result.task;return {resumeTask:{action:t.action,...(t.transactionId?{transactionId:t.transactionId}:{}),...(t.caseId?{caseId:t.caseId}:{}),...(t.period?{period:t.period}:{})}};}
 return prior;
}
