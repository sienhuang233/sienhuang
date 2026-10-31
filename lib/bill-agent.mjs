import {isNextStepMessage,billSourceTask} from '../public/engines/conversation.mjs';
export function billConversation(s,q,context={}){
 if(/(?:虚拟|虚构|模拟|示例|样本)\s*账单/.test(q)&&/不要|不想|别|取消|如果|假如|假设/.test(q))return {mode:'rules',reply:'没有导入虚构账单。你可以保留当前数据，或在账单体检选择自己的真实账单。',steps:[],proposal:null,context:{},direct:true,flowControlled:true};
 const choice=/^(?:(?:请|帮我|给我|我要|我想|就|那就)?\s*(?:导入|载入|用|使用|选择|来一份)?\s*(?:一份|个)?\s*(?:虚拟|虚构|模拟|示例|样本)\s*账单)(?:吧|体验)?[。！!\s]*$/.test(q);
 const contextual=context.intent==='bill_source'&&(/^(?:就用|用|选择|来一份)?(?:虚拟的|虚构的|示例|样本)(?:吧)?[。！!\s]*$/.test(q)||isNextStepMessage(q));
 if(!choice&&!contextual)return null;
 const task=billSourceTask(s),contextNext={intent:'bill_source'};
 if(task.action!=='load-sample-bill')return {mode:'rules',reply:'当前已有个人资金或真实账单，不能混入虚构样本。请导入自己的账单；若要体验样本，可另开免注册虚构会话。',steps:[],proposal:null,direct:true,flowControlled:true,context:contextNext};
 return {mode:'rules',reply:'将载入所选情形的虚构账单，再打开分析结果。不会把样本当成你的真实消费。',steps:[],proposal:null,task,direct:true,flowControlled:true,context:contextNext};
}
