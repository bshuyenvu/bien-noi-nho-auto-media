import { addRssSource,deleteRssSource,rssSources } from './manager.js';

const CATALOG=[
 ['WHO News','https://www.who.int/rss-feeds/news-english.xml'],
 ['CDC Newsroom','https://tools.cdc.gov/api/v2/resources/media/132608.rss'],
 ['CDC Emerging Infectious Diseases','https://wwwnc.cdc.gov/eid/rss/ahead-of-print.xml'],
 ['CDC Expedited Articles','https://wwwnc.cdc.gov/eid/rss/expedited.xml'],
 ['FDA MedWatch','https://www.fda.gov/AboutFDA/ContactFDA/StayInformed/RSSFeeds/MedWatch/rss.xml'],
 ['NIH News Releases','https://www.nih.gov/news-events/news-releases/rss.xml'],
 ['BMJ Recent','https://www.bmj.com/rss/recent.xml'],
 ['NEJM','https://www.nejm.org/action/showFeed?jc=nejm&type=etoc&feed=rss'],
 ['ScienceDaily Health','https://www.sciencedaily.com/rss/health_medicine.xml'],
 ['Medical Xpress','https://medicalxpress.com/rss-feed/'],
 ['NHS England','https://www.england.nhs.uk/feed/'],
 ['VnExpress Sức khỏe','https://vnexpress.net/rss/suc-khoe.rss'],
 ['Tuổi Trẻ Sức khỏe','https://tuoitre.vn/rss/suc-khoe.rss'],
 ['Sức khỏe & Đời sống','https://suckhoedoisong.vn/rss/home.rss'],
 ['VietnamNet Sức khỏe','https://vietnamnet.vn/rss/suc-khoe.rss']
] as const;

const TARGET=15,MAX=20;
export function curateTrustedRss(){
 let removed=0,added=0;
 const unsafe=rssSources.filter(x=>x.managed&&!x.locked&&(Boolean(x.lastError)||x.url.includes('news.google.com/rss/')));
 for(const x of unsafe){deleteRssSource(x.id,true);removed++}
 const excess=Math.max(0,rssSources.length-MAX);
 for(const x of rssSources.filter(x=>!x.locked).sort((a,b)=>(a.managed===b.managed?0:a.managed?1:-1)).slice(0,excess)){deleteRssSource(x.id,true);removed++}
 const existing=new Set(rssSources.map(x=>x.url));
 for(const[name,url]of CATALOG){if(rssSources.length>=TARGET)break;if(existing.has(url))continue;addRssSource({name,url,managed:true});existing.add(url);added++}
 return{added,removed,total:rssSources.length,locked:rssSources.filter(x=>x.locked).length,managed:rssSources.filter(x=>x.managed).length,target:TARGET,max:MAX}
}
export const trustedRssCatalog=CATALOG.map(([name,url])=>({name,url}));
