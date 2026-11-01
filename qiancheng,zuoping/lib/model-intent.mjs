import {billConversation} from './bill-agent.mjs';
import {peopleConversation} from './people-agent.mjs';
import {dueResponse} from './due-agent.mjs';
// The model selects a supported intent. Program code validates evidence and owns all facts/actions.
import {goalConversation,cnNumber,canInterpretGoal} from './goal-intent.mjs';
import {profilePlan} from './coach-agent.mjs';
import {recommend} from './tasks.mjs';
import {nextDue,sampleDue} from '../public/engines/people.mjs';
import {isNextStepMessage} from '../public/engines/conversation.mjs';
const out=(reply,extra={})=>({steps:[],proposal:null,reply,...extra});
const evidence=(q,v)=>typeof v==='string'&&v.trim().length>1&&q.includes(v.trim());
const neg=q=>/不要|别转|取消|算了|假如|如果|假设|不(?:是|要|转|借)|先不/.test(q);
function groundedNumber(q,field,unit){
 if(!field||!evidence(q,field.quote)||!Number.isFinite(Number(field.value)))return null;
 const n=Number(field.value),fragment=field.quote;
 if(unit==='months'){
  if(!/月|年/.test(fragment))return null;
  if(/半年/.test(fragment)&&n===6)return n;
  if(/一年半/.test(fragment)&&n===18)return n;
 }else if(/月|年|天/.test(fragment)&&!/元|块/.test(fragment))return null;
 const matches=[...fragment.matchAll(/([0-9]+(?:\.[0-9]{1,2})?|[零一二两三四五六七八九十百千万]+)\s*(万|千|年|个?月|天|元|块)?/g)];
 return matches.some(m=>{if(unit==='amount'&&/^(?:年|个?月|天)$/.test(m[2]||''))return false;if(unit==='months'&&!/^(?:年|个?月)$/.test(m[2]||''))return false;const x=cnNumber(m[1]),u=m[2]||'';return x!=null&&x*(unit==='months'&&u==='年'?12:u==='万'?10000:u==='千'?1000:1)===n;})?n:null;
}
export function resolveModelIntent(s,q,context={},raw,fallback,dispatch){
 if(fallback.continuation)return fallback;
 const bill=billConversation(s,q,context);if(bill)return bill;
 const flow=peopleConversation(s,q,context,raw);if(flow)return flow;
 if(fallback.flowControlled)return fallback;
 if(isNextStepMessage(q)||raw.intent==='next_step'&&/下一步|接下来|继续|怎么做/.test(q))return fallback.direct||fallback.next==='goal_followup'||fallback.interview||fallback.proposal?fallback:out('',{task:recommend(s),next:'recommended_task'});
 // Never turn a hypothetical or negated operation into authorization.
 if(raw.intent==='due_status'&&['due_status','due_repayment'].includes(context.intent)){
  if(/明天|后天|将会|准备|打算|承诺|答应|会还/.test(q)&&!/已(?:经)?(?:收到|到账|还|归还)|还了|收到(?:了)?/.test(q))return fallback;
  if(!evidence(q,raw.repayment_quote)||neg(q)&&!['unpaid','uncertain'].includes(raw.repayment_status))return fallback;
  const label={full:'已全部还款',partial:'已部分还款',unpaid:'未还款',uncertain:'不确定'}[raw.repayment_status];
  if(label){const amount=groundedNumber(q,raw.amount_field,'amount');return dueResponse(s,amount>0&&raw.repayment_status==='partial'?'归还'+amount+'元':label,context)||fallback;}
 }
 if(raw.intent==='sample_bill'&&/(?:导入|载入|用|使用)/.test(q)&&/虚拟|虚构|模拟/.test(q)&&/账单/.test(q))return out('将使用已选情形的明确虚构账单，不代表你的真实消费。',{task:{action:'load-sample-bill'}});
 if(raw.intent==='persona'&&!/【虚构情形】|\d|[零一二两三四五六七八九十百千万]+元/.test(q)&&/试|体验|虚构|案例/.test(q)&&((raw.persona==='student'&&/武汉/.test(q))||(raw.persona==='worker'&&/深圳/.test(q))))return out('将使用明确虚构的生活条件与已有存款，先给你核对再计算。',{task:{action:'use-persona',persona:raw.persona}});
 if(neg(q)&&['transfer','reserve','purchase','advance_time','transfer_purpose'].includes(raw.intent))return fallback;
 if(raw.intent==='transfer_purpose'&&context?.intent==='transfer_purpose'){
  const t=s.transactions.find(t=>t.id===context.transactionId&&t.kind==='unknown'&&t.direction==='out'&&!t.caseId&&!t.excluded&&!t.duplicateOf);
  if(!t||!evidence(q,raw.purpose_quote))return fallback;
  const type=raw.purpose,hasAdvance=/垫|帮.*付|先.*出|代付|AA|平摊/.test(raw.purpose_quote),hasLoan=/借给|借出/.test(raw.purpose_quote),hasExpense=/送礼|礼物|赡养|给家里|自己|消费|我吃|我买/.test(raw.purpose_quote);
  if(type==='uncertain')return out('先保留为用途待确认，不建立人情账，现金没有变化。',{context:{}});
  if(type==='aa'&&hasAdvance)return out('请核对对方应还的份额和日期，不把整笔付款都算作待收。',{task:{action:'link',transactionId:t.id},context:{}});
  if((type==='advance'&&hasAdvance)||(type==='loan'&&hasLoan)){
   // A different amount must be reconciled explicitly in the existing-transaction form.
   const amount=groundedNumber(q,raw.amount_field,'amount');if(amount!=null&&Math.round(amount*100)!==t.cents)return out('你提到的金额与这笔流水不一致，请先核对应还份额。',{task:{action:'link',transactionId:t.id},context:{}});
   return out('用途已整理，请在页面核对已有流水的关联；确认前不建账，也不再付款。',{context:{},proposal:{type:'link_loan',args:{id:t.id,name:t.merchant,amount:(t.cents/100).toFixed(2),kind:type==='loan'?'借款':'垫付',dueType:'none'}}});
  }
  if(type==='expense'&&hasExpense)return out('请确认将已有流水记为个人支出，不把亲友支出一律判为浪费。',{context:{},proposal:{type:'classify',args:{id:t.id,kind:'expense',cat:'person'}}});
  return fallback;
 }
 if(raw.intent==='profile'&&!fallback.proposal&&!fallback.goalDraft&&!fallback.task&&fallback.next!=='bill_analysis')return profilePlan(s,q,context,raw.profile_fields);
 if(raw.intent==='transfer'&&context?.intent!=='transfer_purpose'&&!fallback.proposal&&/转|付|借|垫|给/.test(q)){
  const name=String(raw.recipient||'').trim(),amount=groundedNumber(q,raw.amount_field||{value:raw.amount,quote:String(raw.amount??'')},'amount');
  if(name&&name.length<=40&&q.includes(name)&&amount>0&&amount<=100000000){
   const contacts=s.contacts.filter(c=>c.name===name);if(contacts.length>1)return out('有同名联系人，请亲自核对对象。',{task:{action:'agent-people-practice'}});
   const requested=['普通付款','借款','垫付','AA','借入'].includes(raw.kind)?raw.kind:'普通付款';
   const kind=requested==='借入'&&/向.*借|借我|我借|借入/.test(q)?'借入':requested==='AA'&&/AA|平摊/.test(q)?'AA':requested==='借款'&&/借给|借出/.test(q)?'借款':requested==='垫付'&&/垫|代付|帮.*付/.test(q)?'垫付':'普通付款';
   return out('已按这句话整理模拟付款草案。请核对姓名、金额与用途，确认后才记账。',{proposal:{type:'transfer',args:{...(contacts.length===1?{contactId:contacts[0].id}:{name}),amount:String(amount),kind}}});
  }
 }
 if(raw.intent==='goal'&&!canInterpretGoal(q,context))return {...fallback,flowControlled:true};
 if(raw.intent==='goal'&&!neg(q)){
  if(fallback.proposal?.type==='goal')return fallback;
  const target=groundedNumber(q,raw.goal_target,'amount'),months=groundedNumber(q,raw.goal_months,'months');
  if(target!=null&&target>0||months!=null&&months>0){
   const existing=fallback.goalDraft?fallback.goalDraft:context?.intent==='goal_details'?context:s.goal&&/改|换|调整/.test(q)?{target:s.goal.targetCents/100,months:s.goal.months,purpose:s.goal.name}:{};
   const targetText=target!=null?'我要攒'+target+'元':'',monthText=months!=null?months+'个月':'';
   return goalConversation(s,targetText+monthText,{...existing,intent:'goal_details'});
  }
  return fallback.unrecognized?dispatch(s,'我想存钱，目标现实吗',context):fallback;
 }
 if(raw.intent==='bill_actions'&&s.billReports?.[s.lastBillPeriod])return out('请看页面中的具体改进，或选择暂不改变预算。',{task:{action:'agent-bill-actions',period:s.lastBillPeriod}});
 if(raw.intent==='people'&&/付款|借|垫|AA|人情|往来/.test(q))return out('请在页面填写并核对对象、金额和用途；这里仅模拟，不发生真实转账。',{task:{action:'agent-people-practice'}});
 if(raw.intent==='advance_time'&&/最近|归还|还款|到期/.test(q)&&/推进|快进|跳到|挪到/.test(q)){
  const due=s.demo?nextDue(s):null;if(due&&due.days<=365)return out('已找到最近归还日期，先核对页面上的模拟日期，确认后才推进。',{proposal:{type:'advance_time',args:{days:due.days}}});
 }
 if(fallback.unrecognized&&['analyze','balance','subscription_inspect'].includes(raw.intent))return dispatch(s,({analyze:'分析账单',balance:'查询余额',subscription_inspect:'查看订阅'})[raw.intent],context);
 return fallback;
}
