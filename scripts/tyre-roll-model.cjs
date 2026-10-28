 const TAU=Math.PI*2,SIZE=180,cache=new Map();
 const profile=[[-.36,.58],[-.385,.66],[-.39,.8],[-.365,.91],[-.31,.975],[-.23,1],[-.1,1.012],[.1,1.012],[.23,1],[.31,.975],[.365,.91],[.39,.8],[.385,.66],[.36,.58],[.30,.55],[-.30,.55]];
 const norm=v=>{const l=Math.hypot(...v);return v.map(x=>x/l);};
 const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
 const camera=norm([-4,1.4,6]),right=norm([camera[2],0,-camera[0]]),up=norm([camera[1]*right[2],camera[2]*right[0]-camera[0]*right[2],-camera[1]*right[0]]),direction=camera.map(v=>-v);
 const key=norm([-3,5,6]),fill=norm([4,1,2]),half=norm(key.map((v,i)=>v+camera[i]));
 function geometry(size){
  if(cache.has(size))return cache.get(size);
  const pixels=[];
  for(let py=0;py<size;py++)for(let px=0;px<size;px++){
   const sx=(px+.5-size/2)/(size*.41),sy=(size*.49-py-.5)/(size*.41),o=camera.map((v,i)=>v*4+right[i]*sx+up[i]*sy);
   let hit=null;
   for(let j=0;j<profile.length;j++){
    const p=profile[j],q=profile[(j+1)%profile.length],dz=q[0]-p[0],dr=q[1]-p[1];let roots=[];
    if(Math.abs(dz)<1e-9){if(Math.abs(direction[2])>1e-9)roots=[(p[0]-o[2])/direction[2]];}
    else{
     const slope=dr/dz,b=p[1]-slope*p[0],r0=slope*o[2]+b,rd=slope*direction[2],A=direction[0]**2+direction[1]**2-rd**2,B=2*(o[0]*direction[0]+o[1]*direction[1]-r0*rd),C=o[0]**2+o[1]**2-r0**2,D=B*B-4*A*C;
     if(D>=0&&Math.abs(A)>1e-10){const d=Math.sqrt(D);roots=[(-B-d)/(2*A),(-B+d)/(2*A)];}
    }
    for(const t of roots){
     if(t<0||hit&&t>=hit.t)continue;
     const x=o[0]+t*direction[0],y=o[1]+t*direction[1],z=o[2]+t*direction[2],r=Math.hypot(x,y);
     if(Math.abs(dz)<1e-9){if(r<Math.min(p[1],q[1])-1e-6||r>Math.max(p[1],q[1])+1e-6)continue;}
     else if(z<Math.min(p[0],q[0])-1e-6||z>Math.max(p[0],q[0])+1e-6)continue;
     const len=Math.hypot(dz,dr),normal=[dz/len*x/r,dz/len*y/r,-dr/len];
     hit={t,z,r,theta:Math.atan2(y,x),normal};
    }
   }
   if(hit){const n=hit.normal,light=.22+Math.max(0,dot(n,key))*.83+Math.max(0,dot(n,fill))*.24,spec=Math.pow(Math.max(0,dot(n,half)),36);pixels.push({offset:(py*size+px)*4,...hit,light,spec});}
  }
  cache.set(size,pixels);return pixels;
 }
 function frame(context,phase,size=SIZE){
  const output=context.createImageData(size,size),data=output.data;
  for(const p of geometry(size)){
   const theta=p.theta-phase;
   let shade=p.light,shine=p.spec,detail=0;
   if(p.r>.945&&Math.abs(p.z)<.335){
    const u=theta/TAU*42,chevron=u+Math.abs(p.z)*6.5,diagonal=Math.abs(chevron-Math.round(chevron)),channels=Math.min(Math.abs(p.z-.155),Math.abs(p.z+.155),Math.abs(p.z));
    const groove=diagonal<.115||channels<.012;
    if(groove){shade*=.24;shine*=.15;}else{detail=4+Math.cos(theta*84+p.z*12)*1.5;if(diagonal<.16)detail+=14;}
   }else if(p.r>.58){
    const ring=Math.min(Math.abs(p.r-.64),Math.abs(p.r-.69),Math.abs(p.r-.87),Math.abs(p.r-.91));
    if(ring<.006)detail+=13;
    detail+=Math.sin(theta*56+p.r*90)*.7;
    if(p.r>.9&&p.r<.945){const rib=Math.abs(theta/TAU*42-Math.round(theta/TAU*42));if(rib<.07)shade*=.5;}
   }else{shade*=.5;shine*=.2;}
   const value=24+shade*39+shine*100+detail,k=p.offset;
   data[k]=Math.min(255,value*.88);data[k+1]=Math.min(255,value*.96);data[k+2]=Math.min(255,value*1.05);data[k+3]=255;
  }
  context.putImageData(output,0,0);
 }

module.exports={frame,geometry};
