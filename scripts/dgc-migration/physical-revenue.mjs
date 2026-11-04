import {canonical} from './core.mjs';
import {physicalRevenueEvidence,sameLegacyRevenueScope} from './source-identity.mjs';
import {revenueReview} from './revenue-review.mjs';

export function physicalRevenueGroups(snapshot,targetPlan,decisions,planPin){
 const review=revenueReview(snapshot,decisions),groups=[];
 for(const group of targetPlan.groups){
  if(!group.entries.some(e=>review.issues.some(i=>i.source.sourceRow===e.source.sourceRow&&i.code==='MISSING_OR_DUPLICATE_REVENUE_ID')))continue;
  if(group.entries.length!==1||group.state!=='HELD'||!group.documentSource||!group.documentEvidence||!group.sourceFileId||group.reasons.some(r=>!['REVENUE_REQUIRES_REVIEW','LEGACY_RECON_CARDINALITY_OR_REFERENCE'].includes(r)))throw Error('Other physical revenue group holds remain');
  const e=group.entries[0],issues=review.issues.filter(i=>canonical(i.source)===canonical(e.source)),checks=review.checks.filter(i=>canonical(i.source)===canonical(e.source));
  if(issues.length!==1||issues[0].code!=='MISSING_OR_DUPLICATE_REVENUE_ID'||checks.some(c=>c.state!=='MATCH'))throw Error('Other physical revenue arithmetic or source holds remain');
  const identity=physicalRevenueEvidence(snapshot,e.source,planPin),legacy=e.legacyReconciliations.filter(l=>sameLegacyRevenueScope(e.capturedRevenue,l));
  if(canonical(legacy.map(l=>l.source))!==canonical(identity.matchingLegacySources)||e.rehearsalReasons.some(r=>!['REVENUE_REQUIRES_REVIEW','LEGACY_RECON_CARDINALITY_OR_REFERENCE'].includes(r)))throw Error('Physical legacy source scope differs');
  groups.push({...group,entries:[{...e,legacyReconciliations:legacy,physicalRevenueIdentity:identity}]});
 }
 if(!groups.length)throw Error('No physical revenue collisions selected');return groups;
}
