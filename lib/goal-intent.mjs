// Goal slots are grounded in the current utterance, then carried across turns.
const clean=x=>String(x||'').trim().slice(0,40);
export function cnNumber(value){
 const s=String(value).replace(/两/g,'二');if(/^\d+(\.\d+)?$/.test(s))return Number(s);
 const digits={零:0,一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};let result=0,section=0,n=0;
 for(const c of s){if(c in digits)n=digits[c];else if(c==='万'){result+=(section+n)*10000;section=0;n=0;}else if('十百千'.includes(c)){section+=(n||1)*({十:10,百:100,千:1000}[c]);n=0;}else return null;}return result+section+n;
}
export const hasGoalIntent=q=>/攒|存下|存到|存钱|想存|储蓄目标|修改目标|目标金额|目标期限/.test(q);
export function canInterpretGoal(q,context={}){
 if(['goal_details','goal_clarify'].includes(context.intent)||hasGoalIntent(q))return true;
 if(context.intent||context.resumeTask)return false;
 return /想|打算|计划|准备|买|换|目标/.test(q);
}
export function goalConversation(s,q,context={}){
 const editing=!!s.goal&&/目标.{0,6}(金额|改|调整)|期限.{0,5}(改|调整)|改.{0,4}(目标|期限)/.test(q);
 const engaged=['goal_details','goal_clarify'].includes(context.intent);
 const numeral='(?:[0-9]+(?:\\.[0-9]{1,2})?|[零一二两三四五六七八九十百千万]+)';
 const compact=q.match(new RegExp('^('+numeral+')\\s*(元|块|万|千)?\\s*[,，、\\s]+\\s*('+numeral+')\\s*(个?月|年)[。！!\\s]*$'));
 const reversed=q.match(new RegExp('^('+numeral+')\\s*(个?月|年)\\s*[,，、\\s]*\\s*('+numeral+')\\s*(元|块|万|千)?[。！!\\s]*$'));
 if(engaged&&/订阅|会员|扣费|转给|转账|垫付|账单|余额|还款|推进/.test(q)&&!/攒|存钱|储蓄目标/.test(q))return null;
 if(!editing&&!engaged&&!hasGoalIntent(q))return null;
 const amount=q.match(new RegExp('(?:攒下|攒到|攒|存下|存到|存钱|存|目标金额|金额)(?:改成|改为|调整为|是|为)?[^0-9零一二两三四五六七八九十百千万]{0,5}('+numeral+')\\s*(万|千)?'))||engaged&&q.match(new RegExp('^(?:改成)?('+numeral+')\\s*(元|块|万|千)?$'))||(compact?[compact[0],compact[1],compact[2]]:reversed?[reversed[0],reversed[3],reversed[4]]:null);
 const yr=q.match(/([一二两三四五六七八九十百\d]+)\s*年/),mo=q.match(/([一二两三四五六七八九十百\d]+)\s*个?月/);
 const parsedMonths=mo?cnNumber(mo[1]):yr?cnNumber(yr[1])*12:/半年/.test(q)?6:null;
 const prior=engaged?context:editing?{target:s.goal.targetCents/100,months:s.goal.months,purpose:s.goal.name}:{};
 const v=amount?cnNumber(amount[1])*(amount[2]==='万'?10000:amount[2]==='千'?1000:1):Number(prior.target)||null;
 const target=Number.isFinite(v)&&v>0&&v<=100000000&&Math.abs(v*100-Math.round(v*100))<1e-6?v:null;
 const candidate=parsedMonths??Number(prior.months);const months=Number.isInteger(candidate)&&candidate>=1&&candidate<=360?candidate:null;
 const purpose=clean(q.match(/(?:去|为了|买|换)([\u4e00-\u9fa5]{2,10})(?:[，。！？\s]|$)/)?.[1]||q.match(/为([\u4e00-\u9fa5]{2,8})(?:攒|存)/)?.[1]||prior.purpose);
 if(/不要|别|取消|算了|不用了|先不|假如|如果|假设/.test(q))return {mode:'rules',reply:'已暂停这次目标整理，已保存的目标和资金没有变化。',steps:[],proposal:null,context:{}};
 const draft={target:target==null?'':String(target),months:months||'',purpose};
 const steps=[{id:'goal',label:'补齐目标金额和期限，用途可跳过',depends:[],status:target&&months?'done':'waiting'},{id:'profile',label:s.coach?'复用已保存的生活条件':'了解收入、住房和家庭责任',depends:['goal'],status:s.coach?'done':'waiting'},{id:'routes',label:'程序计算并比较三条路线',depends:['profile'],status:'waiting'}];
 if(target&&months)return {mode:'rules',reply:`我整理的目标是：${months}个月攒${target.toLocaleString('zh-CN')}元${purpose?'，用于'+purpose:''}。请在页面核对并确认，当前尚未保存。`,steps,context:{intent:'goal_details',...draft},proposal:{type:'goal',args:{name:purpose||'储蓄目标',target:String(target),months}}};
 return {mode:'rules',reply:`${target?'已记下想攒'+target.toLocaleString('zh-CN')+'元。':''}${!target&&!months?'你想攒多少元，打算用多久？也可以直接在聊天里告诉我。':!months?'你打算用多久攒到？也可以直接在聊天里告诉我。':'请补充想攒的金额。'}用途可以先不填。下一步我会检查已有生活条件，只追问缺少的信息。`,steps,proposal:null,next:'goal_followup',goalDraft:draft,context:{intent:'goal_details',...draft}};
}
