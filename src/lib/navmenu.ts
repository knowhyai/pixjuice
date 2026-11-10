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
    const path=location.pathname.replace(/^\/(zh|ja|ko|es)(?=\/)/,'');
    const link=(href:string,label:string,current:boolean)=>`<a href="${prefix}${href}"${current?' aria-current="page" class="cur"':''}>${label}</a>`;
    header.innerHTML=`<div class="head-in"><a class="brand" href="${prefix}/"><div><h1>Pix<em>Juice</em></h1><p class="sub">${labels[l][0]}</p></div></a><nav class="nav" aria-label="Main">${link('/templates/',t('nav.templates'),path.startsWith('/templates/'))}${link('/free-assets/',t('nav.assets'),path.startsWith('/free-assets/'))}${link('/#effects',labels[l][1],path==='/')}<details class="tools"><summary>${t('nav.tools')}</summary><div class="tools-menu">${[['/image-to-pixel-art/','nav.pixel'],['/normal-map/','nav.normal'],['/pixel-art-upscaler/','nav.upscale'],['/sprite-sheet/','nav.sheet'],['/editor/','nav.editor'],['/free-resources/','fr.h1']].map(([p,k])=>link(p,t(k),path===p)).join('')}</div></details>${link('/credits/',t('nav.credits'),path==='/credits/')}<select data-shared-lang="true" id="lang" class="lang" aria-label="Language">${LOCALES.map(x=>`<option value="${x.code}"${x.code===l?' selected':''}>${x.native}</option>`).join('')}</select><button class="btn theme-toggle" aria-label="${labels[l][2]}" title="${labels[l][2]}">☀ / ☾</button></nav></div>`;
    header.querySelector('button')!.addEventListener('click',()=>{const next=document.documentElement.dataset.theme==='light'?'dark':'light';try{localStorage.setItem('pixjuice-theme',next)}catch{}document.documentElement.dataset.theme=next;});
    header.querySelector('select')!.addEventListener('change',e=>{setLocale((e.target as HTMLSelectElement).value as typeof l)});
    document.querySelectorAll('.crumb, #ed-crumb').forEach(e=>(e as HTMLElement).hidden=true);
  }
  render();onLocaleChange(render);
  document.addEventListener('click',e=>{const menu=header.querySelector('details');if(menu&&!menu.contains(e.target as Node))menu.open=false;});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){const menu=header.querySelector('details');if(menu)menu.open=false;}});
}
