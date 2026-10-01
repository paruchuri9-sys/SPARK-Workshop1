import os, json, datetime, uuid, urllib.parse
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
        self.drive_folder_id=os.getenv("GOOGLE_DRIVE_FOLDER_ID","").strip()
        self.google_oauth_secret_id=os.getenv("GOOGLE_OAUTH_SECRET_ID","").strip()
        self.google_wif_audience=os.getenv("GOOGLE_WIF_AUDIENCE","").strip()
        self.google_service_account=os.getenv("GOOGLE_SERVICE_ACCOUNT_EMAIL","").strip()
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


    def latest_public_bundle(self):
        sessions=self.list_sessions(1)
        if not sessions:
            return None
        session=sessions[0]
        metadata=session.get("metadata") or {}
        safe_metadata={
            "lesson_name":metadata.get("lesson_name",""),
            "grade_course":metadata.get("grade_course",""),
            "duration":metadata.get("duration",""),
            "objective":metadata.get("objective",""),
            "source_url":metadata.get("source_url",""),
            "resolved_url":metadata.get("resolved_url",""),
            "created_at":metadata.get("created_at","")
        }
        selection=session.get("selection") or {}
        return {
            "session_id":session.get("session_id"),
            "created_at":session.get("created_at"),
            "metadata":safe_metadata,
            "prompt_version":session.get("prompt_version"),
            "schema_version":session.get("schema_version"),
            "discovery":session.get("discovery") or {},
            "telemetry":session.get("telemetry") or {},
            "selection":{"selected_ids":selection.get("selected_ids",[])},
            "developed_output":session.get("developed_output") or {},
            "develop_telemetry":session.get("develop_telemetry") or {},
            "source_text_included":False,
            "public_alpha_endpoint":True
        }


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


    def _google_credentials(self):
        # Preferred Alpha path: user OAuth stored securely in AWS Secrets Manager.
        # Expected JSON: {"client_id":"...","client_secret":"...","refresh_token":"..."}
        if self.google_oauth_secret_id:
            try:
                import boto3
                from google.oauth2.credentials import Credentials
                secret=boto3.client("secretsmanager").get_secret_value(
                    SecretId=self.google_oauth_secret_id
                ).get("SecretString","")
                info=json.loads(secret)
                if info.get("client_id") and info.get("client_secret") and info.get("refresh_token"):
                    return Credentials(
                        token=None,
                        refresh_token=info["refresh_token"],
                        token_uri="https://oauth2.googleapis.com/token",
                        client_id=info["client_id"],
                        client_secret=info["client_secret"],
                        scopes=["https://www.googleapis.com/auth/drive.file"]
                    )
            except Exception:
                # Fall through to WIF so existing diagnostics remain usable.
                pass

        if not self.google_wif_audience or not self.google_service_account:
            return None
        import google.auth
        info={
            "universe_domain":"googleapis.com",
            "type":"external_account",
            "audience":self.google_wif_audience,
            "subject_token_type":"urn:ietf:params:aws:token-type:aws4_request",
            "token_url":"https://sts.googleapis.com/v1/token",
            "credential_source":{
                "environment_id":"aws1",
                "region_url":"http://169.254.169.254/latest/meta-data/placement/availability-zone",
                "url":"http://169.254.169.254/latest/meta-data/iam/security-credentials",
                "regional_cred_verification_url":"https://sts.{region}.amazonaws.com?Action=GetCallerIdentity&Version=2011-06-15"
            },
            "service_account_impersonation_url":
                "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/"
                +self.google_service_account+":generateAccessToken"
        }
        creds,_=google.auth.load_credentials_from_dict(
            info,scopes=["https://www.googleapis.com/auth/drive.file"]
        )
        return creds

    def _drive_access_token(self):
        creds=self._google_credentials()
        if not creds:
            return None
        from google.auth.transport.requests import Request
        creds.refresh(Request())
        return creds.token

    def _drive_find_file(self,name:str,token:str):
        if not self.drive_folder_id:
            return None
        import httpx
        q=f"name='{name.replace(chr(39), chr(92)+chr(39))}' and '{self.drive_folder_id}' in parents and trashed=false"
        params={"q":q,"fields":"files(id,name)","pageSize":"10"}
        r=httpx.get(
            "https://www.googleapis.com/drive/v3/files",
            headers={"Authorization":"Bearer "+token},
            params=params,timeout=20
        )
        r.raise_for_status()
        files=r.json().get("files",[])
        return files[0].get("id") if files else None

    def _drive_upload_bytes(self,name:str,content:bytes,mime_type:str,token:str):
        import httpx
        existing=self._drive_find_file(name,token)
        if existing:
            r=httpx.patch(
                f"https://www.googleapis.com/upload/drive/v3/files/{existing}",
                headers={"Authorization":"Bearer "+token,"Content-Type":mime_type},
                params={"uploadType":"media","fields":"id,name,modifiedTime"},
                content=content,timeout=30
            )
            r.raise_for_status()
            return r.json()
        metadata={"name":name,"parents":[self.drive_folder_id]}
        boundary="sparkboundary"
        body=(
            f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"
            +json.dumps(metadata)
            +f"\r\n--{boundary}\r\nContent-Type: {mime_type}\r\n\r\n"
        ).encode("utf-8")+content+f"\r\n--{boundary}--\r\n".encode("utf-8")
        r=httpx.post(
            "https://www.googleapis.com/upload/drive/v3/files",
            headers={"Authorization":"Bearer "+token,"Content-Type":f"multipart/related; boundary={boundary}"},
            params={"uploadType":"multipart","fields":"id,name,modifiedTime"},
            content=body,timeout=30
        )
        r.raise_for_status()
        return r.json()

    def test_drive_connection(self):
        status={
            "configured":bool(self.drive_folder_id and (self.google_oauth_secret_id or (self.google_wif_audience and self.google_service_account))),
            "folder_id":self.drive_folder_id,
            "service_account":self.google_service_account,
            "wif_audience":self.google_wif_audience
        }
        if not status["configured"]:
            status["status"]="disabled"
            return status
        try:
            token=self._drive_access_token()
            if not token:
                status["status"]="auth_failed"
                status["error"]="No access token returned."
                return status
            import httpx
            r=httpx.get(
                "https://www.googleapis.com/drive/v3/files/"+self.drive_folder_id,
                headers={"Authorization":"Bearer "+token},
                params={"fields":"id,name,mimeType,capabilities(canAddChildren)"},
                timeout=20
            )
            status["http_status"]=r.status_code
            if r.status_code>=400:
                status["status"]="drive_failed"
                try:
                    status["error"]=(r.json().get("error") or {}).get("message") or r.text[:400]
                except Exception:
                    status["error"]=r.text[:400]
                return status
            info=r.json()
            status["status"]="ok"
            status["folder_name"]=info.get("name")
            status["can_add_children"]=(info.get("capabilities") or {}).get("canAddChildren")
            return status
        except Exception as e:
            status["status"]="error"
            status["error"]=f"{type(e).__name__}: {str(e)[:500]}"
            return status

    def test_drive_write(self):
        status={"configured":bool(self.drive_folder_id and (self.google_oauth_secret_id or (self.google_wif_audience and self.google_service_account)))}
        if not status["configured"]:
            status["status"]="disabled"
            return status
        try:
            token=self._drive_access_token()
            import httpx
            name="SPARK-drive-health-probe.txt"
            created=self._drive_upload_bytes(name,b"SPARK Drive write probe\n","text/plain; charset=utf-8",token)
            file_id=created.get("id")
            status["created_file_id"]=file_id
            if file_id:
                r=httpx.delete(
                    f"https://www.googleapis.com/drive/v3/files/{file_id}",
                    headers={"Authorization":"Bearer "+token},
                    timeout=20
                )
                status["delete_http_status"]=r.status_code
            status["status"]="ok"
            return status
        except Exception as e:
            status["status"]="error"
            status["error"]=f"{type(e).__name__}: {str(e)[:700]}"
            return status

    def mirror_run_to_drive(self,session_id:str,artifact:dict,markdown:str):
        if not self.drive_folder_id or not (self.google_oauth_secret_id or (self.google_wif_audience and self.google_service_account)):
            return {"status":"disabled"}
        try:
            token=self._drive_access_token()
            base=f"SPARK-{session_id}"
            md=self._drive_upload_bytes(base+".md",markdown.encode("utf-8"),"text/markdown; charset=utf-8",token)
            js=self._drive_upload_bytes(base+".json",json.dumps(artifact,ensure_ascii=False,indent=2).encode("utf-8"),"application/json; charset=utf-8",token)
            return {"status":"ok","markdown_file_id":md.get("id"),"json_file_id":js.get("id")}
        except Exception as e:
            return {"status":"error","error":f"{type(e).__name__}: {str(e)[:400]}"}

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
        # S3 remains canonical; Drive is a convenience mirror only.
        drive=self.mirror_run_to_drive(session_id,artifact,markdown)
        return {"json_key":json_key,"markdown_key":markdown_key,"drive":drive}

    def store_upload(self,session_id:str,file_name:str,content:bytes):
        if self.mode=="aws":
            key=f"{self.prefix}/sessions/{session_id}/source/{file_name}"
            self.s3.put_object(Bucket=self.bucket,Key=key,Body=content,ServerSideEncryption="AES256")
            self.event(session_id,"UPLOAD_STORED",{"bucket":self.bucket,"key":key,"file_name":file_name})
            return key
        self.event(session_id,"UPLOAD_CAPTURED_LOCAL",{"file_name":file_name,"bytes":len(content)})
        return None
