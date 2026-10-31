import {nextDue} from '../public/engines/people.mjs';
import {summary,day,month,billBasis} from './domain.mjs';
import {billReviewBasis} from '../public/engines/bill-analysis.mjs';
import {routeBasis} from '../public/engines/coach-scenario.mjs';
export function recommend(s){
 const task=(id,title,reason,action,extra={})=>({id,title,reason,action,...extra});
 const due=s.cases.find(c=>c.dueDate&&c.dueDate<=(s.simulatedDate||day())&&c.reminderDays>0&&Math.round((c.amount-c.paid-c.offset)*100)>0&&(!c.lastCheckDate||Math.floor((Date.parse(s.simulatedDate||day())-Date.parse(c.lastCheckDate))/86400000)>=c.reminderDays)&&(!c.lastReminderDate||Math.floor((Date.parse(s.simulatedDate||day())-Date.parse(c.lastReminderDate))/86400000)>=c.reminderDays));
 if(s.peopleJourneyCompleted&&!s.peoplePracticeCompleted)return task('people-payment','体验新支付：转账、垫付或AA','本轮往来体验已完成；未结清款仍保留。可以说转给谁多少钱、帮谁垫付，或帮谁AA。','agent-people-practice');
 if(due)return task('due:'+due.id,'有往来到日期，先核对是否已还','尚未到账不计可用资金；提醒只保存到模拟信箱。','due-status',{caseId:due.id});
 const unhandled=s.cases.find(c=>c.checkStatus==='unpaid'&&c.lastCheckDate===(s.simulatedDate||day())&&c.lastReminderDate!==(s.simulatedDate||day())&&Math.round((c.amount-c.paid-c.offset)*100)>0);
 if(unhandled)return task('people-options:'+unhandled.id,'尚未归还：选提醒、改日期或亲自核实','未收到的钱不会提前计入可用资金。','agent-people-options',{caseId:unhandled.id});
 const future=s.demo?nextDue(s):null;
 if(future&&future.days<=365)return task('advance-due:'+future.caseId,'将模拟日期推进至最近一笔借款归还日 '+future.date,'只预览日期，确认后才推进；到期先问是否归还。','agent-advance-due',{caseId:future.caseId,days:future.days,toDate:future.date});
 if(!s.goal)return task('goal','先说一个攒钱愿望','金额、期限先说你知道的；用途可以留空。','start-goal');
 if(!s.coach||!s.openingKnown)return task('profile','补齐生活条件，再判断是否现实','先复用你已说的条件，只追问缺少的信息。','coach-interview');
 if(!s.coachRoute)return task('routes','比较达标比例，选一条路线','目标与生活条件已具备，由程序计算三种储蓄节奏。','coach-outcome');
 const analyzed=!!s.billAnalysisCompleted||!!s.billReviewBasis;
 if(!s.transactions.length&&!analyzed)return task('bills','用账单检查计划是否贴近生活',s.demo?'载入明确虚构的账单，先看消费结构和具体调整空间。':'导入自己的账单，确认后才会保存流水。','route-to-bills');
 const incoming=s.transactions.find(t=>!t.caseId&&!t.excluded&&!t.duplicateOf&&t.direction==='in'&&s.cases.some(c=>c.kind!=='借入'&&c.recipient===t.merchant&&Math.round((c.amount-c.paid-c.offset)*100)>=t.cents));
 if(incoming){const c=s.cases.find(c=>c.kind!=='借入'&&c.recipient===incoming.merchant&&Math.round((c.amount-c.paid-c.offset)*100)>=incoming.cents);return task('repay:'+incoming.id,'这笔入账可能是还款，先核对','金额和姓名只是线索；关联已有到账流水，不再增加一笔现金。','agent-repayment',{transactionId:incoming.id,caseId:c.id});}
 const analyzedPeriod=s.lastBillPeriod||month();
 if(s.billReports?.[analyzedPeriod]&&!s.billDecisions?.[analyzedPeriod])return task('bill-actions','从账单中选一项改进，或暂不改变','先看具体可执行建议，由你决定是否更新未来预算，再核对转账用途。','agent-bill-actions',{period:analyzedPeriod});
 const unknown=s.transactions.find(t=>!t.excluded&&!t.duplicateOf&&!t.caseId&&t.kind==='unknown'&&t.direction==='out');
 if(unknown&&unknown.cat!=='person'&&!/转账|垫付|借款/.test((unknown.rawType||'')+' '+unknown.desc))return task('classify:'+unknown.id,'先核对这笔支出的性质','分类线索不足，先核对消费类别，不能直接判为人情转账或浪费。','classify',{transactionId:unknown.id});
 if(unknown)return task('transfer:'+unknown.id,'先问清这笔转账是什么',`${unknown.merchant}的${(unknown.cents/100).toLocaleString('zh-CN')}元可能是礼物、赡养或垫付，不能直接算浪费。`,'agent-transfer',{transactionId:unknown.id});
 const period=month(),reviewBasis=billReviewBasis(s,period);
 if(!analyzed)return task('bill-analysis','分析消费结构，挑一项具体调整','先看钱花在哪里，再用娱乐、夜宵等可调整线索预览目标变化；订阅只是附带检查。','agent-bill-analysis',{period});

 if(analyzed&&(!s.peopleSceneCompleted||s.demo&&!s.peoplePracticeCompleted))return task('people-practice','体验模拟付款／借还','可记录垫付或AA，核对期望／约定日期，再体验日期推进与到期核对。','agent-people-practice');
 if(s.coachRoute.basis!==routeBasis(s,summary(s).availableCents))return task('recalculate','消费预算或资金已变化，更新目标路线','程序按已确认的预算重算，再选适合你的储蓄节奏。','coach-outcome');
 if(analyzed&&(s.peopleSceneCompleted||s.cases.length))return task('progress','按计划执行，需要时再找钱程','三个场景已体验；账单只在你主动要求时再分析，到期往来仍会提醒核对。','agent-progress',{passive:true});
 const candidates=[...new Set([...s.subscriptions.map(x=>x.name),...s.transactions.filter(t=>!t.excluded&&!t.duplicateOf&&t.kind==='expense'&&t.cat==='subs').map(t=>t.merchant)])].filter(name=>!['keep','cancelled'].includes(s.subscriptions.find(x=>x.name===name)?.status));
 if(candidates.length&&s.optionalSubscriptionReviewSkippedFor!==reviewBasis)return task('subscriptions','可选：顺便检查订阅是否还在用','消费分析已完成；这一步可跳过，不影响目标规划。取消只改沙箱状态，不回退历史扣费。','agent-subscriptions',{names:candidates});
 return task('progress','看看计划接下来怎么执行','可以重看路线、记录本周复盘，或补充新的账单和往来。','agent-progress');
}
