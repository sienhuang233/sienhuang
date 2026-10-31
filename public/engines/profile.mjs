export function hasCompleteProfile(state){
 const c=state.coach;
 return !!c&&state.openingKnown===true&&['place','incomeNum','home','job','rent','rel'].every(k=>c[k]!==null&&c[k]!==undefined&&c[k]!=='');
}
