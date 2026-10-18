/* Apna Social add-on. Load AFTER app.js. Uses the app's existing global lexical bindings. */
(() => {
  const style = document.createElement("style");
  style.textContent = `
    .apna-avatar{width:76px;height:76px;border-radius:50%;object-fit:cover;background:#ececff;border:2px solid #dedfff;flex:none}
    .apna-avatar-mini{width:38px;height:38px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:8px}
    .apna-profile-row{display:flex;align-items:center;gap:12px;margin-bottom:12px}
    .apna-story-card{min-width:100px;max-width:112px;border:1px solid #e5e9f1;border-radius:15px;padding:8px;background:white;color:#3435a6}
    .apna-story-thumb{width:78px;height:100px;object-fit:cover;border-radius:12px;display:block;margin:0 auto 6px;background:#eee}
    #apnaStoryViewer{position:fixed;inset:0;z-index:99999;background:#090909f5;display:flex;align-items:center;justify-content:center;padding:16px}
    #apnaStoryViewer[hidden]{display:none}
    #apnaStoryStage{height:86vh;width:min(100%,480px);display:flex;align-items:center;justify-content:center}
    #apnaStoryStage img,#apnaStoryStage video{max-width:100%;max-height:100%;object-fit:contain;border-radius:12px}
    #apnaStoryTop{position:absolute;top:18px;left:18px;right:18px;color:white;display:flex;justify-content:space-between;align-items:center}
    #apnaStoryClose{background:#ffffff30;color:white;font-size:24px}
    #logout{display:none!important}
  `;
  document.head.append(style);

  const viewer=document.createElement("div");
  viewer.id="apnaStoryViewer";viewer.hidden=true;
  viewer.innerHTML='<div id="apnaStoryTop"><strong id="apnaStoryName"></strong><button id="apnaStoryClose" type="button">×</button></div><div id="apnaStoryStage"></div>';
  document.body.append(viewer);
  const closeStory=()=>{viewer.hidden=true;document.getElementById("apnaStoryStage").replaceChildren();};
  document.getElementById("apnaStoryClose").onclick=closeStory;
  viewer.addEventListener("click",e=>{if(e.target===viewer)closeStory();});
  const showStory=s=>{
    document.getElementById("apnaStoryName").textContent="@"+(s.username||"user");
    const stage=document.getElementById("apnaStoryStage");
    stage.replaceChildren();
    const m=document.createElement(s.media_type==="video"?"video":"img");
    m.src=s.media_url;
    if(s.media_type==="video"){m.controls=true;m.autoplay=true;m.playsInline=true;}else m.alt="Story";
    stage.append(m);viewer.hidden=false;
  };

  // Replace ambiguous PostgREST embedded profiles with independent profile lookup.
  getPosts = async function(publicOnly=false){
    let q=sb.from("posts").select("id,user_id,content,media_url,media_type,created_at,likes_dislikes(type,user_id),comments(id,comment_text,user_id,created_at)")
      .order("created_at",{ascending:false}).limit(40);
    if(!publicOnly)q=q.in("user_id",await idsFollowing());
    const {data,error}=await q;if(error)throw error;
    const posts=data||[];
    const ids=[...new Set(posts.flatMap(p=>[p.user_id,...(p.comments||[]).map(c=>c.user_id)]).filter(Boolean))];
    const byId={};
    if(ids.length){
      const {data:ps,error:pe}=await sb.from("profiles").select("id,username,full_name,avatar_url").in("id",ids);
      if(pe)throw pe;(ps||[]).forEach(p=>byId[p.id]=p);
    }
    return posts.map(p=>({...p,profiles:byId[p.user_id]||{},comments:(p.comments||[]).map(c=>({...c,profiles:byId[c.user_id]||{}}))}));
  };

  // Story preview cards and same-page viewer.
  loadStories = async function(){
    const {data,error}=await sb.from("stories").select("id,user_id,media_url,media_type,expires_at,created_at")
      .gt("expires_at",new Date().toISOString()).order("created_at",{ascending:false}).limit(40);
    const list=$("stories");list.replaceChildren();
    if(error){list.textContent=error.message;return;}
    const rows=data||[],ids=[...new Set(rows.map(s=>s.user_id))],names={};
    if(ids.length){
      const {data:ps,error:pe}=await sb.from("profiles").select("id,username").in("id",ids);
      if(pe){list.textContent=pe.message;return;}(ps||[]).forEach(p=>names[p.id]=p.username);
    }
    rows.forEach(s=>{
      const card=document.createElement("button");card.type="button";card.className="apna-story-card";
      const thumb=document.createElement(s.media_type==="video"?"video":"img");
      thumb.className="apna-story-thumb";thumb.src=s.media_url;
      if(s.media_type==="video"){thumb.muted=true;thumb.playsInline=true;thumb.preload="metadata";}
      else thumb.alt="Story preview";
      const label=document.createElement("small");label.textContent="@"+(names[s.user_id]||"user");
      card.append(thumb,label);card.onclick=()=>showStory({...s,username:names[s.user_id]});list.append(card);
    });
  };

  // Profile photo uploader for every authenticated user.
  const profilePage=$("profilePage");
  const editPanel=$("saveProfile")?.closest(".panel");
  if(editPanel&&!$("apnaPhotoPanel")){
    const photoPanel=document.createElement("div");photoPanel.id="apnaPhotoPanel";photoPanel.className="panel";
    photoPanel.innerHTML='<h3>Profile photo</h3><div id="apnaPhotoPreview"></div><input id="apnaPhotoFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif"><div class="row"><button id="apnaPhotoUpload" type="button">Upload / Change photo</button><button id="apnaPhotoRemove" type="button" class="secondary">Remove</button></div><p id="apnaPhotoMsg" class="muted"></p>';
    editPanel.before(photoPanel);
    $("apnaPhotoUpload").onclick=async()=>{
      const f=$("apnaPhotoFile").files[0];
      if(!f){$("apnaPhotoMsg").textContent="Pehle image choose karo.";return;}
      if(!f.type.startsWith("image/")){$("apnaPhotoMsg").textContent="Image file choose karo.";return;}
      if(f.size>5*1024*1024){$("apnaPhotoMsg").textContent="Maximum image size 5 MB hai.";return;}
      const ext=(f.name.split(".").pop()||"jpg").replace(/[^a-z0-9]/gi,"").toLowerCase();
      const path=`${user.id}/avatars/profile-${Date.now()}.${ext}`;
      $("apnaPhotoMsg").textContent="Uploading…";
      const {error:upErr}=await sb.storage.from("apna-media").upload(path,f,{upsert:true,contentType:f.type});
      if(upErr){$("apnaPhotoMsg").textContent=upErr.message;return;}
      const {data:pub}=sb.storage.from("apna-media").getPublicUrl(path);
      const {error}=await sb.from("profiles").update({avatar_url:pub.publicUrl}).eq("id",user.id);
      $("apnaPhotoMsg").textContent=error?error.message:"Profile photo updated.";
      if(!error){await loadProfile();await addProfilePhotoPreview();}
    };
    $("apnaPhotoRemove").onclick=async()=>{
      const {error}=await sb.from("profiles").update({avatar_url:null}).eq("id",user.id);
      $("apnaPhotoMsg").textContent=error?error.message:"Profile photo removed.";
      if(!error){await loadProfile();await addProfilePhotoPreview();}
    };
  }
  async function addProfilePhotoPreview(){
    if(!user)return;
    const {data,error}=await sb.from("profiles").select("avatar_url").eq("id",user.id).single();
    if(error)return;
    const box=$("apnaPhotoPreview");box.replaceChildren();
    if(data.avatar_url){const img=document.createElement("img");img.className="apna-avatar";img.src=data.avatar_url;img.alt="Your profile photo";box.append(img);}
    else box.textContent="No profile photo yet.";
    const own=$("myProfile");
    let row=own.querySelector(".apna-profile-row");
    if(!row){row=document.createElement("div");row.className="apna-profile-row";own.prepend(row);}
    row.replaceChildren();
    if(data.avatar_url){const img=document.createElement("img");img.className="apna-avatar";img.src=data.avatar_url;img.alt="Profile photo";row.append(img);}
  }

  // Add profile pictures to rendered feed posts using post author usernames.
  function decoratePostPhotos(container){
    if(!container)return;
    container.querySelectorAll(".post").forEach(post=>{
      const name=post.querySelector(".posthead strong");if(!name||name.querySelector("img"))return;
      const m=name.textContent.match(/@([a-z0-9_]+)/i);if(!m)return;
      sb.from("profiles").select("avatar_url").eq("username",m[1]).maybeSingle().then(({data})=>{
        if(data?.avatar_url&&!name.querySelector("img")){
          const img=document.createElement("img");img.className="apna-avatar-mini";img.src=data.avatar_url;img.alt="Profile photo";name.prepend(img);
        }
      });
    });
  }
  const oldFeed=loadFeed;
  loadFeed=async function(){await oldFeed();decoratePostPhotos($("feed"));};
  const oldExplore=loadExplore;
  loadExplore=async function(){await oldExplore();decoratePostPhotos($("exploreFeed"));};

  // Add a Logout control inside Profile settings; remove it from bottom nav.
  const logout=$("logout");if(logout)logout.style.display="none";
  if(profilePage&&!$("apnaAccountSettings")){
    const panel=document.createElement("div");panel.id="apnaAccountSettings";panel.className="panel";
    panel.innerHTML='<h3>Account settings</h3><p class="muted">Sign out from this device.</p>';
    const btn=document.createElement("button");btn.className="danger";btn.textContent="Logout";
    btn.onclick=async()=>{const {error}=await sb.auth.signOut({scope:"local"});if(error)alert(error.message);};
    panel.append(btn);profilePage.append(panel);
  }

  // Wrap profile loading so the preview refreshes after navigation/profile edits.
  const oldProfile=loadProfile;
  loadProfile=async function(){await oldProfile();await addProfilePhotoPreview();};
  if(user){loadStories();loadFeed();loadExplore();loadProfile();}
})();