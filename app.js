/* Apna Social - Supabase client configuration */
const SUPABASE_URL = "PASTE_YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "PASTE_YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY";
const configured = SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("PASTE_") && !SUPABASE_ANON_KEY.includes("PASTE_");
const $ = id => document.getElementById(id);
let sb, user, profile, isSignup = true;
const say = (id,msg) => { $(id).textContent = msg || ""; };
if (!configured) $("setupNotice").classList.remove("hidden");
else { sb = window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY); start(); }

async function start(){
  const {data:{session}} = await sb.auth.getSession();
  if(session) await enter(session.user);
  sb.auth.onAuthStateChange((_event,session)=>{ if(session) setTimeout(()=>enter(session.user),0); else showAuth(); });
}
function showAuth(){ $("authView").classList.remove("hidden"); $("appView").classList.add("hidden"); $("tabs").classList.add("hidden"); $("headerUser").textContent=""; }
function toggleAuth(){
 isSignup=!isSignup; $("authTitle").textContent=isSignup?"Create your account":"Welcome back";
 $("authButton").textContent=isSignup?"Sign up":"Login"; $("signupFields").classList.toggle("hidden",!isSignup);
 $("switchAuth").textContent=isSignup?"Already have an account? Login":"New here? Create account"; say("authMessage","");
}
$("switchAuth").onclick=toggleAuth;
$("authButton").onclick=async()=>{
 if(!sb)return; const email=$("email").value.trim(),password=$("password").value;
 if(!email||password.length<8){say("authMessage","Enter a valid email and password of at least 8 characters.");return;}
 $("authButton").disabled=true;
 try{
  if(isSignup){
   const username=$("username").value.trim().toLowerCase();
   if(!$("fullName").value.trim()||! /^[a-z0-9_]{3,24}$/.test(username)) throw Error("Enter your name and a username (3–24 letters, numbers or underscore).");
   const {data,error}=await sb.auth.signUp({email,password,options:{data:{full_name:$("fullName").value.trim(),username,gotra:$("gotra").value.trim()}}});
   if(error) throw error;
   say("authMessage",data.session?"Account created.":"Account created. Verify your email, then log in.");
  }else{const {error}=await sb.auth.signInWithPassword({email,password});if(error)throw error;}
 }catch(e){say("authMessage",e.message)}finally{$("authButton").disabled=false;}
};
$("forgot").onclick=async()=>{if(!sb)return;const email=$("email").value.trim();if(!email){say("authMessage","Enter your email first.");return;}const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});say("authMessage",error?error.message:"Password reset email requested. Check your inbox.");};
async function enter(u){
 user=u; const {data,error}=await sb.from("profiles").select("*").eq("id",u.id).single();
 if(error){showAuth();say("authMessage","Profile not ready. Verify your email and log in again. "+error.message);return;}
 profile=data; $("authView").classList.add("hidden");$("appView").classList.remove("hidden");$("tabs").classList.remove("hidden");
 $("headerUser").textContent="@"+profile.username; $("adminTab").classList.toggle("hidden",profile.role!=="admin");
 $("editName").value=profile.full_name||"";$("editGotra").value=profile.gotra||"";$("editBio").value=profile.bio||"";
 await loadFeed();await loadMyProfile();
}
$("logout").onclick=()=>sb.auth.signOut();
document.querySelectorAll(".tabs button[data-page]").forEach(b=>b.onclick=()=>showPage(b.dataset.page,b));
function showPage(id,btn){["feedPage","searchPage","profilePage","adminPage"].forEach(p=>$(p).classList.add("hidden"));$(id).classList.remove("hidden");document.querySelectorAll(".tabs button[data-page]").forEach(b=>b.classList.toggle("active",b===btn));if(id==="adminPage")loadReports();}
$("publish").onclick=async()=>{const content=$("postText").value.trim();if(!content)return;const {error}=await sb.from("posts").insert({user_id:user.id,content});if(error)alert(error.message);else{$("postText").value="";loadFeed();}};
async function loadFeed(){
 const {data,error}=await sb.from("posts").select("id,user_id,content,created_at,profiles(username,full_name),likes_dislikes(type,user_id),comments(id,comment_text,user_id,created_at,profiles(username))").order("created_at",{ascending:false}).limit(50);
 if(error){$("feed").textContent=error.message;return;}
 $("feed").replaceChildren();(data||[]).forEach(p=>$("feed").append(postCard(p)));
}
function postCard(p){
 const el=document.createElement("article");el.className="post";
 const head=document.createElement("div");head.className="posthead";const who=document.createElement("strong");who.textContent=(p.profiles?.full_name||p.profiles?.username||"User")+" · @"+(p.profiles?.username||"user");const date=document.createElement("small");date.textContent=new Date(p.created_at).toLocaleString();head.append(who,date);
 const body=document.createElement("p");body.className="postcontent";body.textContent=p.content;
 const counts=p.likes_dislikes||[];const likes=counts.filter(x=>x.type==="like").length,dislikes=counts.filter(x=>x.type==="dislike").length;
 const actions=document.createElement("div");actions.className="actions";
 const like=btn("♥ "+likes,()=>react(p.id,"like"));const dislike=btn("👎 "+dislikes,()=>react(p.id,"dislike"),"secondary");const share=btn("Share",()=>sharePost(p),"secondary");const report=btn("Report",()=>reportPost(p.id),"danger");
 actions.append(like,dislike,share,report);
 if(p.user_id===user.id||profile.role==="admin")actions.append(btn("Delete",()=>deletePost(p.id),"danger"));
 const comments=document.createElement("div");comments.style.marginTop="12px";
 (p.comments||[]).forEach(c=>{const line=document.createElement("p");line.style.margin="7px 0";line.textContent="@"+(c.profiles?.username||"user")+": "+c.comment_text;comments.append(line);});
 const box=document.createElement("input");box.placeholder="Write a comment…";const send=btn("Send",async()=>{const t=box.value.trim();if(!t)return;const {error}=await sb.from("comments").insert({post_id:p.id,user_id:user.id,comment_text:t});if(error)alert(error.message);else loadFeed();});
 comments.append(box,send);el.append(head,body,actions,comments);return el;
}
function btn(label,fn,cls=""){const b=document.createElement("button");b.textContent=label;if(cls)b.className=cls;b.onclick=fn;return b;}
async function react(post_id,type){
 const {data:old}=await sb.from("likes_dislikes").select("id,type").eq("post_id",post_id).eq("user_id",user.id).maybeSingle();
 let result;if(old?.type===type)result=await sb.from("likes_dislikes").delete().eq("id",old.id);else if(old)result=await sb.from("likes_dislikes").update({type}).eq("id",old.id);else result=await sb.from("likes_dislikes").insert({post_id,user_id:user.id,type});
 if(result.error)alert(result.error.message);else loadFeed();
}
async function sharePost(p){const url=location.origin+location.pathname+"#post-"+p.id;try{if(navigator.share)await navigator.share({title:"Apna Social post",text:p.content,url});else{await navigator.clipboard.writeText(url);alert("Post link copied.");}}catch(e){}}
async function deletePost(id){if(!confirm("Delete this post?"))return;const {error}=await sb.from("posts").delete().eq("id",id);if(error)alert(error.message);else loadFeed();}
async function reportPost(id){const reason=prompt("Why are you reporting this post?");if(!reason?.trim())return;const {error}=await sb.from("reports").insert({reporter_id:user.id,post_id:id,reason:reason.trim()});alert(error?error.message:"Report submitted.");}
$("searchInput").oninput=async()=>{
 const q=$("searchInput").value.trim().replace(/[,%()]/g,"");if(q.length<2){$("searchResults").replaceChildren();return;}
 const {data,error}=await sb.from("profiles").select("id,username,full_name,gotra,bio").or(`username.ilike.%${q}%,full_name.ilike.%${q}%`).limit(20);
 $("searchResults").replaceChildren();if(error){$("searchResults").textContent=error.message;return;}
 (data||[]).forEach(p=>{const d=document.createElement("div");d.className="panel";const n=document.createElement("strong");n.textContent=(p.full_name||"")+" @"+p.username;const meta=document.createElement("p");meta.className="muted";meta.textContent=[p.gotra,p.bio].filter(Boolean).join(" · ");const b=btn("Follow / Unfollow",()=>follow(p.id),"secondary");d.append(n,meta,b);$("searchResults").append(d);});
};
async function follow(id){
 const {data:old}=await sb.from("follows").select("follower_id").eq("follower_id",user.id).eq("following_id",id).maybeSingle();
 const r=old?await sb.from("follows").delete().eq("follower_id",user.id).eq("following_id",id):await sb.from("follows").insert({follower_id:user.id,following_id:id});
 if(r.error)alert(r.error.message);else alert(old?"Unfollowed":"Following");
}
async function loadMyProfile(){
 const {count:followers}=await sb.from("follows").select("*",{count:"exact",head:true}).eq("following_id",user.id);
 const {count:following}=await sb.from("follows").select("*",{count:"exact",head:true}).eq("follower_id",user.id);
 $("myProfile").replaceChildren();const h=document.createElement("h2");h.textContent=profile.full_name||profile.username;const p=document.createElement("p");p.textContent="@"+profile.username+" · "+(profile.gotra||"");const bio=document.createElement("p");bio.textContent=profile.bio||"";const counts=document.createElement("p");counts.textContent=`${followers||0} followers · ${following||0} following`;const role=document.createElement("span");role.className="pill";role.textContent=profile.role==="admin"?"MASTER ADMIN":"CUSTOMER";$("myProfile").append(h,p,bio,counts,role);
 const {data}=await sb.from("posts").select("id,content,created_at").eq("user_id",user.id).order("created_at",{ascending:false});$("myPosts").replaceChildren();(data||[]).forEach(x=>{const d=document.createElement("div");d.className="post";const t=document.createElement("p");t.textContent=x.content;d.append(t);$("myPosts").append(d);});
}
$("saveProfile").onclick=async()=>{const {error}=await sb.from("profiles").update({full_name:$("editName").value.trim(),gotra:$("editGotra").value.trim(),bio:$("editBio").value.trim()}).eq("id",user.id);if(error)alert(error.message);else{const {data}=await sb.from("profiles").select("*").eq("id",user.id).single();profile=data;loadMyProfile();alert("Profile updated.");}};
async function loadReports(){
 if(profile.role!=="admin")return;const {data,error}=await sb.from("reports").select("id,reason,status,created_at,posts(content),profiles:reporter_id(username)").order("created_at",{ascending:false});
 const box=$("adminReports");box.replaceChildren();if(error){box.textContent=error.message;return;}if(!data?.length){box.textContent="No reports yet.";return;}
 data.forEach(r=>{const d=document.createElement("div");d.className="post";const t=document.createElement("p");t.textContent=`${r.status} · ${r.reason} · ${r.posts?.content||"Post unavailable"}`;const done=btn("Mark reviewed",async()=>{const {error}=await sb.from("reports").update({status:"reviewed"}).eq("id",r.id);if(error)alert(error.message);else loadReports();},"secondary");d.append(t,done);box.append(d);});
}
