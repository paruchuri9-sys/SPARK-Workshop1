import os, json, datetime, uuid
from typing import Any, Dict

class Store:
    def __init__(self):
        self.mode=os.getenv("SPARK_STORAGE","local").lower()
        self.local={}
        self.events=[]
        self.ddb=None
        self.s3=None
        self.table_name=os.getenv("SPARK_TABLE","")
        self.bucket=os.getenv("SPARK_UPLOAD_BUCKET","")
        if self.mode=="aws":
            import boto3
            self.ddb=boto3.resource("dynamodb").Table(self.table_name)
            self.s3=boto3.client("s3")

    def _ts(self):
        return datetime.datetime.now(datetime.timezone.utc).isoformat()

    def health(self):
        return {"mode":self.mode,"table":self.table_name if self.mode=="aws" else None,"bucket":self.bucket if self.mode=="aws" else None}

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

    def store_upload(self,session_id:str,file_name:str,content:bytes):
        if self.mode=="aws":
            key="sessions/"+session_id+"/source/"+file_name
            self.s3.put_object(Bucket=self.bucket,Key=key,Body=content,ServerSideEncryption="AES256")
            self.event(session_id,"UPLOAD_STORED",{"bucket":self.bucket,"key":key,"file_name":file_name})
            return key
        self.event(session_id,"UPLOAD_CAPTURED_LOCAL",{"file_name":file_name,"bytes":len(content)})
        return None
