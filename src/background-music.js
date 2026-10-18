const STORAGE_KEY='life-explorer.background-music.enabled';

export function createBackgroundMusic(button,storage){
 const audio=new Audio('/audio/background-music.mp3');
 audio.loop=true;
 audio.preload='none';
 audio.volume=.35;
 let enabled=true,started=false,paused=false;
 try{enabled=storage?.getItem(STORAGE_KEY)!=='false';}catch{}

 function updateButton(){
  button.textContent='背景音乐：'+(enabled?'开':'关');
  button.setAttribute('aria-pressed',String(enabled));
 }
 function sync(){
  if(!started||paused||!enabled||document.hidden){audio.pause();return;}
  audio.play().catch(error=>console.warn('背景音乐无法播放：',error));
 }
 button.addEventListener('click',()=>{
  enabled=!enabled;
  try{storage?.setItem(STORAGE_KEY,String(enabled));}catch{}
  updateButton();sync();
 });
 document.addEventListener('visibilitychange',sync);
 window.addEventListener('pagehide',()=>audio.pause());
 updateButton();
 return {
  start(){started=true;paused=false;sync();},
  pause(){paused=true;sync();},
  resume(){paused=false;sync();},
 };
}
