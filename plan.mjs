import {coachScenario,routeBasis,selectedRouteScenario} from './coach-scenario.mjs';
export const WEEKS_PER_MONTH=52/12;
export function probabilityBand(prob){
 const percent=Math.max(0,Math.min(100,Math.round(Number(prob||0)*100)));
 const index=Math.min(4,Math.floor(percent/20));
 return {percent,index,tone:['hard','difficult','stretch','possible','likely'][index],label:['在当前假设下，达标很难','在当前假设下，达标偏难，建议调整','在当前假设下，达标有压力','在当前假设下，达标有希望','在当前假设下，达标较有把握'][index],range:['0–19%','20–39%','40–59%','60–79%','80–100%'][index]};
}
export function weekStart(value){
 const d=new Date(value+'T12:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)throw Error('周日期无效');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);
}
export function surplusAllocation({bufferCents,emergencyGapCents,emergencyCents,emergencyMinimumCents,risk,settings={}}){
 const surplus=Math.max(0,bufferCents);
 const requested=settings.monthlyCents??Math.floor(surplus*.2);
 const longTermReserveCents=Math.max(0,Math.min(surplus,requested));
 // Default planning example: leave at least 20% of this month's surplus liquid,
 // use the remainder for the emergency gap after reserving the learning envelope.
 const liquidFloorCents=Math.min(surplus-longTermReserveCents,Math.ceil(surplus*.2));
 const emergencyFillCents=Math.min(emergencyGapCents,Math.max(0,surplus-longTermReserveCents-liquidFloorCents));
 const remainingBufferCents=surplus-emergencyFillCents-longTermReserveCents;
 const investmentReasons=[];
 if(!longTermReserveCents)investmentReasons.push(surplus?'你把长期预留设为0元':'扣除生活和目标储蓄后，本月没有可分配余量');
 if(!settings.horizonMonths)investmentReasons.push('尚未确认这笔长期闲钱的使用期限');
 else if(settings.horizonMonths<60)investmentReasons.push('这笔闲钱预计5年内需要使用');
 if(!(risk>0))investmentReasons.push('当前风险偏好不接受波动投资');
 if(emergencyCents<emergencyMinimumCents)investmentReasons.push('已单列应急金尚不足1个月必要支出');
 if(!settings.acknowledged)investmentReasons.push('尚未确认长期资金与亏损承受条件');
 const extraGrowthCents=investmentReasons.length?0:longTermReserveCents;
 return {longTermReserveCents,emergencyFillCents,remainingBufferCents,extraGrowthCents,investmentReasons,reserveCapped:requested>surplus,longHorizonMonths:settings.horizonMonths||0,longTermCashCents:longTermReserveCents-extraGrowthCents};
}
export function executionPlan(data){
 const chosen=data.state.coachRoute,selected=selectedRouteScenario(data);if(!chosen||!selected)return null;
 const {params,result,route}=selected,band=result.band;
 const livingCents=Math.max(Math.round(band.rigid*100),Math.round((band.mid+band.leisure-params.expenseReduction)*100));
 const rigidCents=Math.min(livingCents,Math.round(band.rigid*100));
 const monthlySaveCents=Math.round(route.save*100),incomeCents=Math.round(band.income*100);
 const monthlyFlexibleCents=Math.max(0,Math.min(livingCents-rigidCents,incomeCents-rigidCents-monthlySaveCents));
 const weeklyCents=Math.floor(monthlyFlexibleCents/WEEKS_PER_MONTH),dailyCents=Math.floor(monthlyFlexibleCents/30.4);
 // Warning thresholds come from the same monthly envelope; they are not a permission to spend extra.
 const weeklyWarningCents=Math.round(weeklyCents*1.3),dailyWarningCents=Math.round(dailyCents*1.3);
 const bufferCents=Math.max(0,incomeCents-livingCents-monthlySaveCents);
 const legacy=data.state.budgetPlan&&data.state.profile.expenseReductionCents>0?{...data.state.budgetPlan,goalId:data.state.goal.id,legacy:true,active:true,instruction:data.state.budgetPlan.instruction||'每周复盘：'+data.state.budgetPlan.title}:null;
 const actions=(data.state.planActions||(legacy?[legacy]:[])).filter(x=>x.goalId===data.state.goal.id&&x.active!==false);
 const checkins=(data.state.checkins||[]).filter(x=>x.goalId===data.state.goal.id&&x.weekStart);
 const emergencyMonths=3,emergencyTargetCents=Math.round(band.mid*100)*emergencyMonths;
 const emergencyCents=data.state.profile.emergencyCents||0;
 const emergencyGapCents=Math.max(0,emergencyTargetCents-emergencyCents);
 const allocation=surplusAllocation({bufferCents,emergencyGapCents,emergencyCents,emergencyMinimumCents:Math.round(band.mid*100),risk:params.risk,settings:data.state.longTermPlan||{}});
 const targetLiquidCents=params.months<12?monthlySaveCents:Math.floor(monthlySaveCents*.3);
 const targetStableCents=monthlySaveCents-targetLiquidCents;
 const deficitCents=Math.max(0,livingCents+monthlySaveCents-incomeCents);
 return {chosen,route,params,band,stale:chosen.basis!==routeBasis(data.state,data.summary.availableCents),monthlySaveCents,incomeCents,livingCents,rigidCents,monthlyFlexibleCents,weeklyCents,dailyCents,weeklyWarningCents,dailyWarningCents,bufferCents,actions,checkins,emergencyMonths,emergencyTargetCents,emergencyCents,emergencyGapCents:Math.max(0,emergencyTargetCents-emergencyCents),investmentGoalCents:monthlySaveCents,...allocation,targetLiquidCents,targetStableCents,deficitCents,prob:route.prob};
}
export function reminderOptions(c,owner='委托人'){
 const left=Math.max(0,Math.round(c.amount*100)-Math.round(c.paid*100)-Math.round(c.offset*100))/100;
 const amount=left.toLocaleString('zh-CN',{maximumFractionDigits:2}),name=c.recipient;
 const intro=`你好，${name}，这里是钱程助手，帮${owner||'委托人'}核对一笔往来。`;
 const bill=`${c.date?c.date+'的':''}这笔${c.kind||'往来'}款项${c.purpose?'（'+c.purpose+'）':''}，当前记录${c.kind==='借入'?'委托人尚需归还给你':'待你归还'}${amount}元。`;
 return [
  {id:'gentle',label:'友善轻提醒',message:intro+bill+`方便时帮忙核对一下。如果已经归还，也请告诉${owner||'委托人'}一声，谢谢。`},
  {id:'clear',label:'清楚核对金额',message:intro+bill+`请帮忙确认已归还的金额和剩余安排。金额或用途有出入的话，可以先和${owner||'委托人'}核对记录。`},
  {id:'flexible',label:'体谅并协商日期',message:intro+bill+`如果最近不方便，可以和${owner||'委托人'}商量新的日期或分次安排，以你们确认的结果为准。`}
 ];
}
