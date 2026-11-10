import cinzel from "../../public/fonts/cinzel-latin-500.woff2?inline";
import cormorant from "../../public/fonts/cormorant-latin-500.woff2?inline";
import cinzelLicense from "../../public/licenses/Cinzel-OFL.txt?raw";
import cormorantLicense from "../../public/licenses/Cormorant-OFL.txt?raw";
import silkscreen from "../../public/fonts/silkscreen-latin-400.woff2?inline";
import silkscreenLicense from "../../public/licenses/Silkscreen-OFL.txt?raw";
const bytes = (url:string) => Uint8Array.from(atob(url.split(",")[1]), c => c.charCodeAt(0));
export const fontFiles = [
 {name:"fonts/silkscreen-latin-400.woff2",code:"Silkscreen Latin 400 — SIL OFL 1.1",data:bytes(silkscreen)},
 {name:"fonts/Silkscreen-OFL.txt",code:silkscreenLicense},
 {name:"fonts/cinzel-latin-500.woff2",code:"Cinzel Latin 500 — SIL OFL 1.1",data:bytes(cinzel)},
 {name:"fonts/cormorant-latin-500.woff2",code:"Cormorant Latin 500 — SIL OFL 1.1",data:bytes(cormorant)},
 {name:"fonts/Cinzel-OFL.txt",code:cinzelLicense},
 {name:"fonts/Cormorant-OFL.txt",code:cormorantLicense},
];
export const offlineStyles = (css:string) => css.replaceAll("/fonts/", "fonts/");
