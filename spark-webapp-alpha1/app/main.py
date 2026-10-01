import os, json, uuid, datetime, io, ipaddress, socket, time, hmac
from urllib.parse import urlparse, urljoin
from typing import Any, Dict, List
import httpx
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Header
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from .store import Store

app = FastAPI(title="SPARK Alpha 1")
store = Store()
_cached_openai_key = None
_openai_secret_error = ""
_cached_research_token = None
DISCOVERY_PROMPT_VERSION = "discover-0.2"
DESIGN_PROMPT_VERSION = "develop-0.1"
SCHEMA_VERSION = "spark-alpha1-0.2"
MAX_REMOTE_BYTES = 10 * 1024 * 1024
MAX_LESSON_CHARS = 120000

DISCOVERY_INSTRUCTIONS = """You are SPARK's discovery stage. Your distinctive job is not to add generic critical-thinking prompts. It is to uncover a small number of consequential reasoning opportunities that the existing lesson does not already substantially require and that an educator could plausibly miss.

First reconstruct the lesson faithfully: goal, sequence, what students actually do, reasoning already present, constraints, and missing materials. Generate a broad internal candidate set across uncertainty, competing explanations, assumptions, evidence quality, consequential choices, tradeoffs, representation limits, prediction, calibration, and revision.

For every candidate apply a strict critic:
1. NEWNESS: Is the intellectual move materially different from reasoning already required, rather than merely making an implicit instruction more explicit or adding terminology?
2. CONSEQUENCE: Would the judgment change what students conclude, choose, revise, investigate, or attend to?
3. TEACHER VALUE: Is this something a competent teacher might not already notice or enact from the lesson as written?
4. GROUNDING: Can the opportunity be located in a specific existing lesson moment and supported by available lesson evidence?
5. FEASIBILITY: Can it fit the lesson with low or proportionate burden and without unavailable resources?
6. DISTINCTNESS: Does it add a different reasoning demand from the other surfaced moments?

Reject candidates that are generic, redundant, mainly procedural, merely 'explain your answer', dependent on missing content, or mostly restate an existing task. Do not surface an idea just because it is good pedagogy.

Aim for THREE surfaced moments when three clearly clear this bar. Use four or five only when each additional moment is independently strong and distinct. Fewer than three, including zero, is valid. Preserve all candidates and rejection rationales for research. Do not redesign the lesson yet. Return JSON only."""
DESIGN_INSTRUCTIONS = """You are SPARK's develop stage. Use only the educator-selected moments plus the educator's constraints and further input. Create concrete teacher-usable strengthening for those moments while preserving the existing lesson unless change is necessary. Make the adaptation to educator constraints explicit. Return JSON only."""

DISCOVERY_SCHEMA = {
    "type":"object",
    "additionalProperties":False,
    "properties":{
        "activity_map":{
            "type":"object","additionalProperties":False,
            "properties":{
                "instructional_goal":{"type":"string"},
                "student_sequence":{"type":"array","items":{"type":"string"}},
                "existing_reasoning":{"type":"array","items":{"type":"string"}},
                "constraints":{"type":"array","items":{"type":"string"}},
                "summary":{"type":"string"}
            },
            "required":["instructional_goal","student_sequence","existing_reasoning","constraints","summary"]
        },
        "candidates":{
            "type":"array",
            "items":{
                "type":"object","additionalProperties":False,
                "properties":{
                    "id":{"type":"string"},
                    "location":{"type":"string"},
                    "current_task":{"type":"string"},
                    "reasoning_gap":{"type":"string"},
                    "proposed_judgment":{"type":"string"},
                    "evidence_from_lesson":{"type":"string"},
                    "novelty_check":{"type":"string"},
                    "estimated_burden":{"type":"string"},
                    "decision":{"type":"string","enum":["surface","reject"]},
                    "decision_reason":{"type":"string"}
                },
                "required":["id","location","current_task","reasoning_gap","proposed_judgment","evidence_from_lesson","novelty_check","estimated_burden","decision","decision_reason"]
            }
        },
        "surfaced_moments":{
            "type":"array","maxItems":5,
            "items":{
                "type":"object","additionalProperties":False,
                "properties":{
                    "id":{"type":"string"},
                    "title":{"type":"string"},
                    "location":{"type":"string"},
                    "what_students_do_now":{"type":"string"},
                    "reasoning_opportunity":{"type":"string"},
                    "why_worthwhile":{"type":"string"},
                    "what_makes_it_new":{"type":"string"},
                    "lesson_evidence":{"type":"string"},
                    "estimated_burden":{"type":"string"},
                    "uncertainties":{"type":"array","items":{"type":"string"}}
                },
                "required":["id","title","location","what_students_do_now","reasoning_opportunity","why_worthwhile","what_makes_it_new","lesson_evidence","estimated_burden","uncertainties"]
            }
        }
    },
    "required":["activity_map","candidates","surfaced_moments"]
}

