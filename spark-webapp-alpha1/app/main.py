import os, json, uuid, datetime, io, ipaddress, socket
from urllib.parse import urlparse, urljoin
from typing import Any, Dict, List
import httpx
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from .store import Store

app = FastAPI(title="SPARK Alpha 1")
store = Store()
_cached_openai_key = None
_openai_secret_error = ""
MAX_REMOTE_BYTES = 10 * 1024 * 1024
MAX_LESSON_CHARS = 120000

DISCOVERY_INSTRUCTIONS = """You are SPARK's discovery stage. Given an existing lesson/activity, first reconstruct what students already do and what reasoning is already present. Then generate candidate reasoning moments liberally. Criticize each candidate for redundancy, genericness, grounding, lesson evidence, consequentiality, feasibility, time burden, dependencies, and duplication. Surface at most five defensible moments. Zero is valid. Do not redesign the lesson yet. Return JSON only."""
DESIGN_INSTRUCTIONS = """You are SPARK's develop stage. Use only the educator-selected moments plus the educator's constraints and further input. Create concrete teacher-usable strengthening for those moments while preserving the existing lesson unless change is necessary. Make the adaptation to educator constraints explicit. Return JSON only."""

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def openai_key():
    global _cached_openai_key, _openai_secret_error
    env_key=os.getenv("OPENAI_API_KEY", "").strip()
    if env_key:
        return env_key
    if _cached_openai_key:
        return _cached_openai_key
    secret_id=os.getenv("OPENAI_SECRET_ID", "").strip()
    if not secret_id:
        return ""
    try:
        import boto3
        secret=boto3.client("secretsmanager").get_secret_value(SecretId=secret_id).get("SecretString","").strip()
        if secret.startswith("{"):
            parsed=json.loads(secret)
            secret=(parsed.get("OPENAI_API_KEY") or parsed.get("api_key") or parsed.get("key") or "").strip()
        _cached_openai_key=secret
        return secret
    except Exception as e:
        _openai_secret_error=f"{type(e).__name__}: {str(e)[:300]}"
        return ""

def cfg():
    return {
        "key": openai_key(),
        "model": os.getenv("OPENAI_MODEL", "gpt-5.6-sol"),
        "url": os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    }

def call_model(instructions: str, prompt: str) -> Dict[str, Any]:
    c=cfg()
    if not c["key"]:
        raise HTTPException(503, "OPENAI_API_KEY is not configured.")
    payload={"model":c["model"],"instructions":instructions,"input":prompt,
             "text":{"format":{"type":"json_object"}}}
    with httpx.Client(timeout=120) as client:
        r=client.post(c["url"]+"/responses",headers={"Authorization":"Bearer "+c["key"],"Content-Type":"application/json"},json=payload)
    if r.status_code>=400:
        raise HTTPException(502, "Model call failed: "+r.text[:800])
    data=r.json()
    chunks=[]
    for item in data.get("output",[]):
        if item.get("type")=="message":
            for part in item.get("content",[]):
                if part.get("type") in ("output_text","text") and part.get("text"):
                    chunks.append(part["text"])
    text="\n".join(chunks) or data.get("output_text","")
    try:
        return json.loads(text)
    except Exception:
        raise HTTPException(502, "Model did not return valid JSON.")

def extract_text(name: str, content: bytes) -> str:
    ext=(name or "").lower().rsplit(".",1)[-1] if "." in (name or "") else ""
    if ext in ("txt","md","csv"):
        return content.decode("utf-8",errors="replace")
    if ext=="pdf":
        from pypdf import PdfReader
        return "\n\n".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(content)).pages)
    if ext=="docx":
        from docx import Document
        return "\n".join(p.text for p in Document(io.BytesIO(content)).paragraphs)
    raise HTTPException(400,"Supported: PDF, DOCX, TXT, MD, CSV")

