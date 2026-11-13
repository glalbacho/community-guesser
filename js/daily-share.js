// Spoiler-free share card for five independent episode-identification rounds.
window.COMMUNITY_DAILY_SHARE = function(date,answers,url) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||
     !Array.isArray(answers)||answers.length!==5||
     !answers.every(value=>typeof value==="boolean")||
     typeof url!=="string"||!/^https?:\/\//.test(url))
    throw new Error("Invalid Daily Challenge result.");
  const correct=answers.filter(Boolean).length;
  const rounds=answers.map((won,index)=>
    "Round "+(index+1)+": "+(won?"✅ Correct":"❌ Missed")).join("\n");
  return "🎬 Community Guesser · Daily Challenge\n"
    + date+" · "+correct+"/5 episodes recognized\n\n"
    + rounds+"\n\n"
    + "Can you beat my score? No episode spoilers!\n"
    + url;
};
