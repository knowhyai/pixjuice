import {getLocale, onLocaleChange, t, LOCALES, setLocale} from './i18n';

/** One site header, shared by every entry point. */
export function mountToolsMenu(): void {
  const found=document.querySelector<HTMLElement>('header.head');
  if(!found)return;
  const header:HTMLElement=found;
  const labels={en:['Free game assets','Effects','Light / dark'],zh:['免费游戏素材','特效','深浅色切换'],ja:['無料ゲーム素材','エフェクト','明暗切替'],ko:['무료 게임 에셋','효과','테마 전환'],es:['Recursos gratis para juegos','Efectos','Claro / oscuro']};
  const theme=()=>{let saved=null;try{saved=localStorage.getItem('pixjuice-theme')}catch{} document.documentElement.dataset.theme=saved || (matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');};
  theme();matchMedia('(prefers-color-scheme: light)').addEventListener('change',theme);
  function render(){
    const l=getLocale(), prefix=l==='en'?'':'/'+l;
    let path=location.pathname.replace(/^\/(zh|ja|ko|es)(?=\/|$)/,'')||'/'; if(path!=='/'&&!path.endsWith('/'))path+='/'; const home=path==='/'; const toolPaths=['/image-to-pixel-art/','/normal-map/','/pixel-art-upscaler/','/sprite-sheet/','/editor/','/free-resources/']; const inTools=toolPaths.some(p=>path===p);
    const link=(href:string,label:string,current:boolean)=>`<a href="${prefix}${href}"${current?' aria-current="page" class="cur"':''}>${label}</a>`;
    header.innerHTML=`<div class="head-in"><a class="brand" href="${prefix}/"><div><h1>Pix<em>Juice</em></h1><p class="sub">${labels[l][0]}</p></div></a><nav class="nav" aria-label="Main">${link('/templates/',t('nav.templates'),!home&&path.startsWith('/templates/'))}${link('/free-assets/',t('nav.assets'),!home&&path.startsWith('/free-assets/'))}${link('/#effects',labels[l][1],false)}${link('/feel/',t('nav.feel'),!home&&path.startsWith('/feel/'))}<details class="tools"><summary${inTools?' class="cur" aria-current="true"':''}>${t('nav.tools')}</summary><div class="tools-menu">${toolPaths.map((p,i)=>link(p,t(['nav.pixel','nav.normal','nav.upscale','nav.sheet','nav.editor','fr.h1'][i]),path===p)).join('')}</div></details>${link('/credits/',t('nav.credits'),path==='/credits/')}<select data-shared-lang="true" id="lang" class="lang" aria-label="Language">${LOCALES.map(x=>`<option value="${x.code}"${x.code===l?' selected':''}>${x.native}</option>`).join('')}</select><button class="btn theme-toggle" type="button" aria-label="${labels[l][2]}" title="${labels[l][2]}"><svg class="icon-sun" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><svg class="icon-moon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M19 14.5A7.5 7.5 0 0 1 9.5 5 7 7 0 1 0 19 14.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg></button></nav></div>`;
    header.querySelector('button')!.addEventListener('click',()=>{const next=document.documentElement.dataset.theme==='light'?'dark':'light';try{localStorage.setItem('pixjuice-theme',next)}catch{}document.documentElement.dataset.theme=next;});
    header.querySelector('select')!.addEventListener('change',e=>{setLocale((e.target as HTMLSelectElement).value as typeof l)});
    document.querySelectorAll('.crumb, #ed-crumb').forEach(e=>(e as HTMLElement).hidden=true);
  }
  render();onLocaleChange(render);
  document.addEventListener('click',e=>{const menu=header.querySelector('details');if(menu&&!menu.contains(e.target as Node))menu.open=false;});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){const menu=header.querySelector('details');if(menu)menu.open=false;}});
}
