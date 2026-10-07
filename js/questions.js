import { VERBS } from './verbs.js';
export const MODES = [
{
    key:'past',label:'Past simple',heading:'¿Cuál es el pasado simple de'
},
{
    key:'participle',label:'Past participle',heading:'¿Cuál es el participio pasado de'
},
{
    key:'spanish',label:'Traducción',heading:'¿Qué significa en español'
},
{
    key:'complete',label:'Conjugación',heading:'Completa la conjugación de'
}
];
export const shuffle = array => {
    const out=[...array];
    for(let i=out.length-1; i>0; i--){
        const j=Math.floor(Math.random()*(i+1));
        [out[i],out[j]]=[out[j],out[i]];
    }
    return out;
};
export function answerFor(v,mode){
    if(mode==='complete') return `${v.past} · ${v.participle}`;
    return v[mode];
}
export function createQuestion(verbId,modeKey){
    const verb=VERBS[verbId], mode=MODES.find(m=>m.key===modeKey)||MODES[0];
    const correct=answerFor(verb,mode.key);
    const alternatives=shuffle(VERBS.filter(v=>v.id!==verb.id))
    .map(v=>answerFor(v,mode.key))
    .filter((a,i,arr)=>a!==correct && arr.indexOf(a)===i)
    .slice(0,3);
    const options=shuffle([correct,...alternatives]);
    return {
        verbId,mode:mode.key,options,correct:options.indexOf(correct),prompt:`${mode.heading} «${verb.base}»?`
    };
}
export function makeDeck(){
    return shuffle(VERBS.map(v=>v.id));
}
