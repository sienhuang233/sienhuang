import {goalPrompt} from '../public/engines/conversation.mjs';
// Goal slots are grounded in the current utterance, then carried across turns.
const clean=x=>String(x||'').trim().slice(0,40);
export function cnNumber(value){
 const s=String(value).replace(/两/g,'二');if(/^\d+(\.\d+)?$/.test(s))return Number(s);
 const digits={零:0,一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};let result=0,section=0,n=0;
 for(const c of s){if(c in digits)n=digits[c];else if(c==='万'){result+=(section+n)*10000;section=0;n=0;}else if('十百千'.includes(c)){section+=(n||1)*({十:10,百:100,千:1000}[c]);n=0;}else return null;}return result+section+n;
}
export const hasGoalIntent=q=>/攒|存下|存到|存钱|想存|储蓄目标|修改目标|目标金额|目标期限/.test(q);
export const otherMoneyContext=q=>/生活费|房租|工资|月收入|月支出|还款|还钱|转账|垫付|借款|账单|订阅|会员|扣费|余额|推进/.test(q)&&!hasGoalIntent(q);
export function canInterpretGoal(q,context={}){
 if(otherMoneyContext(q))return false;
 if(['goal_details','goal_clarify'].includes(context.intent)||hasGoalIntent(q))return true;
 if(context.intent||context.resumeTask)return false;
 return /想|打算|计划|准备|买|换|目标/.test(q);
}
const numeral='(?:[0-9]+(?:\\.[0-9]+)?|[零一二两三四五六七八九十百千万]+)';
const moneyValue=(n,u)=>cnNumber(n)*(u==='万'?10000:u==='千'?1000:1);
export function goalConversation(s,input,context={}){
 const q=String(input||'').trim(),engaged=['goal_details','goal_clarify'].includes(context.intent);
 const editing=!!s.goal&&/目标.{0,6}(金额|改|调整)|期限.{0,5}(改|调整)|改.{0,4}(目标|期限)/.test(q);
 if(otherMoneyContext(q)||!editing&&!engaged&&!hasGoalIntent(q))return null;
 const prior=engaged?context:editing?{target:s.goal.targetCents/100,months:s.goal.months,purpose:s.goal.name==='储蓄目标'?'':s.goal.name}:{};
 if(/^(?:取消|算了|不用了|先不(?:弄了|设置|设了|存了)?|暂停)[。！!\s]*$/.test(q)||/假如|如果|假设/.test(q))return {mode:'rules',reply:'先暂停这次目标整理。已保存的目标和资金没有变化。',steps:[],proposal:null,context:{}};
 const duration=new RegExp('('+numeral+')\\s*(个?月|年)(半)?','g');
 const durations=[...q.matchAll(duration)];
 let parsedMonths=null;
 if(durations.length===1){const m=durations[0];parsedMonths=cnNumber(m[1])*(m[2]==='年'?12:1)+(m[3]?(m[2]==='年'?6:.5):0);}
 else if(/半年/.test(q))parsedMonths=6;
 const money=[...q.matchAll(new RegExp('(?<![0-9.])('+numeral+')\\s*(万|千)?\\s*(?:元|块)','g'))];
 const labelled=q.match(new RegExp('(?:攒下|攒到|攒|存下|存到|存钱|存|目标金额|金额)(?:改成|改为|调整为|是|为)?[^0-9零一二两三四五六七八九十百千万]{0,5}('+numeral+')\\s*(万|千)?'));
 let parsedTarget=money.length===1?moneyValue(money[0][1],money[0][2]):labelled?moneyValue(labelled[1],labelled[2]):null;
 // Time units identify duration; number order never assigns the slots.
 const rest=q.replace(duration,'').replace(/半年/,'').replace(/^[，,、。！!\s]+|[，,、。！!\s]+$/g,'').replace(/^(?:改成|改为|金额改成|目标改成|目标金额改成)\s*/,'').replace(/[，,、\s]*(?:期限不变|时间不变)$/,'').trim();
 const bare=rest.match(new RegExp('^('+numeral+')(万|千)?$'));
 if(parsedTarget==null&&engaged&&bare&&(!prior.target||parsedMonths!=null||/改成|改为|金额/.test(q)))parsedTarget=moneyValue(bare[1],bare[2]);
 const ambiguous=money.length>1||durations.length>1||parsedTarget==null&&parsedMonths==null&&/[0-9零一二两三四五六七八九十百千万]/.test(q)&&!bare&&!/不变/.test(q);
 const candidateTarget=parsedTarget??(Number(prior.target)||null),candidateMonths=parsedMonths??(Number(prior.months)||null);
 const invalidTarget=candidateTarget!==null&&(!Number.isFinite(candidateTarget)||candidateTarget<=0||candidateTarget>100000000||Math.abs(candidateTarget*100-Math.round(candidateTarget*100))>1e-6)||new RegExp('[-负]\\s*'+numeral+'\\s*(?:万|千)?\\s*(?:元|块)').test(q)||new RegExp('^[-负]\\s*'+numeral+'(?:万|千)?$').test(rest);
 const invalidMonths=candidateMonths!==null&&(!Number.isInteger(candidateMonths)||candidateMonths<1||candidateMonths>360)||new RegExp('[-负]\\s*'+numeral+'\\s*(?:个?月|年)').test(q);
 const target=invalidTarget||money.length>1?null:candidateTarget,months=invalidMonths||durations.length>1?null:candidateMonths;
 const purpose=/用途[：:\s]*(?:不填|先不填|留空|无|暂无|跳过)/.test(q)?'':clean(q.match(/(?:用途|用于|用来)[：:\s]*([^，。！？]{1,30})/)?.[1]||q.match(/(?:去|为了|买|换)([\u4e00-\u9fa5]{2,10})(?:[，。！？\s]|$)/)?.[1]||q.match(/为([\u4e00-\u9fa5]{2,8})(?:攒|存)/)?.[1]||prior.purpose);
 const draft={target:target==null?'':String(target),months:months||'',purpose};
 const steps=[{id:'goal',label:'补齐目标金额和期限',depends:[],status:target&&months?'done':'waiting'},{id:'profile',label:s.coach?'复用已保存的生活条件':'了解收入、住房和家庭责任',depends:['goal'],status:s.coach?'done':'waiting'},{id:'routes',label:'程序计算并比较三条路线',depends:['profile'],status:'waiting'}];
 if(target&&months&&!ambiguous)return {mode:'rules',reply:`目标已整理：${months}个月攒${target}元。请在目标确认区核对并确认保存。`,steps,context:{intent:'goal_details',...draft},goalDraft:draft,proposal:{type:'goal',args:{name:purpose,target:String(target),months}}};
 const reason=invalidTarget?'目标金额须大于0、最多两位小数。':invalidMonths?'期限须为1至360个月的整数。':ambiguous?'请说明目标金额和期限，例如“5000元，6个月”。':'';
 return {mode:'rules',reply:reason?reason+'可以直接对我说。':goalPrompt(draft),steps,proposal:null,next:'goal_followup',goalDraft:draft,context:{intent:'goal_details',...draft}};
}
