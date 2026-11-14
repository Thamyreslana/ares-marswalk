import {sensitivity} from './planner.js';

export function compareRoutes(analyses,parameters){
  return Object.fromEntries(['direct','terrain'].map(kind=>{
    const analysis=analyses?.[kind];
    if(!analysis)return [kind,{kind,analysis:null,scenarios:[],status:'noRoute',reserveMargin:null}];
    const scenarios=sensitivity(analysis.roundTripMeters,parameters),base=scenarios[1],conservative=scenarios[2];
    const status=!analysis.passable?'blocked':!base.feasible?'insufficient':!conservative.feasible?'conditional':'robust';
    return [kind,{kind,analysis,scenarios,base,conservative,status,reserveMargin:conservative.remaining-parameters.reserve}];
  }));
}

export const DEMO_PARAMETERS=Object.freeze({autonomy:240,work:30,speed:2.5,reserve:45,maxSlope:12});