def _validate_public_url(url: str):
    parsed=urlparse(url)
    if parsed.scheme not in ("http","https") or not parsed.hostname:
        raise HTTPException(400,"Lesson URL must be a valid http:// or https:// URL.")
    host=parsed.hostname.lower()
    if host in ("localhost","localhost.localdomain") or host.endswith(".local"):
        raise HTTPException(400,"Private/local URLs are not supported.")
    try:
        infos=socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme=="https" else 80), type=socket.SOCK_STREAM)
    except socket.gaierror:
        raise HTTPException(400,"Lesson URL hostname could not be resolved.")
    for info in infos:
        ip=ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            raise HTTPException(400,"Private, loopback, link-local, and reserved network URLs are not supported.")

def fetch_url_text(source_url: str):
    current=source_url.strip()
    headers={"User-Agent":"SPARK-Alpha1/1.0 (+educator lesson analysis)"}
    with httpx.Client(timeout=httpx.Timeout(20.0, read=40.0), follow_redirects=False, headers=headers) as client:
        for _ in range(6):
            _validate_public_url(current)
            with client.stream("GET",current) as r:
                if 300 <= r.status_code < 400 and r.headers.get("location"):
                    current=urljoin(current,r.headers["location"])
                    continue
                if r.status_code >= 400:
                    raise HTTPException(400,f"Could not retrieve lesson URL (HTTP {r.status_code}).")
                body=bytearray()
                for chunk in r.iter_bytes():
                    body.extend(chunk)
                    if len(body)>MAX_REMOTE_BYTES:
                        raise HTTPException(400,"Lesson URL content is too large (10 MB maximum).")
                content=bytes(body)
                content_type=(r.headers.get("content-type") or "").split(";")[0].lower().strip()
            break
        else:
            raise HTTPException(400,"Lesson URL redirected too many times.")

    path=(urlparse(current).path or "").lower()
    if content_type=="application/pdf" or path.endswith(".pdf"):
        text=extract_text("remote.pdf",content)
    elif content_type in ("application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/msword") or path.endswith(".docx"):
        text=extract_text("remote.docx",content)
    elif content_type.startswith("text/html") or path.endswith((".html",".htm")) or not content_type:
        from bs4 import BeautifulSoup
        soup=BeautifulSoup(content,"html.parser")
        for tag in soup(["script","style","noscript","svg"]):
            tag.decompose()
        root=soup.find("main") or soup.find("article") or soup.body or soup
        text=root.get_text("\n",strip=True)
    elif content_type.startswith("text/"):
        text=content.decode("utf-8",errors="replace")
    else:
        raise HTTPException(400,f"Unsupported lesson URL content type: {content_type or 'unknown'}.")
    text=text.strip()
    if not text:
        raise HTTPException(400,"No readable lesson text was found at that URL.")
    return text[:MAX_LESSON_CHARS], current, content_type

class DesignRequest(BaseModel):
    selected_ids: List[str]
    constraints: str=""
    educator_input: str=""

class FeedbackRequest(BaseModel):
    moment_id: str
    rating: str
    comment: str=""

