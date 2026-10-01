import os, json, datetime, uuid
from typing import Any, Dict, List

class Store:
    def __init__(self):
        self.mode=os.getenv("SPARK_STORAGE","local").lower()
        self.local={}
        self.events=[]
        self.ddb=None
        self.s3=None
        self.table_name=os.getenv("SPARK_TABLE","")
        self.bucket=os.getenv("SPARK_UPLOAD_BUCKET","")
        self.prefix=os.getenv("SPARK_UPLOAD_PREFIX","spark-alpha1").strip("/")
        if self.mode=="aws":
            import boto3
            self.ddb=boto3.resource("dynamodb").Table(self.table_name)
            self.s3=boto3.client("s3")

    def _ts(self):
        return datetime.datetime.now(datetime.timezone.utc).isoformat()

    def health(self):
        return {"mode":self.mode,"table":self.table_name if self.mode=="aws" else None,"bucket":self.bucket if self.mode=="aws" else None,"prefix":self.prefix if self.mode=="aws" else None}

    def create_session(self,session_id:str,metadata:Dict[str,Any],lesson_text:str):
        item={"session_id":session_id,"metadata":metadata,"lesson_text":lesson_text,"created_at":self._ts()}
        if self.mode=="aws":
            self.ddb.put_item(Item={"pk":"SESSION#"+session_id,"sk":"META","data_json":json.dumps(item,ensure_ascii=False),"created_at":item["created_at"]})
        else:
            self.local[session_id]=item

    def update_session(self,session_id:str,patch:Dict[str,Any]):
        if self.mode=="aws":
            cur=self.get_session(session_id) or {}
            cur.update(patch)
            self.ddb.put_item(Item={"pk":"SESSION#"+session_id,"sk":"META","data_json":json.dumps(cur,ensure_ascii=False),"created_at":cur.get("created_at",self._ts()),"updated_at":self._ts()})
        else:
            self.local.setdefault(session_id,{}).update(patch)

    def get_session(self,session_id:str):
        if self.mode=="aws":
            r=self.ddb.get_item(Key={"pk":"SESSION#"+session_id,"sk":"META"})
            item=r.get("Item")
            return json.loads(item["data_json"]) if item else None
        return self.local.get(session_id)

    def event(self,session_id:str,event_type:str,payload:Any):
        event={"event_id":str(uuid.uuid4()),"session_id":session_id,"event_type":event_type,"payload":payload,"created_at":self._ts()}
        if self.mode=="aws":
            self.ddb.put_item(Item={"pk":"SESSION#"+session_id,"sk":"EVENT#"+event["created_at"]+"#"+event["event_id"],"event_type":event_type,"data_json":json.dumps(event,ensure_ascii=False),"created_at":event["created_at"]})
        else:
            self.events.append(event)


    def list_sessions(self,limit:int=50):
        limit=max(1,min(int(limit),200))
        if self.mode=="aws":
            items=[]
            kwargs={"ProjectionExpression":"pk, sk, data_json, created_at, updated_at"}
            while len(items)<limit:
                r=self.ddb.scan(**kwargs)
                for item in r.get("Items",[]):
                    if item.get("sk")=="META":
                        try:
                            data=json.loads(item.get("data_json","{}"))
                        except Exception:
                            continue
                        data.pop("lesson_text",None)
                        items.append(data)
                        if len(items)>=limit:
                            break
                lek=r.get("LastEvaluatedKey")
                if not lek or len(items)>=limit:
                    break
                kwargs["ExclusiveStartKey"]=lek
            items.sort(key=lambda x:x.get("created_at",""),reverse=True)
            return items[:limit]
        items=[]
        for data in self.local.values():
            copy=dict(data)
            copy.pop("lesson_text",None)
            items.append(copy)
        items.sort(key=lambda x:x.get("created_at",""),reverse=True)
        return items[:limit]

    def get_events(self,session_id:str):
        if self.mode=="aws":
            from boto3.dynamodb.conditions import Key
            r=self.ddb.query(
                KeyConditionExpression=Key("pk").eq("SESSION#"+session_id) & Key("sk").begins_with("EVENT#")
            )
            events=[]
            for item in r.get("Items",[]):
                try:
                    events.append(json.loads(item.get("data_json","{}")))
                except Exception:
                    pass
            events.sort(key=lambda x:x.get("created_at",""))
            return events
        return [e for e in self.events if e.get("session_id")==session_id]

    def research_bundle(self,session_id:str,include_lesson:bool=False):
        session=self.get_session(session_id)
        if not session:
            return None
        session=dict(session)
        if not include_lesson:
            session.pop("lesson_text",None)
        return {"session":session,"events":self.get_events(session_id)}


    def build_run_artifacts(self,session_id:str):
        session=self.get_session(session_id)
        if not session:
            return None
        events=self.get_events(session_id)
        safe_session=dict(session)
        safe_session.pop("lesson_text",None)
        artifact={
            "session_id":session_id,
            "exported_at":self._ts(),
            "session":safe_session,
            "events":events,
            "source_text_included":False
        }
        metadata=safe_session.get("metadata") or {}
        discovery=safe_session.get("discovery") or {}
        lines=[
            f"# SPARK Alpha 1 Run {session_id}",
            "",
            f"- Exported: {artifact['exported_at']}",
            f"- Lesson: {metadata.get('lesson_name','')}",
            f"- Grade/course: {metadata.get('grade_course','')}",
            f"- Duration: {metadata.get('duration','')}",
            f"- Source URL: {metadata.get('source_url','')}",
            f"- Resolved URL: {metadata.get('resolved_url','')}",
            f"- Prompt version: {safe_session.get('prompt_version','')}",
            f"- Schema version: {safe_session.get('schema_version','')}",
            "",
            "## Activity map",
            json.dumps(discovery.get("activity_map",{}),ensure_ascii=False,indent=2),
            "",
            "## Candidates",
            json.dumps(discovery.get("candidates",[]),ensure_ascii=False,indent=2),
            "",
            "## Surfaced moments",
            json.dumps(discovery.get("surfaced_moments",[]),ensure_ascii=False,indent=2),
            "",
            "## Educator selection",
            json.dumps(safe_session.get("selection",{}),ensure_ascii=False,indent=2),
            "",
            "## Developed output",
            json.dumps(safe_session.get("developed_output",{}),ensure_ascii=False,indent=2),
            "",
            "## Telemetry",
            json.dumps({"discover":safe_session.get("telemetry",{}),"develop":safe_session.get("develop_telemetry",{})},ensure_ascii=False,indent=2),
            "",
            "## Events",
            json.dumps(events,ensure_ascii=False,indent=2)
        ]
        return artifact, "\n".join(lines)+"\n"

    def export_run_artifacts(self,session_id:str):
        built=self.build_run_artifacts(session_id)
        if not built:
            return None
        artifact,markdown=built
        if self.mode!="aws":
            return {"json_key":None,"markdown_key":None,"artifact":artifact,"markdown":markdown}
        base=f"{self.prefix}/research/runs/{session_id}"
        json_key=base+".json"
        markdown_key=base+".md"
        self.s3.put_object(
            Bucket=self.bucket,Key=json_key,
            Body=json.dumps(artifact,ensure_ascii=False,indent=2).encode("utf-8"),
            ContentType="application/json; charset=utf-8",
            ServerSideEncryption="AES256"
        )
        self.s3.put_object(
            Bucket=self.bucket,Key=markdown_key,
            Body=markdown.encode("utf-8"),
            ContentType="text/markdown; charset=utf-8",
            ServerSideEncryption="AES256"
        )
        return {"json_key":json_key,"markdown_key":markdown_key}

    def store_upload(self,session_id:str,file_name:str,content:bytes):
        if self.mode=="aws":
            key=f"{self.prefix}/sessions/{session_id}/source/{file_name}"
            self.s3.put_object(Bucket=self.bucket,Key=key,Body=content,ServerSideEncryption="AES256")
            self.event(session_id,"UPLOAD_STORED",{"bucket":self.bucket,"key":key,"file_name":file_name})
            return key
        self.event(session_id,"UPLOAD_CAPTURED_LOCAL",{"file_name":file_name,"bytes":len(content)})
        return None
