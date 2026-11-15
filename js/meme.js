(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const view = $("meme-view");
  if (!view) return;
  const canvas = $("meme-canvas");
  const ctx = canvas.getContext("2d");
  const fields = $("meme-fields");
  const status = $("meme-status");
  const randomButton = $("meme-random");
  const downloadButton = $("meme-download");
  const styleSelect = $("meme-style");
  const layoutButtons = Array.from(view.querySelectorAll("[data-meme-layout]"));
  let count = 1;
  let pictures = [];
  let captions = [{top:"",bottom:""}];
  let loading = false;
  let version = 0;
  let initialized = false;

  const setStatus = (message, error=false) => {
    status.textContent = message;
    status.classList.toggle("is-error",error);
  };
  const active = () => pictures.length === count &&
    pictures.every(img => img && img.complete && img.naturalWidth > 0);
  function updateButtons() {
    layoutButtons.forEach(button => {
      const selected = Number(button.dataset.memeLayout) === count;
      button.classList.toggle("active",selected);
      button.setAttribute("aria-pressed",String(selected));
    });
    randomButton.disabled=loading;
    downloadButton.disabled=loading || !active();
  }
  function buildFields() {
    fields.replaceChildren();
    for(let i=0;i<count;i++) {
      const panel=document.createElement("fieldset");
      panel.className="meme-caption-group";
      const heading=document.createElement("legend");
      heading.textContent=count===1?"Caption":"Panel "+(i+1);
      panel.appendChild(heading);
      for(const position of ["top","bottom"]) {
        const label=document.createElement("label");
        label.textContent=position==="top"?"Top text":"Bottom text";
        const field=document.createElement("textarea");
        field.rows=2;
        field.maxLength=180;
        field.placeholder=position==="top"?"Text at the top…":"Text at the bottom…";
        field.value=captions[i]?.[position]||"";
        field.setAttribute("aria-label",(count===1?"Single frame":"Panel "+(i+1))+" "+position+" text");
        field.addEventListener("input",()=>{
          captions[i][position]=field.value;
          draw();
        });
        label.appendChild(field);
        panel.appendChild(label);
      }
      fields.appendChild(panel);
    }
  }
  function drawCover(img,x,y,w,h) {
    if(!img || !img.naturalWidth || !img.naturalHeight) {
      ctx.fillStyle="#24252a";
      ctx.fillRect(x,y,w,h);
      return;
    }
    const scale=Math.max(w/img.naturalWidth,h/img.naturalHeight);
    const cropW=w/scale;
    const cropH=h/scale;
    ctx.drawImage(img,(img.naturalWidth-cropW)/2,(img.naturalHeight-cropH)/2,
      cropW,cropH,x,y,w,h);
  }
  function wrapText(text,maxWidth,size) {
    ctx.font="900 "+size+"px Impact, 'Arial Black', sans-serif";
    const words=text.toUpperCase().trim().replace(/\s+/g," ").split(" ");
    if(!text.trim())return [];
    const lines=[];
    let line="";
    for(const word of words) {
      const test=line?line+" "+word:word;
      if(ctx.measureText(test).width<=maxWidth || !line) line=test;
      else {lines.push(line);line=word;}
    }
    if(line)lines.push(line);
    return lines;
  }
  function caption(text,x,y,w,h,position,bars) {
    if(!text?.trim())return;
    const preferred=count===1?69:37;
    let size=preferred, lines=[];
    const maxWidth=w-30;
    const maxLines=bars?3:3;
    for(;size>=15;size-=2) {
      lines=wrapText(text,maxWidth,size);
      if(lines.length<=maxLines && lines.every(line=>ctx.measureText(line).width<=maxWidth) &&
        lines.length*size*1.08 <= (bars?h:Math.min(h*.43,count===1?230:130)))break;
    }
    if(size<15)size=15;
    lines=wrapText(text,maxWidth,size);
    const lineHeight=size*1.08;
    const total=lines.length*lineHeight;
    ctx.save();
    ctx.textAlign="center";
    ctx.textBaseline="middle";
    ctx.lineJoin="round";
    ctx.font="900 "+size+"px Impact, 'Arial Black', sans-serif";
    ctx.fillStyle=bars?"#111":"#fff";
    ctx.strokeStyle="#000";
    ctx.lineWidth=Math.max(2,size*.12);
    const start=bars ? y+(h-total)/2+lineHeight/2 :
      (position==="top"?y+16+lineHeight/2:y+h-16-total+lineHeight/2);
    lines.forEach((line,i)=>{
      const baseline=start+i*lineHeight;
      if(!bars)ctx.strokeText(line,x+w/2,baseline,maxWidth);
      ctx.fillText(line,x+w/2,baseline,maxWidth);
    });
    ctx.restore();
  }
  function paintPanel(img,text,x,y,w,h,withBars) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x,y,w,h);
    ctx.clip();
    if(withBars) {
      const bar=Math.round(count===1?110:77);
      ctx.fillStyle="#fff";
      ctx.fillRect(x,y,w,h);
      drawCover(img,x,y+bar,w,h-2*bar);
      caption(text?.top||"",x,y,w,bar,"top",true);
      caption(text?.bottom||"",x,y+h-bar,w,bar,"bottom",true);
    } else {
      drawCover(img,x,y,w,h);
      caption(text?.top||"",x,y,w,h,"top",false);
      caption(text?.bottom||"",x,y,w,h,"bottom",false);
    }
    ctx.restore();
  }
  function draw() {
    if(!ctx)return;
    const bars=styleSelect.value==="bars";
    const single=count===1;
    canvas.width=1200;
    canvas.height=single?(bars?895:675):(bars?1030:740);
    ctx.fillStyle=bars?"#fff":"#17181c";
    ctx.fillRect(0,0,canvas.width,canvas.height);
    if(single) {
      paintPanel(pictures[0],captions[0],0,0,1200,canvas.height,bars);
    } else {
      const gutter=16;
      const width=(canvas.width-gutter*3)/2;
      const height=(canvas.height-gutter*3)/2;
      for(let i=0;i<4;i++) {
        const x=gutter+(i%2)*(width+gutter);
        const y=gutter+Math.floor(i/2)*(height+gutter);
        paintPanel(pictures[i],captions[i],x,y,width,height,bars);
      }
    }
    updateButtons();
  }
  function loadPicture(src) {
    return new Promise((resolve,reject)=>{
      const img=new Image();
      img.decoding="async";
      img.onload=()=>resolve(img);
      img.onerror=()=>reject(new Error("A screenshot could not be loaded."));
      img.src=src;
    });
  }
  async function randomFrames() {
    const requestVersion=++version;
    loading=true;
    initialized=true;
    updateButtons();
    setStatus("Loading random Community frames…");
    try {
      const response=await fetch("/api/meme",{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({count}),cache:"no-store"
      });
      const data=await response.json();
      if(!response.ok || !Array.isArray(data.images) || data.images.length!==count)
        throw new Error(data.error||"Could not get screenshots.");
      const loaded=await Promise.all(data.images.map(loadPicture));
      if(requestVersion!==version)return;
      pictures=loaded;
      captions=Array.from({length:count},()=>({top:"",bottom:""}));
      buildFields();
      setStatus("Write your captions and download your meme as a PNG.");
    }catch(error){
      if(requestVersion!==version)return;
      pictures=[];
      setStatus(error.message||"Could not load frames.",true);
    }finally {
      if(requestVersion===version){
        loading=false;
        draw();
      }
    }
  }
  async function chooseLayout(next) {
    if(next===count)return;
    version++;
    count=next;
    if(next===1 && pictures.length===4){
      pictures=[pictures[0]];
      captions=[captions[0]||{top:"",bottom:""}];
      buildFields();
      draw();
    } else {
      pictures=[];
      captions=Array.from({length:count},()=>({top:"",bottom:""}));
      buildFields();
      draw();
      await randomFrames();
    }
  }
  // Take a canvas snapshot of what the player actually sees, including
  // pixelation, hue filters, zoom and rotation. Never use the unmodified
  // source image as a shortcut to guessing a distorted screenshot.
  function snapshotVisible(source) {
    if(!(source instanceof HTMLImageElement) &&
       !(source instanceof HTMLCanvasElement))throw new Error("No screenshot to import.");
    const out=document.createElement("canvas");
    out.width=1200;
    out.height=675;
    const c=out.getContext("2d");
    const parent=source.parentElement;
    const computed=getComputedStyle(source);
    const sw=source instanceof HTMLImageElement?source.naturalWidth:source.width;
    const sh=source instanceof HTMLImageElement?source.naturalHeight:source.height;
    if(!sw||!sh)throw new Error("Wait until the screenshot has finished loading.");
    c.fillStyle="#24262b";
    c.fillRect(0,0,out.width,out.height);
    let dw=out.width,dh=out.height;
    if(sw/sh>out.width/out.height)dh=out.width*sh/sw;
    else dw=out.height*sw/sh;
    const boxWidth=parent?.clientWidth || source.clientWidth || out.width;
    const boxHeight=parent?.clientHeight || source.clientHeight || out.height;
    const scaleX=out.width/boxWidth,scaleY=out.height/boxHeight;
    c.save();
    c.beginPath();c.rect(0,0,out.width,out.height);c.clip();
    c.translate(out.width/2,out.height/2);
    if(computed.transform && computed.transform!=="none") {
      const matrix=new DOMMatrix(computed.transform);
      c.transform(matrix.a,matrix.b,matrix.c,matrix.d,
        matrix.e*scaleX,matrix.f*scaleY);
    }
    if(computed.filter && computed.filter!=="none")c.filter=computed.filter;
    c.imageSmoothingEnabled=!(source instanceof HTMLCanvasElement ||
      computed.imageRendering==="pixelated");
    c.drawImage(source,-dw/2,-dh/2,dw,dh);
    c.restore();
    return out.toDataURL("image/png");
  }
  window.addEventListener("community:meme-import", async event=>{
    const requestVersion=++version;
    initialized=true;
    loading=true;
    count=1;
    pictures=[];
    captions=[{top:"",bottom:""}];
    buildFields();
    setStatus("Preparing the current screenshot…");
    try {
      const image=await loadPicture(snapshotVisible(event.detail.source));
      if(requestVersion!==version)return;
      pictures=[image];
      setStatus("Current game screenshot imported. Your game is still paused in the background.");
    }catch(error){
      if(requestVersion!==version)return;
      setStatus(error.message||"Could not import the screenshot.",true);
    }finally {
      if(requestVersion===version){loading=false;draw();}
    }
  });
  window.addEventListener("community:meme-open",()=>{
    if(!initialized)randomFrames();
  });
  layoutButtons.forEach(button=>{
    button.addEventListener("click",()=>chooseLayout(Number(button.dataset.memeLayout)));
  });
  randomButton.addEventListener("click",randomFrames);
  styleSelect.addEventListener("change",draw);
  downloadButton.addEventListener("click",()=>{
    if(!active()||loading)return;
    draw();
    canvas.toBlob(blob=>{
      if(!blob){setStatus("Could not export PNG.",true);return;}
      const url=URL.createObjectURL(blob);
      const anchor=document.createElement("a");
      anchor.href=url;
      anchor.download=count===1?"community-meme.png":"community-comic.png";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      setStatus("PNG created. You can keep editing or make another meme.");
    },"image/png");
  });
  buildFields();
  draw();
  // game.js handles direct #/meme navigation during startup before this
  // script has registered its event listeners.
  if(window.location.hash==="#/meme")randomFrames();
})();