HTML="""<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>
<title>SPARK Alpha 1</title><style>
body{font-family:system-ui;margin:0;background:#faf9f6;color:#191919}.wrap{max-width:900px;margin:auto;padding:36px 20px}
.card{background:white;border:1px solid #ddd;border-radius:16px;padding:22px;margin:16px 0}h1{font-size:42px;line-height:1.05}
label{display:block;font-weight:650;margin:12px 0}input,textarea{width:100%;box-sizing:border-box;padding:10px;border:1px solid #ccc;border-radius:8px;margin-top:5px}
button{border:0;border-radius:999px;background:#4f2d7f;color:white;padding:11px 16px;font-weight:750;cursor:pointer}
.moment{border:1px solid #ddd;border-radius:12px;padding:16px;margin:10px 0}.muted{color:#666}.hidden{display:none}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
pre{white-space:pre-wrap;background:#111;color:#eee;padding:14px;border-radius:10px;overflow:auto}@media(max-width:700px){.grid{grid-template-columns:1fr}}
</style></head><body><main class='wrap'><div class='muted'>SPARK · ALPHA 1</div><h1>Uncover worthwhile reasoning opportunities</h1>
<p>Existing lesson → discover moments → educator selects → develop selected moments.</p>
<section class='card'><h2>1. Lesson</h2><form id='f'><div class='grid'>
<label>Lesson name<input name='lesson_name'></label><label>Grade/course<input name='grade_course'></label>
<label>Duration<input name='duration'></label><label>Objective<input name='objective'></label></div>
<label>Lesson URL<input type='url' name='source_url' placeholder='https://...'></label>
<label>Or upload<input type='file' name='file' accept='.pdf,.docx,.txt,.md,.csv'></label>
<label>Or paste lesson<textarea name='pasted_text' rows='9'></textarea></label>
<label>Anything SPARK should know?<textarea name='educator_input' rows='3'></textarea></label>
<button>Uncover opportunities</button><p id='s' class='muted'></p></form></section>
<section id='r' class='card hidden'><h2>2. SPARK's reading</h2><div id='map'></div><details><summary>Discovery trace</summary><pre id='trace'></pre></details></section>
<section id='m' class='card hidden'><h2>3. Choose moments</h2><div id='moments'></div>
<div class='grid'><label>Constraints<textarea id='constraints' rows='4'></textarea></label><label>Further input<textarea id='more' rows='4'></textarea></label></div>
<button id='develop'>Develop selected moments</button><p id='ds' class='muted'></p></section>
<section id='d' class='card hidden'><h2>4. Customized strengthening</h2><div id='design'></div></section></main>
<script>
let session=null,selected=new Set(),discovery=null;
const esc=x=>String(x??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
document.getElementById('f').onsubmit=async e=>{e.preventDefault();s.textContent='Analyzing...';let fd=new FormData(e.target);
let res=await fetch('/api/discover',{method:'POST',body:fd});let data=await res.json();if(!res.ok){s.textContent=data.detail||'Failed';return}
session=data.session_id;discovery=data.discovery;s.textContent='Done';r.classList.remove('hidden');m.classList.remove('hidden');
map.innerHTML='<p><b>Goal:</b> '+esc(data.discovery.activity_map?.instructional_goal)+'</p><p>'+esc(data.discovery.activity_map?.summary)+'</p>';
trace.textContent=JSON.stringify({activity_map:data.discovery.activity_map,candidates:data.discovery.candidates},null,2);
moments.innerHTML=(data.discovery.surfaced_moments||[]).map(x=>'<div class="moment"><label><input type="checkbox" data-id="'+esc(x.id)+'"> <b>'+esc(x.title)+'</b></label><p><b>Moment:</b> '+esc(x.location)+'</p><p><b>Now:</b> '+esc(x.what_students_do_now)+'</p><p><b>Opportunity:</b> '+esc(x.reasoning_opportunity)+'</p><p><b>Why:</b> '+esc(x.why_worthwhile)+'</p><p class="muted"><b>Evidence:</b> '+esc(x.lesson_evidence)+'</p><p class="muted"><b>Burden:</b> '+esc(x.estimated_burden)+'</p></div>').join('');
document.querySelectorAll('[data-id]').forEach(cb=>cb.onchange=()=>cb.checked?selected.add(cb.dataset.id):selected.delete(cb.dataset.id));};
develop.onclick=async()=>{if(!selected.size){ds.textContent='Select at least one moment.';return}ds.textContent='Developing...';
let res=await fetch('/api/session/'+session+'/design',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({selected_ids:[...selected],constraints:constraints.value,educator_input:more.value})});
let data=await res.json();if(!res.ok){ds.textContent=data.detail||'Failed';return}ds.textContent='Done';d.classList.remove('hidden');design.innerHTML=(data.designs||[]).map(x=>'<div class="moment"><h3>'+esc(x.teacher_facing_title)+'</h3><p><b>Placement:</b> '+esc(x.placement)+'</p><p><b>Student task:</b> '+esc(x.student_task)+'</p><p><b>Estimated time:</b> '+esc(x.estimated_time)+'</p><p><b>Reasoning target:</b> '+esc(x.reasoning_target)+'</p><p><b>Constraint adaptation:</b> '+esc(x.adaptation_to_constraints)+'</p></div>').join('');};
</script></body></html>"""

@app.get("/",response_class=HTMLResponse)
def root():
    return HTML

