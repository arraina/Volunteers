// Preview by default. --apply acknowledges exactly nine current saved-pledge reviews.
// Financial fields, payments, status, and schedules are never changed.
const fs=require('fs'); const Module=require('module'); const ts=require('typescript');
const auth=require('../node_modules/firebase-tools/lib/auth');
(async()=>{
  const reviewPath=require('path').resolve(__dirname,'../src/helpers/pledgeReview.ts');
  const reviewModule=new Module(reviewPath,module);
  reviewModule._compile(ts.transpileModule(fs.readFileSync(reviewPath,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,reviewPath);
  const {pledgeReviewReasons,pledgeReviewFingerprint}=reviewModule.exports;
  const account=auth.getGlobalDefaultAccount(); if(!account) throw new Error('Firebase login required');
  const token=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
  const root='https://firestore.googleapis.com/v1/projects/temple-volunteers-8ff23/databases/(default)/documents';
  const decode=v=>'stringValue'in v?v.stringValue:'integerValue'in v?Number(v.integerValue):'doubleValue'in v?v.doubleValue:'booleanValue'in v?v.booleanValue:'timestampValue'in v?v.timestampValue:'arrayValue'in v?(v.arrayValue.values||[]).map(decode):'mapValue'in v?Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,v])=>[k,decode(v)])):null;
  const list=async collection=>{const docs=[];let page='';do{const res=await fetch(root+'/'+collection+'?pageSize=1000'+(page?'&pageToken='+encodeURIComponent(page):''),{headers:{Authorization:'Bearer '+token.access_token}});if(!res.ok)throw new Error('Read failed '+res.status);const data=await res.json();docs.push(...(data.documents||[]));page=data.nextPageToken;}while(page);return docs;};
  const dataOf=doc=>({id:doc.name.split('/').pop(),...Object.fromEntries(Object.entries(doc.fields||{}).map(([k,v])=>[k,decode(v)]))});
  const collections=['fundraisingPledges','fundraisingPledgePayments','fundraisingCampaigns','events'];
  const raw=await Promise.all(collections.map(list)); const [saved,payments,campaigns,events]=raw.map(docs=>docs.map(dataOf));
  const model=p=>({...p,donorId:p.donorId||'',eventId:p.eventId||'',purpose:p.purpose||'',donorFirstName:p.donorFirstName||'',donorLastName:p.donorLastName||'',pledgedAmount:Number(p.pledgedAmount)||0,paidAmount:Number(p.paidAmount)||0,openBalanceKnown:p.openBalanceKnown!==false,openBalanceSource:p.openBalanceSource||'',status:p.status||'active',pledgeDate:p.pledgeDate?new Date(p.pledgeDate):null,dueDate:p.dueDate?new Date(p.dueDate):null,nextPaymentDate:p.nextPaymentDate?new Date(p.nextPaymentDate):null});
  const tracked=new Set(saved.filter(p=>p.sourceCampaignEntryId).map(p=>p.eventId+':'+p.sourceCampaignEntryId));
  const displayed=[...saved.map(model),...campaigns.flatMap(c=>(c.entries||[]).filter(e=>e.type==='pledge'&&!tracked.has(c.id+':'+e.id)).map(e=>model({id:'dashboard:'+c.id+':'+e.id,eventId:c.id,donorFirstName:e.firstName,donorLastName:e.lastName,purpose:c.dashboardName||'General pledge',pledgedAmount:e.amount})))].map(p=>{const event=events.find(e=>e.id===p.eventId);return event?.date?{...p,pledgeDate:new Date(event.date)}:p;});
  const receipts=payments.map(p=>({...p,receivedAt:p.receivedAt?new Date(p.receivedAt):null}));
  const now=new Date('2026-10-28T12:00:00-04:00');
  const reviews=displayed.map(pledge=>({pledge,reasons:pledgeReviewReasons(pledge,displayed,receipts,14,now)})).filter(r=>r.reasons.length);
  console.log(JSON.stringify({count:reviews.length,records:reviews.map(({pledge,reasons})=>({id:pledge.id,code:pledge.reconciliationCode,name:[pledge.donorFirstName,pledge.donorLastName].join(' '),amount:pledge.pledgedAmount,reasons}))},null,2));
  if(!process.argv.includes('--apply'))return;
  if(reviews.length!==9||reviews.some(r=>r.pledge.id.startsWith('dashboard:')))throw new Error('Expected exactly nine approved saved pledge reviews; no changes made');
  const encode=v=>v===null?{nullValue:null}:typeof v==='string'?{stringValue:v}:typeof v==='number'?{doubleValue:v}:Array.isArray(v)?{arrayValue:{values:v.map(encode)}}:{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,v])=>[k,encode(v)]))}};
  const writes=reviews.map(({pledge,reasons})=>{const doc=raw[0].find(d=>d.name.endsWith('/'+pledge.id));return{update:{name:doc.name,fields:{reviewConfirmation:encode({fingerprint:pledgeReviewFingerprint(pledge,displayed,receipts),reasons,confirmedBy:account.user.email,note:'Pledge review confirmed by Hub owner in chat. Financial values unchanged.'}),updatedBy:encode(account.user.email)}},updateMask:{fieldPaths:['reviewConfirmation','updatedBy']},currentDocument:{updateTime:doc.updateTime},updateTransforms:[{fieldPath:'reviewConfirmation.confirmedAt',setToServerValue:'REQUEST_TIME'},{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}]};});
  // Abort atomically if payments, event dates, or dashboard data changed since inspection.
  for(const doc of raw.slice(1).flat())writes.push({verify:doc.name,currentDocument:{updateTime:doc.updateTime}});
  const response=await fetch(root+':commit',{method:'POST',headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},body:JSON.stringify({writes})});if(!response.ok)throw new Error('Confirmation failed '+response.status+' '+await response.text());
  const after=await list('fundraisingPledges');
  const canon=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canon).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}';
  for(const doc of raw[0]){const actual=after.find(d=>d.name===doc.name);if(!actual)throw new Error('Record missing');const target=writes.some(w=>w.update?.name===doc.name);const clean=fields=>Object.fromEntries(Object.entries(fields).filter(([k])=>!target||!['reviewConfirmation','updatedBy','updatedAt'].includes(k)));if(canon(clean(doc.fields))!==canon(clean(actual.fields)))throw new Error('Unexpected data change');if(target&&!actual.fields.reviewConfirmation)throw new Error('Missing confirmation');}
  const confirmed=new Map(after.map(doc=>{const p=model(dataOf(doc));return[p.id,p.reviewConfirmation];}));
  const remaining=displayed.filter(p=>pledgeReviewReasons({...p,reviewConfirmation:confirmed.get(p.id)||p.reviewConfirmation},displayed,receipts,14,now).length);
  if(remaining.length)throw new Error('Review queue verification failed');
  console.log(JSON.stringify({confirmed:reviews.length,remainingReviews:remaining.length,financialFieldsUnchanged:true,otherPledgesUnchanged:true}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
