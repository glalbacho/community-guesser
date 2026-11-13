// Package only browser assets. Never publish src/server or the functions source as static files.
import {cp,mkdir,rm,copyFile} from "node:fs/promises";
await rm("dist",{recursive:true,force:true});
await mkdir("dist",{recursive:true});
for(const directory of ["assets","css"]){
  await cp(directory,"dist/"+directory,{recursive:true});
}
await mkdir("dist/js",{recursive:true});
for(const file of ["js/episodes.js","js/game.js","index.html","_routes.json"]){
  await copyFile(file,"dist/"+file);
}
