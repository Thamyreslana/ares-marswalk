import {sensitivity,walkback} from './planner.js';

export function compareRoutes(analyses,parameters){
  return Object.fromEntries(['direct','terrain'].map(kind=>{
    const analysis=analyses?.[kind];
    if(!analysis)return [kind,{kind,analysis:null,scenarios:[],status:'noRoute',reserveMargin:null,walkback:null}];
    const scenarios=sensitivity(analysis.roundTripMeters,parameters),base=scenarios[1],conservative=scenarios[2];
    const status=!analysis.passable?'blocked':!base.feasible?'insufficient':!conservative.feasible?'conditional':'robust';
    return [kind,{kind,analysis,scenarios,base,conservative,status,reserveMargin:conservative.remaining-parameters.reserve,walkback:walkback(analysis.outboundMeters,parameters)}];
  }));
}

export const DEMO_PARAMETERS=Object.freeze({autonomy:270,work:30,speed:2.5,reserve:45,maxSlope:12});
// Step 3 of the guided demo: fieldwork takes longer than planned.
export const DEMO_LONG_WORK=90;

// Describe the combined terrain/time checks without selecting a route for the user.
export function summarizeComparison(comparison){
  const kinds=['direct','terrain'];
  if(!kinds.some(kind=>comparison?.[kind]?.analysis))return {key:'decisionUnavailable',kind:null};
  const robust=kinds.filter(kind=>comparison[kind]?.status==='robust');
  if(robust.length===2)return {key:'decisionBoth',kind:null};
  if(robust.length===1)return {key:'decisionOne',kind:robust[0]};
  if(kinds.some(kind=>comparison[kind]?.status==='conditional'))return {key:'decisionConditional',kind:null};
  return {key:'decisionRevise',kind:null};
}
