import {cnNumber} from './goal-intent.mjs';
const left=c=>Math.max(0,Math.round(c.amount*100)-Math.round(c.paid*100)-Math.round(c.offset*100));
export function dueResponse(s,q,context={}){
 if(!['due_status','due_repayment'].includes(context.intent))return null;
 const c=s.cases.find(c=>c.id===context.caseId&&left(c)>0),base={mode:'rules',steps:[],proposal:null,direct:true};
 if(!c)return {...base,context:{},reply:'这笔往来已结清或记录已变化，请重新核对；没有新增现金。'};
 const keep={intent:context.intent,caseId:c.id};
 if(/^(取消|算了|暂停|先不)[。！!\s]*$/.test(q))return {...base,context:{},reply:'已暂停核对，往来和现金没有变化。'};
 if(/明天|后天|将会|准备|打算|承诺|答应|会还/.test(q)&&!/已(?:经)?(?:收到|到账|还|归还)|还了|收到(?:了)?/.test(q))return {...base,context:keep,reply:'计划归还还不等于已经到账。请先核对目前实际已归还多少，未收到的钱不会计入现金。'};
 if(/没还|未还|没收到|未到账|尚未收到|没有还/.test(q))return {...base,context:{},task:{action:'due-unpaid',caseId:c.id},reply:'先记录为尚未归还，不增加现金。接下来可准备友善提醒、沟通调整日期，或亲自核实。'};
 if(/不确定|不知道|查一下|核实一下/.test(q))return {...base,context:{},task:{action:'due-verify',caseId:c.id},reply:'先核实实际收款记录，未确认前不记还款，也不增加可用资金。'};
 const amount=q.match(/(?:还了|归还|还款|收到|到账)\s*([\d.]+|[零一二两三四五六七八九十百千万]+)\s*(元|块)?/),number=amount?cnNumber(amount[1]):context.intent==='due_repayment'?cnNumber(q.replace(/元|块|[。！!\s]/g,'')):null;
 if(number!=null&&number>0&&number<=left(c)/100)return {...base,context:keep,task:{action:'repay',caseId:c.id,amount:String(number)},reply:'请核对本次归还金额与对应流水。页面只是草案，确认前不新增现金。'};
 if(number!=null)return {...base,context:keep,reply:'归还金额应大于零，且不能超过这笔记录尚未结清的金额。请再核对一次。'};
 if(/全部.*(?:还|收|到账)|都还|全还|已还清|已经还清|全部结清/.test(q))return {...base,context:keep,task:{action:'repay',caseId:c.id},reply:'请核对全部未结清金额与实际流水，确认后才记还款；关联已有流水不会再增加一笔现金。'};
 if(/部分.*还|还.*部分|部分到账|收到部分/.test(q))return {...base,context:{intent:'due_repayment',caseId:c.id},task:{action:'repay',caseId:c.id,partial:true},reply:'这次实际归还多少元？可以直接回答金额，并在页面选择对应流水核对。'};
 return {...base,context:keep,reply:'继续核对这笔到期往来：已经全部归还、部分归还，还是尚未归还？归还金额与流水核对后才记账。'};
}
