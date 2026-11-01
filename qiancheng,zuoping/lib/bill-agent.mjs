import {isNextStepMessage,billSourceTask} from '../public/engines/conversation.mjs';
export function billConversation(s,q,context={}){
 if(context.intent==='bill_source'&&/^(?:好|好的|可以|就这样)[。！!\s]*$/.test(q))return {mode:'rules',reply:'你想导入自己的账单，还是用虚构账单体验？',steps:[],proposal:null,context,direct:true,flowControlled:true};
 if(/(?:虚拟|虚构|模拟|示例|样本)\s*账单/.test(q)&&/不要|不想|别|取消|如果|假如|假设/.test(q))return {mode:'rules',reply:'已保留当前数据，没有导入虚构样本。需要分析自己的账单时，可以直接告诉我。',steps:[],proposal:null,context:{},direct:true,flowControlled:true};
 const choice=/^(?:(?:请|帮我|给我|我要|我想|就|那就)?\s*(?:导入|载入|用|使用|选择|来一份)?\s*(?:一份|个)?\s*(?:虚拟|虚构|模拟|示例|样本)\s*账单)(?:吧|体验)?[。！!\s]*$/.test(q);
 const contextual=context.intent==='bill_source'&&(/^(?:就用|用|选择|来一份)?(?:虚拟的|虚构的|示例|样本)(?:吧)?[。！!\s]*$/.test(q)||isNextStepMessage(q));
 if(!choice&&!contextual)return null;
 const task=billSourceTask(s),contextNext={intent:'bill_source'};
 if(task.action!=='load-sample-bill')return {mode:'rules',reply:'当前会话已有个人资金或真实账单，不能混入虚构样本。可以继续使用自己的数据；想体验样本，请另开虚构会话，无需注册。',steps:[],proposal:null,direct:true,flowControlled:true,context:contextNext};
 return {mode:'rules',reply:'接下来载入所选虚构账单，完成分析后展示结果。',steps:[],proposal:null,task,direct:true,flowControlled:true,context:contextNext};
}