DESIGN_SCHEMA = {
    "type":"object",
    "additionalProperties":False,
    "properties":{
        "designs":{
            "type":"array",
            "items":{
                "type":"object","additionalProperties":False,
                "properties":{
                    "moment_id":{"type":"string"},
                    "teacher_facing_title":{"type":"string"},
                    "placement":{"type":"string"},
                    "student_task":{"type":"string"},
                    "teacher_moves":{"type":"array","items":{"type":"string"}},
                    "materials_or_changes":{"type":"array","items":{"type":"string"}},
                    "estimated_time":{"type":"string"},
                    "adaptation_to_constraints":{"type":"string"},
                    "reasoning_target":{"type":"string"},
                    "success_indicators":{"type":"array","items":{"type":"string"}},
                    "cautions":{"type":"array","items":{"type":"string"}}
                },
                "required":["moment_id","teacher_facing_title","placement","student_task","teacher_moves","materials_or_changes","estimated_time","adaptation_to_constraints","reasoning_target","success_indicators","cautions"]
            }
        },
        "integration_notes":{"type":"array","items":{"type":"string"}}
    },
    "required":["designs","integration_notes"]
}

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
            if isinstance(parsed, dict):
                for name in ("OPENAI_API_KEY","openai_api_key","OpenAIApiKey","OpenAIApiKey2","api_key","apikey","key","value"):
                    value=parsed.get(name)
                    if isinstance(value,str) and value.strip():
                        secret=value.strip()
                        break
                else:
                    values=[v.strip() for v in parsed.values() if isinstance(v,str) and v.strip()]
                    secret=values[0] if len(values)==1 else ""
            else:
                secret=""
        if not secret:
            _openai_secret_error="Secret retrieved, but no API key value was found."
            return ""
        _cached_openai_key=secret
        _openai_secret_error=""
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

def research_token():
    global _cached_research_token
    env=os.getenv("SPARK_RESEARCH_TOKEN","").strip()
    if env:
        return env
    if _cached_research_token:
        return _cached_research_token
    secret_id=os.getenv("RESEARCH_SECRET_ID","").strip()
    if not secret_id:
        return ""
    try:
        import boto3
        secret=boto3.client("secretsmanager").get_secret_value(SecretId=secret_id).get("SecretString","").strip()
        if secret.startswith("{"):
            parsed=json.loads(secret)
            if isinstance(parsed,dict):
                for name in ("SPARK_RESEARCH_TOKEN","research_token","token","value"):
                    v=parsed.get(name)
                    if isinstance(v,str) and v.strip():
                        secret=v.strip()
                        break
                else:
                    vals=[v.strip() for v in parsed.values() if isinstance(v,str) and v.strip()]
                    secret=vals[0] if len(vals)==1 else ""
        _cached_research_token=secret
        return secret
    except Exception:
        return ""

def require_research(provided: str):
    expected=research_token()
    if not expected:
        raise HTTPException(503,"Research API token is not configured.")
    if not provided or not hmac.compare_digest(provided,expected):
        raise HTTPException(401,"Invalid research API token.")

