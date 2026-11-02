export function hasCompleteProfile(state){
 const c=state.coach;
 return !!c&&state.openingKnown===true&&['place','incomeNum','home','job','rent','rel'].every(k=>c[k]!==null&&c[k]!==undefined&&c[k]!=='');
}
export const PROFILE_FIELDS=['place','incomeNum','opening','home','job','rent','rel'];
export function missingProfile(state,draft={}){return PROFILE_FIELDS.filter(k=>(k!=='opening'||!state.openingKnown)&&(draft[k]==null||draft[k]===''));}
export const PROFILE_INTRO='为了评估目标是否可行，请补充你的城市、学生或工作身份、住房情况、每月收支、已有存款及家庭负担。';
export const PROFILE_EXAMPLES='也可以直接说“试试武汉在校生”或“试试深圳职场新人”，用模拟条件体验。';
export function profileCollection(missing,{offerExample=true}={}){
 const labels={place:'城市',job:'学生或工作身份',home:'住房情况',incomeNum:'每月收入或生活费',opening:'已有存款',rent:'每月房租（没有可说0）',rel:'家庭或关系阶段'};
 const message=missing.length===PROFILE_FIELDS.length?PROFILE_INTRO:'为了评估目标是否可行，还需补充你的'+missing.map(k=>labels[k]).join('、')+'。可以一次告诉我。';
 return message+(offerExample?PROFILE_EXAMPLES:'');
}
export function requestedPersona(message){
 const q=String(message||'').trim();
 if(/^(?:(?:我想|让我|请)?(?:选择|用|体验|试试|试一试|试一下|试用))武汉(?:在校生|在校大学生|大学生)(?:虚构体验|案例|情形)?[。！!\s]*$/.test(q))return 'student';
 if(/^(?:(?:我想|让我|请)?(?:选择|用|体验|试试|试一试|试一下|试用))深圳职场新人(?:虚构体验|案例|情形)?[。！!\s]*$/.test(q))return 'worker';
 return null;
}
export const canPreviewPersona=s=>s.demo||(!s.coach&&!s.openingKnown&&!s.transactions.length&&!s.cases.length&&!s.contacts.length);