@app.get("/health")
def health():
    c=cfg()
    return {
        "ok":True,
        "storage":store.health(),
        "model":c["model"],
        "has_api_key":bool(c["key"]),
        "openai_secret_id":os.getenv("OPENAI_SECRET_ID",""),
        "openai_secret_error":_openai_secret_error if not c["key"] else ""
    }

@app.post("/api/discover")
async def discover(
    lesson_name: str=Form(""), grade_course: str=Form(""), duration: str=Form(""),
    objective: str=Form(""), educator_input: str=Form(""), pasted_text: str=Form(""),
    source_url: str=Form(""), file: UploadFile|None=File(None)
):
    session_id=str(uuid.uuid4())
    file_name=""
    file_bytes=b""
    lesson_text=pasted_text.strip()
    fetched_url=""
    fetched_content_type=""
    if source_url.strip():
        remote_text,fetched_url,fetched_content_type=fetch_url_text(source_url)
        lesson_text=(lesson_text+"\n\n"+remote_text).strip()
    if file and file.filename:
        file_name=file.filename
        file_bytes=await file.read()
        extracted=extract_text(file_name,file_bytes)
        lesson_text=(lesson_text+"\n\n"+extracted).strip()
    if not lesson_text:
        raise HTTPException(400,"Provide a lesson URL, upload a file, or paste a lesson/activity.")
    lesson_text=lesson_text[:MAX_LESSON_CHARS]
    metadata={"lesson_name":lesson_name,"grade_course":grade_course,"duration":duration,"objective":objective,"educator_input":educator_input,"file_name":file_name,"source_url":source_url.strip(),"resolved_url":fetched_url,"source_content_type":fetched_content_type,"created_at":now()}
    store.create_session(session_id,metadata,lesson_text)
    if file_bytes:
        store.store_upload(session_id,file_name,file_bytes)
    store.event(session_id,"INPUT_CAPTURED",{"metadata":metadata,"lesson_chars":len(lesson_text),"source_modes":{"url":bool(source_url.strip()),"upload":bool(file_bytes),"pasted":bool(pasted_text.strip())}})
    prompt=json.dumps({"lesson":lesson_text,"context":metadata},ensure_ascii=False)
    discovery=call_model(DISCOVERY_INSTRUCTIONS,prompt)
    store.event(session_id,"ACTIVITY_UNDERSTANDING",discovery.get("activity_map",{}))
    store.event(session_id,"CANDIDATE_MOMENTS",discovery.get("candidates",[]))
    store.event(session_id,"SURFACED_MOMENTS",discovery.get("surfaced_moments",[]))
    store.update_session(session_id,{"discovery":discovery})
    return {"session_id":session_id,"discovery":discovery}

@app.post("/api/session/{session_id}/design")
def design(session_id: str, req: DesignRequest):
    session=store.get_session(session_id)
    if not session: raise HTTPException(404,"Unknown session")
    discovery=session.get("discovery") or {}
    surfaced={m.get("id"):m for m in discovery.get("surfaced_moments",[])}
    chosen=[surfaced[i] for i in req.selected_ids if i in surfaced]
    if not chosen: raise HTTPException(400,"No valid surfaced moments selected.")
    selection={"selected_ids":req.selected_ids,"constraints":req.constraints,"educator_input":req.educator_input}
    store.event(session_id,"EDUCATOR_SELECTION",selection)
    prompt=json.dumps({"lesson_text":session.get("lesson_text",""),"selected_moments":chosen,"constraints":req.constraints,"educator_input":req.educator_input},ensure_ascii=False)
    result=call_model(DESIGN_INSTRUCTIONS,prompt)
    store.event(session_id,"DEVELOPED_OUTPUT",result)
    store.update_session(session_id,{"selection":selection,"developed_output":result})
    return result

@app.post("/api/session/{session_id}/feedback")
def feedback(session_id: str, req: FeedbackRequest):
    store.event(session_id,"USER_FEEDBACK",req.model_dump())
    return {"ok":True}

try:
    from mangum import Mangum
    handler=Mangum(app)
except Exception:
    handler=None