def call_model(instructions: str, prompt: str, schema_name: str, schema: Dict[str, Any], prompt_version: str, reasoning_effort: str="low", max_output_tokens: int=8000):
    c=cfg()
    if not c["key"]:
        raise HTTPException(503, "OPENAI_API_KEY is not configured.")
    payload={
        "model":c["model"],
        "instructions":instructions,
        "input":prompt,
        "reasoning":{"effort":reasoning_effort},
        "max_output_tokens":max_output_tokens,
        "text":{
            "format":{
                "type":"json_schema",
                "name":schema_name,
                "strict":True,
                "schema":schema
            }
        }
    }
    started=time.perf_counter()
    with httpx.Client(timeout=120) as client:
        r=client.post(c["url"]+"/responses",headers={"Authorization":"Bearer "+c["key"],"Content-Type":"application/json"},json=payload)
    latency_ms=round((time.perf_counter()-started)*1000)
    request_id=r.headers.get("x-request-id","")
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
        parsed=json.loads(text)
    except Exception:
        raise HTTPException(502, "Model did not return valid structured JSON.")
    usage=data.get("usage") or {}
    telemetry={
        "model":c["model"],
        "prompt_version":prompt_version,
        "schema_name":schema_name,
        "reasoning_effort":reasoning_effort,
        "max_output_tokens":max_output_tokens,
        "schema_version":SCHEMA_VERSION,
        "latency_ms":latency_ms,
        "request_id":request_id,
        "response_id":data.get("id",""),
        "input_tokens":usage.get("input_tokens"),
        "output_tokens":usage.get("output_tokens"),
        "reasoning_tokens":(usage.get("output_tokens_details") or {}).get("reasoning_tokens"),
        "total_tokens":usage.get("total_tokens"),
        "status":"ok"
    }
    return parsed, telemetry

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
moments.innerHTML=(data.discovery.surfaced_moments||[]).map(x=>'<div class="moment"><label><input type="checkbox" data-id="'+esc(x.id)+'"> <b>'+esc(x.title)+'</b></label><p><b>Moment:</b> '+esc(x.location)+'</p><p><b>Now:</b> '+esc(x.what_students_do_now)+'</p><p><b>Opportunity:</b> '+esc(x.reasoning_opportunity)+'</p><p><b>Why:</b> '+esc(x.why_worthwhile)+'</p><p><b>New because:</b> '+esc(x.what_makes_it_new)+'</p><p class="muted"><b>Evidence:</b> '+esc(x.lesson_evidence)+'</p><p class="muted"><b>Burden:</b> '+esc(x.estimated_burden)+'</p></div>').join('');
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
        "openai_secret_error":_openai_secret_error if not c["key"] else "",
        "research_api_configured":bool(os.getenv("RESEARCH_SECRET_ID","") or os.getenv("SPARK_RESEARCH_TOKEN",""))
    }

@app.get("/health/drive")
def health_drive():
    return store.test_drive_connection()

@app.get("/health/drive/write")
def health_drive_write():
    return store.test_drive_write()

