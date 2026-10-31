import {calculate,simulate} from './goal.mjs';
export function routeBasis(s,availableCents){return JSON.stringify({engineVersion:13,goal:s.goal,coach:s.coach,availableCents,goalReservedCents:s.reservations.filter(r=>r.goalId===s.goal?.id).reduce((v,r)=>v+r.cents,0),expenseCents:s.profile.expenseCents,expenseReductionCents:s.profile.expenseReductionCents||0});}
export function adjustedGoal(s,kind){
 if(!s.goal||!s.coach)throw Error('请先补齐目标与生活条件');
 const goal=structuredClone(s.goal),extraSave=Number(s.coach.extraSave)||0;
 if(kind==='save')return {goal,extraSave:extraSave+500};
 if(kind==='target'){goal.targetCents=Math.max(1,Math.round(goal.targetCents*.85));return {goal,extraSave};}
 if(kind==='months'){goal.months=Math.min(360,goal.months+6);return {goal,extraSave};}
 throw Error('请选择已有的调整方式');
}
export function coachScenario(data,whatIf=null){
 const c=data.state.coach;let g=data.state.goal;if(!c||!g||data.summary.availableCents==null)return null;
 let extraSave=Number(c.extraSave)||0;
 if(whatIf){const adjusted=adjustedGoal(data.state,whatIf.kind);g=adjusted.goal;extraSave=adjusted.extraSave;}
 const params={...c,city:c.city??2,home:c.home??0,job:c.job??6,commute:c.commute??1,rel:c.rel??0,risk:c.risk??0,time:c.time??0,kids:c.kids||[],extra:c.extraAmt?[{name:c.extraName||'其他固定支出',amt:c.extraAmt}]:[],incomeNum:c.incomeNum,rent:c.rent??null,leisure:c.leisure??null,expenseReduction:(data.state.profile.expenseReductionCents||0)/100,expenseOverride:data.state.profile.expenseCents==null?null:data.state.profile.expenseCents/100,saved:(data.summary.availableCents+data.summary.savedCents)/100,goal:g.targetCents/100,months:g.months,extraSave};
 const result=calculate(params);return {params,result,band:result.band};
}
export function selectedRouteScenario(data){
 const chosen=data.state.coachRoute,forecast=coachScenario(data);if(!chosen||!forecast)return null;
 const current=chosen.basis===routeBasis(data.state,data.summary.availableCents),index=chosen.index;
 let route=forecast.result.plans[index];if(!route)return null;
 if(!current){const save=chosen.monthlyCents/100,sim=simulate(save,forecast.params.months,0);route={...route,save,...sim,freeCap:Math.max(0,forecast.result.free-save)};}
 return {...forecast,route};
}