@app.post("/api/discover")
async def discover(
    lesson_name: str=Form(""), grade_course: str=Form(""), duration: str=Form(""),
    objective: str=Form(""), educator_input: str=Form(""), pasted_text: str=Form(""),
    source_url: str=Form(""), file: UploadFile|None=File(None)
):
    run_started=time.perf_counter()
    session_id=str(uuid.uuid4())
    url_fetch_extract_ms=0
    file_extract_ms=0
    file_name=""
    file_bytes=b""
    lesson_text=pasted_text.strip()
    fetched_url=""
    fetched_content_type=""
    if source_url.strip():
        stage=time.perf_counter()
        remote_text,fetched_url,fetched_content_type=fetch_url_text(source_url)
        url_fetch_extract_ms=round((time.perf_counter()-stage)*1000)
        lesson_text=(lesson_text+"\n\n"+remote_text).strip()
    if file and file.filename:
        file_name=file.filename
        file_bytes=await file.read()
        stage=time.perf_counter()
        extracted=extract_text(file_name,file_bytes)
        file_extract_ms=round((time.perf_counter()-stage)*1000)
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
    discovery,model_meta=call_model(DISCOVERY_INSTRUCTIONS,prompt,"spark_discovery",DISCOVERY_SCHEMA,DISCOVERY_PROMPT_VERSION,reasoning_effort="low",max_output_tokens=8000)
    store.event(session_id,"MODEL_CALL",{"stage":"discover",**model_meta})
    store.event(session_id,"ACTIVITY_UNDERSTANDING",discovery.get("activity_map",{}))
    store.event(session_id,"CANDIDATE_MOMENTS",discovery.get("candidates",[]))
    store.event(session_id,"SURFACED_MOMENTS",discovery.get("surfaced_moments",[]))
    total_ms=round((time.perf_counter()-run_started)*1000)
    timing={"url_fetch_extract_ms":url_fetch_extract_ms,"file_extract_ms":file_extract_ms,"model_ms":model_meta.get("latency_ms"),"total_ms":total_ms,"input_chars":len(lesson_text),"candidate_count":len(discovery.get("candidates",[])),"surfaced_count":len(discovery.get("surfaced_moments",[]))}
    store.event(session_id,"RUN_TIMING",timing)
    store.update_session(session_id,{"discovery":discovery,"telemetry":{"discover":model_meta,"timing":timing},"prompt_version":DISCOVERY_PROMPT_VERSION,"schema_version":SCHEMA_VERSION})
    artifact_export=store.export_run_artifacts(session_id)
    if artifact_export:
        store.event(session_id,"RESEARCH_ARTIFACT_EXPORTED",artifact_export)
    return {"session_id":session_id,"discovery":discovery,"timing":{"total_ms":total_ms}}

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
    result,model_meta=call_model(DESIGN_INSTRUCTIONS,prompt,"spark_develop",DESIGN_SCHEMA,DESIGN_PROMPT_VERSION,reasoning_effort="low",max_output_tokens=6000)
    store.event(session_id,"MODEL_CALL",{"stage":"develop",**model_meta})
    store.event(session_id,"DEVELOPED_OUTPUT",result)
    store.update_session(session_id,{"selection":selection,"developed_output":result,"develop_telemetry":model_meta})
    artifact_export=store.export_run_artifacts(session_id)
    if artifact_export:
        store.event(session_id,"RESEARCH_ARTIFACT_EXPORTED",artifact_export)
    return result

@app.post("/api/session/{session_id}/feedback")
def feedback(session_id: str, req: FeedbackRequest):
    store.event(session_id,"USER_FEEDBACK",req.model_dump())
    artifact_export=store.export_run_artifacts(session_id)
    if artifact_export:
        store.event(session_id,"RESEARCH_ARTIFACT_EXPORTED",artifact_export)
    return {"ok":True}

@app.get("/api/research/latest")
def research_latest():
    bundle=store.latest_public_bundle()
    if not bundle:
        raise HTTPException(404,"No SPARK runs found.")
    return JSONResponse(
        content=bundle,
        headers={"Cache-Control":"no-store"}
    )

@app.get("/api/research/sessions")
def research_sessions(limit: int=50, x_spark_research_token: str=Header("")):
    require_research(x_spark_research_token)
    return {"sessions":store.list_sessions(limit)}

@app.get("/api/research/session/{session_id}")
def research_session(session_id: str, include_lesson: bool=False, x_spark_research_token: str=Header("")):
    require_research(x_spark_research_token)
    bundle=store.research_bundle(session_id,include_lesson=include_lesson)
    if not bundle:
        raise HTTPException(404,"Unknown session")
    return bundle

@app.get("/api/research/session/{session_id}/events")
def research_events(session_id: str, x_spark_research_token: str=Header("")):
    require_research(x_spark_research_token)
    return {"session_id":session_id,"events":store.get_events(session_id)}

try:
    from mangum import Mangum
    handler=Mangum(app)
except Exception:
    handler=None
